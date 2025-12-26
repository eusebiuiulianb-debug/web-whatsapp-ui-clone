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
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendBadRequest(res, "Method not allowed");
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
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

    const followUps = await prisma.fanFollowUp.findMany({
      where: {
        fanId,
        creatorId: fan.creatorId,
        status: { in: ["DONE", "DELETED"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json({
      ok: true,
      history: followUps.map(mapFollowUp),
    });
  } catch (err) {
    console.error("Error loading follow-up history", err);
    return sendServerError(res);
  }
}

function mapFollowUp(followUp: {
  id: string;
  title: string;
  note: string | null;
  dueAt: Date | null;
  status: "OPEN" | "DONE" | "DELETED";
  createdAt: Date;
  updatedAt: Date;
  doneAt: Date | null;
}): FollowUpPayload {
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
