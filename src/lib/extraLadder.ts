import type { PrismaClient } from "@prisma/client";

export type ExtraLadderStatus = {
  totalSpent: number;
  lastPurchaseAt: Date | null;
  maxTierBought: "T0" | "T1" | "T2" | "T3" | "T4" | null;
  suggestedTier: "T1" | "T2" | "T3" | "T4" | null;
  phaseLabel: string;
  sessionToday?: ExtraSessionToday | null;
};

export type ExtraSessionToday = {
  todayCount: number;
  todaySpent: number;
  todayHighestTier: "T0" | "T1" | "T2" | "T3" | "T4" | null;
  todayLastPurchaseAt: Date | null;
};

type ExtrasCatalogItem = {
  id: string;
  title: string | null;
  extraTier: string | null;
};

function getPhaseLabel(tier: string | null): string {
  switch (tier) {
    case "T0":
      return "Fase T0 – sin extras todavía";
    case "T1":
      return "Fase T1 – cliente calentando";
    case "T2":
      return "Fase T2 – ya invierte bien";
    case "T3":
      return "Fase T3 – alto valor";
    case "T4":
      return "Fase T4 – techo alcanzado";
    default:
      return "Fase 0 – sin extras todavía";
  }
}

export async function getExtraLadderStatusForFan(
  prisma: PrismaClient,
  creatorId: string,
  fanId: string,
  extrasCatalog?: ExtrasCatalogItem[]
): Promise<ExtraLadderStatus> {
  const catalog =
    extrasCatalog ??
    (await prisma.contentItem.findMany({
      where: {
        creatorId,
        OR: [{ isExtra: true }, { visibility: "EXTRA" }],
      },
      select: { id: true, title: true, extraTier: true },
    }));

  const purchases = await prisma.extraPurchase.findMany({
    where: { fanId, amount: { gt: 0 }, kind: "EXTRA" },
    include: { contentItem: { select: { title: true, extraTier: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Source of truth: explicit tier stored on each purchase (falling back to the content item's tier if needed).
  if (!purchases.length) {
    return {
      totalSpent: 0,
      lastPurchaseAt: null,
      maxTierBought: null,
      suggestedTier: "T1",
      phaseLabel: getPhaseLabel(null),
    };
  }

  let totalSpent = 0;
  let maxTierBought: "T0" | "T1" | "T2" | "T3" | "T4" | null = null;
  let lastPurchaseAt: Date | null = null;

  for (let idx = 0; idx < purchases.length; idx++) {
    const purchase = purchases[idx];
    totalSpent += purchase.amount ?? 0;
    if (idx === 0) {
      lastPurchaseAt = purchase.createdAt;
    }
    const rawTier = (purchase.tier ?? purchase.contentItem?.extraTier ?? "").toString().toUpperCase();
    const tier = ["T0", "T1", "T2", "T3", "T4"].includes(rawTier) ? (rawTier as any) : null;
    if (!tier) continue;
    if (!maxTierBought) maxTierBought = tier;
    else {
      const currentNum = Number(maxTierBought.replace("T", ""));
      const tierNum = Number(tier.replace("T", ""));
      if (tierNum > currentNum) maxTierBought = tier;
    }
  }

  let suggestedTier: "T1" | "T2" | "T3" | "T4" | null = "T1";
  if (!maxTierBought) {
    suggestedTier = "T1";
  } else {
    const nextNum = Math.min(4, Number(maxTierBought.replace("T", "")) + 1);
    suggestedTier = nextNum > 4 ? null : (`T${nextNum}` as any);
    if (nextNum === 4 && maxTierBought === "T4") suggestedTier = null;
  }

  // Optional: check catalog for existence of suggested tier
  if (suggestedTier) {
    const hasTier = catalog.some(
      (item) => item.extraTier && item.extraTier.toUpperCase() === suggestedTier
    );
    if (!hasTier) suggestedTier = null;
  }

  return {
    totalSpent,
    lastPurchaseAt,
    maxTierBought,
    suggestedTier,
    phaseLabel: getPhaseLabel(maxTierBought),
  };
}

export async function getExtraSessionTodayForFan(
  prisma: PrismaClient,
  fanId: string,
  now = new Date()
): Promise<ExtraSessionToday> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const purchases = await prisma.extraPurchase.findMany({
    where: {
      fanId,
      amount: { gt: 0 },
      kind: "EXTRA",
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: { contentItem: { select: { title: true, extraTier: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (!purchases.length) {
    return {
      todayCount: 0,
      todaySpent: 0,
      todayHighestTier: null,
      todayLastPurchaseAt: null,
    };
  }

  let todayCount = 0;
  let todaySpent = 0;
  let todayHighestTier: "T0" | "T1" | "T2" | "T3" | "T4" | null = null;
  let todayLastPurchaseAt: Date | null = null;

  for (let idx = 0; idx < purchases.length; idx++) {
    const purchase = purchases[idx];
    todayCount += 1;
    todaySpent += purchase.amount ?? 0;
    if (idx === 0) {
      todayLastPurchaseAt = purchase.createdAt;
    }
    const rawTier = (purchase.tier ?? purchase.contentItem?.extraTier ?? "").toString().toUpperCase();
    const tier = ["T0", "T1", "T2", "T3", "T4"].includes(rawTier) ? (rawTier as any) : null;
    if (tier && tier !== "T0") {
      if (!todayHighestTier) {
        todayHighestTier = tier;
      } else {
        const currentNum = Number(todayHighestTier.replace("T", ""));
        const tierNum = Number(tier.replace("T", ""));
        if (tierNum > currentNum) todayHighestTier = tier;
      }
    }
  }

  return {
    todayCount,
    todaySpent,
    todayHighestTier,
    todayLastPurchaseAt,
  };
}
