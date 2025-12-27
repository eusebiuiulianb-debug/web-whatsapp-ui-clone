import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

function getStartOfToday(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const creatorId = await resolveCreatorId();
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, creatorId: true, attendedAt: true },
    });

    if (!fan || fan.creatorId !== creatorId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const now = new Date();
    const startOfToday = getStartOfToday(now);
    const isAttendedToday = fan.attendedAt ? fan.attendedAt >= startOfToday : false;
    const attendedAt = isAttendedToday ? null : now;

    const updated = await prisma.fan.update({
      where: { id: fanId },
      data: { attendedAt },
      select: { attendedAt: true },
    });

    return res.status(200).json({
      ok: true,
      attendedAt: updated.attendedAt ? updated.attendedAt.toISOString() : null,
    });
  } catch (err) {
    console.error("Error updating attended status", err);
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
    throw new Error("No creator found to attach attended status");
  }

  return creator.id;
}
