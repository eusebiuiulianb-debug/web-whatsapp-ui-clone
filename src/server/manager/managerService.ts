import { PrismaClient } from "@prisma/client";

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

export type FanManagerRow = {
  id: string;
  displayName: string;
  segment: Segment;
  healthScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  daysToExpiry: number | null;
  lifetimeValue: number;
  recent30dSpend: number;
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
  daysToExpiry: number | null;
  recent30dSpend: number;
  lifetimeValue: number;
  priorityRank: number | null;
  priorityReason: string;
  nextBestAction: "RENOVAR_PACK" | "CUIDAR_VIP" | "BIENVENIDA" | "REACTIVAR_DORMIDO" | "OFRECER_EXTRA" | "NEUTRO";
  recommendedButtons: string[];
  objectiveToday: string;
  messageSuggestions: ManagerMessageSuggestion[];
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

function daysBetween(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  const diff = a.getTime() - b.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function buildNextBestAction(input: {
  segment: Segment;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  hasActivePack: boolean;
  daysToExpiry: number | null;
  recent30dSpend: number;
  lifetimeValue: number;
}): {
  action: FanManagerSummary["nextBestAction"];
  reason: string;
  buttons: string[];
  objective: string;
  suggestions: ManagerMessageSuggestion[];
} {
  const { segment, riskLevel, hasActivePack, daysToExpiry, recent30dSpend, lifetimeValue } = input;

  // Caso A: en riesgo con caducidad pronta
  if (segment === "EN_RIESGO" && hasActivePack && typeof daysToExpiry === "number" && daysToExpiry <= 3) {
    return {
      action: "RENOVAR_PACK",
      reason: "Pack a punto de caducar y ha gastado dinero contigo. Buen momento para ofrecer renovación.",
      objective: "Confirmar si quiere seguir este mes y cerrar la renovación con un tono cercano, no agresivo.",
      buttons: ["renenganche", "elegir_pack"],
      suggestions: [
        {
          id: "renovar_check_suave",
          label: "Check de renovación",
          text:
            "Hola {nombre}, vengo a hacer un check rápido contigo. Tu suscripción está a punto de renovarse y me gustaría saber qué te ha sido más útil este mes o si hay algo que quieras ajustar antes de seguir. Si quieres que sigamos, te dejo el enlace de renovación por aquí.",
        },
        {
          id: "ofrecer_subida_pack",
          label: "Subir a especial",
          text:
            "Estoy viendo todo lo que has aprovechado del pack mensual y creo que el pack especial te podría encajar muy bien: incluye lo mismo, pero con [fotos / vídeos / escenas] más intensas. Si te apetece subir de nivel, te explico cómo quedaría y el precio.",
        },
      ],
    };
  }

  // Caso B: VIP estable
  if (segment === "VIP" && riskLevel === "LOW") {
    return {
      action: "CUIDAR_VIP",
      reason: "Fan de alto valor con buena salud. Prioridad: mantener vínculo.",
      objective: "Hacerle sentir trato preferente y escuchar qué le apetece a continuación.",
      buttons: ["saludo_rapido", "extra_rapido"],
      suggestions: [
        {
          id: "cuidado_vip",
          label: "Cuidado VIP",
          text:
            "Oye {nombre}, me he acordado de ti porque eres de las personas que más han apostado por mi contenido. ¿Cómo vienes estos días? Si hay algo que te apetezca probar o cambiar, lo vemos y lo montamos a tu medida.",
        },
      ],
    };
  }

  // Caso C: Nuevo
  if (segment === "NUEVO") {
    return {
      action: "BIENVENIDA",
      reason: "Fan nuevo sin mucha historia aún. Buen momento para presentarte y preguntarle qué busca.",
      objective: "Romper el hielo, entender qué busca y guiarle al pack que más sentido tenga.",
      buttons: ["saludo_rapido", "pack_bienvenida"],
      suggestions: [
        {
          id: "bienvenida_guiada",
          label: "Bienvenida guiada",
          text:
            "Hola {nombre}, gracias por suscribirte. Antes de proponerte nada me gustaría saber qué buscas exactamente: ¿más conexión, ideas concretas, algo muy específico que te gustaría recibir de mí? Así te guío al pack que mejor te encaje.",
        },
      ],
    };
  }

  // Caso D: Dormido
  if (segment === "DORMIDO") {
    return {
      action: "REACTIVAR_DORMIDO",
      reason: "Fue cliente pero lleva mucho tiempo sin escribir ni comprar.",
      objective: "Tocar la puerta con un mensaje ligero para ver si sigue ahí, sin presionar.",
      buttons: ["saludo_rapido"],
      suggestions: [
        {
          id: "reactivar_suave",
          label: "Reactivar suave",
          text:
            "Hola {nombre}, hacía tiempo que no pasaba por aquí y me he acordado de ti. No sé si sigues interesad@ en este tipo de contenido, pero si te apetece retomarlo o probar algo nuevo, estoy aquí y lo ajustamos a tu ritmo.",
        },
      ],
    };
  }

  // Caso E: Ligero/Habitual sin riesgo
  if ((segment === "LIGERO" || segment === "LEAL_ESTABLE") && recent30dSpend < 10 && lifetimeValue > 50) {
    return {
      action: "OFRECER_EXTRA",
      reason: "Ha sido buen cliente en el pasado pero ahora está más frío. Un extra bien colocado puede reactivar la relación.",
      objective: "Ofrecerle una pieza extra concreta alineada con lo que ya te ha comprado.",
      buttons: ["extra_rapido"],
      suggestions: [
        {
          id: "extra_a_medida",
          label: "Extra a medida",
          text:
            "Estaba revisando lo que te ha gustado hasta ahora y se me ha ocurrido una idea de extra que puede encajarte muy bien: [describe el extra]. Si te resuena, te explico cómo sería y te paso el precio.",
        },
      ],
    };
  }

  return {
    action: "NEUTRO",
    reason: "No hay nada urgente. Puedes seguir el flujo normal de conversación.",
    objective: "Seguir la conversación normal, escuchar y responder.",
    buttons: [],
    suggestions: [],
  };
}

export async function buildManagerQueueForCreator(creatorId: string, prisma: PrismaClient): Promise<FanManagerRow[]> {
  const now = new Date();
  const fans = await prisma.fan.findMany({
    where: { creatorId },
    include: {
      accessGrants: true,
      extraPurchases: true,
      messages: true,
    },
  });

  const queue: FanManagerRow[] = [];

  for (const fan of fans) {
    const lastMsg = fan.messages
      .map((m) => m.time)
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
    const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const daysSinceLastMessage = daysBetween(now, lastMessageAt);
    const daysSinceLastPurchase = daysBetween(now, lastPurchaseAt);
    const daysSinceCreated = null;
    const lifetimeValue = fan.lifetimeValue ?? 0;

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
    include: { accessGrants: true, extraPurchases: true, messages: true },
  });
  if (!fan || fan.creatorId !== creatorId) {
    throw new Error("NOT_FOUND");
  }

  const lastMsg = fan.messages
    .map((m) => new Date(m.time))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const lastPurchase = fan.extraPurchases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const daysSinceLastMessage = lastMsg ? Math.floor((now.getTime() - lastMsg.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const daysSinceLastPurchase = lastPurchase
    ? Math.floor((now.getTime() - lastPurchase.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const activeGrant = fan.accessGrants.find((g) => g.expiresAt > now) ?? null;
  const daysToExpiry = activeGrant
    ? Math.ceil((activeGrant.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const hasActivePack = Boolean(activeGrant);

  const lifetimeValue = fan.lifetimeValue ?? 0;
  let recent30dSpend = fan.recent30dSpend ?? 0;
  if (!recent30dSpend) {
    const start30 = new Date(now);
    start30.setDate(start30.getDate() - 30);
    recent30dSpend = fan.extraPurchases
      .filter((p) => p.createdAt >= start30)
      .reduce((acc, p) => acc + (p.amount ?? 0), 0);
  }

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

  let priorityRank: number | null = null;
  try {
    const queue = await buildManagerQueueForCreator(creatorId, prisma);
    const idx = queue.findIndex((row) => row.id === fanId);
    priorityRank = idx >= 0 ? idx + 1 : null;
  } catch (_err) {
    priorityRank = null;
  }

  const next = buildNextBestAction({
    segment,
    riskLevel,
    hasActivePack,
    daysToExpiry,
    recent30dSpend,
    lifetimeValue,
  });

  return {
    fanId,
    segment,
    healthScore,
    riskLevel,
    hasActivePack,
    daysToExpiry,
    recent30dSpend,
    lifetimeValue,
    priorityRank,
    priorityReason: next.reason,
    nextBestAction: next.action,
    recommendedButtons: next.buttons,
    objectiveToday: next.objective,
    messageSuggestions: next.suggestions,
  };
}
