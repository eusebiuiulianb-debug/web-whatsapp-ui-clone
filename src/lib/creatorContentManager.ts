import { PACKS } from "../config/packs";
import { getCreatorManagerSummary } from "./creatorManager";
import prisma from "./prisma.server";

export type ContentPackStats = {
  id: string;
  name: string;
  type: string;
  price?: number | null;
  activeFans: number;
  renewalsNext7Days: number;
  churn30d: number;
  ingresos30d: number;
  totalSales?: number | null;
};

export type ExtrasSummary30d = {
  totalVentas: number;
  totalIngresos: number;
  extrasSinVentas: number;
  porNivel: {
    T0: { ventas30d: number; ingresos30d: number };
    T1: { ventas30d: number; ingresos30d: number };
    T2: { ventas30d: number; ingresos30d: number };
    T3: { ventas30d: number; ingresos30d: number };
  };
  topExtras30d: Array<{
    id: string;
    title: string;
    tier: "T0" | "T1" | "T2" | "T3";
    ventas30d: number;
    ingresos30d: number;
  }>;
};

export type CreatorContentSnapshot = {
  packs: ContentPackStats[];
  totalPacks: number;
  bestPack30d?: ContentPackStats | null;
  packsToReview: ContentPackStats[];
  ingresosTotales30d: number;
  extrasSummary30d: ExtrasSummary30d;
};

export async function getCreatorContentSnapshot(creatorId: string): Promise<CreatorContentSnapshot> {
  const summary = await getCreatorManagerSummary(creatorId);
  const start30 = new Date();
  start30.setDate(start30.getDate() - 30);

  const [extrasPurchases, extrasCatalog] = await Promise.all([
    prisma.extraPurchase.findMany({
      where: { fan: { creatorId }, createdAt: { gte: start30 }, kind: "EXTRA", amount: { gt: 0 }, isArchived: false },
      select: { amount: true, tier: true, contentItemId: true, contentItem: { select: { id: true, title: true, extraTier: true } } },
    }),
    prisma.contentItem.findMany({
      where: { creatorId, OR: [{ isExtra: true }, { visibility: "EXTRA" }] },
      select: { id: true, title: true, extraTier: true },
    }),
  ]);

  const packs: ContentPackStats[] = [
    {
      id: "trial",
      name: PACKS.trial.name,
      type: "WELCOME",
      price: PACKS.trial.price,
      activeFans: summary.packs.welcome.activeFans,
      renewalsNext7Days: 0,
      churn30d: 0,
      ingresos30d: summary.packs.welcome.revenue30,
      totalSales: null,
    },
    {
      id: "monthly",
      name: PACKS.monthly.name,
      type: "MONTHLY",
      price: PACKS.monthly.price,
      activeFans: summary.packs.monthly.activeFans,
      renewalsNext7Days: summary.packs.monthly.renewalsIn7Days,
      churn30d: summary.packs.monthly.churn30,
      ingresos30d: summary.packs.monthly.revenue30,
      totalSales: null,
    },
    {
      id: "special",
      name: PACKS.special.name,
      type: "SPECIAL",
      price: PACKS.special.price,
      activeFans: summary.packs.special.activeFans,
      renewalsNext7Days: 0,
      churn30d: 0,
      ingresos30d: summary.packs.special.revenue30,
      totalSales: null,
    },
  ];

  const ingresosTotales30d = packs.reduce((acc, pack) => acc + (pack.ingresos30d ?? 0), 0);
  const bestPack30d =
    packs.reduce((best, current) => ((best?.ingresos30d ?? 0) >= (current.ingresos30d ?? 0) ? best : current), null as ContentPackStats | null) ??
    null;

  const packsToReview = packs.filter((p) => (p.ingresos30d ?? 0) === 0 && (p.activeFans ?? 0) === 0);

  const tierBuckets: ExtrasSummary30d["porNivel"] = {
    T0: { ventas30d: 0, ingresos30d: 0 },
    T1: { ventas30d: 0, ingresos30d: 0 },
    T2: { ventas30d: 0, ingresos30d: 0 },
    T3: { ventas30d: 0, ingresos30d: 0 },
  };

  const topExtrasMap = new Map<
    string,
    { id: string; title: string; tier: "T0" | "T1" | "T2" | "T3"; ventas30d: number; ingresos30d: number }
  >();

  for (const purchase of extrasPurchases) {
    const tier = normalizeTier(purchase.tier ?? purchase.contentItem?.extraTier ?? "T0");
    tierBuckets[tier].ventas30d += 1;
    tierBuckets[tier].ingresos30d += purchase.amount ?? 0;

    const itemId = purchase.contentItemId ?? purchase.contentItem?.id ?? "unknown";
    const title = purchase.contentItem?.title ?? "Extra";
    const current = topExtrasMap.get(itemId) ?? { id: itemId, title, tier, ventas30d: 0, ingresos30d: 0 };
    current.ventas30d += 1;
    current.ingresos30d += purchase.amount ?? 0;
    current.tier = tier;
    topExtrasMap.set(itemId, current);
  }

  const topExtras30d = Array.from(topExtrasMap.values()).sort((a, b) => b.ingresos30d - a.ingresos30d).slice(0, 3);

  const soldExtraIds = new Set<string>(
    extrasPurchases.map((p) => p.contentItemId).filter((id): id is string => Boolean(id))
  );
  const extrasSinVentas = extrasCatalog.filter((item) => !soldExtraIds.has(item.id)).length;

  const extrasSummary30d: ExtrasSummary30d = {
    totalVentas: extrasPurchases.length,
    totalIngresos: extrasPurchases.reduce((acc: number, p) => acc + (p.amount ?? 0), 0),
    extrasSinVentas,
    porNivel: tierBuckets,
    topExtras30d,
  };

  return {
    packs,
    totalPacks: packs.length,
    bestPack30d: bestPack30d && (bestPack30d.ingresos30d ?? 0) > 0 ? bestPack30d : null,
    packsToReview,
    ingresosTotales30d,
    extrasSummary30d,
  };
}

function normalizeTier(tier: any): "T0" | "T1" | "T2" | "T3" {
  if (tier === "T1") return "T1";
  if (tier === "T2") return "T2";
  if (tier === "T3") return "T3";
  return "T0";
}
