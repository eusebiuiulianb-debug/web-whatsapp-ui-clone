import type { ServerResponse } from "http";
import type { NextApiRequest } from "next";
import prisma from "../prisma.server";

type FanSessionRequest = Pick<NextApiRequest, "headers" | "query" | "body">;
type FanSessionResponse = Pick<ServerResponse, "getHeader" | "setHeader">;

type EnsureFanOptions = {
  creatorHandle?: string;
  creatorId?: string;
  mode?: "go" | "public";
};

const FAN_COOKIE_PREFIX = "novsy_fan_";
const FAN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function slugifyHandle(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    const key = decodeURIComponent(rawKey);
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function buildFanCookieName(handle: string) {
  return `${FAN_COOKIE_PREFIX}${slugifyHandle(handle || "creator")}`;
}

export function setFanCookie(res: FanSessionResponse, handle: string, fanId: string) {
  const cookieName = buildFanCookieName(handle);
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieValue = `${cookieName}=${encodeURIComponent(
    fanId
  )}; Path=/; Max-Age=${FAN_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secureFlag}`;

  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [existing as string, cookieValue]);
}

export function readFanId(req: FanSessionRequest, handle?: string | null): string | null {
  const cookies = parseCookieHeader(req.headers?.cookie);
  const resolvedHandle = handle || resolveHandleFromRequest(req);
  if (resolvedHandle) {
    const key = buildFanCookieName(resolvedHandle);
    return cookies[key] || null;
  }
  const match = Object.entries(cookies).find(([key]) => key.startsWith(FAN_COOKIE_PREFIX));
  return match?.[1] ?? null;
}

export async function ensureFan(
  req: FanSessionRequest,
  res: FanSessionResponse,
  options: EnsureFanOptions = {}
): Promise<{ fanId: string; creatorId: string; handle: string; isNew: boolean }> {
  const creatorHandle = options.creatorHandle || resolveHandleFromRequest(req);
  const creatorId = options.creatorId || resolveCreatorIdFromRequest(req);
  const mode = options.mode ?? "public";

  const creator = await resolveCreator(creatorHandle, creatorId);
  if (!creator) {
    throw new Error("creator_not_found");
  }

  const resolvedHandle = slugifyHandle(creator.name || creatorHandle || "creator");
  const cookies = parseCookieHeader(req.headers?.cookie);
  const existingFanId = cookies[buildFanCookieName(resolvedHandle)];

  if (existingFanId) {
    const existing = await prisma.fan.findFirst({
      where: { id: existingFanId, creatorId: creator.id },
      select: { id: true },
    });
    if (existing?.id) {
      return { fanId: existing.id, creatorId: creator.id, handle: resolvedHandle, isNew: false };
    }
  }

  const fanId = `fan-${Date.now()}`;
  await prisma.fan.create({
    data: {
      id: fanId,
      name: "Invitado",
      creatorId: creator.id,
      source: mode,
      handle: resolvedHandle,
      isNew: true,
    },
  });

  setFanCookie(res, resolvedHandle, fanId);
  return { fanId, creatorId: creator.id, handle: resolvedHandle, isNew: true };
}

function resolveHandleFromRequest(req: FanSessionRequest): string | null {
  const bodyHandle = pickString((req.body as any)?.creatorHandle ?? (req.body as any)?.handle);
  if (bodyHandle) return bodyHandle;
  const queryHandle = pickString((req.query as any)?.creatorHandle ?? (req.query as any)?.handle);
  return queryHandle || null;
}

function resolveCreatorIdFromRequest(req: FanSessionRequest): string | null {
  const bodyId = pickString((req.body as any)?.creatorId);
  if (bodyId) return bodyId;
  const queryId = pickString((req.query as any)?.creatorId);
  return queryId || null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function resolveCreator(handle?: string | null, creatorId?: string | null) {
  if (creatorId) {
    return prisma.creator.findUnique({
      where: { id: creatorId },
      select: { id: true, name: true },
    });
  }
  if (!handle) return null;
  const creators = await prisma.creator.findMany({ select: { id: true, name: true } });
  const normalized = slugifyHandle(handle);
  return creators.find((creator) => slugifyHandle(creator.name) === normalized) || null;
}
