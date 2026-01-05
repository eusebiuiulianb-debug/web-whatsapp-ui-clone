import type { NextApiRequest, NextApiResponse } from "next";
import { ANALYTICS_EVENTS, type AnalyticsEventName } from "../../../lib/analyticsEvents";
import { ensureAnalyticsCookie, readAnalyticsCookie } from "../../../lib/analyticsCookie";
import { inferPreferredLanguage, normalizePreferredLanguage } from "../../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../lib/dbSchemaGuard";
import { translateText } from "../../../server/ai/translateText";

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
  let isNewFan = false;
  try {
    const existing = await prisma.fan.findFirst({
      where: { creatorId: match.id, name },
      select: {
        id: true,
        isBlocked: true,
        preferredLanguage: true,
        firstUtmSource: true,
        firstUtmMedium: true,
        firstUtmCampaign: true,
        firstUtmContent: true,
        firstUtmTerm: true,
      },
    });

    if (existing?.isBlocked) {
      return res.status(403).json({ error: "CHAT_BLOCKED" });
    }

    const attribution = {
      firstUtmSource: merged.utmSource || null,
      firstUtmMedium: merged.utmMedium || null,
      firstUtmCampaign: merged.utmCampaign || null,
      firstUtmContent: merged.utmContent || null,
      firstUtmTerm: merged.utmTerm || null,
    };

    const inferredLanguage = inferPreferredLanguage(req.headers["accept-language"]);
    const storedLanguage = normalizePreferredLanguage(existing?.preferredLanguage);
    const preferredLanguage = storedLanguage ?? inferredLanguage;

    if (existing) {
      fanId = existing.id;
      const needsAttribution =
        !existing.firstUtmSource ||
        !existing.firstUtmMedium ||
        !existing.firstUtmCampaign ||
        !existing.firstUtmContent ||
        !existing.firstUtmTerm;
      const shouldUpdateLanguage = !storedLanguage;

      await prisma.fan.update({
        where: { id: fanId },
        data: {
          isArchived: false,
          preview: message.slice(0, 120),
          time,
          lastMessageAt: now,
          lastActivityAt: now,
          unreadCount: { increment: 1 },
          ...(shouldUpdateLanguage ? { preferredLanguage } : {}),
          ...(needsAttribution
            ? {
                firstUtmSource: existing.firstUtmSource || attribution.firstUtmSource,
                firstUtmMedium: existing.firstUtmMedium || attribution.firstUtmMedium,
                firstUtmCampaign: existing.firstUtmCampaign || attribution.firstUtmCampaign,
                firstUtmContent: existing.firstUtmContent || attribution.firstUtmContent,
                firstUtmTerm: existing.firstUtmTerm || attribution.firstUtmTerm,
              }
            : {}),
        },
      });
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
          lastActivityAt: now,
          isNew: true,
          unreadCount: 1,
          preferredLanguage,
          ...attribution,
        },
      });
      isNewFan = true;
    }

    const creatorTranslatedText =
      preferredLanguage !== "es"
        ? await translateText({ text: message, targetLanguage: "es", creatorId: match.id, fanId })
        : null;

    await prisma.message.create({
      data: {
        id: `${fanId}-${Date.now()}`,
        fanId,
        from: "fan",
        audience: "FAN",
        text: message,
        creatorTranslatedText,
        time,
        isLastFromCreator: false,
        type: "TEXT",
      },
    });

    try {
      const commonAnalyticsData = {
        creatorId: match.id,
        fanId,
        sessionId: merged.sessionId,
        path: `/c/${handleParam || slugify(match.name || "creator")}`,
        referrer: merged.referrer || referrerHeader || null,
        utmSource: merged.utmSource || null,
        utmMedium: merged.utmMedium || null,
        utmCampaign: merged.utmCampaign || null,
        utmContent: merged.utmContent || null,
        utmTerm: merged.utmTerm || null,
        meta: { handle: handleParam || slugify(match.name || "creator") },
      } as const;

      const eventsToCreate: Array<{ eventName: AnalyticsEventName; data: typeof commonAnalyticsData }> = [
        {
          eventName: ANALYTICS_EVENTS.OPEN_CHAT,
          data: commonAnalyticsData,
        },
        {
          eventName: ANALYTICS_EVENTS.SEND_MESSAGE,
          data: commonAnalyticsData,
        },
      ];

      if (isNewFan) {
        eventsToCreate.unshift({
          eventName: ANALYTICS_EVENTS.NEW_FAN,
          data: commonAnalyticsData,
        });
      }

      await Promise.all(
        eventsToCreate.map((evt) =>
          prisma.analyticsEvent.create({
            data: {
              ...evt.data,
              eventName: evt.eventName,
            },
          })
        )
      );
    } catch (err) {
      console.error("Error tracking send_message for public entry", err);
    }
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ error: payload.errorCode, ...payload });
    }
    console.error("Error creating public fan entry", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }

  return res.status(200).json({ fanId });
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
