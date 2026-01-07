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
import { emitCreatorEvent as emitRealtimeEvent } from "../../server/realtimeHub";
import { saveVoice } from "../../lib/voiceStorage";
import { buildReactionSummary, type ReactionActor } from "../../lib/messageReactions";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16mb",
    },
  },
};

type MessageResponse =
  | { ok: true; items: any[]; messages?: any[] }
  | { ok: true; message: any; items?: any[]; messages?: any[] }
  | { ok: false; error: string; errorCode?: string; message?: string; fix?: string[] };

type MessageTimestampCandidate = {
  id?: string | null;
  createdAt?: Date | string | null;
};

const MAX_VOICE_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_DURATION_MS = 120 * 1000;
const MIN_VOICE_BYTES = 2 * 1024;
const ALLOWED_VOICE_MIME = new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4"]);

function normalizeMimeType(value: string) {
  return value.split(";")[0].trim().toLowerCase();
}

function extractBase64Payload(value: string) {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  return commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
}

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

type ViewerRole = "creator" | "fan";

function resolveViewerRole(req: NextApiRequest): ViewerRole {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

function sanitizeMessageForFan(message: Record<string, unknown>) {
  if (!message || typeof message !== "object") return message;
  const {
    transcriptText,
    transcriptStatus,
    transcriptError,
    transcribedAt,
    transcriptLang,
    intentJson,
    voiceAnalysisJson,
    voiceAnalysisUpdatedAt,
    voiceTranscript,
    voiceTranscriptStatus,
    voiceTranscriptError,
    voiceTranscriptLang,
    voiceTranslation,
    voiceTranslationText,
    voiceTranslationLang,
    voiceInsightsJson,
    voiceInsightsUpdatedAt,
    creatorTranslatedText,
    messageTranslations,
    ...rest
  } = message as Record<string, unknown>;
  return rest;
}

async function loadReactionSummaries(
  messageIds: string[],
  viewer?: ReactionActor | null
): Promise<Record<string, ReturnType<typeof buildReactionSummary>>> {
  if (!messageIds.length) return {};
  const reactions = await prisma.messageReaction.findMany({
    where: { messageId: { in: messageIds } },
    select: { messageId: true, emoji: true, actorType: true, actorId: true },
    orderBy: { createdAt: "asc" },
  });
  const byMessage = new Map<string, typeof reactions>();
  for (const reaction of reactions) {
    const list = byMessage.get(reaction.messageId) ?? [];
    list.push(reaction);
    byMessage.set(reaction.messageId, list);
  }
  const summaryById: Record<string, ReturnType<typeof buildReactionSummary>> = {};
  for (const id of messageIds) {
    summaryById[id] = buildReactionSummary(byMessage.get(id) ?? [], viewer ?? undefined);
  }
  return summaryById;
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;
  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("No creator found");
  }
  return creator.id;
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
  const viewerRole = resolveViewerRole(req);
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
    const includeTranslations = viewerRole === "creator";
    const messages = await prisma.message.findMany({
      where,
      orderBy: { id: "asc" },
      include: {
        contentItem: true,
        ...(includeTranslations
          ? { messageTranslations: { orderBy: { createdAt: "desc" } } }
          : {}),
      },
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
        const now = new Date();
        const data =
          viewerRole === "creator"
            ? { lastReadAtCreator: now }
            : { lastReadAtFan: now };
        await prisma.fan.updateMany({
          where: { id: normalizedFanId },
          data,
        });
      } catch (updateErr) {
        console.error("api/messages markRead error", { fanId: normalizedFanId, error: (updateErr as Error)?.message });
      }
    }
    const messageIds = filteredMessages
      .map((message) => (typeof message.id === "string" ? message.id : ""))
      .filter(Boolean);
    const viewerActor: ReactionActor | null =
      viewerRole === "creator"
        ? { actorType: "CREATOR", actorId: await resolveCreatorId() }
        : { actorType: "FAN", actorId: normalizedFanId };
    const reactionSummaries = await loadReactionSummaries(messageIds, viewerActor);
    const withReactions = filteredMessages.map((message) => ({
      ...message,
      reactionsSummary: reactionSummaries[message.id] ?? [],
    }));

    const responseMessages =
      viewerRole === "fan"
        ? withReactions.map((message) => sanitizeMessageForFan(message as Record<string, unknown>))
        : withReactions;

    return res.status(200).json({ ok: true, items: responseMessages, messages: responseMessages });
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
  const {
    fanId,
    text,
    from,
    type,
    contentItemId,
    audience,
    stickerId,
    actionKey,
    audioBase64,
    mimeType,
    durationMs,
  } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }
  const normalizedFanId = fanId.trim();
  const viewerRole = resolveViewerRole(req);

  const normalizedType =
    type === "CONTENT"
      ? "CONTENT"
      : type === "STICKER"
      ? "STICKER"
      : type === "VOICE"
      ? "VOICE"
      : "TEXT";

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
  if (normalizedType === "VOICE") {
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ ok: false, error: "audioBase64 is required for voice messages" });
    }
    if (!mimeType || typeof mimeType !== "string") {
      return res.status(400).json({ ok: false, error: "mimeType is required for voice messages" });
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
      : normalizedType === "VOICE"
      ? ""
      : typeof text === "string"
      ? text
      : "";

  const normalizedMime = normalizedType === "VOICE" ? normalizeMimeType(mimeType as string) : "";
  const parsedDurationMs = Number(durationMs);

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

  if (normalizedType === "VOICE") {
    if (!ALLOWED_VOICE_MIME.has(normalizedMime)) {
      return res.status(400).json({ ok: false, error: "Unsupported audio format" });
    }
    if (Number.isFinite(parsedDurationMs)) {
      if (parsedDurationMs <= 0) {
        return res.status(400).json({ ok: false, error: "Invalid duration" });
      }
      if (parsedDurationMs > MAX_VOICE_DURATION_MS) {
        return res.status(400).json({ ok: false, error: "Audio too long" });
      }
    }
  }
  const time = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  let voicePayload: {
    audioUrl: string;
    audioMime: string;
    audioSizeBytes: number;
    audioDurationMs: number | null;
  } | null = null;

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: normalizedFanId },
      select: { isBlocked: true, preferredLanguage: true, creatorId: true, inviteUsedAt: true, inviteToken: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }
    if (normalizedFrom === "creator" && fan.isBlocked && normalizedAudience !== "INTERNAL") {
      return res.status(403).json({ ok: false, error: "CHAT_BLOCKED" });
    }

    if (normalizedType === "VOICE") {
      const base64Payload = extractBase64Payload(audioBase64 as string);
      const bytes = Buffer.from(base64Payload, "base64");
      if (!bytes.length || bytes.length < MIN_VOICE_BYTES) {
        return res.status(400).json({ ok: false, error: "No se detectó audio" });
      }
      if (bytes.length > MAX_VOICE_BYTES) {
        return res.status(400).json({ ok: false, error: "Audio too large" });
      }
      const stored = await saveVoice({
        fanId: normalizedFanId,
        bytes,
        mimeType: normalizedMime,
      });
      voicePayload = {
        audioUrl: stored.url,
        audioMime: normalizedMime,
        audioSizeBytes: bytes.length,
        audioDurationMs: Number.isFinite(parsedDurationMs) ? Math.round(parsedDurationMs) : null,
      };
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
        fanId: normalizedFanId,
      });
    }

    if (shouldTranslate && normalizedFrom === "fan" && preferredLanguage !== "es") {
      creatorTranslatedText = await translateText({
        text,
        targetLanguage: "es",
        creatorId: fan.creatorId,
        fanId: normalizedFanId,
      });
    }

    const shouldUpdateThread = normalizedAudience !== "INTERNAL";
    if (shouldUpdateThread) {
      await prisma.message.updateMany({
        where: { fanId: normalizedFanId },
        data: { isLastFromCreator: false },
      });
    }

    const created = await prisma.message.create({
      data: {
        id: `${normalizedFanId}-${Date.now()}`,
        fanId: normalizedFanId,
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
        audioUrl: voicePayload?.audioUrl ?? null,
        audioDurationMs: voicePayload?.audioDurationMs ?? null,
        audioMime: voicePayload?.audioMime ?? null,
        audioSizeBytes: voicePayload?.audioSizeBytes ?? null,
      },
      include: { contentItem: true },
    });

    const createdMessage = { ...created, reactionsSummary: [] };

    emitRealtimeEvent({
      eventId: created.id,
      type: "MESSAGE_CREATED",
      creatorId: fan.creatorId,
      fanId: normalizedFanId,
      createdAt: new Date().toISOString(),
      payload: {
        message: {
          id: createdMessage.id,
          fanId: normalizedFanId,
          from: createdMessage.from,
          audience: createdMessage.audience,
          text: createdMessage.text,
          deliveredText: createdMessage.deliveredText,
          creatorTranslatedText: createdMessage.creatorTranslatedText,
          time: createdMessage.time,
          type: createdMessage.type,
          stickerId: createdMessage.stickerId,
          contentItem: createdMessage.contentItem,
          audioUrl: createdMessage.audioUrl,
          audioDurationMs: createdMessage.audioDurationMs,
          audioMime: createdMessage.audioMime,
          audioSizeBytes: createdMessage.audioSizeBytes,
          transcriptText: createdMessage.transcriptText,
          transcriptStatus: createdMessage.transcriptStatus,
          transcriptError: createdMessage.transcriptError,
          transcribedAt: createdMessage.transcribedAt,
          transcriptLang: createdMessage.transcriptLang,
          intentJson: createdMessage.intentJson,
          reactionsSummary: createdMessage.reactionsSummary,
        },
      },
    });

    if (shouldUpdateThread) {
      const previewSource =
        normalizedType === "CONTENT"
          ? created.contentItem?.title || "Contenido compartido"
          : normalizedType === "VOICE"
          ? "🎤 Nota de voz"
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
        if (fan.inviteToken && !fan.inviteUsedAt) {
          fanUpdate.inviteUsedAt = now;
        }
      } else {
        fanUpdate.lastCreatorMessageAt = now;
      }
      if (normalizedFrom === "creator" && normalizedAudience !== "INTERNAL" && isCortexOutreach) {
        fanUpdate.lastCortexOutreachAt = now;
        fanUpdate.lastCortexOutreachKey = normalizedActionKey;
      }
      try {
        await prisma.fan.update({
          where: { id: normalizedFanId },
          data: fanUpdate,
        });
      } catch (updateErr) {
        console.error("api/messages fan-update error", { fanId: normalizedFanId, error: (updateErr as Error)?.message });
      }
    }

    const responseMessage =
      viewerRole === "fan"
        ? sanitizeMessageForFan(createdMessage as Record<string, unknown>)
        : createdMessage;
    return res.status(200).json({
      ok: true,
      message: responseMessage,
      items: [responseMessage],
      messages: [responseMessage],
    });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/messages post error", { fanId: normalizedFanId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error creating message" });
  }
}
