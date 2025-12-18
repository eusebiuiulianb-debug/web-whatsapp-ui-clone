import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma.server";

type MessageResponse =
  | { ok: true; items: any[]; messages?: any[] }
  | { ok: true; message: any; items?: any[]; messages?: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<MessageResponse>) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<MessageResponse>) {
  const { fanId } = req.query;

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  try {
    const messages = await prisma.message.findMany({
      where: { fanId },
      orderBy: { id: "asc" },
      include: { contentItem: true },
    });

    return res.status(200).json({ ok: true, items: messages, messages });
  } catch (err) {
    console.error("api/messages get error", { fanId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error fetching messages" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<MessageResponse>) {
  const { fanId, text, from, type, contentItemId } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  const normalizedType = type === "CONTENT" ? "CONTENT" : "TEXT";

  if (normalizedType === "TEXT") {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "text is required" });
    }
  }

  if (normalizedType === "CONTENT") {
    if (!contentItemId || typeof contentItemId !== "string") {
      return res.status(400).json({ ok: false, error: "contentItemId is required for content messages" });
    }
  }

  const normalizedFrom = from === "fan" ? "fan" : "creator";
  const time = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { isBlocked: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }
    if (normalizedFrom === "creator" && fan.isBlocked) {
      return res.status(403).json({ ok: false, error: "CHAT_BLOCKED" });
    }

    await prisma.message.updateMany({
      where: { fanId },
      data: { isLastFromCreator: false },
    });

    const created = await prisma.message.create({
      data: {
        id: `${fanId}-${Date.now()}`,
        fanId,
        from: normalizedFrom,
        text: typeof text === "string" ? text : "",
        time,
        isLastFromCreator: normalizedFrom === "creator",
        type: normalizedType,
        contentItemId: normalizedType === "CONTENT" ? (contentItemId as string) : null,
      },
      include: { contentItem: true },
    });

    if (normalizedFrom === "fan") {
      try {
        await prisma.fan.update({
          where: { id: fanId },
          data: { isArchived: false },
        });
      } catch (updateErr) {
        console.error("api/messages auto-unarchive error", { fanId, error: (updateErr as Error)?.message });
      }
    }

    return res.status(200).json({ ok: true, message: created, items: [created], messages: [created] });
  } catch (err) {
    console.error("api/messages post error", { fanId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error creating message" });
  }
}
