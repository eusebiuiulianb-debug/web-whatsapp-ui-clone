import { PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import { PACKS } from "../config/packs";

export type CreatorManagerSummary = {
  kpis: {
    last7: { revenue: number; extras: number; newFans: number };
    last30: { revenue: number; extras: number; newFans: number };
  };
  packs: {
    welcome: { activeFans: number; revenue30: number };
    monthly: { activeFans: number; renewalsIn7Days: number; churn30: number; revenue30: number };
    special: { activeFans: number; revenue30: number };
  };
  segments: {
    newFans: number;
    habitual: number;
    vip: number;
    atRisk: number;
  };
  suggestions: { id: string; label: string; description?: string; action?: string; filter?: Record<string, any> }[];
  revenueAtRisk7d?: number;
  atRiskFansCount?: number;
};

type ManagerDeps = {
  prismaClient?: PrismaClient;
};

const VIP_SPEND_THRESHOLD = 200; // mismo umbral usado en el HUD para etiquetar VIP
const HABITUAL_WINDOW_DAYS = 60;
const AT_RISK_INACTIVITY_DAYS = 30; // fans sin compras en los últimos 30 días se marcan en riesgo
const RENEWAL_WINDOW_DAYS = 7;

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

function daysFromNow(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getGrantAmount(type: string): number {
  const code = (type || "").toLowerCase();
  if (code === "monthly") return PACKS.monthly.price;
  if (code === "special") return PACKS.special.price;
  if (code === "single") return PACKS.special.price; // single se equipara al pack especial
  // trial/welcome/no coste
  return 0;
}

function sumGrantRevenue(grants: { type: string }[]): number {
  return grants.reduce((acc, grant) => acc + getGrantAmount(grant.type), 0);
}

function getUniqueFanCount(grants: { fanId: string }[]): number {
  return new Set(grants.map((g) => g.fanId)).size;
}

export async function getCreatorManagerSummary(creatorId: string, deps: ManagerDeps = {}): Promise<CreatorManagerSummary> {
  const client = deps.prismaClient ?? prisma;
  const now = new Date();
  const start7 = daysAgo(7);
  const start30 = daysAgo(30);
  const expiryWindowEnd = daysFromNow(RENEWAL_WINDOW_DAYS);

  const [extrasLast7, extrasLast30, grantsLast7, grantsLast30, activeGrants, monthlyExpiringSoon, monthlyExpired30, fans] =
    await Promise.all([
      client.extraPurchase.aggregate({
        where: { fan: { creatorId }, createdAt: { gte: start7 } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      client.extraPurchase.aggregate({
        where: { fan: { creatorId }, createdAt: { gte: start30 } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      client.accessGrant.findMany({
        where: { fan: { creatorId }, createdAt: { gte: start7 } },
        select: { fanId: true, type: true },
      }),
      client.accessGrant.findMany({
        where: { fan: { creatorId }, createdAt: { gte: start30 } },
        select: { fanId: true, type: true },
      }),
      client.accessGrant.findMany({
        where: { fan: { creatorId }, expiresAt: { gt: now } },
        select: { fanId: true, type: true, expiresAt: true },
      }),
      client.accessGrant.findMany({
        where: { fan: { creatorId }, type: "monthly", expiresAt: { gt: now, lte: expiryWindowEnd } },
        select: { fanId: true, type: true, expiresAt: true },
      }),
      client.accessGrant.findMany({
        where: { fan: { creatorId }, type: "monthly", expiresAt: { lte: now, gte: start30 } },
        select: { fanId: true, type: true, expiresAt: true },
      }),
      client.fan.findMany({
        where: { creatorId },
        select: {
          id: true,
          isNew: true,
          accessGrants: { select: { type: true, createdAt: true, expiresAt: true } },
          extraPurchases: { select: { amount: true, createdAt: true } },
        },
      }),
    ]);

  const kpis = {
    last7: {
      revenue: (extrasLast7._sum?.amount ?? 0) + sumGrantRevenue(grantsLast7),
      extras: extrasLast7._count?._all ?? 0,
      newFans: 0, // se calcula más abajo
    },
    last30: {
      revenue: (extrasLast30._sum?.amount ?? 0) + sumGrantRevenue(grantsLast30),
      extras: extrasLast30._count?._all ?? 0,
      newFans: 0, // se calcula más abajo
    },
  };

  let segments = {
    newFans: 0,
    habitual: 0,
    vip: 0,
    atRisk: 0,
  };

  const monthlyActiveGrants = activeGrants.filter((g) => g.type === "monthly");
  const specialActiveGrants = activeGrants.filter((g) => g.type === "special");
  const welcomeActiveGrants = activeGrants.filter((g) => g.type === "trial" || g.type === "welcome");

  // Recorremos fans para segmentación y nuevos en ventanas
  for (const fan of fans) {
    const grants = fan.accessGrants ?? [];
    const extras = fan.extraPurchases ?? [];
    const firstActivityDate =
      [...grants.map((g) => g.createdAt), ...extras.map((e) => e.createdAt)].sort(
        (a, b) => a.getTime() - b.getTime()
      )[0] || null;
    const lastActivityDate =
      [...grants.map((g) => g.createdAt), ...extras.map((e) => e.createdAt)].sort(
        (a, b) => b.getTime() - a.getTime()
      )[0] || null;
    const lifetimeRevenue = extras.reduce((acc, e) => acc + (e.amount ?? 0), 0) + sumGrantRevenue(grants);

    if (firstActivityDate && firstActivityDate >= start30) {
      segments.newFans += 1;
      kpis.last30.newFans += 1;
    }
    if (firstActivityDate && firstActivityDate >= start7) {
      kpis.last7.newFans += 1;
    }
    // Si no hay fecha, usamos la bandera isNew como respaldo para segmentar.
    if (!firstActivityDate && fan.isNew) {
      segments.newFans += 1;
      kpis.last30.newFans += 1;
      kpis.last7.newFans += 1;
    }

    const hasActiveMonthly = grants.some((g) => g.type === "monthly" && g.expiresAt > now);
    const hasActiveSpecial = grants.some((g) => g.type === "special" && g.expiresAt > now);

    if (lifetimeRevenue >= VIP_SPEND_THRESHOLD || hasActiveSpecial) {
      segments.vip += 1;
    } else {
      const activityWindow = daysAgo(HABITUAL_WINDOW_DAYS);
      if (lastActivityDate && lastActivityDate >= activityWindow) {
        segments.habitual += 1;
      }
    }

    const inactivityWindow = daysAgo(AT_RISK_INACTIVITY_DAYS);
    const monthlyExpirySoon = grants.some(
      (g) => g.type === "monthly" && g.expiresAt > now && g.expiresAt <= expiryWindowEnd
    );
    if (monthlyExpirySoon || !lastActivityDate || lastActivityDate <= inactivityWindow) {
      segments.atRisk += 1;
    }
    // VIP fans ya se contaron en vip; no los restamos de atRisk para mantener una métrica conservadora.
  }

  const packs = {
    welcome: {
      activeFans: getUniqueFanCount(welcomeActiveGrants),
      revenue30: sumGrantRevenue(grantsLast30.filter((g) => g.type === "trial" || g.type === "welcome")),
    },
    monthly: {
      activeFans: getUniqueFanCount(monthlyActiveGrants),
      renewalsIn7Days: getUniqueFanCount(monthlyExpiringSoon),
      churn30: getUniqueFanCount(monthlyExpired30),
      revenue30: sumGrantRevenue(grantsLast30.filter((g) => g.type === "monthly")),
    },
    special: {
      activeFans: getUniqueFanCount(specialActiveGrants),
      revenue30: sumGrantRevenue(grantsLast30.filter((g) => g.type === "special")),
    },
  };

  const suggestions: { label: string; action: "vip" | "renewals" | "extras" | "risk" | "general" }[] = [];
  if (segments.vip > 0) {
    suggestions.push({ label: `Tienes ${segments.vip} fans VIP activos, revisa sus chats hoy.`, action: "vip" });
  } else {
    suggestions.push({ label: "Aún sin fans VIP; sigue calentando con extras medianos.", action: "general" });
  }
  if (packs.monthly.renewalsIn7Days > 0) {
    suggestions.push({
      label: `Hay ${packs.monthly.renewalsIn7Days} renovaciones de mensual en los próximos 7 días.`,
      action: "renewals",
    });
  }
  if (kpis.last30.extras > 0) {
    suggestions.push({
      label: `Has vendido ${kpis.last30.extras} extras en los últimos 30 días; mantén el ritmo.`,
      action: "extras",
    });
  } else {
    suggestions.push({ label: "Sin extras recientes; prueba un mensaje de 'Extra rápido' a tus habituales.", action: "extras" });
  }
  if (segments.atRisk > 0) {
    suggestions.push({
      label: `${segments.atRisk} fans en riesgo (inactivos o con mensual a punto de caducar).`,
      action: "risk",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({ label: "Aún no hay suficiente actividad; sigue escribiendo a tus fans.", action: "general" });
  }

  return { kpis, packs, segments, suggestions };
}
