import { AiTemplateUsage, AiTurnMode } from "./aiTemplateTypes";
import { ExtraLadderStatus, ExtraSessionToday } from "./extraLadder";

export type ChatterProFocus = "warmup" | "extra_ladder" | "pack_offer" | "vip_care";

export type ChatterProStep = "none" | "first_extra" | "ladder_run" | "after_peak";

export interface ChatterProPlan {
  focus: ChatterProFocus;
  step: ChatterProStep;
  suggestedUsage: AiTemplateUsage | null;
  goalLabel: string;
  stepLabel: string;
  focusLabel: string;
  summaryLabel: string;
}

type Tier = "T0" | "T1" | "T2" | "T3" | "T4";
type AccessSnapshot = {
  hasMonthly: boolean;
  daysToMonthlyEnd: number | null;
  hasSpecialPack: boolean;
  daysToSpecialEnd: number | null;
  hasHistory: boolean;
  lastGrantType: string | null;
};

export function getAccessSnapshot(params: {
  activeGrantTypes?: string[] | null;
  daysLeft?: number | null;
  membershipStatus?: string | null;
  hasAccessHistory?: boolean;
  lastGrantType?: string | null;
}): AccessSnapshot {
  const { activeGrantTypes, daysLeft, membershipStatus, hasAccessHistory = false, lastGrantType = null } = params;
  const types = (activeGrantTypes ?? []).map((t) => (t || "").toLowerCase());
  const hasMonthly = types.includes("monthly");
  const hasSpecialPack = types.includes("special");
  // Usamos daysLeft como proxy para el acceso principal si está activo.
  const isActive = (membershipStatus || "").toLowerCase() === "active" || hasMonthly || hasSpecialPack;
  const baseDays = isActive && typeof daysLeft === "number" ? daysLeft : null;

  return {
    hasMonthly,
    daysToMonthlyEnd: hasMonthly ? baseDays : null,
    hasSpecialPack,
    daysToSpecialEnd: hasSpecialPack ? baseDays : null,
    hasHistory: hasAccessHistory,
    lastGrantType: lastGrantType ?? null,
  };
}

function tierToNumber(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const normalized = tier.toString().toUpperCase();
  if (!/^T[0-4]$/.test(normalized)) return null;
  return Number(normalized.replace("T", ""));
}

function deriveStep(tier: Tier | null, extrasToday: number): ChatterProStep {
  if (extrasToday >= 3) return "after_peak";
  if (extrasToday === 0) return "first_extra";
  if (extrasToday > 0 && (tier === "T1" || tier === "T2")) return "ladder_run";
  if (extrasToday > 0 && (tier === "T3" || tier === "T4")) return "after_peak";
  return "none";
}

function deriveFocus(turnMode: AiTurnMode): ChatterProFocus {
  // Map the mental mode to a concrete focus for the chatter.
  if (turnMode === "HEATUP") return "warmup";
  if (turnMode === "PACK_PUSH") return "pack_offer";
  if (turnMode === "VIP_CARE") return "vip_care";
  return "warmup";
}

function getGoalLabel(focus: ChatterProFocus): string {
  if (focus === "warmup") return "Calentar y sacar primer extra";
  if (focus === "extra_ladder") return "Seguir subiendo la escalera de extras";
  if (focus === "pack_offer") return "Explorar si encaja un pack (sin quemar)";
  if (focus === "vip_care") return "Cuidar a un buen cliente (sin presión)";
  return "";
}

function getStepLabel(step: ChatterProStep, extrasToday: number): string {
  if (step === "first_extra") return "Hoy aún sin extras";
  if (step === "ladder_run") return extrasToday === 1 ? "Sesión en marcha (ya compró 1 extra hoy)" : "Sesión en marcha, ya ha comprado extras hoy";
  if (step === "after_peak") return "Sesión avanzada, mejor cuidar";
  return "";
}

function getFocusLabel(focus: ChatterProFocus): string {
  if (focus === "warmup") return "Calentar y conocerle";
  if (focus === "extra_ladder") return "Cerrar extras alineados";
  if (focus === "pack_offer") return "Explorar pack cuando encaje";
  if (focus === "vip_care") return "Cuidar VIP";
  return "Mantener conversación";
}

function getUsageLabel(usage: AiTemplateUsage | null): string | null {
  if (!usage) return null;
  if (usage === "extra_quick") return "Extra rápido";
  if (usage === "pack_offer") return "Pack especial";
  if (usage === "welcome" || usage === "warmup") return "Saludo / calentar";
  if (usage === "renewal") return "Renovación";
  return usage;
}

export function getChatterProPlan(params: {
  ladder: ExtraLadderStatus | null;
  sessionToday: ExtraSessionToday | null;
  turnMode: AiTurnMode;
  hasActivePaidAccess?: boolean;
  accessSnapshot?: AccessSnapshot;
  accessState?: "ACTIVE" | "EXPIRED" | "NONE";
  lastGrantType?: string | null;
}): ChatterProPlan {
  const { ladder, sessionToday, turnMode, hasActivePaidAccess = false, accessSnapshot, accessState, lastGrantType } = params;
  const tier: Tier | null = (ladder?.maxTierBought as Tier | null) ?? null;
  const extrasToday = sessionToday?.todayCount ?? 0;
  const step = deriveStep(tier, extrasToday);
  const tierNum = tierToNumber(tier) ?? 0;
  const suggestedTierNum = tierToNumber(ladder?.suggestedTier ?? null) ?? Math.min(4, Math.max(1, tierNum + 1));
  const stepLabel = getStepLabel(step, extrasToday);
  let focus = deriveFocus(turnMode);
  const access = accessSnapshot ?? getAccessSnapshot({});
  const RENEWAL_WINDOW_DAYS = 7;
  const PACK_PUSH_SPEND_THRESHOLD = 50;
  const isSessionLate = extrasToday >= 3;
  const isRenewalWindow =
    access.hasMonthly && typeof access.daysToMonthlyEnd === "number" && access.daysToMonthlyEnd <= RENEWAL_WINDOW_DAYS;
  const isPackRenewalWindow =
    access.hasSpecialPack &&
    typeof access.daysToSpecialEnd === "number" &&
    access.daysToSpecialEnd <= RENEWAL_WINDOW_DAYS;
  const hasAnyPaid = hasActivePaidAccess || access.hasMonthly || access.hasSpecialPack;
  const hasHistory = access.hasHistory;
  const accessStateResolved: "ACTIVE" | "EXPIRED" | "NONE" =
    accessState ?? (hasAnyPaid ? "ACTIVE" : hasHistory ? "EXPIRED" : "NONE");
  const canPushPackBySpend = (ladder?.totalSpent ?? 0) >= PACK_PUSH_SPEND_THRESHOLD || suggestedTierNum >= 2;

  // Rama específica para fans caducados con historial: reenganche de pack.
  if (accessStateResolved === "EXPIRED" && hasHistory) {
    const lastType = (lastGrantType || access.lastGrantType || "").toLowerCase();
    const wasSpecial = lastType.includes("special") || lastType.includes("individual") || lastType === "single";
    const focusLabel = wasSpecial ? "Reenganche pack especial" : "Reenganche mensual";
    const goalLabel = wasSpecial
      ? "Que recupere su pack especial en los próximos días"
      : "Que renueve el mensual en los próximos 7 días";
    const suggestedUsage: AiTemplateUsage = "renewal";
    const stepLabel = getStepLabel(step, extrasToday);
    const summaryLabel = [
      `Plan de hoy: ${focusLabel}`,
      stepLabel ? `Paso: ${stepLabel}` : null,
      `Objetivo: ${goalLabel}`,
      "Siguiente jugada: Mensaje de reenganche",
    ]
      .filter(Boolean)
      .join(" — ");

    return {
      focus: "vip_care",
      step,
      suggestedUsage,
      goalLabel,
      stepLabel,
      focusLabel,
      summaryLabel,
    };
  }

  // Base focus adjustment combining mode + access.
  if (access.hasSpecialPack) {
    focus = "vip_care";
  } else if (isRenewalWindow) {
    focus = "vip_care";
  } else if (turnMode === "PACK_PUSH") {
    focus = canPushPackBySpend ? "pack_offer" : "extra_ladder";
  } else if (turnMode === "VIP_CARE") {
    focus = "vip_care";
  } else if (access.hasMonthly || tierNum >= 3) {
    focus = "vip_care";
  } else if (turnMode === "HEATUP" && !hasAnyPaid) {
    focus = "warmup";
  } else if (!hasAnyPaid) {
    focus = "extra_ladder";
  }

  let suggestedUsage: AiTemplateUsage | null = null;
  let goalLabel = "";
  let focusLabel = "";

  // --- Renovación mensual: solo dentro de ventana ---
  if (isRenewalWindow) {
    focus = "vip_care";
    focusLabel = "Cuidar mensual y preparar renovación";
    goalLabel = "Refuerza valor y ofrece renovar sin presión";
    suggestedUsage = "renewal";
  }
  // --- Pack especial activo: no volver a venderlo ---
  else if (access.hasSpecialPack) {
    focus = "vip_care";
    if (isPackRenewalWindow) {
      focusLabel = access.hasMonthly ? "VIP con mensual + pack especial" : "Cuidar pack especial";
      goalLabel = "Cuidar pack especial y tantear renovación cuando encaje";
      suggestedUsage = "pack_offer";
    } else {
      focusLabel = access.hasMonthly ? "VIP con mensual + pack especial" : "Cuidar pack especial";
      goalLabel = "Acompañar su pack especial y sumar valor con extras";
      suggestedUsage = "extra_quick";
    }
  }
  // --- Modo calentar / primeros extras ---
  else if (focus === "warmup" || (tierNum <= 1 && extrasToday === 0)) {
    focusLabel = "Calentar y sacar primer extra";
    goalLabel = "Romper hielo y conseguir primer extra suave";
    suggestedUsage = "extra_quick";
  }
  // --- Empujar pack sin pack especial aún ---
  else if (focus === "pack_offer") {
    if (access.hasMonthly) {
      focusLabel = "Subir de mensual a pack especial";
      goalLabel = "Usar extras medianos para preparar el Pack especial";
      suggestedUsage = extrasToday === 0 ? "extra_quick" : "pack_offer";
    } else if (!hasAnyPaid && canPushPackBySpend) {
      focusLabel = "Explorar si encaja un pack";
      goalLabel = "Suma un extra y tantea mensual/pack especial";
      suggestedUsage = extrasToday === 0 ? "extra_quick" : "pack_offer";
    } else {
      focusLabel = "Consolidar con extras antes de pack";
      goalLabel = "Consolida interés con extras antes de hablar de pack";
      suggestedUsage = "extra_quick";
    }
  }
  // --- Extra ladder: subir ticket medio ---
  else if (focus === "extra_ladder") {
    focusLabel = "Seguir subiendo la escalera de extras";
    goalLabel = "Cerrar un extra alineado con su nivel";
    suggestedUsage = "extra_quick";
  }
  // --- Cuidar VIP sin renovación cercana ---
  else if (focus === "vip_care") {
    focusLabel = access.hasMonthly ? "Cuidar suscripción mensual" : "Cuidar VIP";
    goalLabel = "Cuidar y reforzar vínculo (sin renovación hoy)";
    suggestedUsage = turnMode === "PACK_PUSH" && canPushPackBySpend && !isSessionLate ? "pack_offer" : "extra_quick";
  } else {
    goalLabel = "Mantener conversación y detectar interés";
    suggestedUsage = "extra_quick";
  }

  // Late session tweak: avoid hard sell at the very end.
  if (isSessionLate && suggestedUsage === "pack_offer") {
    suggestedUsage = "extra_quick";
    goalLabel = "Cierra suave con un extra y deja el pack para otro momento";
  }

  if (!focusLabel) focusLabel = getFocusLabel(focus);
  if (!goalLabel) goalLabel = getGoalLabel(focus);
  const usageLabel = getUsageLabel(suggestedUsage);
  const summaryLabel = [
    `Plan de hoy: ${focusLabel}`,
    stepLabel ? `Paso: ${stepLabel}` : null,
    goalLabel ? `Objetivo: ${goalLabel}` : null,
    usageLabel ? `Siguiente jugada: ${usageLabel}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return {
    focus,
    step,
    suggestedUsage,
    goalLabel,
    stepLabel,
    focusLabel,
    summaryLabel,
  };
}
