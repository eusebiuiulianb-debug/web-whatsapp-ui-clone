import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.server";
import { emitCreatorEvent } from "../realtimeHub";
import { safeOpenAiChatCompletion } from "../ai/openAiClient";
import { getVoiceTranscriptionProvider } from "./voiceTranscriptionProviders";

export type TranscriptStatus = "OFF" | "PENDING" | "DONE" | "FAILED";

export type VoiceIntentJson = {
  intent?: string;
  tags?: string[];
  needsReply?: boolean;
  replyDraft?: string;
};

type TranscriptUpdate = {
  messageId: string;
  fanId: string;
  creatorId: string;
  status: TranscriptStatus;
  transcriptText?: string | null;
  transcriptLang?: string | null;
  error?: string | null;
  intentJson?: VoiceIntentJson | null;
};

type TranscriptionJob = {
  messageId: string;
  fanId: string;
  creatorId: string;
  audioUrl: string | null;
  audioMime?: string | null;
  audioSizeBytes?: number | null;
  extractIntentTags?: boolean;
  suggestReply?: boolean;
};

function parseIntentJson(raw: string): VoiceIntentJson | null {
  if (!raw) return null;
  let trimmed = raw.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    trimmed = trimmed.slice(firstBrace, lastBrace + 1);
  }
  try {
    const parsed = JSON.parse(trimmed) as VoiceIntentJson | null;
    if (!parsed || typeof parsed !== "object") return null;
    const intent = typeof parsed.intent === "string" ? parsed.intent.trim() : "";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
          .filter((tag) => tag.length > 0)
      : [];
    const needsReply = typeof parsed.needsReply === "boolean" ? parsed.needsReply : Boolean(parsed.needsReply);
    const replyDraft = typeof parsed.replyDraft === "string" ? parsed.replyDraft.trim() : "";
    const result: VoiceIntentJson = {};
    if (intent) result.intent = intent;
    if (tags.length > 0) result.tags = Array.from(new Set(tags));
    if (needsReply) result.needsReply = true;
    if (replyDraft) result.replyDraft = replyDraft;
    if (!result.intent && !result.tags && !result.needsReply && !result.replyDraft) return null;
    return result;
  } catch (_err) {
    return null;
  }
}

async function generateIntentTags(params: { transcriptText: string; creatorId: string; fanId: string }) {
  const prompt = `Devuelve SOLO JSON con las claves: intent (string), tags (array de strings), needsReply (boolean), replyDraft (string).\n\nTranscripción:\n"""${params.transcriptText}"""`;
  const result = await safeOpenAiChatCompletion({
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente que resume intenciones y etiquetas de notas de voz para un creador. Responde únicamente JSON válido.",
      },
      { role: "user", content: prompt },
    ],
    model: process.env.OPENAI_INTENT_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    creatorId: params.creatorId,
    fanId: params.fanId,
    route: "voice_intent_tags",
  });

  if (result.usedFallback) return null;
  return parseIntentJson(result.text);
}

async function applyTranscriptUpdate(update: TranscriptUpdate) {
  const now = new Date();
  const transcriptText = update.status === "DONE" ? update.transcriptText ?? "" : null;
  const transcriptError = update.status === "FAILED" ? update.error ?? "transcription_failed" : null;
  const transcriptLang = update.status === "DONE" ? update.transcriptLang ?? null : null;

  const data: Prisma.MessageUncheckedUpdateInput = {
    transcriptStatus: update.status,
    transcriptText,
    transcriptError,
    transcribedAt: update.status === "DONE" ? now : null,
    transcriptLang,
  };
  if (update.intentJson !== undefined) {
    data.intentJson = update.intentJson === null ? Prisma.JsonNull : (update.intentJson as Prisma.InputJsonValue);
  }

  await prisma.message.update({
    where: { id: update.messageId },
    data,
  });

  const payload: Record<string, unknown> = {
    chatId: update.fanId,
    fanId: update.fanId,
    messageId: update.messageId,
    transcriptText,
    transcriptStatus: update.status,
    transcriptError,
    transcribedAt: update.status === "DONE" ? now.toISOString() : null,
    transcriptLang,
  };
  if (update.intentJson !== undefined) {
    payload.intentJson = update.intentJson;
  }

  emitCreatorEvent({
    eventId: `voice-note-transcribed-${update.messageId}-${now.getTime()}`,
    type: "voice_note_transcribed",
    creatorId: update.creatorId,
    fanId: update.fanId,
    createdAt: now.toISOString(),
    payload,
  });
}

export async function runVoiceNoteTranscription(job: TranscriptionJob) {
  if (!job.audioUrl) {
    await applyTranscriptUpdate({
      messageId: job.messageId,
      fanId: job.fanId,
      creatorId: job.creatorId,
      status: "FAILED",
      error: "audio_unavailable",
      intentJson: null,
    });
    return { status: "FAILED", error: "audio_unavailable" } as const;
  }

  const provider = getVoiceTranscriptionProvider();
  const result = await provider.transcribeVoiceNote({
    messageId: job.messageId,
    audioUrl: job.audioUrl,
    audioMime: job.audioMime ?? null,
    audioSizeBytes: job.audioSizeBytes ?? null,
  });

  if (result.status === "DONE") {
    const shouldGenerateIntent = Boolean(job.extractIntentTags || job.suggestReply);
    let intentJson = shouldGenerateIntent
      ? await generateIntentTags({
          transcriptText: result.transcriptText,
          creatorId: job.creatorId,
          fanId: job.fanId,
        })
      : undefined;
    if (intentJson) {
      if (!job.extractIntentTags) {
        delete intentJson.intent;
        delete intentJson.tags;
        delete intentJson.needsReply;
      }
      if (!job.suggestReply) {
        delete intentJson.replyDraft;
      }
      if (
        !intentJson.intent &&
        (!intentJson.tags || intentJson.tags.length === 0) &&
        !intentJson.needsReply &&
        !intentJson.replyDraft
      ) {
        intentJson = null;
      }
    }
    await applyTranscriptUpdate({
      messageId: job.messageId,
      fanId: job.fanId,
      creatorId: job.creatorId,
      status: "DONE",
      transcriptText: result.transcriptText,
      transcriptLang: result.transcriptLang ?? null,
      intentJson,
    });
    return { status: "DONE", transcriptText: result.transcriptText } as const;
  }

  await applyTranscriptUpdate({
    messageId: job.messageId,
    fanId: job.fanId,
    creatorId: job.creatorId,
    status: "FAILED",
    error: result.error,
    intentJson: null,
  });
  return { status: "FAILED", error: result.error } as const;
}

export async function markTranscriptPending(params: { messageId: string }) {
  await prisma.message.update({
    where: { id: params.messageId },
    data: {
      transcriptStatus: "PENDING",
      transcriptError: null,
      transcriptText: null,
      transcribedAt: null,
      transcriptLang: null,
      intentJson: Prisma.JsonNull,
    },
  });
}
