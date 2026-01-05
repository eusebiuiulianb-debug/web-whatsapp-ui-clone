import type { PrismaClient } from "@prisma/client";
import prisma from "./prisma.server";
import { PACKS } from "../config/packs";
import { buildManagerQueueForCreator, type Segment } from "../server/manager/managerService";
import { getCreatorRevenueSummary } from "./analytics/revenue";

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
    extras: {
      today: { count: number; revenue: number };
      last7: { count: number; revenue: number };
      last30: { count: number; revenue: number };
    };
    tips: {
      today: { count: number; revenue: number };
      last7: { count: number; revenue: number };
      last30: { count: number; revenue: number };
    };
    gifts: {
      today: { count: number };
      last7: { count: number };
      last30: { count: number };
    };
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
// Priority engine v2: weights by impact, dedupe per fan, and limit invites in Top 3 unless only invites exist.
const PRIORITY_WEIGHTS: Record<PriorityItemKind, number> = {
  EXPIRING_ACCESS: 100,
  AT_RISK: 80,
  NO_ACCESS_BUT_MESSAGE: 60,
  INVITE_PENDING: 20,
};
const PRIORITY_KIND_ORDER: PriorityItemKind[] = ["EXPIRING_ACCESS", "AT_RISK", "NO_ACCESS_BUT_MESSAGE", "INVITE_PENDING"];
const PRIORITY_KIND_RANK = PRIORITY_KIND_ORDER.reduce(
  (acc, kind, index) => {
    acc[kind] = index;
    return acc;
  },
  {} as Record<PriorityItemKind, number>
);

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
  return `/creator?fan=${encodeURIComponent(fanId)}`;
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

function comparePriorityItems(a: PriorityItem, b: PriorityItem): number {
  if (a.score !== b.score) return b.score - a.score;
  const kindDiff = PRIORITY_KIND_RANK[a.kind] - PRIORITY_KIND_RANK[b.kind];
  if (kindDiff !== 0) return kindDiff;
  return a.title.localeCompare(b.title);
}

export async function getCreatorManagerSummary(creatorId: string, deps: ManagerDeps = {}): Promise<CreatorManagerSummary> {
  const client = deps.prismaClient ?? prisma;
  const now = new Date();
  const startToday = startOfToday();
  const start7 = daysAgo(7);
  const start30 = daysAgo(30);
  const expiryWindowEnd = daysFromNow(RENEWAL_WINDOW_DAYS);
  const priorityExpiryWindowEnd = new Date(now.getTime() + PRIORITY_EXPIRY_WINDOW_HOURS * 60 * 60 * 1000);
  const inactivityWindow = daysAgo(AT_RISK_INACTIVITY_DAYS);
  const priorityByFan = new Map<string, PriorityItem>();
  const addPriorityItem = (item: PriorityItem) => {
    if (!item.fanId) return;
    const existing = priorityByFan.get(item.fanId);
    if (!existing || comparePriorityItems(item, existing) < 0) {
      priorityByFan.set(item.fanId, item);
    }
  };

  const [
    revenueToday,
    revenueLast7,
    revenueLast30,
    activeGrants,
    monthlyExpiringSoon,
    monthlyExpired30,
    fans,
  ] = await Promise.all([
    getCreatorRevenueSummary({ creatorId, from: startToday, to: now, prismaClient: client }),
    getCreatorRevenueSummary({ creatorId, from: start7, to: now, prismaClient: client }),
    getCreatorRevenueSummary({ creatorId, from: start30, to: now, prismaClient: client }),
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
        extraPurchases: { where: { amount: { gt: 0 }, isArchived: false }, select: { amount: true, createdAt: true, kind: true } },
        messages: { where: { from: "fan" }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  const extrasTodayCount = revenueToday.extras.count;
  const extrasTodayRevenue = revenueToday.extras.amount;
  const extrasLast7Count = revenueLast7.extras.count;
  const extrasLast7Revenue = revenueLast7.extras.amount;
  const extrasLast30Count = revenueLast30.extras.count;
  const extrasLast30Revenue = revenueLast30.extras.amount;

  const kpis = {
    last7: {
      revenue: revenueLast7.totals.amount,
      extras: extrasLast7Count,
      newFans: 0, // se calcula más abajo
    },
    last30: {
      revenue: revenueLast30.totals.amount,
      extras: extrasLast30Count,
      newFans: 0, // se calcula más abajo
    },
    extras: {
      today: { count: extrasTodayCount, revenue: extrasTodayRevenue },
      last7: { count: extrasLast7Count, revenue: extrasLast7Revenue },
      last30: { count: extrasLast30Count, revenue: extrasLast30Revenue },
    },
    tips: {
      today: { count: revenueToday.tips.count, revenue: revenueToday.tips.amount },
      last7: { count: revenueLast7.tips.count, revenue: revenueLast7.tips.amount },
      last30: { count: revenueLast30.tips.count, revenue: revenueLast30.tips.amount },
    },
    gifts: {
      today: { count: revenueToday.gifts.count },
      last7: { count: revenueLast7.gifts.count },
      last30: { count: revenueLast30.gifts.count },
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
    const purchases = fan.extraPurchases ?? [];
    const firstActivityDate =
      [...grants.map((g) => g.createdAt), ...purchases.map((e) => e.createdAt)].sort(
        (a, b) => a.getTime() - b.getTime()
      )[0] || null;
    const lastActivityDate =
      [...grants.map((g) => g.createdAt), ...purchases.map((e) => e.createdAt)].sort(
        (a, b) => b.getTime() - a.getTime()
      )[0] || null;
    const lifetimeRevenue = purchases.reduce((acc, e) => acc + (e.amount ?? 0), 0) + sumGrantRevenue(grants);

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
      addPriorityItem({
        id: `priority_invite_pending_${fan.id}`,
        kind: "INVITE_PENDING",
        title: "Invite pendiente",
        subtitle: `${displayName} aún no ha entrado`,
        fanId: fan.id,
        inviteUrl: invitePath,
        score: PRIORITY_WEIGHTS.INVITE_PENDING,
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
      addPriorityItem({
        id: `priority_expiring_access_${fan.id}`,
        kind: "EXPIRING_ACCESS",
        title: "Acceso caduca pronto",
        subtitle: `${displayName} caduca en ${daysToExpiry} ${dayLabel}`,
        fanId: fan.id,
        href: chatHref,
        score: PRIORITY_WEIGHTS.EXPIRING_ACCESS,
        primaryAction: buildOpenChatAction(fan.id),
      });
    }

    const hasActiveAccess = grants.some((g) => g.expiresAt > now);
    const hasMessages = (fan.messages?.length ?? 0) > 0;
    if (!hasActiveAccess && hasMessages) {
      const chatHref = buildCreatorChatHref(fan.id);
      addPriorityItem({
        id: `priority_no_access_message_${fan.id}`,
        kind: "NO_ACCESS_BUT_MESSAGE",
        title: "Escribió sin acceso",
        subtitle: `${displayName} escribió pero no tiene acceso`,
        fanId: fan.id,
        href: chatHref,
        score: PRIORITY_WEIGHTS.NO_ACCESS_BUT_MESSAGE,
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
      addPriorityItem({
        id: `priority_at_risk_${fan.id}`,
        kind: "AT_RISK",
        title: "Fan en riesgo",
        subtitle: `${displayName} requiere seguimiento`,
        fanId: fan.id,
        href: chatHref,
        score: PRIORITY_WEIGHTS.AT_RISK,
        primaryAction: buildOpenChatAction(fan.id),
      });
    }
    // VIP fans ya se contaron en vip; no los restamos de atRisk para mantener una métrica conservadora.
  }

  const subsByType30 = revenueLast30.subs.byType ?? {};
  const welcomeRevenue30 = (subsByType30.trial?.amount ?? 0) + (subsByType30.welcome?.amount ?? 0);
  const monthlyRevenue30 = subsByType30.monthly?.amount ?? 0;
  const specialRevenue30 = subsByType30.special?.amount ?? 0;

  const packs = {
    welcome: {
      activeFans: getUniqueFanCount(welcomeActiveGrants),
      revenue30: welcomeRevenue30,
    },
    monthly: {
      activeFans: getUniqueFanCount(monthlyActiveGrants),
      renewalsIn7Days: getUniqueFanCount(monthlyExpiringSoon),
      churn30: getUniqueFanCount(monthlyExpired30),
      revenue30: monthlyRevenue30,
    },
    special: {
      activeFans: getUniqueFanCount(specialActiveGrants),
      revenue30: specialRevenue30,
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

  const priorityItems = Array.from(priorityByFan.values()).sort(comparePriorityItems);
  const nonInviteItems = priorityItems.filter((item) => item.kind !== "INVITE_PENDING");
  const inviteItems = priorityItems.filter((item) => item.kind === "INVITE_PENDING");
  const topPriorities =
    nonInviteItems.length === 0
      ? inviteItems.slice(0, 3)
      : [...nonInviteItems.slice(0, 3), ...inviteItems.slice(0, 1)].slice(0, 3);

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
