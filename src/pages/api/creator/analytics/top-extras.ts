import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { daysAgoInTimeZone } from "../../../../lib/timezone";

type ExtrasRange = "7d" | "30d" | "90d";

type TopExtraEntry = {
  extraId: string;
  title: string;
  soldCount: number;
  revenue: number;
  lastSoldAt: string | null;
};

function normalizeRange(value: unknown): ExtrasRange | null {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return null;
}

function getRangeStart(range: ExtrasRange): Date {
  if (range === "30d") return daysAgoInTimeZone(30);
  if (range === "90d") return daysAgoInTimeZone(90);
  return daysAgoInTimeZone(7);
}

function resolveExtraId(entry: { contentItemId?: string | null; productId?: string | null; id: string }): string {
  return entry.contentItemId ?? entry.productId ?? entry.id;
}

function resolveExtraTitle(contentTitle?: string | null): string {
  return contentTitle?.trim() || "Extra";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TopExtraEntry[] | { error: string }>
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
    const purchases = await prisma.extraPurchase.findMany({
      where: {
        fan: { creatorId },
        createdAt: { gte: from, lte: now },
        amount: { gt: 0 },
        isArchived: false,
        kind: "EXTRA",
      },
      select: {
        id: true,
        contentItemId: true,
        productId: true,
        amount: true,
        createdAt: true,
        contentItem: { select: { title: true } },
      },
    });

    const byExtra = new Map<string, TopExtraEntry>();
    for (const purchase of purchases) {
      const extraId = resolveExtraId(purchase);
      const title = resolveExtraTitle(purchase.contentItem?.title ?? null);
      const current = byExtra.get(extraId) ?? {
        extraId,
        title,
        soldCount: 0,
        revenue: 0,
        lastSoldAt: null,
      };
      current.soldCount += 1;
      current.revenue += Number(purchase.amount) || 0;
      if (!current.lastSoldAt || purchase.createdAt > new Date(current.lastSoldAt)) {
        current.lastSoldAt = purchase.createdAt.toISOString();
      }
      byExtra.set(extraId, current);
    }

    const results = Array.from(byExtra.values()).sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.soldCount - a.soldCount;
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error("Error loading top extras analytics", error);
    return sendServerError(res, "Failed to load top extras");
  }
}
