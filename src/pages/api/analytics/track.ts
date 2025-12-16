import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { ensureAnalyticsCookie, readAnalyticsCookie } from "../../../lib/analyticsCookie";

type Body = {
  eventName?: string;
  creatorId?: string;
  fanId?: string | null;
  meta?: Record<string, any>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body || {}) as Body;
  const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";
  const creatorId = typeof body.creatorId === "string" ? body.creatorId : null;
  const fanId = typeof body.fanId === "string" ? body.fanId : null;
  const meta = body.meta && typeof body.meta === "object" ? body.meta : null;

  if (!eventName) return res.status(400).json({ error: "eventName is required" });
  if (!creatorId) return res.status(400).json({ error: "creatorId is required" });

  const referrerHeader = Array.isArray(req.headers.referer)
    ? req.headers.referer[0]
    : typeof req.headers.referer === "string"
    ? req.headers.referer
    : Array.isArray(req.headers.referrer)
    ? req.headers.referrer[0]
    : typeof req.headers.referrer === "string"
    ? req.headers.referrer
    : "";
  const referrer = referrerHeader || "";
  const cookieData = readAnalyticsCookie(req);
  const merged = ensureAnalyticsCookie(req, res, {
    referrer: cookieData?.referrer || referrer || undefined,
    utmSource: cookieData?.utmSource,
    utmMedium: cookieData?.utmMedium,
    utmCampaign: cookieData?.utmCampaign,
    utmContent: cookieData?.utmContent,
    utmTerm: cookieData?.utmTerm,
  });

  const pathFromReferrer = (() => {
    try {
      if (!referrer) return "/";
      const url = new URL(referrer);
      return url.pathname || "/";
    } catch (_err) {
      return "/";
    }
  })();

  try {
    await prisma.analyticsEvent.create({
      data: {
        creatorId,
        fanId: fanId ?? undefined,
        sessionId: merged.sessionId,
        eventName,
        path: pathFromReferrer,
        referrer: merged.referrer || referrer || null,
        utmSource: merged.utmSource || null,
        utmMedium: merged.utmMedium || null,
        utmCampaign: merged.utmCampaign || null,
        utmContent: merged.utmContent || null,
        utmTerm: merged.utmTerm || null,
        meta: meta as any,
      },
    });
  } catch (err) {
    console.error("Error tracking analytics event", { eventName, creatorId, path: pathFromReferrer, error: err instanceof Error ? err.message : err });
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }

  return res.status(200).json({ ok: true });
}
