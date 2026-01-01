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

type GetCreatorRevenueSummaryParams = {
  creatorId: string;
  from: Date;
  to?: Date;
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
