import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendBadRequest(res, "Method not allowed");
  }

  const { fanId, nextAction } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  const normalizedNextAction =
    typeof nextAction === "string" && nextAction.trim().length > 0 ? nextAction.trim() : null;

  try {
    const fan = await prisma.fan.update({
      where: { id: fanId },
      data: { nextAction: normalizedNextAction },
      select: { id: true, nextAction: true },
    });

    return res.status(200).json({ ok: true, fan });
  } catch (err) {
    console.error("Error updating next action", err);
    return sendServerError(res);
  }
}
