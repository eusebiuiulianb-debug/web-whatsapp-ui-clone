import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

type FollowUpPayload = {
  id: string;
  title: string;
  note: string | null;
  dueAt: string | null;
  status: "OPEN" | "DONE" | "DELETED";
  createdAt: string | null;
  updatedAt: string | null;
  doneAt: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendBadRequest(res, "Method not allowed");
  }

  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId.trim() : "";
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, creatorId: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const openFollowUp = await prisma.fanFollowUp.findFirst({
      where: { fanId, creatorId: fan.creatorId, status: "OPEN" },
      orderBy: { updatedAt: "desc" },
    });

    if (!openFollowUp) {
      await prisma.fan.update({ where: { id: fanId }, data: { nextAction: null } });
      return res.status(200).json({ ok: true, followUp: null });
    }

    const followUp = await prisma.fanFollowUp.update({
      where: { id: openFollowUp.id },
      data: { status: "DONE", doneAt: new Date() },
    });

    await prisma.fan.update({ where: { id: fanId }, data: { nextAction: null } });

    return res.status(200).json({ ok: true, followUp: mapFollowUp(followUp) });
  } catch (err) {
    console.error("Error marking follow-up as done", err);
    return sendServerError(res);
  }
}

function mapFollowUp(
  followUp: {
    id: string;
    title: string;
    note: string | null;
    dueAt: Date | null;
    status: "OPEN" | "DONE" | "DELETED";
    createdAt: Date;
    updatedAt: Date;
    doneAt: Date | null;
  }
): FollowUpPayload {
  return {
    id: followUp.id,
    title: followUp.title,
    note: followUp.note ?? null,
    dueAt: followUp.dueAt ? followUp.dueAt.toISOString() : null,
    status: followUp.status,
    createdAt: followUp.createdAt ? followUp.createdAt.toISOString() : null,
    updatedAt: followUp.updatedAt ? followUp.updatedAt.toISOString() : null,
    doneAt: followUp.doneAt ? followUp.doneAt.toISOString() : null,
  };
}
