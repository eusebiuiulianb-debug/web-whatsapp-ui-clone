import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { isFanDraftPreviewEnabled, normalizeFanDraftText } from "../../../lib/fanDraftPreview";
import { emitCreatorTypingEvent } from "../../../server/realtimeHub";

type TypingResponse = { ok: true } | { ok: false; error: string };

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

  const fan = await prisma.fan.findUnique({
    where: { id: normalizedConversationId },
    select: {
      id: true,
      creatorId: true,
      adultConfirmedAt: true,
      creator: {
        select: {
          aiSettings: {
            select: { draftPreviewEnabled: true },
          },
        },
      },
    },
  });
  if (!fan?.creatorId) {
    return res.status(404).json({ ok: false, error: "FAN_NOT_FOUND" });
  }

  const draftPreviewEnabled = isFanDraftPreviewEnabled();
  const creatorAllowsDraftPreview = fan.creator?.aiSettings?.draftPreviewEnabled === true;
  const adultConfirmed = Boolean(fan.adultConfirmedAt);
  const allowDraftPreview =
    draftPreviewEnabled &&
    creatorAllowsDraftPreview &&
    adultConfirmed &&
    normalizedSenderRole === "fan";
  const rawDraftText =
    normalizedSenderRole === "fan" && typeof draftText === "string" ? draftText : null;
  let normalizedDraftText = rawDraftText !== null ? normalizeFanDraftText(rawDraftText) : "";
  if (!isTyping) {
    normalizedDraftText = "";
  }
  const hasDraft = rawDraftText !== null ? normalizedDraftText.length > 0 : undefined;
  let resolvedIsTyping = isTyping;
  if (rawDraftText !== null && !normalizedDraftText) {
    resolvedIsTyping = false;
  }

  // Manual QA: fan without adultConfirmedAt -> event has hasDraft only (no draftText); creator sees dots.
  emitCreatorTypingEvent({
    creatorId: fan.creatorId,
    conversationId: fan.id,
    fanId: fan.id,
    isTyping: resolvedIsTyping,
    senderRole: normalizedSenderRole,
    ...(hasDraft !== undefined ? { hasDraft } : {}),
    ...(allowDraftPreview && rawDraftText !== null ? { draftText: normalizedDraftText } : {}),
    ts: Date.now(),
  });

  return res.status(200).json({ ok: true });
}
