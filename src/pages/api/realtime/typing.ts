import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { emitCreatorTypingEvent } from "../../../server/realtimeHub";

type TypingResponse = { ok: true } | { ok: false; error: string };

const DRAFT_TEXT_MAX_LEN = 240;

function normalizeDraftText(value: string) {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, DRAFT_TEXT_MAX_LEN);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TypingResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { conversationId, isTyping, senderRole, draftText } = (req.body ?? {}) as {
    conversationId?: unknown;
    isTyping?: unknown;
    senderRole?: unknown;
    draftText?: unknown;
  };
  const normalizedConversationId = typeof conversationId === "string" ? conversationId.trim() : "";
  const normalizedSenderRole =
    senderRole === "fan" || senderRole === "creator" ? senderRole : null;
  if (!normalizedConversationId || typeof isTyping !== "boolean" || !normalizedSenderRole) {
    return res.status(400).json({ ok: false, error: "Invalid typing payload" });
  }

  if (draftText !== undefined && draftText !== null && typeof draftText !== "string") {
    return res.status(400).json({ ok: false, error: "Invalid typing payload" });
  }
  const rawDraftText = typeof draftText === "string" ? draftText : null;
  let normalizedDraftText = rawDraftText === null ? undefined : normalizeDraftText(rawDraftText);
  let resolvedIsTyping = isTyping;
  if (normalizedDraftText !== undefined) {
    if (!normalizedDraftText) {
      resolvedIsTyping = false;
      normalizedDraftText = "";
    } else if (!isTyping) {
      normalizedDraftText = "";
    }
  }
  if (normalizedSenderRole !== "fan") {
    normalizedDraftText = undefined;
  }

  const fan = await prisma.fan.findUnique({
    where: { id: normalizedConversationId },
    select: { id: true, creatorId: true },
  });
  if (!fan?.creatorId) {
    return res.status(404).json({ ok: false, error: "FAN_NOT_FOUND" });
  }

  emitCreatorTypingEvent({
    creatorId: fan.creatorId,
    conversationId: fan.id,
    fanId: fan.id,
    isTyping: resolvedIsTyping,
    senderRole: normalizedSenderRole,
    ...(normalizedDraftText !== undefined ? { draftText: normalizedDraftText } : {}),
    ts: Date.now(),
  });

  return res.status(200).json({ ok: true });
}
