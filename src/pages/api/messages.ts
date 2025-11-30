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
    return res.status(200).json({ messages: [] });
  }

  try {
    const messages = await prisma.message.findMany({
      where: { fanId },
      orderBy: { time: "asc" },
    });

    console.log("DEBUG get messages for fan", fanId, "count", messages.length);
    return res.status(200).json({ messages });
  } catch (_err) {
    return res.status(200).json({ messages: [] });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { fanId, text, from } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ error: "fanId is required" });
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
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

    const created = await prisma.message.create({
      data: {
        id: `${fanId}-${Date.now()}`,
        fanId,
        from: normalizedFrom,
        text: typeof text === "string" ? text : "",
        time,
        isLastFromCreator: normalizedFrom === "creator",
      },
    });

    console.log("DEBUG created message", created);
    return res.status(201).json({ message: created });
  } catch (err) {
    console.error("Error creating message (debug):", err);
    return res.status(500).json({ error: "Error creating message" });
  }
}
