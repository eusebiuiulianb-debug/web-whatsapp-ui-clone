import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { fanId } = req.query;

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ error: "fanId is required" });
  }

  try {
    const messages = await prisma.message.findMany({
      where: { fanId },
      orderBy: { time: "asc" },
    });

    if (!messages || messages.length === 0) {
      const fanExists = await prisma.fan.findUnique({ where: { id: fanId } });
      if (!fanExists) return res.status(404).json({ error: "Fan not found" });
    }

    const mappedMessages = mapMessages(messages);
    return res.status(200).json({ messages: mappedMessages });
  } catch (_err) {
    return res.status(500).json({ error: "Error loading messages" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { fanId, text, from } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ error: "fanId is required" });
  }

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required" });
  }

  const normalizedFrom = from === "fan" ? "fan" : "creator";
  const time = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  try {
    await prisma.message.updateMany({
      where: { fanId },
      data: { isLastFromCreator: false },
    });

    await prisma.message.create({
      data: {
        id: `${fanId}-${Date.now()}`,
        fanId,
        from: normalizedFrom,
        text,
        time,
        isLastFromCreator: normalizedFrom === "creator",
      },
    });

    const messages = await prisma.message.findMany({
      where: { fanId },
      orderBy: { time: "asc" },
    });

    const mappedMessages = mapMessages(messages);
    return res.status(201).json({ messages: mappedMessages });
  } catch (_err) {
    return res.status(500).json({ error: "Error creating message" });
  }
}

function mapMessages(messages: Array<{
  id: string;
  fanId: string;
  from: string;
  text: string;
  time: string | null;
  isLastFromCreator: boolean | null;
}>) {
  return messages.map((msg) => ({
    id: msg.id,
    fanId: msg.fanId,
    from: msg.from,
    text: msg.text,
    time: msg.time || "",
    isLastFromCreator: msg.isLastFromCreator ?? false,
  }));
}
