import type { PrismaClient } from "@prisma/client";
import { PACKS } from "../../config/packs";
import prisma from "../prisma.server";

export type RevenueBucket = {
  amount: number;
  count: number;
};

export type CreatorRevenueSummary = {
  subs: RevenueBucket & { byType: Record<string, RevenueBucket> };
  extras: RevenueBucket;
  tips: RevenueBucket;
  gifts: RevenueBucket;
  totals: { amount: number };
  counts: { subs: number; extras: number; tips: number; total: number };
};

export type FanMonetizationSummary = {
  subscription: {
    active: boolean;
    price: number;
    daysLeft: number | null;
  };
  extras: {
    count: number;
    total: number;
  };
  tips: {
    count: number;
    total: number;
  };
  gifts: {
    count: number;
    total: number;
  };
  totalSpent: number;
  recent30dSpent: number;
  lastPurchaseAt: string | null;
};

type GetCreatorRevenueSummaryParams = {
  creatorId: string;
  from: Date;
  to?: Date;
  prismaClient?: PrismaClient;
};

type FanMonetizationSource = {
  accessGrants: { type: string; createdAt: Date; expiresAt: Date }[];
  extraPurchases: { amount: number | null; createdAt: Date; kind?: string | null; isArchived?: boolean | null }[];
};

type FanMonetizationQueryParams = {
  creatorId?: string;
  prismaClient?: PrismaClient;
};

const DEFAULT_SUB_TYPES = ["trial", "welcome", "monthly", "special"] as const;
type PurchaseKind = "EXTRA" | "TIP" | "GIFT";

function normalizeGrantType(raw: string | null | undefined): string {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "single") return "special";
  return normalized || "unknown";
}

function getGrantAmount(type: string): number {
  if (type === "monthly") return PACKS.monthly.price;
  if (type === "special") return PACKS.special.price;
  if (type === "trial") return PACKS.trial.price;
  if (type === "welcome") return 0;
  return 0;
}

function normalizePurchaseKind(raw: string | null | undefined): PurchaseKind {
  if (raw === "TIP") return "TIP";
  if (raw === "GIFT") return "GIFT";
  return "EXTRA";
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  const ts = value.getTime();
  if (Number.isNaN(ts)) return null;
  return value.toISOString();
}

function pickLatestDate(values: (Date | null | undefined)[]): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || value.getTime() > latest.getTime()) {
      latest = value;
    }
  }
  return latest;
}

export function buildFanMonetizationSummaryFromFan(
  source: FanMonetizationSource,
  now: Date = new Date()
): FanMonetizationSummary {
  const grants = [...(source.accessGrants ?? [])];
  const purchases = (source.extraPurchases ?? []).filter(
    (purchase) => !purchase?.isArchived && (purchase.amount ?? 0) > 0
  );
  const extras = purchases.filter((purchase) => normalizePurchaseKind(purchase.kind) === "EXTRA");
  const tipPurchases = purchases.filter((purchase) => normalizePurchaseKind(purchase.kind) === "TIP");
  const giftPurchases = purchases.filter((purchase) => normalizePurchaseKind(purchase.kind) === "GIFT");
  const activeGrants = grants.filter((grant) => grant.expiresAt > now);
  const activeGrant =
    activeGrants.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0] ?? null;
  const lastGrant =
    grants.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const hasHistory = grants.length > 0;
  const subscriptionActive = Boolean(activeGrant);
  const normalizedType = activeGrant ? normalizeGrantType(activeGrant.type) : "";
  const price = subscriptionActive ? getGrantAmount(normalizedType) : 0;
  const endsAt = activeGrant ? activeGrant.expiresAt : null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = subscriptionActive && endsAt
    ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / msPerDay))
    : hasHistory
    ? 0
    : null;
  const extrasTotal = extras.reduce((acc, purchase) => acc + (purchase.amount ?? 0), 0);
  const extrasCount = extras.length;
  const lastExtraAt =
    extras.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
  const lastTipAt =
    tipPurchases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
  const lastGiftAt =
    giftPurchases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
  const lastPurchaseAt = pickLatestDate([lastExtraAt, lastTipAt, lastGiftAt, lastGrant?.createdAt ?? null]);
  const subsTotal = grants.reduce((acc, grant) => acc + getGrantAmount(normalizeGrantType(grant.type)), 0);
  const tips = {
    count: tipPurchases.length,
    total: tipPurchases.reduce((acc, purchase) => acc + (purchase.amount ?? 0), 0),
  };
  const gifts = {
    count: giftPurchases.length,
    total: giftPurchases.reduce((acc, purchase) => acc + (purchase.amount ?? 0), 0),
  };
  const totalSpent = subsTotal + extrasTotal + tips.total;
  const start30 = new Date(now);
  start30.setDate(start30.getDate() - 30);
  const recentExtrasTotal = extras
    .filter((purchase) => purchase.createdAt >= start30)
    .reduce((acc, purchase) => acc + (purchase.amount ?? 0), 0);
  const recentTipsTotal = tipPurchases
    .filter((purchase) => purchase.createdAt >= start30)
    .reduce((acc, purchase) => acc + (purchase.amount ?? 0), 0);
  const recentGiftsTotal = giftPurchases
    .filter((purchase) => purchase.createdAt >= start30)
    .reduce((acc, purchase) => acc + (purchase.amount ?? 0), 0);
  const recentSubsTotal = grants
    .filter((grant) => grant.createdAt >= start30)
    .reduce((acc, grant) => acc + getGrantAmount(normalizeGrantType(grant.type)), 0);
  const recent30dSpent = recentExtrasTotal + recentTipsTotal + recentSubsTotal;

  return {
    subscription: {
      active: subscriptionActive,
      price,
      daysLeft,
    },
    extras: {
      count: extrasCount,
      total: extrasTotal,
    },
    tips,
    gifts,
    totalSpent,
    recent30dSpent,
    lastPurchaseAt: toIso(lastPurchaseAt),
  };
}

export async function getFanMonetizationSummary(
  fanId: string,
  creatorId?: string,
  { prismaClient }: FanMonetizationQueryParams = {}
): Promise<FanMonetizationSummary | null> {
  const client = prismaClient ?? prisma;
  const [fan, extraPurchases] = await Promise.all([
    client.fan.findUnique({
      where: { id: fanId },
      include: { accessGrants: true },
    }),
    client.extraPurchase.findMany({
      where: { fanId, amount: { gt: 0 }, isArchived: false },
      select: { amount: true, createdAt: true, kind: true },
    }),
  ]);
  if (!fan || (creatorId && fan.creatorId !== creatorId)) return null;
  return buildFanMonetizationSummaryFromFan(
    { accessGrants: fan.accessGrants, extraPurchases },
    new Date()
  );
}

export async function getCreatorRevenueSummary({
  creatorId,
  from,
  to,
  prismaClient,
}: GetCreatorRevenueSummaryParams): Promise<CreatorRevenueSummary> {
  const client = prismaClient ?? prisma;
  const rangeEnd = to ?? new Date();
  const [purchaseAgg, grants] = await Promise.all([
    client.extraPurchase.groupBy({
      by: ["kind"],
      where: {
        fan: { creatorId },
        createdAt: { gte: from, lte: rangeEnd },
        amount: { gt: 0 },
        isArchived: false,
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    client.accessGrant.findMany({
      where: { fan: { creatorId }, createdAt: { gte: from, lte: rangeEnd } },
      select: { type: true },
    }),
  ]);

  const extras: RevenueBucket = { amount: 0, count: 0 };
  const tips: RevenueBucket = { amount: 0, count: 0 };
  const gifts: RevenueBucket = { amount: 0, count: 0 };

  for (const entry of purchaseAgg) {
    const bucket = normalizePurchaseKind(entry.kind);
    const amount = entry._sum?.amount ?? 0;
    const count = entry._count?._all ?? 0;
    if (bucket === "TIP") {
      tips.amount += amount;
      tips.count += count;
    } else if (bucket === "GIFT") {
      gifts.amount += amount;
      gifts.count += count;
    } else {
      extras.amount += amount;
      extras.count += count;
    }
  }

  const subsByType: Record<string, RevenueBucket> = {};
  DEFAULT_SUB_TYPES.forEach((type) => {
    subsByType[type] = { amount: 0, count: 0 };
  });

  for (const grant of grants) {
    const type = normalizeGrantType(grant.type);
    const amount = getGrantAmount(type);
    if (amount <= 0) continue;
    if (!subsByType[type]) {
      subsByType[type] = { amount: 0, count: 0 };
    }
    subsByType[type].count += 1;
    subsByType[type].amount += amount;
  }

  const subsAmount = Object.values(subsByType).reduce((acc, entry) => acc + (entry.amount || 0), 0);
  const subsCount = Object.values(subsByType).reduce((acc, entry) => acc + (entry.count || 0), 0);

  const totalsAmount = subsAmount + extras.amount + tips.amount + gifts.amount;
  const totalCount = subsCount + extras.count + tips.count + gifts.count;

  return {
    subs: { amount: subsAmount, count: subsCount, byType: subsByType },
    extras,
    tips,
    gifts,
    totals: { amount: totalsAmount },
    counts: {
      subs: subsCount,
      extras: extras.count,
      tips: tips.count,
      total: totalCount,
    },
  };
}
