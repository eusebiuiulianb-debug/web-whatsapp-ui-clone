import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { dedupeGet, dedupeSet, hashText, rateLimitOrThrow } from "../../../../lib/ai/guardrails";
import { markTranscriptPending, runVoiceNoteTranscription, type TranscriptStatus } from "../../../../server/transcription/voiceNoteTranscription";

type TranscribeResponse =
  | { ok: true; status: TranscriptStatus; transcriptText?: string | null; started?: boolean }
  | { ok: false; status?: TranscriptStatus; error: string; retryAfterSec?: number };

const DEDUPE_TTL_SEC = 30 * 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse<TranscribeResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const messageId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!messageId) {
    return res.status(400).json({ ok: false, error: "messageId is required" });
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        fanId: true,
        audioUrl: true,
        audioMime: true,
        audioSizeBytes: true,
        transcriptStatus: true,
        transcriptText: true,
        fan: {
          select: { creatorId: true },
        },
      },
    });
    if (!message) {
      return res.status(404).json({ ok: false, error: "Voice note not found" });
    }
    const creatorId = await resolveCreatorId();
    if (message.fan.creatorId !== creatorId) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    if (message.transcriptStatus === "DONE") {
      res.setHeader("x-cache", "db");
      return res.status(200).json({ ok: true, status: "DONE", transcriptText: message.transcriptText ?? "" });
    }
    if (message.transcriptStatus === "PENDING") {
      res.setHeader("x-cache", "db");
      return res.status(202).json({ ok: true, status: "PENDING", started: false });
    }

    const sourceHash = hashText(
      [message.audioUrl, message.audioMime, String(message.audioSizeBytes ?? "")].filter(Boolean).join("|")
    );
    const dedupeKey = `ai:voice_transcribe:${creatorId}:${message.id}:${sourceHash}`;
    const deduped = await dedupeGet<TranscribeResponse>(dedupeKey);
    if (deduped && deduped.ok) {
      res.setHeader("x-cache", "dedupe");
      return res.status(202).json(deduped);
    }

    const rateLimit = await rateLimitOrThrow({ creatorId, action: "voice_transcribe" });
    if (typeof rateLimit.remaining === "number") {
      res.setHeader("x-ratelimit-remaining", String(rateLimit.remaining));
    }

    await markTranscriptPending({ messageId: message.id });
    const settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId: message.fan.creatorId },
      select: {
        voiceTranscriptionExtractIntentTags: true,
        voiceTranscriptionSuggestReply: true,
        voiceIntentTagsEnabled: true,
      },
    });

    void runVoiceNoteTranscription({
      messageId: message.id,
      fanId: message.fanId,
      creatorId: message.fan.creatorId,
      audioUrl: message.audioUrl,
      audioMime: message.audioMime,
      audioSizeBytes: message.audioSizeBytes,
      extractIntentTags:
        typeof settings?.voiceTranscriptionExtractIntentTags === "boolean"
          ? settings.voiceTranscriptionExtractIntentTags
          : Boolean(settings?.voiceIntentTagsEnabled),
      suggestReply: Boolean(settings?.voiceTranscriptionSuggestReply),
    });

    const payload: TranscribeResponse = { ok: true, status: "PENDING", started: true };
    res.setHeader("x-cache", "miss");
    await dedupeSet(dedupeKey, payload, DEDUPE_TTL_SEC);
    return res.status(202).json(payload);
  } catch (err) {
    if (isRateLimitError(err)) {
      const retryAfterSec = err.retryAfterSec ?? 60;
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ ok: false, error: "RATE_LIMITED", retryAfterSec });
    }
    console.error("voice-note transcribe error", err);
    return res.status(500).json({ ok: false, error: "Transcription failed" });
  }
}

function resolveViewerRole(req: NextApiRequest): "creator" | "fan" {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

function isRateLimitError(err: unknown): err is { status?: number; retryAfterSec?: number } {
  if (!err || typeof err !== "object") return false;
  return "status" in err && (err as { status?: number }).status === 429;
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
