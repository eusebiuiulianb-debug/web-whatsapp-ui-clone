import { ACTION_COPY, PRIORITY_REASON_COPY } from "./managerCopyConfig";

export const NEW_FAN_DAYS = 7;
export const DORMANT_DAYS = 21;
export const EXPIRY_HARD_DAYS = 3;
export const EXPIRY_SOFT_DAYS = 7;
export const HIGH_SPENDER_TOTAL = 150;
export const EXTRA_RECENT_DAYS = 10;
export const MAX_SUGGESTIONS = 3;

export type NextBestActionId =
  | "RENEW_HARD"
  | "RENEW_SOFT"
  | "FIRST_WELCOME"
  | "FIRST_EXTRA"
  | "RECOVER_TOP_FAN"
  | "WAKE_DORMANT"
  | "NEUTRAL";

export interface IaRuleContext {
  hasActiveSubscription: boolean;
  daysToExpiry: number | null;
  isNewFan: boolean;
  isDormant: boolean;
  lifetimeExtraSpend: number;
  extraSpendLast30d: number;
  lastPaidActionDaysAgo: number | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  healthScore: number;
  relationshipStage: string;
}

export interface IaDecision {
  id: NextBestActionId;
  label: string;
  priorityReason: string;
  buttonToHighlight: "SALUDO" | "RENOVACION" | "EXTRA_RAPIDO" | "PACK_ESPECIAL" | "ABRIR_EXTRAS" | null;
  suggestions: string[];
}

function limitSuggestions(suggestions: string[]): string[] {
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

function buildDecision(id: NextBestActionId, buttonToHighlight: IaDecision["buttonToHighlight"]): IaDecision {
  const actionCopy = ACTION_COPY[id] ?? { label: id, managerText: "", suggestions: [] };
  const reasonCopy = PRIORITY_REASON_COPY[id];

  return {
    id,
    label: actionCopy.label,
    buttonToHighlight,
    priorityReason: reasonCopy?.description ?? actionCopy.managerText,
    suggestions: limitSuggestions(actionCopy.suggestions),
  };
}

export function decideNextBestAction(ctx: IaRuleContext): IaDecision {
  // Prioridad 1: renovación urgente
  if (ctx.hasActiveSubscription && ctx.daysToExpiry !== null && ctx.daysToExpiry <= EXPIRY_HARD_DAYS) {
    return buildDecision("RENEW_HARD", "RENOVACION");
  }

  // Prioridad 2: renovación suave
  if (
    ctx.hasActiveSubscription &&
    ctx.daysToExpiry !== null &&
    ctx.daysToExpiry > EXPIRY_HARD_DAYS &&
    ctx.daysToExpiry <= EXPIRY_SOFT_DAYS
  ) {
    return buildDecision("RENEW_SOFT", "RENOVACION");
  }

  // Prioridad 3: recuperar top fan sin pack activo
  if (!ctx.hasActiveSubscription && ctx.lifetimeExtraSpend >= HIGH_SPENDER_TOTAL && !ctx.isDormant) {
    return buildDecision("RECOVER_TOP_FAN", "PACK_ESPECIAL");
  }

  // Prioridad 4: bienvenida inicial
  if (ctx.isNewFan) {
    return buildDecision("FIRST_WELCOME", "SALUDO");
  }

  // Prioridad 5: primer extra
  if (ctx.hasActiveSubscription && ctx.lifetimeExtraSpend === 0 && !ctx.isDormant) {
    return buildDecision("FIRST_EXTRA", "EXTRA_RAPIDO");
  }

  // Prioridad 6: despertar fans dormidos
  if (ctx.isDormant) {
    return buildDecision("WAKE_DORMANT", "SALUDO");
  }

  // Fallback neutro
  return buildDecision("NEUTRAL", null);
}
