import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import path from "path";
import fs from "fs/promises";
import formidable, { type File } from "formidable";
import prisma from "../../../../lib/prisma.server";
import { normalizeAudience, normalizeFrom, type MessageAudience } from "../../../../lib/messageAudience";
import { emitCreatorEvent as emitRealtimeEvent } from "../../../../server/realtimeHub";

type VoiceNoteResponse =
  | { ok: true; message: any; messages?: any[]; reused: boolean }
  | { ok: false; error: string };

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_DURATION_MS = 120 * 1000;
const MIN_AUDIO_BYTES = 2 * 1024;
const ALLOWED_MIME = new Set(["audio/webm", "audio/ogg", "audio/mp4"]);
const MAX_CLIENT_TXN_ID = 120;

function normalizeMimeType(mime: string) {
  return mime.split(";")[0].trim().toLowerCase();
}

function getExtensionFromMime(mime: string) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

function normalizeClientTxnId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CLIENT_TXN_ID);
}

function sanitizeFileToken(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function isSafeChatId(chatId: string) {
  return !chatId.includes("/") && !chatId.includes("\\") && chatId.trim().length > 0;
}

async function moveFile(source: string, dest: string) {
  try {
    await fs.rename(source, dest);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "EXDEV") {
      throw err;
    }
    await fs.copyFile(source, dest);
    await fs.unlink(source);
  }
}

async function safeUnlink(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (_err) {
    // ignore
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<VoiceNoteResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const chatIdParam = typeof req.query.chatId === "string" ? req.query.chatId.trim() : "";
  if (!chatIdParam || !isSafeChatId(chatIdParam)) {
    return res.status(400).json({ ok: false, error: "chatId is required" });
  }
  const requestContentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : "";

  const form = formidable({
    multiples: false,
    maxFileSize: MAX_SIZE_BYTES + 1024,
    allowEmptyFiles: false,
  });

  try {
    let fields: formidable.Fields;
    let files: formidable.Files;
    try {
      const parsed = await new Promise<{
        fields: formidable.Fields;
        files: formidable.Files;
      }>((resolve, reject) => {
        form.parse(req, (err, parsedFields, parsedFiles) => {
          if (err) reject(err);
          else resolve({ fields: parsedFields, files: parsedFiles });
        });
      });
      fields = parsed.fields;
      files = parsed.files;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid multipart payload";
      console.error("voice-note parse error", err);
      return res.status(400).json({ ok: false, error: message });
    }

    const fileCandidate = (files.file ?? files.audio ?? null) as File | File[] | null;
    const file = Array.isArray(fileCandidate) ? fileCandidate[0] : fileCandidate;
    if (!file) {
      return res.status(400).json({ ok: false, error: "Missing audio file" });
    }

    const rawMimeField = Array.isArray(fields.mime) ? fields.mime[0] : fields.mime;
    const rawMimeFieldAlt = Array.isArray(fields.mimeType) ? fields.mimeType[0] : fields.mimeType;
    const providedMime =
      typeof rawMimeField === "string"
        ? rawMimeField
        : typeof rawMimeFieldAlt === "string"
        ? rawMimeFieldAlt
        : "";
    const mimeType = providedMime || file.mimetype || "";
    let normalizedMime = normalizeMimeType(mimeType);
    if (!ALLOWED_MIME.has(normalizedMime)) {
      const originalName = typeof file.originalFilename === "string" ? file.originalFilename : "";
      const fallbackExt = path.extname(originalName || file.newFilename || "").toLowerCase();
      if (fallbackExt === ".webm") normalizedMime = "audio/webm";
      if (fallbackExt === ".ogg") normalizedMime = "audio/ogg";
      if (fallbackExt === ".mp4") normalizedMime = "audio/mp4";
    }
    if (!ALLOWED_MIME.has(normalizedMime)) {
      return res.status(400).json({ ok: false, error: "Unsupported audio format" });
    }

    const durationMs = Number(Array.isArray(fields.durationMs) ? fields.durationMs[0] : fields.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid duration" });
    }
    if (durationMs > MAX_DURATION_MS) {
      return res.status(400).json({ ok: false, error: "Audio too long" });
    }

    let sizeBytes = typeof file.size === "number" ? file.size : 0;
    if (sizeBytes <= 0) {
      try {
        const stat = await fs.stat(file.filepath);
        sizeBytes = stat.size;
      } catch (_err) {
        sizeBytes = 0;
      }
    }
    if (sizeBytes < MIN_AUDIO_BYTES) {
      console.info("voice-note rejected", {
        chatId: chatIdParam,
        contentType: requestContentType,
        receivedMime: mimeType,
        finalMime: normalizedMime,
        bytes: sizeBytes,
      });
      await safeUnlink(file.filepath);
      return res.status(400).json({ ok: false, error: "No se detectó audio" });
    }
    if (sizeBytes > MAX_SIZE_BYTES) {
      return res.status(400).json({ ok: false, error: "Audio too large" });
    }

    const rawFrom = Array.isArray(fields.from) ? fields.from[0] : fields.from;
    const normalizedFrom = normalizeFrom(typeof rawFrom === "string" ? rawFrom : undefined);
    const storedFrom = normalizedFrom === "fan" ? "fan" : "creator";
    const rawClientTxnId = Array.isArray(fields.clientTxnId) ? fields.clientTxnId[0] : fields.clientTxnId;
    const normalizedClientTxnId = normalizeClientTxnId(rawClientTxnId);
    const safeClientTxnId = normalizedClientTxnId ? sanitizeFileToken(normalizedClientTxnId) : null;
    const rawAudience = Array.isArray(fields.audience) ? fields.audience[0] : fields.audience;
    const parsedAudience = normalizeAudience(typeof rawAudience === "string" ? rawAudience : undefined);
    let normalizedAudience: MessageAudience;
    if (storedFrom === "fan") {
      normalizedAudience = "FAN";
    } else if (!rawAudience || parsedAudience === "CREATOR" || parsedAudience === "FAN") {
      normalizedAudience = "CREATOR";
    } else if (parsedAudience === "INTERNAL") {
      normalizedAudience = "INTERNAL";
    } else {
      return res.status(400).json({ ok: false, error: "Invalid audience" });
    }

    const fan = await prisma.fan.findUnique({
      where: { id: chatIdParam },
      select: {
        id: true,
        isBlocked: true,
        inviteToken: true,
        inviteUsedAt: true,
        creatorId: true,
      },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }
    if (storedFrom === "creator" && fan.isBlocked && normalizedAudience !== "INTERNAL") {
      return res.status(403).json({ ok: false, error: "CHAT_BLOCKED" });
    }

    const messageId = `${chatIdParam}-${Date.now()}`;
    const extension = getExtensionFromMime(normalizedMime);
    const relativeDir = path.posix.join("uploads", "voice-notes", chatIdParam);
    const destDir = path.join(process.cwd(), "public", "uploads", "voice-notes", chatIdParam);
    await fs.mkdir(destDir, { recursive: true });
    const fileToken = safeClientTxnId ? `${storedFrom}-${safeClientTxnId}` : messageId;
    const filename = `${fileToken}.${extension}`;
    const destPath = path.join(destDir, filename);
    const publicAudioUrl = `/${path.posix.join(relativeDir, filename)}`;
    const audioUrl = `/api/voice-notes/${chatIdParam}/${filename}`;
    if (safeClientTxnId) {
      const existing = await prisma.message.findFirst({
        where: {
          fanId: chatIdParam,
          from: storedFrom,
          type: "AUDIO",
          OR: [{ audioUrl }, { audioUrl: publicAudioUrl }],
        },
      });
      if (existing) {
        await safeUnlink(file.filepath);
        return res.status(200).json({ ok: true, reused: true, message: existing, messages: [existing] });
      }
    }
    try {
      await moveFile(file.filepath, destPath);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (safeClientTxnId && code === "EEXIST") {
        const existing = await prisma.message.findFirst({
          where: {
            fanId: chatIdParam,
            from: storedFrom,
            type: "AUDIO",
            OR: [{ audioUrl }, { audioUrl: publicAudioUrl }],
          },
        });
        if (existing) {
          await safeUnlink(file.filepath);
          return res.status(200).json({ ok: true, reused: true, message: existing, messages: [existing] });
        }
      }
      throw err;
    }
    const storedStats = await fs.stat(destPath);
    console.info("voice-note stored", {
      chatId: chatIdParam,
      from: storedFrom,
      contentType: requestContentType,
      receivedMime: mimeType,
      finalMime: normalizedMime,
      bytes: storedStats.size,
    });
    const time = new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const shouldUpdateThread = normalizedAudience !== "INTERNAL";
    if (shouldUpdateThread) {
      await prisma.message.updateMany({
        where: { fanId: chatIdParam },
        data: { isLastFromCreator: false },
      });
    }

    const created = await prisma.message.create({
      data: {
        id: messageId,
        fanId: chatIdParam,
        from: storedFrom,
        audience: normalizedAudience,
        text: "",
        deliveredText: null,
        creatorTranslatedText: null,
        time,
        isLastFromCreator: shouldUpdateThread && storedFrom === "creator",
        type: "AUDIO",
        contentItemId: null,
        stickerId: null,
        audioUrl,
        audioDurationMs: Math.round(durationMs),
        audioMime: normalizedMime,
        audioSizeBytes: sizeBytes,
        transcriptText: null,
        transcriptStatus: "OFF",
        transcriptError: null,
        transcribedAt: null,
        transcriptLang: null,
        intentJson: Prisma.JsonNull,
      },
    });

    const createdAtIso = new Date().toISOString();
    emitRealtimeEvent({
      eventId: created.id,
      type: "voice_note_created",
      creatorId: fan.creatorId,
      fanId: chatIdParam,
      createdAt: createdAtIso,
      payload: {
        chatId: chatIdParam,
        messageId: created.id,
        eventId: created.id,
        from: created.from,
        createdAt: createdAtIso,
        durationMs: created.audioDurationMs,
        message: {
          id: created.id,
          fanId: chatIdParam,
          from: created.from,
          audience: created.audience,
          text: created.text,
          deliveredText: created.deliveredText,
          creatorTranslatedText: created.creatorTranslatedText,
          time: created.time,
          type: created.type,
          audioUrl: created.audioUrl,
          audioDurationMs: created.audioDurationMs,
          audioMime: created.audioMime,
          audioSizeBytes: created.audioSizeBytes,
          transcriptText: created.transcriptText,
          transcriptStatus: created.transcriptStatus,
          transcriptError: created.transcriptError,
          transcribedAt: created.transcribedAt,
          transcriptLang: created.transcriptLang,
          intentJson: created.intentJson,
        },
      },
    });

    if (shouldUpdateThread) {
      const preview = "🎤 Nota de voz";
      const now = new Date();
      const fanUpdate: Record<string, unknown> = {
        preview,
        time,
        lastMessageAt: now,
        lastActivityAt: now,
      };
      if (storedFrom === "fan") {
        fanUpdate.isArchived = false;
        fanUpdate.unreadCount = { increment: 1 };
        if (fan.inviteToken && !fan.inviteUsedAt) {
          fanUpdate.inviteUsedAt = now;
        }
      } else {
        fanUpdate.lastCreatorMessageAt = now;
        fanUpdate.unreadCount = 0;
      }
      await prisma.fan.update({
        where: { id: chatIdParam },
        data: fanUpdate,
      });
    }

    return res.status(200).json({ ok: true, reused: false, message: created, messages: [created] });
  } catch (err) {
    console.error("voice-note upload error", err);
    const message = err instanceof Error && err.message ? err.message : "Upload failed";
    return res.status(500).json({ ok: false, error: message });
  }
}
