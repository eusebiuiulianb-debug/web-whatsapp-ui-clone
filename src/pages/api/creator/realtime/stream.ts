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

  const creatorId = await resolveCreatorId();
  if (!creatorId) {
    const accept = req.headers.accept || "";
    if (accept.includes("text/event-stream")) {
      return res.status(204).end();
    }
    return res.status(401).json({ error: "CREATOR_NOT_FOUND" });
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
  if (creator) return creator.id;
  if (process.env.NODE_ENV === "development" || process.env.DEV_BYPASS_AUTH === "true") {
    try {
      const created = await prisma.creator.create({
        data: {
          id: "creator-1",
          name: "Creator demo",
          subtitle: "Demo",
          description: "Perfil demo generado automáticamente.",
        },
        select: { id: true },
      });
      return created.id;
    } catch (err) {
      const existing = await prisma.creator.findFirst({
        select: { id: true },
        orderBy: { id: "asc" },
      });
      return existing?.id ?? null;
    }
  }
  return null;
}
