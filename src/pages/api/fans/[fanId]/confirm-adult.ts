import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { emitCreatorEvent } from "../../../../server/realtimeHub";

const ADULT_CONFIRM_VERSION = "v1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) return sendBadRequest(res, "Missing fanId");

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
    });

    if (!fan) {
      return res.status(404).json({ error: "Fan not found" });
    }

    const existingConfirmedAt = (fan as any).adultConfirmedAt as Date | null | undefined;
    const existingConfirmVersion = (fan as any).adultConfirmVersion as string | null | undefined;

    if (existingConfirmedAt) {
      return res.status(200).json({
        ok: true,
        adultConfirmedAt: existingConfirmedAt.toISOString(),
        adultConfirmVersion: existingConfirmVersion ?? ADULT_CONFIRM_VERSION,
      });
    }

    const now = new Date();
    const updated = await (prisma.fan as any).update({
      where: { id: fanId },
      data: {
        adultConfirmedAt: now,
        adultConfirmVersion: ADULT_CONFIRM_VERSION,
      },
    });
    const updatedConfirmedAt = (updated as any).adultConfirmedAt as Date | null | undefined;
    const updatedConfirmVersion = (updated as any).adultConfirmVersion as string | null | undefined;

    emitCreatorEvent({
      eventId: `adult_confirmed:${fanId}:${now.getTime()}`,
      type: "CHAT_UPDATED",
      creatorId: fan.creatorId,
      fanId,
      createdAt: now.toISOString(),
      payload: {
        fanId,
        adultConfirmedAt: updatedConfirmedAt?.toISOString() ?? now.toISOString(),
        adultConfirmVersion: updatedConfirmVersion ?? ADULT_CONFIRM_VERSION,
        isAdultConfirmed: true,
      },
    });

    return res.status(200).json({
      ok: true,
      adultConfirmedAt: updatedConfirmedAt?.toISOString() ?? now.toISOString(),
      adultConfirmVersion: updatedConfirmVersion ?? ADULT_CONFIRM_VERSION,
    });
  } catch (error) {
    console.error("Error confirming adult status", error);
    return sendServerError(res, "Failed to confirm adult status");
  }
}
