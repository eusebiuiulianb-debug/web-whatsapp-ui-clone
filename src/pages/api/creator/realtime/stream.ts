import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { onCreatorEvent, type CreatorRealtimeEvent } from "../../../../server/realtimeHub";

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

  let creatorId: string;
  try {
    creatorId = await resolveCreatorId();
  } catch (err) {
    console.error("Error resolving creator for realtime stream", err);
    return res.status(500).json({ error: "creator_unavailable" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);
  (res as { flushHeaders?: () => void }).flushHeaders?.();

  const sendEvent = (event: CreatorRealtimeEvent) => {
    res.write("event: creator_event\n");
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const off = onCreatorEvent((event) => {
    if (event.creatorId !== creatorId) return;
    sendEvent(event);
  });

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    off();
  });
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;
  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("Creator not found");
  }
  return creator.id;
}
