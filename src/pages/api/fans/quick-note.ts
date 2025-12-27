import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId.trim() : "";
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  const rawNote = typeof req.body?.quickNote === "string" ? req.body.quickNote.trim() : "";
  const quickNote = rawNote.length > 0 ? rawNote : null;

  try {
    const creatorId = await resolveCreatorId();
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, creatorId: true },
    });

    if (!fan || fan.creatorId !== creatorId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await prisma.fan.update({
      where: { id: fanId },
      data: { quickNote },
      select: { id: true, quickNote: true },
    });

    return res.status(200).json({ ok: true, quickNote: updated.quickNote ?? null });
  } catch (err) {
    console.error("Error saving quick note", err);
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
    throw new Error("No creator found to attach quick note");
  }

  return creator.id;
}
