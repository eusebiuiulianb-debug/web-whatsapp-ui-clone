import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { PACKS } from "../../../../config/packs";
import {
  computeCreatorSalesBreakdown,
  getSalesProductKey,
  type CreatorSalesPurchase,
} from "../../../../lib/analytics/creatorSalesTotals";
import { daysAgoInTimeZone, startOfDayInTimeZone } from "../../../../lib/timezone";
import { AI_ENABLED, sendAiDisabled } from "../../../../lib/features";

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
  ok: boolean;
  error?: string;
  totals: SalesTotals;
  breakdown: SalesBreakdown;
  counts: SalesCounts;
  topProducts: SalesProduct[];
  topFans: SalesFan[];
  insights: string[];
};

type ExtraPurchaseRow = {
  id: string;
  fanId: string;
  amount: number | null;
  kind: string | null;
  createdAt?: Date | null;
  isArchived?: boolean | null;
  productId?: string | null;
  productType?: string | null;
  contentItemId?: string | null;
  sessionTag?: string | null;
  contentItem?: { title?: string | null } | null;
  fan?: { displayName?: string | null; name?: string | null } | null;
};

const EMPTY_TOTALS: SalesTotals = {
  totalAmount: 0,
  count: 0,
  uniqueFans: 0,
};

const EMPTY_BREAKDOWN: SalesBreakdown = {
  subscriptionsAmount: 0,
  giftsAmount: 0,
  packsAmount: 0,
  bundlesAmount: 0,
  extrasAmount: 0,
  tipsAmount: 0,
};

const EMPTY_COUNTS: SalesCounts = {
  subscriptionsCount: 0,
  giftsCount: 0,
  packsCount: 0,
  bundlesCount: 0,
  extrasCount: 0,
  tipsCount: 0,
};

function buildEmptyResponse(error?: string): SalesResponse {
  return {
    ok: false,
    error,
    totals: { ...EMPTY_TOTALS },
    breakdown: { ...EMPTY_BREAKDOWN },
    counts: { ...EMPTY_COUNTS },
    topProducts: [],
    topFans: [],
    insights: [],
  };
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
  if (range === "7d") return "los ultimos 7 dias";
  return "los ultimos 30 dias";
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
    insights.push("Las propinas estan activas, pero faltan extras.");
  }

  if (breakdown.subscriptionsAmount > 0 && purchasesAmount <= 0) {
    insights.push("Los ingresos vienen solo de suscripciones. Activa extras o propinas.");
  }

  if (breakdown.giftsAmount > 0 && breakdown.extrasAmount <= 0) {
    insights.push("Los regalos estan funcionando, pero no se venden extras.");
  }

  if (insights.length === 0) {
    insights.push("Ventas estables en el periodo seleccionado.");
  }

  return insights;
}

async function safeQuery<T>(label: string, query: () => Promise<T>, fallback: T) {
  try {
    return { value: await query(), ok: true };
  } catch (error) {
    console.error(`Error loading ${label}`, error);
    return { value: fallback, ok: false };
  }
}

async function loadExtraPurchases({
  creatorId,
  from,
  now,
}: {
  creatorId: string;
  from: Date;
  now: Date;
}): Promise<{ value: ExtraPurchaseRow[]; ok: boolean }> {
  const where = { fan: { creatorId }, createdAt: { gte: from, lte: now }, amount: { gt: 0 }, isArchived: false };
  const baseSelect = {
    id: true,
    fanId: true,
    amount: true,
    kind: true,
    isArchived: true,
    createdAt: true,
    contentItemId: true,
    contentItem: { select: { title: true } },
    fan: { select: { displayName: true, name: true } },
  };
  const fullSelect = {
    ...baseSelect,
    productId: true,
    productType: true,
    sessionTag: true,
  };

  try {
    const data = await prisma.extraPurchase.findMany({ where, select: fullSelect });
    return { value: data as ExtraPurchaseRow[], ok: true };
  } catch (error) {
    console.error("Error loading extra purchases with product fields", error);
    try {
      const data = await prisma.extraPurchase.findMany({ where, select: baseSelect });
      const normalized = data.map((purchase) => ({
        ...purchase,
        productId: null,
        productType: null,
        sessionTag: null,
      }));
      return { value: normalized as ExtraPurchaseRow[], ok: true };
    } catch (fallbackError) {
      console.error("Error loading extra purchases fallback", fallbackError);
      return { value: [], ok: false };
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SalesResponse>) {
  if (!AI_ENABLED) {
    return sendAiDisabled(res);
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const methodOk = req.method === "GET";
  if (!methodOk) {
    res.setHeader("Allow", ["GET"]);
  }

  const rangeValue = normalizeRange(req.query.range);
  const range = rangeValue ?? "7d";

  if (!methodOk || !rangeValue) {
    const error = !methodOk ? "method_not_allowed" : "invalid_range";
    return res.status(200).json(buildEmptyResponse(error));
  }

  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();
  const from =
    range === "today" ? startOfDayInTimeZone() : range === "7d" ? daysAgoInTimeZone(7) : daysAgoInTimeZone(30);
  const debug = req.query?.debug === "1" && process.env.NODE_ENV !== "production";

  try {
    const [purchasesResult, grantsResult, extrasActiveCountResult] = await Promise.all([
      loadExtraPurchases({ creatorId, from, now }),
      safeQuery(
        "access grants",
        () =>
          prisma.accessGrant.findMany({
            where: { fan: { creatorId }, createdAt: { gte: from, lte: now } },
            select: {
              id: true,
              fanId: true,
              type: true,
              createdAt: true,
              fan: { select: { displayName: true, name: true } },
            },
          }),
        []
      ),
      safeQuery(
        "extras active count",
        () =>
          prisma.contentItem.count({
            where: { creatorId, OR: [{ isExtra: true }, { visibility: "EXTRA" }] },
          }),
        0
      ),
    ]);

    const purchases = purchasesResult.value;
    const grants = grantsResult.value;
    const extrasActiveCount = extrasActiveCountResult.value;

    if (debug) {
      console.info("cortex-sales-debug", {
        range,
        from: from.toISOString(),
        to: now.toISOString(),
        purchases: purchases.map((purchase) => ({
          id: purchase.id,
          amount: purchase.amount,
          kind: purchase.kind,
          productType: purchase.productType,
          isArchived: purchase.isArchived,
          createdAt: purchase.createdAt,
        })),
        grants: grants.map((grant) => ({
          id: grant.id,
          type: grant.type,
          createdAt: grant.createdAt,
        })),
      });
    }

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
          : "Suscripcion";
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

    const ok = purchasesResult.ok || grantsResult.ok;

    return res.status(200).json({
      ok,
      ...(ok ? {} : { error: "data_unavailable" }),
      totals,
      breakdown,
      counts,
      topProducts,
      topFans,
      insights,
    });
  } catch (error) {
    console.error("Error loading cortex sales", error);
    return res.status(200).json(buildEmptyResponse("data_unavailable"));
  }
}
