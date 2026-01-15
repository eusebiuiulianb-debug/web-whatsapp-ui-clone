import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { onCreatorTypingEvent, type CreatorTypingEvent } from "../../../server/realtimeHub";

export const config = {
  api: {
    bodyParser: false,
  },
};

const HEARTBEAT_MS = 20_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawFanId = Array.isArray(req.query.fanId) ? req.query.fanId[0] : req.query.fanId;
  const rawConversationId = Array.isArray(req.query.conversationId)
    ? req.query.conversationId[0]
    : req.query.conversationId;
  const resolvedId =
    typeof rawFanId === "string" && rawFanId.trim()
      ? rawFanId.trim()
      : typeof rawConversationId === "string"
      ? rawConversationId.trim()
      : "";
  if (!resolvedId) {
    return res.status(400).json({ error: "Missing fanId" });
  }

  const fan = await prisma.fan.findUnique({
    where: { id: resolvedId },
    select: { id: true, creatorId: true },
  });
  if (!fan?.creatorId) {
    return res.status(404).json({ error: "FAN_NOT_FOUND" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);
  (res as { flushHeaders?: () => void }).flushHeaders?.();

  const sendTypingEvent = (event: CreatorTypingEvent) => {
    res.write("event: typing\n");
    res.write(
      `data: ${JSON.stringify({
        conversationId: event.conversationId,
        fanId: event.fanId,
        isTyping: event.isTyping,
        senderRole: event.senderRole,
        ts: event.ts,
      })}\n\n`
    );
  };

  const off = onCreatorTypingEvent((event) => {
    if (event.creatorId !== fan.creatorId) return;
    if (event.fanId !== fan.id && event.conversationId !== fan.id) return;
    sendTypingEvent(event);
  });

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    off();
  });
}
