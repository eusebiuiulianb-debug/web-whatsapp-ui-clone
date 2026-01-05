import type { NextApiRequest, NextApiResponse } from "next";
import { sendServerError } from "../../../lib/apiError";
import { getCreatorRevenueSummary } from "../../../lib/analytics/revenue";
import prisma from "../../../lib/prisma.server";
import { daysAgoInTimeZone, startOfDayInTimeZone } from "../../../lib/timezone";
import type { ExtrasSummary } from "../../../types/extras";

export default async function handler(_req: NextApiRequest, res: NextApiResponse<ExtrasSummary | { error: string }>) {
  if (_req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const todayStart = startOfDayInTimeZone();
  const weekStart = daysAgoInTimeZone(7);
  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();
  const debug = _req.query?.debug === "1" && process.env.NODE_ENV !== "production";

  try {
    const [todaySummary, last7Summary] = await Promise.all([
      getCreatorRevenueSummary({ creatorId, from: todayStart, to: now }),
      getCreatorRevenueSummary({ creatorId, from: weekStart, to: now }),
    ]);

    if (debug) {
      const [todayPurchases, last7Purchases, todayGrants] = await Promise.all([
        prisma.extraPurchase.findMany({
          where: {
            fan: { creatorId },
            createdAt: { gte: todayStart, lte: now },
            amount: { gt: 0 },
            isArchived: false,
          },
          select: { id: true, amount: true, kind: true, productType: true, isArchived: true, createdAt: true },
        }),
        prisma.extraPurchase.findMany({
          where: {
            fan: { creatorId },
            createdAt: { gte: weekStart, lte: now },
            amount: { gt: 0 },
            isArchived: false,
          },
          select: { id: true, amount: true, kind: true, productType: true, isArchived: true, createdAt: true },
        }),
        prisma.accessGrant.findMany({
          where: { fan: { creatorId }, createdAt: { gte: todayStart, lte: now } },
          select: { id: true, type: true, createdAt: true },
        }),
      ]);
      console.info("extras-summary-debug", {
        today: {
          from: todayStart.toISOString(),
          to: now.toISOString(),
          purchases: todayPurchases,
          grants: todayGrants,
        },
        last7: {
          from: weekStart.toISOString(),
          to: now.toISOString(),
          purchases: last7Purchases,
        },
      });
    }

    const summary: ExtrasSummary = {
      incomeToday: {
        count: todaySummary.counts.total,
        amount: todaySummary.totals.amount,
      },
      extrasToday: {
        count: todaySummary.extras.count,
        amount: todaySummary.extras.amount,
      },
      tipsToday: {
        count: todaySummary.tips.count,
        amount: todaySummary.tips.amount,
      },
      today: {
        count: todaySummary.extras.count,
        amount: todaySummary.extras.amount,
      },
      last7Days: {
        count: last7Summary.extras.count,
        amount: last7Summary.extras.amount,
      },
    };

    return res.status(200).json(summary);
  } catch (error) {
    console.error("Error calculating extras summary", error);
    return sendServerError(res, "Failed to load extras summary");
  }
}
