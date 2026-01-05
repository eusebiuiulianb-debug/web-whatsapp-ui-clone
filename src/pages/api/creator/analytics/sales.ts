import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { PACKS } from "../../../../config/packs";
import {
  computeCreatorSalesBreakdown,
  getSalesProductKey,
  type CreatorSalesPurchase,
} from "../../../../lib/analytics/creatorSalesTotals";

type SalesRange = "today" | "7d" | "30d";

type SalesTotals = {
  totalAmount: number;
  count: number;
  uniqueFans: number;
};

type SalesBreakdown = {
  subscriptionsAmount: number;
  giftsAmount: number;
  packsAmount: number;
  bundlesAmount: number;
  extrasAmount: number;
  tipsAmount: number;
};

type SalesCounts = {
  subscriptionsCount: number;
  giftsCount: number;
  packsCount: number;
  bundlesCount: number;
  extrasCount: number;
  tipsCount: number;
};

type SalesProduct = {
  productId: string;
  title: string;
  type: string;
  amount: number;
  count: number;
  isGift?: boolean;
};

type SalesFan = {
  fanId: string;
  displayName: string;
  amount: number;
  count: number;
};

type SalesResponse = {
  totals: SalesTotals;
  breakdown: SalesBreakdown;
  counts: SalesCounts;
  topProducts: SalesProduct[];
  topFans: SalesFan[];
  insights: string[];
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

function normalizeRange(value: unknown): SalesRange | null {
  if (value === "today" || value === "7d" || value === "30d") return value;
  return null;
}

function normalizeGrantType(raw: string | null | undefined): "monthly" | "special" | "trial" | "welcome" | "unknown" {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "monthly") return "monthly";
  if (normalized === "special") return "special";
  if (normalized === "trial") return "trial";
  if (normalized === "welcome") return "welcome";
  if (normalized === "single") return "special";
  return "unknown";
}

function getGrantAmount(type: string): number {
  if (type === "monthly") return PACKS.monthly.price;
  if (type === "special") return PACKS.special.price;
  if (type === "trial") return PACKS.trial.price;
  return 0;
}

function normalizePurchaseKind(raw: string | null | undefined): "EXTRA" | "TIP" | "GIFT" {
  if (raw === "TIP" || raw === "GIFT") return raw;
  return "EXTRA";
}

function normalizeProductType(raw: string | null | undefined): "EXTRA" | "PACK" | "BUNDLE" | "SUBSCRIPTION" | null {
  if (raw === "EXTRA" || raw === "PACK" || raw === "BUNDLE" || raw === "SUBSCRIPTION") return raw;
  return null;
}

function parseGiftSessionTag(tag?: string | null): { id?: string; name?: string } {
  const value = typeof tag === "string" ? tag.trim() : "";
  if (!value) return {};
  const parts = value.split(":").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { id: parts[0], name: parts.slice(1).join(":") };
  }
  return { id: value };
}

function resolvePackName(productId?: string | null, fallbackName?: string | null): string | null {
  const id = productId?.trim() ?? "";
  if (id && (id === PACKS.monthly.code || id === PACKS.special.code || id === PACKS.trial.code)) {
    return PACKS[id as keyof typeof PACKS]?.name ?? fallbackName ?? null;
  }
  return fallbackName ?? null;
}

function getRangeLabel(range: SalesRange): string {
  if (range === "today") return "hoy";
  if (range === "7d") return "los últimos 7 días";
  return "los últimos 30 días";
}

function buildInsights({
  breakdown,
  totals,
  extrasActiveCount,
  range,
}: {
  breakdown: SalesBreakdown;
  totals: SalesTotals;
  extrasActiveCount: number;
  range: SalesRange;
}): string[] {
  const insights: string[] = [];
  const rangeLabel = getRangeLabel(range);
  const purchasesAmount = breakdown.extrasAmount + breakdown.tipsAmount + breakdown.giftsAmount;

  if (totals.totalAmount <= 0) {
    insights.push(`No hay ventas ${rangeLabel}.`);
    return insights;
  }

  if (breakdown.extrasAmount <= 0 && extrasActiveCount > 0) {
    insights.push(`No se han vendido extras en ${rangeLabel}.`);
  }

  if (breakdown.tipsAmount > 0 && breakdown.extrasAmount <= 0) {
    insights.push("Las propinas están activas, pero faltan extras.");
  }

  if (breakdown.subscriptionsAmount > 0 && purchasesAmount <= 0) {
    insights.push("Los ingresos vienen solo de suscripciones. Activa extras o propinas.");
  }

  if (breakdown.giftsAmount > 0 && breakdown.extrasAmount <= 0) {
    insights.push("Los regalos están funcionando, pero no se venden extras.");
  }

  if (insights.length === 0) {
    insights.push("Ventas estables en el periodo seleccionado.");
  }

  return insights;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SalesResponse | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const range = normalizeRange(req.query.range);
  if (!range) {
    return sendBadRequest(res, "range must be today, 7d, or 30d");
  }

  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();
  const from = range === "today" ? startOfToday() : range === "7d" ? daysAgo(7) : daysAgo(30);

  try {
    const [purchases, grants, extrasActiveCount] = await Promise.all([
      prisma.extraPurchase.findMany({
        where: {
          fan: { creatorId },
          createdAt: { gte: from, lte: now },
          amount: { gt: 0 },
          isArchived: false,
        },
        select: {
          id: true,
          fanId: true,
          amount: true,
          kind: true,
          isArchived: true,
          productId: true,
          productType: true,
          contentItemId: true,
          sessionTag: true,
          contentItem: { select: { title: true } },
          fan: { select: { displayName: true, name: true } },
        },
      }),
      prisma.accessGrant.findMany({
        where: { fan: { creatorId }, createdAt: { gte: from, lte: now } },
        select: {
          id: true,
          fanId: true,
          type: true,
          fan: { select: { displayName: true, name: true } },
        },
      }),
      prisma.contentItem.count({
        where: { creatorId, OR: [{ isExtra: true }, { visibility: "EXTRA" }] },
      }),
    ]);

    let extrasCount = 0;
    let tipsCount = 0;
    let giftsCount = 0;
    let purchasesAmount = 0;

    const productTotals = new Map<string, SalesProduct>();
    const fanTotals = new Map<string, SalesFan>();
    const uniqueFans = new Set<string>();

    for (const purchase of purchases) {
      const amount = purchase.amount ?? 0;
      if (amount <= 0 || purchase.isArchived) continue;
      purchasesAmount += amount;
      const kind = normalizePurchaseKind(purchase.kind);
      if (kind === "TIP") tipsCount += 1;
      else if (kind === "GIFT") giftsCount += 1;
      else extrasCount += 1;

      const giftInfo = kind === "GIFT" ? parseGiftSessionTag(purchase.sessionTag) : {};
      const resolvedProductId =
        (purchase.productId && purchase.productId.trim().length > 0 ? purchase.productId : null) ??
        (giftInfo.id && giftInfo.id.trim().length > 0 ? giftInfo.id : null) ??
        purchase.contentItemId ??
        null;
      const productKey = getSalesProductKey({
        productId: resolvedProductId,
        kind,
        contentItemId: purchase.contentItemId,
      });
      const resolvedProductType =
        normalizeProductType(purchase.productType) ??
        (kind === "TIP" ? null : kind === "GIFT" ? "SUBSCRIPTION" : "EXTRA");
      const resolvedTitle =
        purchase.contentItem?.title ??
        resolvePackName(resolvedProductId, giftInfo.name ?? null) ??
        (kind === "TIP" ? "Propina" : kind === "GIFT" ? "Regalo" : "Extra");
      const entry = productTotals.get(productKey) ?? {
        productId: productKey,
        title: resolvedTitle,
        type: resolvedProductType ?? kind,
        amount: 0,
        count: 0,
        isGift: false,
      };
      entry.amount += amount;
      entry.count += 1;
      if (kind === "GIFT") entry.isGift = true;
      productTotals.set(productKey, entry);

      if (purchase.fanId) {
        const displayName =
          purchase.fan?.displayName?.trim() ||
          purchase.fan?.name?.trim() ||
          purchase.fanId;
        const fanEntry = fanTotals.get(purchase.fanId) ?? {
          fanId: purchase.fanId,
          displayName,
          amount: 0,
          count: 0,
        };
        fanEntry.amount += amount;
        fanEntry.count += 1;
        fanTotals.set(purchase.fanId, fanEntry);
        uniqueFans.add(purchase.fanId);
      }
    }

    let subscriptionsAmount = 0;
    let subscriptionsCount = 0;

    for (const grant of grants) {
      const type = normalizeGrantType(grant.type);
      const amount = getGrantAmount(type);
      if (amount <= 0) continue;
      subscriptionsAmount += amount;
      subscriptionsCount += 1;
      const productId = `sub-${type}`;
      const title =
        type === "monthly"
          ? PACKS.monthly.name
          : type === "special"
          ? PACKS.special.name
          : type === "trial"
          ? PACKS.trial.name
          : "Suscripción";
      const entry = productTotals.get(productId) ?? {
        productId,
        title,
        type: "SUBSCRIPTION",
        amount: 0,
        count: 0,
      };
      entry.amount += amount;
      entry.count += 1;
      productTotals.set(productId, entry);

      if (grant.fanId) {
        const displayName =
          grant.fan?.displayName?.trim() ||
          grant.fan?.name?.trim() ||
          grant.fanId;
        const fanEntry = fanTotals.get(grant.fanId) ?? {
          fanId: grant.fanId,
          displayName,
          amount: 0,
          count: 0,
        };
        fanEntry.amount += amount;
        fanEntry.count += 1;
        fanTotals.set(grant.fanId, fanEntry);
        uniqueFans.add(grant.fanId);
      }
    }

    const breakdownInput: CreatorSalesPurchase[] = purchases.map((purchase) => ({
      amount: purchase.amount ?? 0,
      kind: purchase.kind ?? null,
      productType: normalizeProductType(purchase.productType) ?? null,
      productId: purchase.productId ?? null,
    }));

    const breakdown = computeCreatorSalesBreakdown({
      purchases: breakdownInput,
      subscriptionsAmount,
    });

    const totals: SalesTotals = {
      totalAmount: purchasesAmount + subscriptionsAmount,
      count: purchases.length + subscriptionsCount,
      uniqueFans: uniqueFans.size,
    };

    const counts: SalesCounts = {
      subscriptionsCount,
      giftsCount,
      packsCount: 0,
      bundlesCount: 0,
      extrasCount,
      tipsCount,
    };

    const topProducts = Array.from(productTotals.values())
      .filter((entry) => entry.amount > 0 || entry.count > 0)
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return b.count - a.count;
      })
      .slice(0, 5);

    const topFans = Array.from(fanTotals.values())
      .filter((entry) => entry.amount > 0 || entry.count > 0)
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return b.count - a.count;
      })
      .slice(0, 5);

    const insights = buildInsights({
      breakdown,
      totals,
      extrasActiveCount,
      range,
    });

    return res.status(200).json({
      totals,
      breakdown,
      counts,
      topProducts,
      topFans,
      insights,
    });
  } catch (error) {
    console.error("Error loading sales analytics", error);
    return sendServerError(res, "Failed to load sales analytics");
  }
}
