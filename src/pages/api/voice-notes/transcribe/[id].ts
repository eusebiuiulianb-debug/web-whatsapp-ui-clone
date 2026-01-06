import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { markTranscriptPending, runVoiceNoteTranscription, type TranscriptStatus } from "../../../../server/transcription/voiceNoteTranscription";

type TranscribeResponse =
  | { ok: true; status: TranscriptStatus; transcriptText?: string | null; started?: boolean }
  | { ok: false; status?: TranscriptStatus; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<TranscribeResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
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

    if (message.transcriptStatus === "DONE") {
      return res.status(200).json({ ok: true, status: "DONE", transcriptText: message.transcriptText ?? "" });
    }
    if (message.transcriptStatus === "PENDING") {
      return res.status(202).json({ ok: true, status: "PENDING", started: false });
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

    return res.status(202).json({ ok: true, status: "PENDING", started: true });
  } catch (err) {
    console.error("voice-note transcribe error", err);
    return res.status(500).json({ ok: false, error: "Transcription failed" });
  }
}
