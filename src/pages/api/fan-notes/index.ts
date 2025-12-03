import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

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
    const creatorId = await resolveCreatorId();

    const notes = await prisma.fanNote.findMany({
      where: { fanId, creatorId },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ notes });
  } catch (err) {
    console.error("Error loading fan notes", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { fanId, content } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  const trimmedContent = typeof content === "string" ? content.trim() : "";
  if (!trimmedContent) {
    return sendBadRequest(res, "content is required");
  }

  try {
    const creatorId = await resolveCreatorId();

    const note = await prisma.fanNote.create({
      data: {
        fanId,
        creatorId,
        content: trimmedContent,
      },
    });

    return res.status(201).json({ note });
  } catch (err) {
    console.error("Error creating fan note", err);
    return sendServerError(res);
  }
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("No creator found to attach note");
  }

  return creator.id;
}
