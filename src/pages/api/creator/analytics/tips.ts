import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { daysAgoInTimeZone } from "../../../../lib/timezone";

type TipsRange = "7d" | "30d" | "90d";

type TipFanEntry = {
  fan: { id: string; name: string | null };
  tipsCount: number;
  revenue: number;
  lastTipAt: string | null;
};

function normalizeRange(value: unknown): TipsRange | null {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return null;
}

function getRangeStart(range: TipsRange): Date {
  if (range === "30d") return daysAgoInTimeZone(30);
  if (range === "90d") return daysAgoInTimeZone(90);
  return daysAgoInTimeZone(7);
}

function resolveFanName(fan?: { displayName?: string | null; name?: string | null }): string | null {
  const value = fan?.displayName?.trim() || fan?.name?.trim();
  return value || null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TipFanEntry[] | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const range = normalizeRange(req.query.range);
  if (!range) {
    return sendBadRequest(res, "range must be 7d, 30d, or 90d");
  }

  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();
  const from = getRangeStart(range);

  try {
    const tips = await prisma.extraPurchase.findMany({
      where: {
        fan: { creatorId },
        createdAt: { gte: from, lte: now },
        amount: { gt: 0 },
        isArchived: false,
        kind: "TIP",
      },
      select: {
        id: true,
        fanId: true,
        amount: true,
        createdAt: true,
        fan: { select: { displayName: true, name: true } },
      },
    });

    const byFan = new Map<string, TipFanEntry>();
    for (const tip of tips) {
      const entry = byFan.get(tip.fanId) ?? {
        fan: { id: tip.fanId, name: resolveFanName(tip.fan) },
        tipsCount: 0,
        revenue: 0,
        lastTipAt: null,
      };
      entry.tipsCount += 1;
      entry.revenue += Number(tip.amount) || 0;
      if (!entry.lastTipAt || tip.createdAt > new Date(entry.lastTipAt)) {
        entry.lastTipAt = tip.createdAt.toISOString();
      }
      byFan.set(tip.fanId, entry);
    }

    const results = Array.from(byFan.values()).sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.tipsCount - a.tipsCount;
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error("Error loading tips analytics", error);
    return sendServerError(res, "Failed to load tips");
  }
}
