import type { PrismaClient } from "@prisma/client";
import prisma from "./prisma.server";
import { PACKS } from "../config/packs";
import { buildManagerQueueForCreator, type Segment } from "../server/manager/managerService";

export type PriorityItemKind = "INVITE_PENDING" | "EXPIRING_ACCESS" | "NO_ACCESS_BUT_MESSAGE" | "AT_RISK";

export type PriorityItemAction = {
  type: "open" | "copy";
  label: string;
  href?: string;
  copyText?: string;
  target?: "_blank" | "_self";
};

export type PriorityItem = {
  id: string;
  kind: PriorityItemKind;
  title: string;
  subtitle?: string;
  fanId?: string;
  href?: string;
  inviteUrl?: string;
  score: number;
  primaryAction: PriorityItemAction;
  secondaryAction?: PriorityItemAction;
};

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
  priorityItems: PriorityItem[];
  topPriorities: PriorityItem[];
  revenueAtRisk7d?: number;
  atRiskFansCount?: number;
};

export type CreatorBusinessSnapshot = {
  vipActiveCount: number;
  renewalsNext7Days: number;
  extrasLast30Days: number;
  fansAtRisk: number;
  ingresosUltimos30Dias: number;
  ingresosUltimos7Dias: number;
  newFansLast30Days: number;
  revenueAtRisk7d: number;
  monthlyChurn30d: number;
  prioritizedFansToday: {
    id: string;
    name: string;
    segment: "NUEVO" | "HABITUAL" | "VIP" | "RIESGO";
    health: number;
    daysToExpire: number;
    spentLast30Days: number;
  }[];
};

type ManagerDeps = {
  prismaClient?: PrismaClient;
};

const VIP_SPEND_THRESHOLD = 200; // mismo umbral usado en el HUD para etiquetar VIP
const HABITUAL_WINDOW_DAYS = 60;
const AT_RISK_INACTIVITY_DAYS = 30; // fans sin compras en los últimos 30 días se marcan en riesgo
const RENEWAL_WINDOW_DAYS = 7;
const PRIORITY_EXPIRY_WINDOW_HOURS = 72;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function buildCreatorChatHref(fanId: string): string {
  return `/?fanId=${encodeURIComponent(fanId)}`;
}

function buildOpenChatAction(fanId: string): PriorityItemAction {
  return {
    type: "open",
    label: "Abrir chat",
    href: buildCreatorChatHref(fanId),
  };
}

function buildInvitePath(token: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (base) {
    const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${normalized}/i/${token}`;
  }
  return `/i/${token}`;
}

export async function getCreatorManagerSummary(creatorId: string, deps: ManagerDeps = {}): Promise<CreatorManagerSummary> {
  const client = deps.prismaClient ?? prisma;
  const now = new Date();
  const start7 = daysAgo(7);
  const start30 = daysAgo(30);
  const expiryWindowEnd = daysFromNow(RENEWAL_WINDOW_DAYS);
  const priorityExpiryWindowEnd = new Date(now.getTime() + PRIORITY_EXPIRY_WINDOW_HOURS * 60 * 60 * 1000);
  const inactivityWindow = daysAgo(AT_RISK_INACTIVITY_DAYS);
  const priorityItems: PriorityItem[] = [];

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
          name: true,
          displayName: true,
          inviteToken: true,
          inviteUsedAt: true,
          isNew: true,
          accessGrants: { select: { type: true, createdAt: true, expiresAt: true } },
          extraPurchases: { select: { amount: true, createdAt: true } },
          messages: { where: { from: "fan" }, select: { id: true }, take: 1 },
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
    const displayName = (fan.displayName || fan.name || "").trim() || "Fan";
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

    if (fan.inviteToken && !fan.inviteUsedAt) {
      const invitePath = buildInvitePath(fan.inviteToken);
      priorityItems.push({
        id: `priority_invite_pending_${fan.id}`,
        kind: "INVITE_PENDING",
        title: "Invite pendiente",
        subtitle: `${displayName} aún no ha entrado`,
        fanId: fan.id,
        inviteUrl: invitePath,
        score: 90,
        primaryAction: {
          type: "copy",
          label: "Copiar invitación",
          copyText: invitePath,
        },
      });
    }

    let expiringAccessAt: Date | null = null;
    for (const grant of grants) {
      if (grant.expiresAt > now && grant.expiresAt <= priorityExpiryWindowEnd) {
        if (!expiringAccessAt || grant.expiresAt.getTime() < expiringAccessAt.getTime()) {
          expiringAccessAt = grant.expiresAt;
        }
      }
    }
    if (expiringAccessAt) {
      const daysToExpiry = Math.max(1, Math.ceil((expiringAccessAt.getTime() - now.getTime()) / MS_PER_DAY));
      const dayLabel = daysToExpiry === 1 ? "día" : "días";
      const chatHref = buildCreatorChatHref(fan.id);
      priorityItems.push({
        id: `priority_expiring_access_${fan.id}`,
        kind: "EXPIRING_ACCESS",
        title: "Acceso caduca pronto",
        subtitle: `${displayName} caduca en ${daysToExpiry} ${dayLabel}`,
        fanId: fan.id,
        href: chatHref,
        score: 80,
        primaryAction: buildOpenChatAction(fan.id),
      });
    }

    const hasActiveAccess = grants.some((g) => g.expiresAt > now);
    const hasMessages = (fan.messages?.length ?? 0) > 0;
    if (!hasActiveAccess && hasMessages) {
      const chatHref = buildCreatorChatHref(fan.id);
      priorityItems.push({
        id: `priority_no_access_message_${fan.id}`,
        kind: "NO_ACCESS_BUT_MESSAGE",
        title: "Escribió sin acceso",
        subtitle: `${displayName} escribió pero no tiene acceso`,
        fanId: fan.id,
        href: chatHref,
        score: 70,
        primaryAction: buildOpenChatAction(fan.id),
      });
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

    const monthlyExpirySoon = grants.some(
      (g) => g.type === "monthly" && g.expiresAt > now && g.expiresAt <= expiryWindowEnd
    );
    const isAtRisk = monthlyExpirySoon || !lastActivityDate || lastActivityDate <= inactivityWindow;
    if (isAtRisk) {
      segments.atRisk += 1;
      const chatHref = buildCreatorChatHref(fan.id);
      priorityItems.push({
        id: `priority_at_risk_${fan.id}`,
        kind: "AT_RISK",
        title: "Fan en riesgo",
        subtitle: `${displayName} requiere seguimiento`,
        fanId: fan.id,
        href: chatHref,
        score: 60,
        primaryAction: buildOpenChatAction(fan.id),
      });
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

  let suggestionCounter = 0;
  const buildId = () => {
    suggestionCounter += 1;
    return `suggestion_${suggestionCounter}`;
  };

  const suggestions: { id: string; label: string; action: "vip" | "renewals" | "extras" | "risk" | "general" }[] = [];
  if (segments.vip > 0) {
    suggestions.push({ id: buildId(), label: `Tienes ${segments.vip} fans VIP activos, revisa sus chats hoy.`, action: "vip" });
  } else {
    suggestions.push({ id: buildId(), label: "Aún sin fans VIP; sigue calentando con extras medianos.", action: "general" });
  }
  if (packs.monthly.renewalsIn7Days > 0) {
    suggestions.push({
      id: buildId(),
      label: `Hay ${packs.monthly.renewalsIn7Days} renovaciones de mensual en los próximos 7 días.`,
      action: "renewals",
    });
  }
  if (kpis.last30.extras > 0) {
    suggestions.push({
      id: buildId(),
      label: `Has vendido ${kpis.last30.extras} extras en los últimos 30 días; mantén el ritmo.`,
      action: "extras",
    });
  } else {
    suggestions.push({
      id: buildId(),
      label: "Sin extras recientes; prueba un mensaje de 'Extra rápido' a tus habituales.",
      action: "extras",
    });
  }
  if (segments.atRisk > 0) {
    suggestions.push({
      id: buildId(),
      label: `${segments.atRisk} fans en riesgo (inactivos o con mensual a punto de caducar).`,
      action: "risk",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({ id: buildId(), label: "Aún no hay suficiente actividad; sigue escribiendo a tus fans.", action: "general" });
  }

  const topPriorities = priorityItems
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 3);

  return { kpis, packs, segments, suggestions, priorityItems, topPriorities };
}

export async function getCreatorBusinessSnapshot(creatorId: string, deps: ManagerDeps = {}): Promise<CreatorBusinessSnapshot> {
  const summary = await getCreatorManagerSummary(creatorId, deps);
  const queue = await buildManagerQueueForCreator(creatorId, deps.prismaClient ?? prisma);

  return {
    vipActiveCount: summary.segments.vip,
    renewalsNext7Days: summary.packs.monthly.renewalsIn7Days,
    extrasLast30Days: summary.kpis.last30.extras,
    fansAtRisk: summary.segments.atRisk,
    ingresosUltimos30Dias: summary.kpis.last30.revenue,
    ingresosUltimos7Dias: summary.kpis.last7.revenue,
    newFansLast30Days: summary.kpis.last30.newFans,
    revenueAtRisk7d: summary.revenueAtRisk7d ?? 0,
    monthlyChurn30d: summary.packs.monthly.churn30,
    prioritizedFansToday: queue.map((fan) => ({
      id: fan.id,
      name: fan.displayName,
      segment: mapSegmentForSnapshot(fan.segment),
      health: fan.healthScore,
      daysToExpire: fan.daysToExpiry ?? 0,
      spentLast30Days: fan.recent30dSpend ?? 0,
    })),
  };
}

function mapSegmentForSnapshot(segment: Segment): "NUEVO" | "HABITUAL" | "VIP" | "RIESGO" {
  if (segment === "VIP") return "VIP";
  if (segment === "NUEVO") return "NUEVO";
  if (segment === "EN_RIESGO") return "RIESGO";
  return "HABITUAL";
}
