import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma";
import { sendBadRequest, sendServerError } from "../../lib/apiError";

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
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const messages = await prisma.message.findMany({
      where: { fanId },
      orderBy: { id: "asc" },
      include: { contentItem: true },
    });

    return res.status(200).json({ messages });
  } catch (err) {
    console.error("Error fetching messages", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { fanId, text, from, type, contentItemId } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  const normalizedType = type === "CONTENT" ? "CONTENT" : "TEXT";

  if (normalizedType === "TEXT") {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return sendBadRequest(res, "text is required");
    }
  }

  if (normalizedType === "CONTENT") {
    if (!contentItemId || typeof contentItemId !== "string") {
      return sendBadRequest(res, "contentItemId is required for content messages");
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
      return sendBadRequest(res, "Fan not found");
    }
    if (normalizedFrom === "creator" && fan.isBlocked) {
      return res.status(403).json({ error: "CHAT_BLOCKED" });
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
        console.error("Error auto-unarchiving fan after incoming message", updateErr);
      }
    }

    return res.status(200).json({ message: created });
  } catch (err) {
    console.error("Error creating message", err);
    return sendServerError(res);
  }
}
