import type { NextApiRequest, NextApiResponse } from "next";
import { ANALYTICS_EVENTS } from "../../../lib/analyticsEvents";
import { ensureAnalyticsCookie, readAnalyticsCookie } from "../../../lib/analyticsCookie";

type Body = {
  handle?: string;
  name?: string;
  message?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const prisma = (await import("../../../lib/prisma.server")).default;
  const body = (req.body || {}) as Body;
  const handleParam = typeof body.handle === "string" ? body.handle : "";
  const name = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "Invitado";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return res.status(400).json({ error: "message_required" });
  }

  const creators = await prisma.creator.findMany();
  const match = creators.find((c) => slugify(c.name) === handleParam) || creators[0];
  if (!match) {
    return res.status(400).json({ error: "creator_not_found" });
  }

  const referrerHeader = Array.isArray(req.headers.referer)
    ? req.headers.referer[0]
    : typeof req.headers.referer === "string"
    ? req.headers.referer
    : Array.isArray(req.headers.referrer)
    ? req.headers.referrer[0]
    : typeof req.headers.referrer === "string"
    ? req.headers.referrer
    : "";

  const cookieData = readAnalyticsCookie(req);
  const merged = ensureAnalyticsCookie(req, res, {
    referrer: cookieData?.referrer || referrerHeader || undefined,
    utmSource: cookieData?.utmSource,
    utmMedium: cookieData?.utmMedium,
    utmCampaign: cookieData?.utmCampaign,
    utmContent: cookieData?.utmContent,
    utmTerm: cookieData?.utmTerm,
  });

  const now = new Date();
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });

  let fanId = "";
  try {
    const existing = await prisma.fan.findFirst({
      where: { creatorId: match.id, name },
      select: { id: true, isBlocked: true },
    });

    if (existing?.isBlocked) {
      return res.status(403).json({ error: "CHAT_BLOCKED" });
    }

    if (existing) {
      fanId = existing.id;
      await prisma.fan.update({ where: { id: fanId }, data: { isArchived: false, preview: message.slice(0, 120), lastMessageAt: now } });
    } else {
      fanId = `fan-${Date.now()}`;
      await prisma.fan.create({
        data: {
          id: fanId,
          name,
          creatorId: match.id,
          preview: message.slice(0, 120),
          time,
          lastMessageAt: now,
        },
      });
    }

    await prisma.message.create({
      data: {
        id: `${fanId}-${Date.now()}`,
        fanId,
        from: "fan",
        text: message,
        time,
        isLastFromCreator: false,
        type: "TEXT",
      },
    });

    try {
      await prisma.analyticsEvent.create({
        data: {
          creatorId: match.id,
          fanId,
          sessionId: merged.sessionId,
          eventName: ANALYTICS_EVENTS.SEND_MESSAGE,
          path: `/c/${handleParam || slugify(match.name || "creator")}`,
          referrer: merged.referrer || referrerHeader || null,
          utmSource: merged.utmSource || null,
          utmMedium: merged.utmMedium || null,
          utmCampaign: merged.utmCampaign || null,
          utmContent: merged.utmContent || null,
          utmTerm: merged.utmTerm || null,
          meta: { handle: handleParam || slugify(match.name || "creator") },
        },
      });
    } catch (err) {
      console.error("Error tracking send_message for public entry", err);
    }
  } catch (err) {
    console.error("Error creating public fan entry", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }

  return res.status(200).json({ fanId });
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
