import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma.server";
import {
  deriveAudience,
  normalizeAudience,
  normalizeFrom,
  type MessageAudience,
} from "../../lib/messageAudience";
import { normalizePreferredLanguage } from "../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../lib/dbSchemaGuard";
import { translateText } from "../../server/ai/translateText";
import { getStickerById } from "../../lib/emoji/stickers";

type MessageResponse =
  | { ok: true; items: any[]; messages?: any[] }
  | { ok: true; message: any; items?: any[]; messages?: any[] }
  | { ok: false; error: string; errorCode?: string; message?: string; fix?: string[] };

type MessageTimestampCandidate = {
  id?: string | null;
  createdAt?: Date | string | null;
};

function parseSinceMs(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMessageIdTimestamp(messageId?: string | null): number | null {
  if (!messageId) return null;
  const lastDash = messageId.lastIndexOf("-");
  if (lastDash < 0 || lastDash === messageId.length - 1) return null;
  const raw = messageId.slice(lastDash + 1);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getMessageTimestamp(message: MessageTimestampCandidate): number | null {
  const createdAt = message.createdAt;
  if (createdAt instanceof Date) {
    const ms = createdAt.getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return extractMessageIdTimestamp(message.id);
}

function normalizeList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.flatMap((entry) => entry.split(",")).map((entry) => entry.trim()).filter(Boolean);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<MessageResponse>) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<MessageResponse>) {
  const { fanId, markRead, audiences, afterId, since } = req.query;

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  const normalizedFanId = fanId.trim();
  const shouldMarkRead =
    typeof markRead === "string" ? markRead === "1" || markRead.toLowerCase() === "true" : false;
  const normalizedAudiences = normalizeList(Array.isArray(audiences) || typeof audiences === "string" ? audiences : undefined);
  const parsedAudiences = normalizedAudiences
    .map((audience) => normalizeAudience(audience))
    .filter((audience): audience is MessageAudience => Boolean(audience));
  const fallbackAudiences: MessageAudience[] = ["FAN", "CREATOR"];
  const hasPublicAudience = parsedAudiences.includes("FAN") || parsedAudiences.includes("CREATOR");
  const audienceFilter = (parsedAudiences.length ? parsedAudiences : fallbackAudiences).filter((audience) =>
    hasPublicAudience ? audience !== "INTERNAL" : true
  );
  const afterIdParam = typeof afterId === "string" ? afterId.trim() : "";
  const sinceParam = typeof since === "string" ? since.trim() : "";
  const sinceMs = parseSinceMs(sinceParam);
  const afterIdMatchesFan = afterIdParam ? afterIdParam.startsWith(`${normalizedFanId}-`) : false;
  const afterIdCutoff = afterIdMatchesFan ? afterIdParam : "";
  const afterIdTimestamp = afterIdCutoff ? extractMessageIdTimestamp(afterIdCutoff) : null;
  const cutoffMs =
    sinceMs !== null && afterIdTimestamp !== null
      ? Math.max(sinceMs, afterIdTimestamp)
      : sinceMs ?? afterIdTimestamp ?? null;
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  try {
    const baseWhere = {
      OR: [
        { fanId: normalizedFanId },
        { id: { startsWith: `${normalizedFanId}-` } },
      ],
    };
    const where = afterIdCutoff
      ? {
          AND: [
            baseWhere,
            { id: { gt: afterIdCutoff } },
          ],
        }
      : baseWhere;
    const messages = await prisma.message.findMany({
      where,
      orderBy: { id: "asc" },
      include: { contentItem: true },
    });

    const normalizedMessages = messages
      .map((message) => ({
        ...message,
        fanId: normalizedFanId,
        audience: deriveAudience(message),
      }))
      .filter((message) => audienceFilter.includes(message.audience as MessageAudience));

    const filteredMessages = normalizedMessages.filter((message) => {
      if (cutoffMs === null && !afterIdCutoff) return true;
      if (cutoffMs !== null) {
        const timestamp = getMessageTimestamp(message);
        if (timestamp === null) return false;
        return timestamp > cutoffMs;
      }
      if (afterIdCutoff) {
        return typeof message.id === "string" ? message.id > afterIdCutoff : false;
      }
      return true;
    });

    if (shouldMarkRead) {
      try {
        await prisma.fan.updateMany({
          where: { id: normalizedFanId, unreadCount: { gt: 0 } },
          data: { unreadCount: 0 },
        });
      } catch (updateErr) {
        console.error("api/messages markRead error", { fanId: normalizedFanId, error: (updateErr as Error)?.message });
      }
    }

    return res.status(200).json({ ok: true, items: filteredMessages, messages: filteredMessages });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/messages get error", { fanId: normalizedFanId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error fetching messages" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<MessageResponse>) {
  const { fanId, text, from, type, contentItemId, audience, stickerId, actionKey } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  const normalizedType = type === "CONTENT" ? "CONTENT" : type === "STICKER" ? "STICKER" : "TEXT";

  if (normalizedType === "TEXT") {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "text is required" });
    }
  }

  if (normalizedType === "CONTENT") {
    if (!contentItemId || typeof contentItemId !== "string") {
      return res.status(400).json({ ok: false, error: "contentItemId is required for content messages" });
    }
  }
  if (normalizedType === "STICKER") {
    if (!stickerId || typeof stickerId !== "string") {
      return res.status(400).json({ ok: false, error: "stickerId is required for sticker messages" });
    }
  }

  const normalizedStickerId = normalizedType === "STICKER" ? stickerId.trim() : null;
  if (normalizedType === "STICKER" && !normalizedStickerId) {
    return res.status(400).json({ ok: false, error: "stickerId is required for sticker messages" });
  }
  const sticker = normalizedType === "STICKER" ? getStickerById(normalizedStickerId) : null;
  const stickerLabel = sticker?.label || "Sticker";
  const messageText =
    normalizedType === "STICKER"
      ? typeof text === "string" && text.trim().length > 0
        ? text.trim()
        : stickerLabel
      : typeof text === "string"
      ? text
      : "";

  const normalizedFrom = normalizeFrom(typeof from === "string" ? from : undefined);
  const normalizedActionKey = typeof actionKey === "string" ? actionKey.trim() : "";
  const isCortexOutreach = normalizedActionKey.startsWith("cortex:");
  const storedFrom = normalizedFrom === "fan" ? "fan" : "creator";
  const rawAudience = typeof audience === "string" ? audience : undefined;
  const parsedAudience = normalizeAudience(rawAudience);
  let normalizedAudience: MessageAudience;

  if (normalizedFrom === "fan") {
    normalizedAudience = "FAN";
  } else if (!rawAudience || parsedAudience === "CREATOR" || parsedAudience === "FAN") {
    normalizedAudience = "CREATOR";
  } else if (parsedAudience === "INTERNAL") {
    normalizedAudience = "INTERNAL";
  } else {
    return res.status(400).json({ ok: false, error: "Invalid audience" });
  }
  const time = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { isBlocked: true, preferredLanguage: true, creatorId: true, inviteUsedAt: true, inviteToken: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }
    if (normalizedFrom === "creator" && fan.isBlocked && normalizedAudience !== "INTERNAL") {
      return res.status(403).json({ ok: false, error: "CHAT_BLOCKED" });
    }

    const preferredLanguage = normalizePreferredLanguage(fan.preferredLanguage) ?? "en";
    let deliveredText: string | null = null;
    let creatorTranslatedText: string | null = null;

    const shouldTranslate =
      normalizedAudience !== "INTERNAL" &&
      normalizedType === "TEXT" &&
      typeof text === "string" &&
      text.trim().length > 0;

    if (shouldTranslate && normalizedFrom === "creator" && preferredLanguage !== "es") {
      deliveredText = await translateText({
        text,
        targetLanguage: preferredLanguage,
        creatorId: fan.creatorId,
        fanId,
      });
    }

    if (shouldTranslate && normalizedFrom === "fan" && preferredLanguage !== "es") {
      creatorTranslatedText = await translateText({
        text,
        targetLanguage: "es",
        creatorId: fan.creatorId,
        fanId,
      });
    }

    const shouldUpdateThread = normalizedAudience !== "INTERNAL";
    if (shouldUpdateThread) {
      await prisma.message.updateMany({
        where: { fanId },
        data: { isLastFromCreator: false },
      });
    }

    const created = await prisma.message.create({
      data: {
        id: `${fanId}-${Date.now()}`,
        fanId,
        from: storedFrom,
        audience: normalizedAudience,
        text: messageText,
        deliveredText,
        creatorTranslatedText,
        time,
        isLastFromCreator: shouldUpdateThread && normalizedFrom === "creator",
        type: normalizedType,
        contentItemId: normalizedType === "CONTENT" ? (contentItemId as string) : null,
        stickerId: normalizedType === "STICKER" ? normalizedStickerId : null,
      },
      include: { contentItem: true },
    });

    if (shouldUpdateThread) {
      const previewSource =
        normalizedType === "CONTENT"
          ? created.contentItem?.title || "Contenido compartido"
          : normalizedType === "STICKER"
          ? stickerLabel
          : typeof text === "string"
          ? text
          : "";
      const preview = previewSource.trim().slice(0, 120);
      const now = new Date();
      const fanUpdate: Record<string, unknown> = {
        preview,
        time,
        lastMessageAt: now,
        lastActivityAt: now,
      };
      if (normalizedFrom === "fan") {
        fanUpdate.isArchived = false;
        fanUpdate.unreadCount = { increment: 1 };
        if (fan.inviteToken && !fan.inviteUsedAt) {
          fanUpdate.inviteUsedAt = now;
        }
      } else {
        fanUpdate.lastCreatorMessageAt = now;
        fanUpdate.unreadCount = 0;
      }
      if (normalizedFrom === "creator" && normalizedAudience !== "INTERNAL" && isCortexOutreach) {
        fanUpdate.lastCortexOutreachAt = now;
        fanUpdate.lastCortexOutreachKey = normalizedActionKey;
      }
      try {
        await prisma.fan.update({
          where: { id: fanId },
          data: fanUpdate,
        });
      } catch (updateErr) {
        console.error("api/messages fan-update error", { fanId, error: (updateErr as Error)?.message });
      }
    }

    return res.status(200).json({ ok: true, message: created, items: [created], messages: [created] });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/messages post error", { fanId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error creating message" });
  }
}
