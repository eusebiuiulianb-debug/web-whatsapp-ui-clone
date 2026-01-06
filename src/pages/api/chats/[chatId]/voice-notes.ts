import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import fs from "fs/promises";
import formidable, { type File } from "formidable";
import prisma from "../../../../lib/prisma.server";
import { normalizeAudience, normalizeFrom, type MessageAudience } from "../../../../lib/messageAudience";

type VoiceNoteResponse =
  | { ok: true; message: any; messages?: any[] }
  | { ok: false; error: string };

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_DURATION_MS = 120 * 1000;
const ALLOWED_MIME = new Set(["audio/webm", "audio/ogg", "audio/mp4"]);

function getExtensionFromMime(mime: string) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
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

export default async function handler(req: NextApiRequest, res: NextApiResponse<VoiceNoteResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const chatIdParam = typeof req.query.chatId === "string" ? req.query.chatId.trim() : "";
  if (!chatIdParam || !isSafeChatId(chatIdParam)) {
    return res.status(400).json({ ok: false, error: "chatId is required" });
  }

  const form = formidable({
    multiples: false,
    maxFileSize: MAX_SIZE_BYTES + 1024,
    allowEmptyFiles: false,
  });

  try {
    const { fields, files } = await new Promise<{
      fields: formidable.Fields;
      files: formidable.Files;
    }>((resolve, reject) => {
      form.parse(req, (err, parsedFields, parsedFiles) => {
        if (err) reject(err);
        else resolve({ fields: parsedFields, files: parsedFiles });
      });
    });

    const fileCandidate = (files.file ?? files.audio ?? null) as File | File[] | null;
    const file = Array.isArray(fileCandidate) ? fileCandidate[0] : fileCandidate;
    if (!file) {
      return res.status(400).json({ ok: false, error: "Missing audio file" });
    }

    const mimeType = file.mimetype || "";
    if (!ALLOWED_MIME.has(mimeType)) {
      return res.status(400).json({ ok: false, error: "Unsupported audio format" });
    }

    const durationMs = Number(Array.isArray(fields.durationMs) ? fields.durationMs[0] : fields.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid duration" });
    }
    if (durationMs > MAX_DURATION_MS) {
      return res.status(400).json({ ok: false, error: "Audio too long" });
    }

    const sizeBytes = typeof file.size === "number" ? file.size : 0;
    if (sizeBytes > MAX_SIZE_BYTES) {
      return res.status(400).json({ ok: false, error: "Audio too large" });
    }

    const rawFrom = Array.isArray(fields.from) ? fields.from[0] : fields.from;
    const normalizedFrom = normalizeFrom(typeof rawFrom === "string" ? rawFrom : undefined);
    const storedFrom = normalizedFrom === "fan" ? "fan" : "creator";
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
      select: { id: true, isBlocked: true, inviteToken: true, inviteUsedAt: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }
    if (storedFrom === "creator" && fan.isBlocked && normalizedAudience !== "INTERNAL") {
      return res.status(403).json({ ok: false, error: "CHAT_BLOCKED" });
    }

    const messageId = `${chatIdParam}-${Date.now()}`;
    const extension = getExtensionFromMime(mimeType);
    const relativeDir = path.posix.join("uploads", "voice-notes", chatIdParam);
    const destDir = path.join(process.cwd(), "public", "uploads", "voice-notes", chatIdParam);
    await fs.mkdir(destDir, { recursive: true });
    const filename = `${messageId}.${extension}`;
    const destPath = path.join(destDir, filename);
    await moveFile(file.filepath, destPath);
    const audioUrl = `/${path.posix.join(relativeDir, filename)}`;
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
        audioMime: mimeType,
        audioSizeBytes: sizeBytes,
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

    return res.status(200).json({ ok: true, message: created, messages: [created] });
  } catch (err) {
    console.error("voice-note upload error", err);
    return res.status(500).json({ ok: false, error: "Upload failed" });
  }
}
