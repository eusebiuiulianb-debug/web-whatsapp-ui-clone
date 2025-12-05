import { PrismaClient } from "@prisma/client";

export type ExtraLadderStatus = {
  totalSpent: number;
  lastPurchaseAt: Date | null;
  maxTierBought: "T0" | "T1" | "T2" | "T3" | "T4" | null;
  suggestedTier: "T1" | "T2" | "T3" | "T4" | null;
  phaseLabel: string;
};

type ExtrasCatalogItem = {
  id: string;
  title: string | null;
  extraTier: string | null;
};

function inferTierString(
  title?: string | null,
  explicit?: string | null
): "T0" | "T1" | "T2" | "T3" | "T4" | null {
  const fromExplicit = (explicit || "").toUpperCase();
  if (["T0", "T1", "T2", "T3", "T4"].includes(fromExplicit)) return fromExplicit as any;
  if (!title) return null;
  const match = title.trim().toUpperCase().match(/^T([0-4])/);
  if (!match) return null;
  return (`T${match[1]}` as any);
}

function getPhaseLabel(tier: string | null): string {
  switch (tier) {
    case "T0":
      return "Fase T0 – gratis / tanteo";
    case "T1":
      return "Fase T1 – cliente calentado";
    case "T2":
      return "Fase T2 – pack medio";
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
    where: { fanId, amount: { gt: 0 } },
    include: { contentItem: { select: { title: true, extraTier: true } } },
    orderBy: { createdAt: "desc" },
  });

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
    const tier = inferTierString(purchase.contentItem?.title, purchase.tier ?? purchase.contentItem?.extraTier);
    if (!tier) continue;
    if (tier !== "T0") {
      if (!maxTierBought) maxTierBought = tier;
      else {
        const currentNum = Number(maxTierBought.replace("T", ""));
        const tierNum = Number(tier.replace("T", ""));
        if (tierNum > currentNum) maxTierBought = tier;
      }
    }
  }

  let suggestedTier: "T1" | "T2" | "T3" | "T4" | null = "T1";
  if (maxTierBought === "T1") suggestedTier = "T2";
  else if (maxTierBought === "T2") suggestedTier = "T3";
  else if (maxTierBought === "T3") suggestedTier = "T4";
  else if (maxTierBought === "T4") suggestedTier = null;
  else if (!maxTierBought) suggestedTier = "T1";

  // Optional: check catalog for existence of suggested tier
  if (suggestedTier) {
    const hasTier = catalog.some(
      (item) => inferTierString(item.title, item.extraTier) === suggestedTier
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
