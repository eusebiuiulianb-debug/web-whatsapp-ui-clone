import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "./prisma.server";

type RateLimitBurst = {
  limit: number;
  windowSeconds: number;
  bucketSeconds?: number;
};

type RateLimitParams = {
  req: NextApiRequest;
  res: NextApiResponse;
  fanId?: string | null;
  endpoint: string;
  burst: RateLimitBurst;
  cooldownMs?: number;
};

type RateKeyParams = {
  fanId?: string | null;
  ip?: string;
  endpoint: string;
  bucketSeconds: number;
  nowMs?: number;
};

const CLEANUP_PROBABILITY = 0.005;
const CLEANUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0] || "unknown";
  }
  return req.socket?.remoteAddress || "unknown";
}

export function buildRateKey(params: RateKeyParams) {
  const { fanId, ip, endpoint, bucketSeconds, nowMs } = params;
  const resolvedNow = typeof nowMs === "number" ? nowMs : Date.now();
  const bucketMs = Math.max(1, Math.floor(bucketSeconds)) * 1000;
  const bucket = Math.floor(resolvedNow / bucketMs);
  const fanPart = fanId ? fanId : "anon";
  const ipPart = ip || "unknown";
  return `${endpoint}:${fanPart}:${ipPart}:${bucket}`;
}

export async function enforceRateLimit(params: RateLimitParams): Promise<boolean> {
  const { req, res, fanId, endpoint, burst, cooldownMs } = params;
  const rateLimitClient = (prisma as { rateLimitEvent?: typeof prisma.rateLimitEvent }).rateLimitEvent;
  if (!rateLimitClient || typeof rateLimitClient.count !== "function") {
    return true;
  }

  const now = new Date();
  const nowMs = now.getTime();
  const ip = getClientIp(req);
  const windowSeconds = Math.max(1, Math.floor(burst.windowSeconds));
  const bucketSeconds = Math.max(1, Math.floor(burst.bucketSeconds ?? windowSeconds));
  const key = buildRateKey({ fanId, ip, endpoint, bucketSeconds, nowMs });
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  const burstCountRaw = await rateLimitClient.count({
    where: {
      key,
      createdAt: { gte: windowStart },
    },
  });
  const burstCount = Number(burstCountRaw) || 0;

  if (burstCount >= burst.limit) {
    const bucketEndMs = Math.floor(nowMs / (bucketSeconds * 1000)) * bucketSeconds * 1000 + bucketSeconds * 1000;
    const retryAfterMs = Math.max(0, bucketEndMs - nowMs);
    respondRateLimited(res, retryAfterMs);
    return false;
  }

  if (cooldownMs && cooldownMs > 0) {
    const lastEvent = await rateLimitClient.findFirst({
      where: {
        endpoint,
        fanId: fanId ?? undefined,
        ip: ip ?? undefined,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (lastEvent) {
      const elapsed = nowMs - lastEvent.createdAt.getTime();
      if (elapsed < cooldownMs) {
        const retryAfterMs = Math.max(0, cooldownMs - elapsed);
        respondRateLimited(res, retryAfterMs);
        return false;
      }
    }
  }

  await rateLimitClient.create({
    data: {
      key,
      fanId: fanId ?? null,
      ip,
      endpoint,
    },
  });

  maybeCleanupOldEvents(nowMs);
  return true;
}

function respondRateLimited(res: NextApiResponse, retryAfterMs: number) {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({ ok: false, error: "RATE_LIMITED", retryAfterMs });
}

function maybeCleanupOldEvents(nowMs: number) {
  if (Math.random() >= CLEANUP_PROBABILITY) return;
  const cutoff = new Date(nowMs - CLEANUP_WINDOW_MS);
  prisma.rateLimitEvent
    .deleteMany({ where: { createdAt: { lt: cutoff } } })
    .catch(() => null);
}
