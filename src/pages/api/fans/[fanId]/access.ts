import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { buildAccessStateFromGrants } from "../../../../lib/accessState";
import { getAccessSummary } from "../../../../lib/access";
import { getFanContents } from "../../../../lib/fanContent";
import { buildPackStatusById } from "../../../../lib/fanPackStatus";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) return sendBadRequest(res, "Missing fanId");

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      include: { accessGrants: true },
    });
    if (!fan) return res.status(404).json({ ok: false, error: "Fan not found" });

    const accessState = buildAccessStateFromGrants({
      accessGrants: fan.accessGrants,
      isNew: fan.isNew ?? false,
      now: new Date(),
    });
    const accessSummary = getAccessSummary({
      membershipStatus: accessState.membershipStatus,
      daysLeft: accessState.daysLeft,
      hasAccessHistory: accessState.hasAccessHistory,
      activeGrantTypes: accessState.activeGrantTypes,
    });
    const includedContent = await getFanContents(fan.creatorId, accessSummary, accessState.activeGrantTypes);
    const packs = await prisma.pack.findMany({
      where: { creatorId: fan.creatorId },
      select: { id: true, name: true, price: true },
    });
    const { packStatusById, unlockedPacks } = buildPackStatusById(packs, fan.accessGrants, new Date());

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, accessSummary, includedContent, packStatusById, unlockedPacks });
  } catch (error) {
    console.error("Error refreshing fan access", error);
    return sendServerError(res, "Failed to refresh access");
  }
}
