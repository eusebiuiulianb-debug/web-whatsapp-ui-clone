import { PrismaClient } from "@prisma/client";
import { addDaysFrom, daysBetween } from "./dateUtils";
import {
  ACTION_OBJECTIVES,
  SUMMARY_PROFILE_COPY,
  SUMMARY_RECENT_COPY,
  SUMMARY_OPPORTUNITY_COPY,
  type SummaryProfileId,
  type SummaryRecentId,
} from "./managerCopyConfig";
import { CreatorAiContextSchema } from "./managerSchemas";
import type { CreatorAiContext } from "./managerSchemas";
import {
  decideNextBestAction,
  DORMANT_DAYS as IA_DORMANT_DAYS,
  type IaRuleContext,
  type NextBestActionId,
} from "./managerIaConfig";
import { isVisibleToFan } from "../../lib/messageAudience";
import { getFanMonetizationSummary, type FanMonetizationSummary } from "../../lib/analytics/revenue";
import { buildAccessStateFromGrants } from "../../lib/accessState";

// Thresholds de segmentación/health
export const VIP_LTV_THRESHOLD = 200;
export const AT_RISK_HEALTH_MAX = 39;
export const MEDIUM_HEALTH_MAX = 74;
export const DORMANT_DAYS = 60;
export const NEW_FAN_DAYS = 7;
export const PACK_EXPIRY_AT_RISK_DAYS = 3;
export const PACK_EXPIRY_WINDOW_DAYS = 7;

export type HealthScoreInput = {
  daysSinceLastMessage: number | null;
  daysSinceLastPurchase: number | null;
  lifetimeValue: number;
  hasActiveMonthlyOrSpecial: boolean;
  daysToExpiry: number | null;
};

export type Segment =
  | "VIP"
  | "LEAL_ESTABLE"
  | "EN_RIESGO"
  | "NUEVO"
  | "DORMIDO"
  | "LIGERO";

export type RelationshipStage = "NUEVO" | "CALENTANDO" | "FIEL" | "RIESGO";

export type CommunicationStyle = "CERCANO" | "DIRECTO" | "JUGUETON" | "SERIO";

export type FanManagerRow = {
  id: string;
  displayName: string;
  segment: Segment;
  healthScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  daysToExpiry: number | null;
  lifetimeValue: number;
  recent30dSpend: number;
  relationshipStage: RelationshipStage;
};

export type ManagerMessageSuggestion = {
  id: string;
  label: string;
  text: string;
};

export type FanManagerSummary = {
  fanId: string;
  segment: Segment;
  healthScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  hasActivePack: boolean;
  hasActiveAccess: boolean;
  daysToExpiry: number | null;
  recent30dSpend: number;
  lifetimeValue: number;
  inviteUsedAt?: string | null;
  priorityRank: number | null;
  priorityReason: string;
  nextBestAction: "RENOVAR_PACK" | "CUIDAR_VIP" | "BIENVENIDA" | "REACTIVAR_DORMIDO" | "OFRECER_EXTRA" | "NEUTRO";
  recommendedButtons: string[];
  objectiveToday: string;
  messageSuggestions: ManagerMessageSuggestion[];
  relationshipStage: RelationshipStage;
  communicationStyle: CommunicationStyle | null;
  lastTopic: string | null;
  personalizationHints: string | null;
  summary: {
    profile: string;
    recent: string;
    opportunity: string;
  };
  aiContext: FanManagerAiContext;
  monetization: FanMonetizationSummary | null;
};

export type FanManagerAiContext = {
  fanId: string;
  displayName: string;
  segment: Segment;
  stageLabel: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  healthScore: number | null;
  lifetimeSpent: number | null;
  spentLast30Days: number | null;
  extrasCount: number | null;
  daysSinceLastMessage: number | null;
  daysToRenewal: number | null;
  hasActiveMonthly: boolean;
  hasActiveTrial: boolean;
  hasActiveSpecialPack: boolean;
  summary: {
    profile: string;
    recent: string;
    opportunity: string;
  };
  mode?: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculateHealthScoreForFan(input: HealthScoreInput): number {
  const { daysSinceLastMessage, daysSinceLastPurchase, lifetimeValue, hasActiveMonthlyOrSpecial, daysToExpiry } = input;

  // Recency chat (0-30)
  let chatScore = 0;
  if (daysSinceLastMessage !== null) {
    if (daysSinceLastMessage <= 1) chatScore = 30;
    else if (daysSinceLastMessage <= 3) chatScore = 20;
    else if (daysSinceLastMessage <= 7) chatScore = 10;
    else chatScore = 0;
  }

  // Recency compra (0-30)
  let purchaseScore = 0;
  if (daysSinceLastPurchase !== null) {
    if (daysSinceLastPurchase <= 7) purchaseScore = 30;
    else if (daysSinceLastPurchase <= 30) purchaseScore = 20;
    else purchaseScore = 10;
  }

  // Valor monetario (0-20)
  let valueScore = 0;
  if (lifetimeValue >= 100) valueScore = 20;
  else if (lifetimeValue >= 30) valueScore = 10;
  else if (lifetimeValue > 0) valueScore = 5;

  // Días para caducar (0-20)
  let expiryScore = 0;
  if (hasActiveMonthlyOrSpecial) {
    if (typeof daysToExpiry === "number") {
      if (daysToExpiry > 7) expiryScore = 20;
      else if (daysToExpiry >= 3) expiryScore = 10;
      else if (daysToExpiry >= 1) expiryScore = 5;
      else expiryScore = 0;
    }
  }

  return clamp(chatScore + purchaseScore + valueScore + expiryScore, 0, 100);
}

export function calculateRiskLevel(healthScore: number, daysToExpiry: number | null): "LOW" | "MEDIUM" | "HIGH" {
  if (healthScore <= AT_RISK_HEALTH_MAX) return "HIGH";
  if (healthScore <= MEDIUM_HEALTH_MAX) return "MEDIUM";
  // Si la salud es alta pero caduca pronto, marcamos medio.
  if (daysToExpiry !== null && daysToExpiry <= PACK_EXPIRY_WINDOW_DAYS) {
    return "MEDIUM";
  }
  return "LOW";
}

export function calculateSegmentForFan(args: {
  healthScore: number;
  lifetimeValue: number;
  hasActiveMonthlyOrSpecial: boolean;
  daysToExpiry: number | null;
  daysSinceLastMessage: number | null;
  daysSinceLastPurchase: number | null;
  daysSinceCreated?: number | null;
  previousSegment?: Segment | null;
}): Segment {
  const {
    healthScore,
    lifetimeValue,
    hasActiveMonthlyOrSpecial,
    daysToExpiry,
    daysSinceLastMessage,
    daysSinceLastPurchase,
    daysSinceCreated,
    previousSegment,
  } = args;

  const hasHistory = lifetimeValue > 0;
  const interactions = [daysSinceLastMessage, daysSinceLastPurchase].filter((v): v is number => typeof v === "number");
  const lastInteraction = interactions.length > 0 ? Math.min(...interactions) : null;
  const daysSinceInteraction = Number.isFinite(lastInteraction as number) ? (lastInteraction as number) : null;

  if (!hasHistory && typeof daysSinceInteraction === "number" && daysSinceInteraction <= NEW_FAN_DAYS) {
    return "NUEVO";
  }

  if (hasHistory && (daysSinceInteraction ?? Infinity) > DORMANT_DAYS) {
    return "DORMIDO";
  }

  if (lifetimeValue >= VIP_LTV_THRESHOLD && healthScore >= 50) {
    return "VIP";
  }

  const expirySoon = typeof daysToExpiry === "number" && daysToExpiry <= PACK_EXPIRY_AT_RISK_DAYS;
  if ((hasActiveMonthlyOrSpecial && expirySoon) || (healthScore <= AT_RISK_HEALTH_MAX && hasHistory)) {
    return "EN_RIESGO";
  }

  if (lifetimeValue >= 50 && healthScore >= 60) {
    return "LEAL_ESTABLE";
  }

  return "LIGERO";
}

type FanStats = {
  segment: Segment;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  healthScore: number;
  lifetimeValue: number;
  recent30dSpend: number;
  hasActivePack: boolean;
  daysToExpiry: number | null;
  daysSinceLastMessage: number | null;
  daysSinceLastPurchase: number | null;
  isNew: boolean;
  lifetimeExtraSpend: number;
};

function inferRelationshipStage(stats: FanStats): RelationshipStage {
  const expiryRisk = typeof stats.daysToExpiry === "number" && stats.daysToExpiry <= PACK_EXPIRY_WINDOW_DAYS;
  if (stats.riskLevel === "HIGH" || stats.healthScore <= AT_RISK_HEALTH_MAX || expiryRisk) {
    return "RIESGO";
  }
  if (stats.isNew || stats.segment === "NUEVO") return "NUEVO";
  if (
    stats.segment === "VIP" ||
    stats.segment === "LEAL_ESTABLE" ||
    stats.healthScore >= 75 ||
    stats.lifetimeValue >= VIP_LTV_THRESHOLD ||
    stats.recent30dSpend >= 50
  ) {
    return "FIEL";
  }
  return "CALENTANDO";
}

function inferCommunicationStyle(stats: FanStats, relationshipStage: RelationshipStage): CommunicationStyle {
  if (relationshipStage === "RIESGO" || stats.segment === "EN_RIESGO") return "DIRECTO";
  if (relationshipStage === "NUEVO") return "CERCANO";
  if (stats.segment === "VIP" || stats.healthScore >= 70 || stats.lifetimeValue >= VIP_LTV_THRESHOLD) return "JUGUETON";
  return "SERIO";
}

function inferLastTopic(notes?: { content?: string | null }[] | null): string | null {
  const content = notes?.[0]?.content?.trim();
  if (!content) return null;
  if (content.length > 100) return `${content.slice(0, 100)}...`;
  return content;
}

function buildPersonalizationHints(
  stats: FanStats,
  relationshipStage: RelationshipStage,
  communicationStyle: CommunicationStyle
): string | null {
  if (relationshipStage === "RIESGO") {
    return "Esta en riesgo; ofrece opciones claras y precios concretos.";
  }
  if (relationshipStage === "NUEVO") {
    return "Es nuevo; haz preguntas abiertas y guíale al pack adecuado.";
  }
  if (communicationStyle === "JUGUETON") {
    return "Le va un tono juguetón y cercano; añade complicidad en tu mensaje.";
  }
  if (communicationStyle === "DIRECTO") {
    return "Prefiere que vayas directo con propuestas y precios claros.";
  }
  if (stats.recent30dSpend > 0) {
    return "Ha gastado recientemente; ofrécele algo alineado con lo último que compró.";
  }
  return null;
}

function buildRelationshipSummary(input: {
  segment: Segment;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  daysToExpiry: number | null;
  daysSinceLastMessage: number | null;
  daysSinceLastPurchase: number | null;
  lifetimeValue: number;
  recent30dSpend: number;
  lifetimeExtraSpend: number;
  nextBestActionId: NextBestActionId;
  isNewFan: boolean;
}): { profile: string; recent: string; opportunity: string } {
  let profileKey: SummaryProfileId = "DEFAULT";
  if (input.segment === "VIP" || input.lifetimeValue >= VIP_LTV_THRESHOLD) {
    profileKey = "VIP_CORE";
  } else if (input.riskLevel === "HIGH") {
    profileKey = "RISK";
  } else if (input.segment === "NUEVO" || input.isNewFan) {
    const engaged = input.lifetimeExtraSpend > 0 || input.recent30dSpend > 0;
    profileKey = engaged ? "NEW_ENGAGED" : "NEW_TRIAL";
  } else if (input.segment === "LEAL_ESTABLE") {
    profileKey = "LOYAL";
  }

  let recentKey: SummaryRecentId = "DEFAULT";
  if (typeof input.daysToExpiry === "number" && input.daysToExpiry <= PACK_EXPIRY_AT_RISK_DAYS) {
    recentKey = "EXPIRY_SOON";
  } else if (typeof input.daysSinceLastPurchase === "number" && input.daysSinceLastPurchase > 30) {
    recentKey = "NO_PURCHASE_LONG";
  } else if (typeof input.daysSinceLastMessage === "number" && input.daysSinceLastMessage <= 3) {
    recentKey = "ACTIVE_CHAT";
  } else if (input.riskLevel === "HIGH") {
    recentKey = "RISK_ZONE";
  }

  const profile = SUMMARY_PROFILE_COPY[profileKey];
  const recent = SUMMARY_RECENT_COPY[recentKey];
  const opportunity = SUMMARY_OPPORTUNITY_COPY[input.nextBestActionId] ?? SUMMARY_OPPORTUNITY_COPY.NEUTRAL;

  return {
    profile,
    recent,
    opportunity,
  };
}

function buildAiContext(input: {
  fanId: string;
  displayName: string;
  segment: Segment;
  relationshipStage: RelationshipStage;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  healthScore: number;
  lifetimeValue: number | null;
  recent30dSpend: number | null;
  extrasCount: number | null;
  daysSinceLastMessage: number | null;
  daysToExpiry: number | null;
  hasActiveMonthly: boolean;
  hasActiveTrial: boolean;
  hasActiveSpecialPack: boolean;
  summary: { profile: string; recent: string; opportunity: string };
  nextBestAction: FanManagerSummary["nextBestAction"];
  nextBestActionId: NextBestActionId;
}): FanManagerAiContext {
  return {
    fanId: input.fanId,
    displayName: input.displayName,
    segment: input.segment,
    stageLabel: input.relationshipStage,
    riskLevel: input.riskLevel,
    healthScore: input.healthScore,
    lifetimeSpent: input.lifetimeValue,
    spentLast30Days: input.recent30dSpend,
    extrasCount: input.extrasCount,
    daysSinceLastMessage: input.daysSinceLastMessage,
    daysToRenewal: input.daysToExpiry,
    hasActiveMonthly: input.hasActiveMonthly,
    hasActiveTrial: input.hasActiveTrial,
    hasActiveSpecialPack: input.hasActiveSpecialPack,
    summary: input.summary,
    mode: input.nextBestAction ?? input.nextBestActionId,
  };
}

function getGrantAmount(type: string): number {
  const lower = (type || "").toLowerCase();
  if (lower === "monthly") return 25;
  if (lower === "special" || lower === "single") return 49;
  return 0;
}

export async function buildCreatorAiContext(creatorId: string, prisma: PrismaClient): Promise<CreatorAiContext> {
  const now = new Date();
  const start30 = addDaysFrom(now, -30) ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [fans, activeGrants, grantsLast30, extrasLast30, extrasAll] = await Promise.all([
    prisma.fan.findMany({
      where: { creatorId },
      select: {
        id: true,
        lifetimeValue: true,
        isNew: true,
        accessGrants: { select: { type: true, createdAt: true, expiresAt: true } },
        extraPurchases: {
          where: { kind: "EXTRA", amount: { gt: 0 }, isArchived: false },
          select: { amount: true, createdAt: true, tier: true },
        },
      },
    }),
    prisma.accessGrant.findMany({
      where: { fan: { creatorId }, expiresAt: { gt: now } },
      select: { fanId: true, type: true, createdAt: true, expiresAt: true },
    }),
    prisma.accessGrant.findMany({
      where: { fan: { creatorId }, createdAt: { gte: start30 } },
      select: { fanId: true, type: true, createdAt: true, expiresAt: true },
    }),
    prisma.extraPurchase.findMany({
      where: { fan: { creatorId }, createdAt: { gte: start30 }, kind: "EXTRA", amount: { gt: 0 }, isArchived: false },
      select: { amount: true, tier: true, createdAt: true },
    }),
    prisma.extraPurchase.findMany({
      where: { fan: { creatorId }, kind: "EXTRA", amount: { gt: 0 }, isArchived: false },
      select: { amount: true, tier: true, createdAt: true },
    }),
  ]);

  const totalFans = fans.length;

  const activeFanIds = new Set(activeGrants.map((g) => g.fanId));
  const activeFans = activeFanIds.size;

  const trialOrFirstMonthFans = new Set(
    grantsLast30
      .filter((g) => g.type === "trial" || g.type === "welcome" || g.type === "monthly")
      .map((g) => g.fanId)
  ).size;

  let churn30d = 0;
  for (const fan of fans) {
    const lastGrant = fan.accessGrants.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
    if (
      lastGrant &&
      lastGrant.expiresAt <= now &&
      lastGrant.expiresAt >= start30 &&
      !activeFanIds.has(fan.id)
    ) {
      churn30d += 1;
    }
  }

  const vipFans = fans.filter((f) => (f.lifetimeValue ?? 0) >= VIP_LTV_THRESHOLD).length;

  const monthlyExtraRevenue = extrasLast30.reduce((acc, p) => acc + (p.amount ?? 0), 0);
  const monthlySubsRevenue = grantsLast30
    .filter((g) => g.type === "monthly")
    .reduce((acc, g) => acc + getGrantAmount(g.type), 0);

  const tiersLast30 = extrasLast30.map((e) => e.tier).filter((t) => Boolean(t)) as string[];
  const topPackType =
    tiersLast30.length > 0
      ? tiersLast30.reduce(
          (best, current) => {
            const countCurrent = tiersLast30.filter((t) => t === current).length;
            const countBest = tiersLast30.filter((t) => t === best).length;
            return countCurrent > countBest ? current : best;
          },
          tiersLast30[0]
        )
      : null;

  const allTiers = extrasAll.map((e) => e.tier).filter((t) => Boolean(t)) as string[];
  const recentTierSet = new Set(tiersLast30);
  const lowStockPackTypes = Array.from(new Set(allTiers.filter((t) => !recentTierSet.has(t))));

  const avgMessagesPerFan = null;

  let lastContentRefreshDays: number | null = null;
  const latestExtra = extrasAll.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const latestSpecialGrant = fans
    .flatMap((f) => f.accessGrants)
    .filter((g) => g.type === "special")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const latestDate = latestExtra?.createdAt || latestSpecialGrant?.createdAt;
  if (latestDate) {
    lastContentRefreshDays = daysBetween(now, latestDate);
  }

  return CreatorAiContextSchema.parse({
    totalFans,
    activeFans,
    trialOrFirstMonthFans,
    churn30d,
    vipFans,
    monthlyExtraRevenue,
    monthlySubsRevenue,
    topPackType,
    lowStockPackTypes,
    avgMessagesPerFan,
    lastContentRefreshDays,
  });
}

function mapDecisionToAction(id: NextBestActionId): FanManagerSummary["nextBestAction"] {
  switch (id) {
    case "RENEW_HARD":
    case "RENEW_SOFT":
      return "RENOVAR_PACK";
    case "FIRST_WELCOME":
      return "BIENVENIDA";
    case "FIRST_EXTRA":
    case "RECOVER_TOP_FAN":
      return "OFRECER_EXTRA";
    case "WAKE_DORMANT":
      return "REACTIVAR_DORMIDO";
    default:
      return "NEUTRO";
  }
}

function getActionMeta(action: FanManagerSummary["nextBestAction"]): { buttons: string[]; objective: string } {
  const objective = ACTION_OBJECTIVES[action] ?? "Seguir la conversación normal, escuchar y responder.";

  switch (action) {
    case "RENOVAR_PACK":
      return {
        buttons: ["renenganche", "elegir_pack"],
        objective,
      };
    case "CUIDAR_VIP":
      return {
        buttons: ["saludo_rapido", "extra_rapido"],
        objective,
      };
    case "BIENVENIDA":
      return {
        buttons: ["saludo_rapido", "pack_bienvenida"],
        objective,
      };
    case "REACTIVAR_DORMIDO":
      return {
        buttons: ["saludo_rapido"],
        objective,
      };
    case "OFRECER_EXTRA":
      return {
        buttons: ["extra_rapido"],
        objective,
      };
    default:
      return {
        buttons: [],
        objective,
      };
  }
}

export async function buildManagerQueueForCreator(creatorId: string, prisma: PrismaClient): Promise<FanManagerRow[]> {
  const now = new Date();
  const fans = await prisma.fan.findMany({
    where: { creatorId },
    include: {
      accessGrants: true,
      extraPurchases: { where: { amount: { gt: 0 }, isArchived: false } },
      messages: true,
    },
  });

  const queue: FanManagerRow[] = [];

  for (const fan of fans) {
    const visibleMessages = (fan.messages ?? []).filter((message) => isVisibleToFan(message));
    const extraPurchases = (fan.extraPurchases ?? []).filter(
      (purchase) => !purchase.kind || purchase.kind === "EXTRA"
    );
    const lastMsg = visibleMessages
      .map((m) => m.time)
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const lastMessageAt = lastMsg ?? null;
    const lastCreatorMessageAt = null; // no explicit flag in messages, keep null for now
    const lastPurchaseAt =
      fan.extraPurchases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
    const activeGrant = fan.accessGrants.find((g) => g.expiresAt > now) ?? null;
    const hasActiveMonthlyOrSpecial =
      fan.accessGrants.some((g) => g.expiresAt > now && (g.type === "monthly" || g.type === "special"));
    const expiry = activeGrant ? activeGrant.expiresAt : null;
    const daysToExpiry = daysBetween(expiry, now);
    const daysSinceLastMessage = daysBetween(now, lastMessageAt);
    const daysSinceLastPurchase = daysBetween(now, lastPurchaseAt);
    const daysSinceCreated = null;
    const lifetimeValue = fan.lifetimeValue ?? 0;
    const lifetimeExtraSpend = extraPurchases.reduce((acc, p) => acc + (p.amount ?? 0), 0);

    const healthScore = calculateHealthScoreForFan({
      daysSinceLastMessage,
      daysSinceLastPurchase,
      lifetimeValue,
      hasActiveMonthlyOrSpecial,
      daysToExpiry,
    });
    const segment = calculateSegmentForFan({
      healthScore,
      lifetimeValue,
      hasActiveMonthlyOrSpecial,
      daysToExpiry,
      daysSinceLastMessage,
      daysSinceLastPurchase,
      daysSinceCreated,
      previousSegment: (fan.segment as Segment) ?? null,
    });
    const riskLevel = calculateRiskLevel(healthScore, daysToExpiry);
    const stats: FanStats = {
      segment,
      riskLevel,
      healthScore,
      lifetimeValue,
      recent30dSpend: fan.recent30dSpend ?? 0,
      hasActivePack: Boolean(activeGrant),
      daysToExpiry,
      daysSinceLastMessage,
      daysSinceLastPurchase,
      isNew: Boolean(fan.isNew),
      lifetimeExtraSpend,
    };
    const relationshipStage = inferRelationshipStage(stats);

    await prisma.fan.update({
      where: { id: fan.id },
      data: {
        healthScore,
        segment,
        riskLevel,
        lastMessageAt,
        lastCreatorMessageAt,
        lastPurchaseAt,
      },
    });

    queue.push({
      id: fan.id,
      displayName: fan.name,
      segment,
      healthScore,
      riskLevel,
      daysToExpiry,
      lifetimeValue,
      recent30dSpend: fan.recent30dSpend ?? 0,
      relationshipStage,
    });
  }

  const priorityOrder: Segment[] = ["EN_RIESGO", "VIP", "LEAL_ESTABLE", "NUEVO", "DORMIDO", "LIGERO"];
  queue.sort((a, b) => {
    const segDiff = priorityOrder.indexOf(a.segment) - priorityOrder.indexOf(b.segment);
    if (segDiff !== 0) return segDiff;
    if (a.segment === "EN_RIESGO") return (b.lifetimeValue ?? 0) - (a.lifetimeValue ?? 0);
    if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore;
    return (b.lifetimeValue ?? 0) - (a.lifetimeValue ?? 0);
  });

  return queue;
}

export async function buildFanManagerSummary(creatorId: string, fanId: string, prisma: PrismaClient): Promise<FanManagerSummary> {
  const now = new Date();
  const fan = await prisma.fan.findUnique({
    where: { id: fanId },
    include: {
      accessGrants: true,
      extraPurchases: { where: { amount: { gt: 0 }, isArchived: false } },
      messages: true,
      notes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!fan || fan.creatorId !== creatorId) {
    throw new Error("NOT_FOUND");
  }

  const visibleMessages = (fan.messages ?? []).filter((message) => isVisibleToFan(message));
  const lastMsg = visibleMessages
    .map((m) => m.time)
    .filter((t): t is string => Boolean(t))
    .map((t) => new Date(t))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const extraPurchases = (fan.extraPurchases ?? []).filter(
    (purchase) => !purchase.kind || purchase.kind === "EXTRA"
  );
  const lastPurchase = fan.extraPurchases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const daysSinceLastMessage = daysBetween(now, lastMsg);
  const daysSinceLastPurchase = daysBetween(now, lastPurchase?.createdAt);

  const accessSnapshot = buildAccessStateFromGrants({
    accessGrants: fan.accessGrants,
    isNew: fan.isNew ?? false,
    now,
  });
  const activeGrants = fan.accessGrants.filter((g) => g.expiresAt > now);
  const activeGrant = activeGrants[0] ?? null;
  const daysToExpiry = daysBetween(activeGrant?.expiresAt, now);
  const hasActivePack = accessSnapshot.hasActiveAccess;
  const hasActiveMonthly = activeGrants.some((g) => g.type === "monthly");
  const hasActiveTrial = activeGrants.some((g) => g.type === "trial" || g.type === "welcome");
  const hasActiveSpecialPack = activeGrants.some((g) => g.type === "special");

  const lifetimeValue = fan.lifetimeValue ?? 0;
  const lifetimeExtraSpend = extraPurchases.reduce((acc, p) => acc + (p.amount ?? 0), 0);
  let recent30dSpend = fan.recent30dSpend ?? 0;
  if (!recent30dSpend) {
    const start30 = addDaysFrom(now, -30) ?? now;
    recent30dSpend = extraPurchases
      .filter((p) => p.createdAt >= start30)
      .reduce((acc, p) => acc + (p.amount ?? 0), 0);
  }
  const extrasCount = extraPurchases.length;

  const healthScore = calculateHealthScoreForFan({
    daysSinceLastMessage,
    daysSinceLastPurchase,
    lifetimeValue,
    hasActiveMonthlyOrSpecial: hasActivePack,
    daysToExpiry,
  });
  const segment = calculateSegmentForFan({
    healthScore,
    lifetimeValue,
    hasActiveMonthlyOrSpecial: hasActivePack,
    daysToExpiry,
    daysSinceLastMessage,
    daysSinceLastPurchase,
    previousSegment: (fan.segment as Segment) ?? null,
  });
  const riskLevel = calculateRiskLevel(healthScore, daysToExpiry);
  const stats: FanStats = {
    segment,
    riskLevel,
    healthScore,
    lifetimeValue,
    recent30dSpend,
    hasActivePack,
    daysToExpiry,
    daysSinceLastMessage,
    daysSinceLastPurchase,
    isNew: Boolean(fan.isNew),
    lifetimeExtraSpend,
  };
  const relationshipStage = inferRelationshipStage(stats);
  const communicationStyle = inferCommunicationStyle(stats, relationshipStage);
  const lastTopic = inferLastTopic(fan.notes);
  const personalizationHints = buildPersonalizationHints(stats, relationshipStage, communicationStyle);

  let priorityRank: number | null = null;
  try {
    const queue = await buildManagerQueueForCreator(creatorId, prisma);
    const idx = queue.findIndex((row) => row.id === fanId);
    priorityRank = idx >= 0 ? idx + 1 : null;
  } catch (_err) {
    priorityRank = null;
  }

  const decision: IaRuleContext = {
    hasActiveSubscription: hasActivePack,
    daysToExpiry,
    isNewFan: Boolean(fan.isNew) || segment === "NUEVO" || relationshipStage === "NUEVO",
    isDormant: typeof daysSinceLastMessage === "number" && daysSinceLastMessage > IA_DORMANT_DAYS,
    lifetimeExtraSpend,
    extraSpendLast30d: recent30dSpend,
    lastPaidActionDaysAgo: daysSinceLastPurchase,
    riskLevel,
    healthScore,
    relationshipStage,
  };
  const decisionResult = decideNextBestAction(decision);
  const nextBestAction = mapDecisionToAction(decisionResult.id);
  const actionMeta = getActionMeta(nextBestAction);
  const monetization = await getFanMonetizationSummary(fanId, creatorId, { prismaClient: prisma });
  const aiLifetimeSpent = monetization?.totalSpent ?? null;
  const aiSpentLast30Days = monetization?.recent30dSpent ?? null;
  const aiExtrasCount = monetization?.extras?.count ?? null;
  const suggestions: ManagerMessageSuggestion[] = decisionResult.suggestions.map((text, idx) => ({
    id: `${decisionResult.id.toLowerCase()}_${idx + 1}`,
    label: `${decisionResult.label} ${idx + 1}`,
    text,
  }));
  const stageLabel = relationshipStage;
  const summary = buildRelationshipSummary({
    segment,
    riskLevel,
    daysToExpiry,
    daysSinceLastMessage,
    daysSinceLastPurchase,
    lifetimeValue,
    recent30dSpend,
    lifetimeExtraSpend,
    nextBestActionId: decisionResult.id,
    isNewFan: Boolean(fan.isNew) || segment === "NUEVO" || relationshipStage === "NUEVO",
  });
  const aiContext = buildAiContext({
    fanId,
    displayName: fan.name,
    segment,
    relationshipStage,
    riskLevel,
    healthScore,
    lifetimeValue: aiLifetimeSpent,
    recent30dSpend: aiSpentLast30Days,
    extrasCount: aiExtrasCount,
    daysSinceLastMessage,
    daysToExpiry,
    hasActiveMonthly,
    hasActiveTrial,
    hasActiveSpecialPack,
    summary,
    nextBestAction,
    nextBestActionId: decisionResult.id,
  });
  const inviteUsedAt = fan.inviteUsedAt ? fan.inviteUsedAt.toISOString() : null;

  return {
    fanId,
    segment,
    healthScore,
    riskLevel,
    hasActivePack,
    hasActiveAccess: hasActivePack,
    daysToExpiry,
    recent30dSpend,
    lifetimeValue,
    inviteUsedAt,
    priorityRank,
    priorityReason: decisionResult.priorityReason,
    nextBestAction,
    recommendedButtons: actionMeta.buttons,
    objectiveToday: actionMeta.objective,
    messageSuggestions: suggestions,
    relationshipStage,
    communicationStyle,
    lastTopic,
    personalizationHints,
    summary,
    aiContext,
    monetization,
  };
}
