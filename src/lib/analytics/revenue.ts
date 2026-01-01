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
  totals: { amount: number };
  counts: { subs: number; extras: number; tips: number; total: number };
};

export type FanMonetizationSummary = {
  subscription: {
    tierName: string | null;
    price: number | null;
    status: "ACTIVE" | "EXPIRED" | "NONE";
    endsAt: string | null;
    daysLeft: number | null;
  };
  extras: {
    count: number;
    total: number;
    lastAt: string | null;
  };
  tips: {
    count: number;
    total: number;
  };
  gifts: {
    count: number;
    total: number;
  };
  lifetimeTotal: number;
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
  extraPurchases: { amount: number | null; createdAt: Date }[];
};

type GetFanMonetizationSummaryParams = {
  creatorId: string;
  fanId: string;
  prismaClient?: PrismaClient;
};

const DEFAULT_SUB_TYPES = ["trial", "welcome", "monthly", "special"] as const;

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

function getTierName(type: string): string | null {
  if (type === "monthly") return PACKS.monthly.name;
  if (type === "special") return PACKS.special.name;
  if (type === "trial" || type === "welcome") return PACKS.trial.name;
  return null;
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
  const extras = [...(source.extraPurchases ?? [])];
  const activeGrants = grants.filter((grant) => grant.expiresAt > now);
  const activeGrant =
    activeGrants.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0] ?? null;
  const lastGrant =
    grants.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const status: FanMonetizationSummary["subscription"]["status"] = activeGrant
    ? "ACTIVE"
    : grants.length > 0
    ? "EXPIRED"
    : "NONE";
  const referenceGrant = activeGrant ?? lastGrant;
  const normalizedType = referenceGrant ? normalizeGrantType(referenceGrant.type) : "";
  const tierName = referenceGrant ? getTierName(normalizedType) : null;
  const price = referenceGrant ? getGrantAmount(normalizedType) : null;
  const endsAt = referenceGrant ? referenceGrant.expiresAt : null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft =
    status === "ACTIVE" && endsAt
      ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / msPerDay))
      : status === "EXPIRED"
      ? 0
      : null;
  const extrasTotal = extras.reduce((acc, purchase) => acc + (purchase.amount ?? 0), 0);
  const extrasCount = extras.length;
  const lastExtraAt =
    extras.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
  const lastPurchaseAt = pickLatestDate([lastExtraAt, lastGrant?.createdAt ?? null]);
  const subsTotal = grants.reduce((acc, grant) => acc + getGrantAmount(normalizeGrantType(grant.type)), 0);
  const tips = { count: 0, total: 0 };
  const gifts = { count: 0, total: 0 };
  const lifetimeTotal = subsTotal + extrasTotal + tips.total;

  return {
    subscription: {
      tierName,
      price,
      status,
      endsAt: toIso(endsAt),
      daysLeft,
    },
    extras: {
      count: extrasCount,
      total: extrasTotal,
      lastAt: toIso(lastExtraAt),
    },
    tips,
    gifts,
    lifetimeTotal,
    lastPurchaseAt: toIso(lastPurchaseAt),
  };
}

export async function getFanMonetizationSummary({
  creatorId,
  fanId,
  prismaClient,
}: GetFanMonetizationSummaryParams): Promise<FanMonetizationSummary | null> {
  const client = prismaClient ?? prisma;
  const fan = await client.fan.findUnique({
    where: { id: fanId },
    include: { accessGrants: true, extraPurchases: true },
  });
  if (!fan || fan.creatorId !== creatorId) return null;
  return buildFanMonetizationSummaryFromFan(fan, new Date());
}

export async function getCreatorRevenueSummary({
  creatorId,
  from,
  to,
  prismaClient,
}: GetCreatorRevenueSummaryParams): Promise<CreatorRevenueSummary> {
  const client = prismaClient ?? prisma;
  const rangeEnd = to ?? new Date();
  const [extrasAgg, grants] = await Promise.all([
    client.extraPurchase.aggregate({
      where: { fan: { creatorId }, createdAt: { gte: from, lte: rangeEnd } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    client.accessGrant.findMany({
      where: { fan: { creatorId }, createdAt: { gte: from, lte: rangeEnd } },
      select: { type: true },
    }),
  ]);

  const extras: RevenueBucket = {
    amount: extrasAgg._sum?.amount ?? 0,
    count: extrasAgg._count?._all ?? 0,
  };

  const subsByType: Record<string, RevenueBucket> = {};
  DEFAULT_SUB_TYPES.forEach((type) => {
    subsByType[type] = { amount: 0, count: 0 };
  });

  for (const grant of grants) {
    const type = normalizeGrantType(grant.type);
    if (!subsByType[type]) {
      subsByType[type] = { amount: 0, count: 0 };
    }
    subsByType[type].count += 1;
    subsByType[type].amount += getGrantAmount(type);
  }

  const subsAmount = Object.values(subsByType).reduce((acc, entry) => acc + (entry.amount || 0), 0);
  const subsCount = Object.values(subsByType).reduce((acc, entry) => acc + (entry.count || 0), 0);

  const tips: RevenueBucket = { amount: 0, count: 0 };
  const totalsAmount = subsAmount + extras.amount + tips.amount;
  const totalCount = subsCount + extras.count + tips.count;

  return {
    subs: { amount: subsAmount, count: subsCount, byType: subsByType },
    extras,
    tips,
    totals: { amount: totalsAmount },
    counts: {
      subs: subsCount,
      extras: extras.count,
      tips: tips.count,
      total: totalCount,
    },
  };
}
