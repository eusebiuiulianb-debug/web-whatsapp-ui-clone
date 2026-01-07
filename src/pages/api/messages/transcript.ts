import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";

const MIN_TRANSCRIPT_LEN = 3;
const MAX_TRANSCRIPT_LEN = 4000;

type TranscriptResponse =
  | { ok: true; transcript: string }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<TranscriptResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  const { messageId, fanId, transcript } = req.body || {};
  const normalizedMessageId = typeof messageId === "string" ? messageId.trim() : "";
  const normalizedFanId = typeof fanId === "string" ? fanId.trim() : "";
  const transcriptText = typeof transcript === "string" ? transcript.trim() : "";

  if (!normalizedMessageId) {
    return res.status(400).json({ ok: false, error: "messageId is required" });
  }
  if (!normalizedFanId) {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }
  if (!transcriptText) {
    return res.status(400).json({ ok: false, error: "transcript is required" });
  }
  if (transcriptText.length < MIN_TRANSCRIPT_LEN) {
    return res.status(400).json({ ok: false, error: "transcript is too short" });
  }
  if (transcriptText.length > MAX_TRANSCRIPT_LEN) {
    return res.status(400).json({ ok: false, error: "transcript is too long" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const message = await prisma.message.findUnique({
      where: { id: normalizedMessageId },
      select: {
        id: true,
        type: true,
        fanId: true,
        fan: { select: { creatorId: true } },
      },
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: "Message not found" });
    }
    if (message.type !== "VOICE") {
      return res.status(400).json({ ok: false, error: "Only voice messages can be updated" });
    }
    if (normalizedFanId !== message.fanId) {
      return res.status(400).json({ ok: false, error: "fanId mismatch" });
    }
    if (message.fan.creatorId !== creatorId) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    await prisma.message.update({
      where: { id: message.id },
      data: {
        transcriptText: transcriptText,
        transcriptStatus: "DONE",
        transcriptError: null,
        transcribedAt: new Date(),
        transcriptLang: null,
      },
    });

    return res.status(200).json({ ok: true, transcript: transcriptText });
  } catch (err) {
    console.error("messages/transcript error", err);
    return res.status(500).json({ ok: false, error: "Error saving transcript" });
  }
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
