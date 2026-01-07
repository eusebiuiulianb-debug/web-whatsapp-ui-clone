import { createHash } from "crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export type AiGuardrailAction = "translate" | "voice_transcribe" | "voice_insights";

type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

type RateLimitWindow = {
  limit: number;
  windowMs: number;
  window: Duration;
};

type RateLimitOutcome = {
  success: boolean;
  remaining?: number;
  retryAfterSec?: number;
};

const ACTION_LIMITS: Record<AiGuardrailAction, { minute: RateLimitWindow; day: RateLimitWindow }> = {
  translate: {
    minute: { limit: 20, windowMs: 60_000, window: "1 m" },
    day: { limit: 500, windowMs: 86_400_000, window: "1 d" },
  },
  voice_transcribe: {
    minute: { limit: 6, windowMs: 60_000, window: "1 m" },
    day: { limit: 100, windowMs: 86_400_000, window: "1 d" },
  },
  voice_insights: {
    minute: { limit: 10, windowMs: 60_000, window: "1 m" },
    day: { limit: 200, windowMs: 86_400_000, window: "1 d" },
  },
};

const memoryDedupe = new Map<string, { value: unknown; expiresAt: number }>();
const memoryRateBuckets = new Map<string, number[]>();
const ratelimiters = new Map<string, Ratelimit>();
let redisClient: Redis | null = null;

export function hashText(text: string): string {
  const normalized = text.normalize("NFKC").trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

export async function dedupeGet<T = unknown>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const stored = await redis.get<string>(key);
      if (!stored) return null;
      return JSON.parse(stored) as T;
    } catch (_err) {
      return null;
    }
  }

  const entry = memoryDedupe.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryDedupe.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function dedupeSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttlSec });
      return;
    } catch (_err) {
      return;
    }
  }

  memoryDedupe.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export async function rateLimitOrThrow(params: { creatorId: string; action: AiGuardrailAction }) {
  const { creatorId, action } = params;
  const limits = ACTION_LIMITS[action];
  const redis = getRedisClient();
  const identifier = `${creatorId}:${action}`;
  let minuteOutcome: RateLimitOutcome | null = null;
  let dayOutcome: RateLimitOutcome | null = null;

  if (redis) {
    minuteOutcome = await rateLimitWithRedis({
      key: `rl:${action}:minute`,
      identifier,
      limit: limits.minute.limit,
      window: limits.minute.window,
    });
    dayOutcome = await rateLimitWithRedis({
      key: `rl:${action}:day`,
      identifier,
      limit: limits.day.limit,
      window: limits.day.window,
    });
  } else {
    minuteOutcome = rateLimitInMemory({
      key: `rl:${action}:minute:${identifier}`,
      limit: limits.minute.limit,
      windowMs: limits.minute.windowMs,
    });
    dayOutcome = rateLimitInMemory({
      key: `rl:${action}:day:${identifier}`,
      limit: limits.day.limit,
      windowMs: limits.day.windowMs,
    });
  }

  const failed = [minuteOutcome, dayOutcome].filter((outcome) => outcome && !outcome.success) as RateLimitOutcome[];
  if (failed.length > 0) {
    const retryAfterSec = Math.max(...failed.map((outcome) => outcome.retryAfterSec ?? 1));
    const error = new Error("rate_limited") as Error & { status?: number; retryAfterSec?: number };
    error.status = 429;
    error.retryAfterSec = retryAfterSec;
    throw error;
  }

  const remainingCandidates = [minuteOutcome?.remaining, dayOutcome?.remaining].filter(
    (value): value is number => typeof value === "number"
  );
  return {
    remaining:
      remainingCandidates.length > 0 ? Math.min(...remainingCandidates) : undefined,
  };
}

function getRedisClient() {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

async function rateLimitWithRedis(params: {
  key: string;
  identifier: string;
  limit: number;
  window: Duration;
}): Promise<RateLimitOutcome> {
  const limiterKey = `${params.key}:${params.limit}:${params.window}`;
  let limiter = ratelimiters.get(limiterKey);
  if (!limiter) {
    const redis = getRedisClient();
    if (!redis) {
      return { success: true };
    }
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(params.limit, params.window),
    });
    ratelimiters.set(limiterKey, limiter);
  }

  const result = await limiter.limit(params.identifier);
  const resetMs = typeof result.reset === "number" ? result.reset - Date.now() : 0;
  return {
    success: result.success,
    remaining: typeof result.remaining === "number" ? result.remaining : undefined,
    retryAfterSec: result.success ? undefined : Math.max(1, Math.ceil(resetMs / 1000)),
  };
}

function rateLimitInMemory(params: { key: string; limit: number; windowMs: number }): RateLimitOutcome {
  const now = Date.now();
  const entries = memoryRateBuckets.get(params.key) || [];
  const fresh = entries.filter((ts) => now - ts < params.windowMs);
  if (fresh.length >= params.limit) {
    const oldest = fresh[0] ?? now;
    memoryRateBuckets.set(params.key, fresh);
    return {
      success: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((params.windowMs - (now - oldest)) / 1000)),
    };
  }

  fresh.push(now);
  memoryRateBuckets.set(params.key, fresh);
  return {
    success: true,
    remaining: Math.max(0, params.limit - fresh.length),
  };
}
