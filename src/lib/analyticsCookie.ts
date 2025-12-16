import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";

export const ANALYTICS_COOKIE_NAME = "novsy_analytics";

export type AnalyticsCookiePayload = {
  sessionId: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
};

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    const key = decodeURIComponent(rawKey);
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function readAnalyticsCookie(req: NextApiRequest | { headers: { cookie?: string } }): AnalyticsCookiePayload | null {
  const cookies = parseCookieHeader(req.headers?.cookie);
  const raw = cookies[ANALYTICS_COOKIE_NAME];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionId) return null;
    return parsed as AnalyticsCookiePayload;
  } catch (_err) {
    return null;
  }
}

export function buildAnalyticsCookie(payload: AnalyticsCookiePayload): string {
  const value = encodeURIComponent(JSON.stringify(payload));
  return `${ANALYTICS_COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`;
}

export function ensureAnalyticsCookie(
  req: NextApiRequest,
  res: NextApiResponse,
  incoming?: Partial<AnalyticsCookiePayload>
): AnalyticsCookiePayload {
  const existing = readAnalyticsCookie(req);
  const merged: AnalyticsCookiePayload = {
    sessionId: existing?.sessionId ?? incoming?.sessionId ?? randomUUID(),
    utmSource: incoming?.utmSource ?? existing?.utmSource,
    utmMedium: incoming?.utmMedium ?? existing?.utmMedium,
    utmCampaign: incoming?.utmCampaign ?? existing?.utmCampaign,
    utmContent: incoming?.utmContent ?? existing?.utmContent,
    utmTerm: incoming?.utmTerm ?? existing?.utmTerm,
    referrer: incoming?.referrer ?? existing?.referrer,
  };

  res.setHeader("Set-Cookie", buildAnalyticsCookie(merged));
  return merged;
}
