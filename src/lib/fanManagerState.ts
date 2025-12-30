import type { Conversation, Message as ConversationMessage } from "../types/Conversation";
import type { Message as ApiMessage } from "../types/chat";
import type { FanManagerChip, FanManagerState, FanTone, ManagerObjective } from "../types/manager";

type MessageLike = Partial<ApiMessage> | Partial<ConversationMessage>;

export type FanManagerStateContext = {
  daysLeft: number | null;
  inactivityDays: number | null;
  extrasCount: number;
  extrasSpentTotal: number;
  lifetimeSpend: number;
  hasActiveMonthly: boolean;
  hasActiveSpecial: boolean;
  hasActiveTrial: boolean;
  expiryTagSoon: boolean;
  followUpTag?: string | null;
  fanMessagesCount: number;
  creatorMessagesCount: number;
  isNew: boolean;
  isVip: boolean;
};

export type FanManagerStateAnalysis = {
  state: FanManagerState;
  defaultObjective: ManagerObjective;
  headline: string;
  chips: FanManagerChip[];
  context: FanManagerStateContext;
};

const NEAR_EXPIRY_DAYS = 3;
const COLD_DAYS_THRESHOLD = 10;
const VIP_EXTRAS_COUNT_THRESHOLD = 2;
const VIP_SPENT_THRESHOLD = 60;
const VIP_LTV_THRESHOLD = 120;

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function countMessages(messages: MessageLike[]) {
  return messages.reduce(
    (acc, msg) => {
      const kind = (msg as any)?.kind;
      if (kind === "system") return acc;
      const from = (msg as any)?.from;
      const me = (msg as any)?.me;
      if (from === "fan" || me === false) acc.fan += 1;
      else if (from === "creator" || me === true) acc.creator += 1;
      return acc;
    },
    { fan: 0, creator: 0 }
  );
}

function mapObjectiveForState(state: FanManagerState, context: FanManagerStateContext): ManagerObjective {
  if (state === "nuevo_curioso") return "bienvenida";
  if (state === "nuevo_timido") return "romper_hielo";
  if (state === "fan_frio") return "reactivar_fan_frio";
  if (state === "a_punto_de_caducar") {
    if (!context.hasActiveMonthly && !context.hasActiveSpecial && context.extrasCount >= VIP_EXTRAS_COUNT_THRESHOLD) {
      return "llevar_a_mensual";
    }
    return "renovacion";
  }
  if (state === "vip_comprador") {
    if (!context.hasActiveMonthly && (context.extrasCount >= 3 || context.extrasSpentTotal >= 120 || context.lifetimeSpend >= 120)) {
      return "llevar_a_mensual";
    }
    return "ofrecer_extra";
  }
  return "ofrecer_extra";
}

function buildHeadline(state: FanManagerState, context: FanManagerStateContext): string {
  const daysLabel =
    context.daysLeft !== null ? `${context.daysLeft} día${context.daysLeft === 1 ? "" : "s"}` : "pocos días";
  const inactivityLabel =
    typeof context.inactivityDays === "number" ? `No escribe desde hace ${context.inactivityDays} días.` : "";

  switch (state) {
    case "nuevo_curioso":
      return "Fan nuevo, ya ha interactuado. Aún está entendiendo qué puede recibir aquí.";
    case "nuevo_timido":
      return "Fan nuevo y tímido; casi no ha hablado todavía.";
    case "a_punto_de_caducar":
      if (context.daysLeft !== null && context.daysLeft <= 0) {
        return "Tu suscripción caduca hoy. Si no actúas, pierdes un fan de pago.";
      }
      return `Tu suscripción está a punto de caducar (${daysLabel}). Si no actúas, pierdes un fan de pago.`;
    case "fan_frio":
      return inactivityLabel || "Fan frío: ha bajado el ritmo de mensajes y necesita un motivo para volver.";
    case "vip_comprador":
      return "Fan muy implicado; ha invertido en extras y responde cuando le propones cosas.";
    default:
      return "";
  }
}

function buildChips(state: FanManagerState, context: FanManagerStateContext): FanManagerChip[] {
  const chips: FanManagerChip[] = [];

  if (state === "nuevo_curioso") {
    chips.push({ label: "NUEVO", tone: "info" });
    chips.push({ label: context.fanMessagesCount > 1 ? "Interés medio" : "Probando", tone: "info" });
  } else if (state === "nuevo_timido") {
    chips.push({ label: "NUEVO", tone: "info" });
    chips.push({ label: "Silencioso", tone: "neutral" });
  } else if (state === "a_punto_de_caducar") {
    if (context.daysLeft !== null && context.daysLeft <= 0) {
      chips.push({ label: "CADUCA HOY", tone: "danger" });
      chips.push({ label: "Crítico", tone: "danger" });
    } else {
      chips.push({ label: "RIESGO", tone: "danger" });
      chips.push({ label: "Riesgo alto", tone: "danger" });
      if (context.daysLeft !== null) {
        chips.push({
          label: `${context.daysLeft} día${context.daysLeft === 1 ? "" : "s"} restantes`,
          tone: context.daysLeft <= 1 ? "danger" : "warning",
        });
      } else if (context.expiryTagSoon) {
        chips.push({ label: "Caduca en breve", tone: "warning" });
      }
    }
  } else if (state === "fan_frio") {
    chips.push({ label: "FRÍO", tone: "warning" });
    chips.push({ label: "Baja actividad", tone: "neutral" });
    if (typeof context.inactivityDays === "number") {
      chips.push({ label: `Sin escribir ${context.inactivityDays} días`, tone: "warning" });
    }
  } else if (state === "vip_comprador") {
    chips.push({ label: "VIP", tone: "success" });
    chips.push({ label: "Alta implicación", tone: "success" });
    if (context.extrasCount > 0) {
      chips.push({ label: `${context.extrasCount} extras`, tone: "info" });
    } else if (context.lifetimeSpend > 0) {
      chips.push({ label: `${Math.round(context.lifetimeSpend)} € gastados`, tone: "info" });
    }
  }

  return chips;
}

export function deriveFanManagerState({
  fan,
  messages = [],
}: {
  fan: Conversation;
  messages?: MessageLike[];
}): FanManagerStateAnalysis {
  const normalizedMessages = Array.isArray(messages) && messages.length > 0 ? messages : fan.messageHistory ?? [];
  const messageCounts = countMessages(normalizedMessages);
  const daysLeft = typeof fan.daysLeft === "number" ? fan.daysLeft : null;
  const inactivityDays = daysSince(fan.lastSeenAt ?? null);
  const extrasCount = typeof fan.extrasCount === "number" ? fan.extrasCount : 0;
  const extrasSpentTotal = typeof fan.extrasSpentTotal === "number" ? fan.extrasSpentTotal : 0;
  const lifetimeSpend =
    typeof fan.lifetimeSpend === "number"
      ? fan.lifetimeSpend
      : typeof fan.lifetimeValue === "number"
      ? fan.lifetimeValue
      : 0;
  const normalizedGrants = (fan.activeGrantTypes ?? []).map((t) => (t || "").toLowerCase());
  const hasActiveMonthly = normalizedGrants.some((t) => t.includes("monthly"));
  const hasActiveSpecial = normalizedGrants.some((t) => t.includes("special"));
  const hasActiveTrial = normalizedGrants.some((t) => t.includes("trial") || t.includes("welcome"));
  const followUpTag = (fan as any)?.followUpTag ?? null;
  const expiryTagSoon = followUpTag === "trial_soon" || followUpTag === "monthly_soon";
  const isNewFan = Boolean(fan.isNew ?? fan.customerTier === "new");
  const isNearExpiry = (typeof daysLeft === "number" && daysLeft <= NEAR_EXPIRY_DAYS) || expiryTagSoon;
  const isCold = typeof inactivityDays === "number" && inactivityDays >= COLD_DAYS_THRESHOLD;
  const isVip =
    fan.isHighPriority === true ||
    fan.customerTier === "vip" ||
    extrasCount >= VIP_EXTRAS_COUNT_THRESHOLD ||
    extrasSpentTotal >= VIP_SPENT_THRESHOLD ||
    lifetimeSpend >= VIP_LTV_THRESHOLD;

  let state: FanManagerState = "nuevo_curioso";
  if (isNearExpiry) state = "a_punto_de_caducar";
  else if (!isNewFan && isCold) state = "fan_frio";
  else if (isVip) state = "vip_comprador";
  else if (isNewFan) state = messageCounts.fan > 0 ? "nuevo_curioso" : "nuevo_timido";
  else if (isCold) state = "fan_frio";
  else if (messageCounts.fan === 0) state = "nuevo_timido";

  const context: FanManagerStateContext = {
    daysLeft,
    inactivityDays,
    extrasCount,
    extrasSpentTotal,
    lifetimeSpend,
    hasActiveMonthly,
    hasActiveSpecial,
    hasActiveTrial,
    expiryTagSoon,
    followUpTag,
    fanMessagesCount: messageCounts.fan,
    creatorMessagesCount: messageCounts.creator,
    isNew: isNewFan,
    isVip,
  };

  const defaultObjective = mapObjectiveForState(state, context);

  return {
    state,
    defaultObjective,
    headline: buildHeadline(state, context),
    chips: buildChips(state, context),
    context,
  };
}

export function getDefaultFanTone(state: FanManagerState): FanTone {
  switch (state) {
    case "nuevo_timido":
      return "suave";
    case "nuevo_curioso":
    case "fan_frio":
    case "a_punto_de_caducar":
      return "intimo";
    case "vip_comprador":
      return "picante";
    default:
      return "intimo";
  }
}
