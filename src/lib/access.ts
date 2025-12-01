type AccessInput = {
  membershipStatus?: string | null;
  daysLeft?: number | null;
  hasAccessHistory?: boolean;
  activeGrantTypes?: string[];
};

type LegacyAccessState = "active" | "expiring" | "expired";
type AccessType = "trial" | "monthly" | "special" | "unknown";
export type AccessState = "ACTIVE" | "EXPIRED" | "NONE";

export type AccessSummary = {
  hasActiveAccess: boolean;
  state: AccessState;
  primaryLabel: string;
  secondaryLabel?: string;
  daysLeft?: number | null;
  hasActiveMonthly: boolean;
  hasActiveTrial: boolean;
  hasActiveSpecial: boolean;
};

export function getAccessState({ daysLeft, membershipStatus }: AccessInput): LegacyAccessState {
  if (!membershipStatus || membershipStatus.trim().length === 0) return "expired";
  const remaining = daysLeft ?? 0;
  if (remaining > 7) return "active";
  if (remaining >= 1) return "expiring";
  return "expired";
}

export function getAccessLabel({
  membershipStatus,
  daysLeft,
}: AccessInput): string {
  if (!membershipStatus || membershipStatus.trim().length === 0) return "Acceso caducado";
  const remaining = daysLeft ?? 0;
  if (remaining <= 0) return `${membershipStatus} · acceso caducado`;
  const suffix = remaining === 1 ? "día restante" : "días restantes";
  return `${membershipStatus} · ${remaining} ${suffix}`;
}

function inferAccessType(membershipStatus?: string | null): AccessType {
  const label = (membershipStatus || "").toLowerCase();
  if (label.includes("prueba")) return "trial";
  if (label.includes("mensual")) return "monthly";
  if (label.includes("especial") || label.includes("individual")) return "special";
  return "unknown";
}

function resolveActiveFlags({
  membershipStatus,
  activeGrantTypes,
  hasActiveAccess,
}: {
  membershipStatus?: string | null;
  activeGrantTypes?: string[];
  hasActiveAccess: boolean;
}) {
  const normalizedGrants = (activeGrantTypes ?? []).map((type) => type.toLowerCase());
  const label = (membershipStatus || "").toLowerCase();

  const hasTrialGrant = normalizedGrants.includes("trial") || label.includes("prueba");
  const hasMonthlyGrant = normalizedGrants.includes("monthly") || label.includes("mensual");
  const hasSpecialGrant =
    normalizedGrants.some((type) => type === "special" || type === "individual") ||
    label.includes("especial") ||
    label.includes("individual");

  const active = hasActiveAccess;

  return {
    hasActiveMonthly: active && hasMonthlyGrant,
    hasActiveTrial: active && hasTrialGrant,
    hasActiveSpecial: active && hasSpecialGrant,
  };
}

export function getAccessSummary({ membershipStatus, daysLeft, hasAccessHistory, activeGrantTypes }: AccessInput): AccessSummary {
  const legacyState = getAccessState({ membershipStatus, daysLeft });
  const remaining = Math.max(0, daysLeft ?? 0);
  const inferredHistory =
    typeof membershipStatus === "string" && membershipStatus.trim().length > 0
      ? true
      : Boolean((daysLeft ?? 0) > 0);
  const hasHistory = hasAccessHistory ?? inferredHistory;
  const hasActiveAccess = legacyState !== "expired" && !!membershipStatus && membershipStatus.trim().length > 0;
  const state: AccessState = hasActiveAccess ? "ACTIVE" : hasHistory ? "EXPIRED" : "NONE";
  const accessType = inferAccessType(membershipStatus);
  const baseFlags = resolveActiveFlags({ membershipStatus, activeGrantTypes, hasActiveAccess });

  if (state === "NONE") {
    return {
      hasActiveAccess: false,
      state,
      primaryLabel: "Aún no tienes acceso activo al contenido privado.",
      secondaryLabel: "Escribe al creador si quieres entrar o probar el chat privado.",
      daysLeft: null,
      hasActiveMonthly: false,
      hasActiveTrial: false,
      hasActiveSpecial: false,
    };
  }

  if (state === "EXPIRED") {
    return {
      hasActiveAccess: false,
      state,
      primaryLabel: membershipStatus?.trim() || "Acceso caducado",
      secondaryLabel: "Tu acceso ha caducado. Si quieres volver a entrar, habla con el creador.",
      daysLeft: 0,
      hasActiveMonthly: false,
      hasActiveTrial: false,
      hasActiveSpecial: false,
    };
  }

  if (accessType === "trial") {
    const suffix = remaining === 1 ? "Te queda 1 día para aprovechar el chat." : `Te quedan ${remaining} días para aprovechar el chat.`;
    return {
      hasActiveAccess: true,
      state,
      primaryLabel: "Prueba 7 días",
      secondaryLabel: suffix,
      daysLeft: remaining,
      ...baseFlags,
    };
  }

  if (accessType === "monthly") {
    const suffix = remaining === 1 ? "Te queda 1 día activo." : `Te quedan ${remaining} días activos.`;
    return {
      hasActiveAccess: true,
      state,
      primaryLabel: "Suscripción mensual",
      secondaryLabel: suffix,
      daysLeft: remaining,
      ...baseFlags,
    };
  }

  if (accessType === "special") {
    const suffix = remaining > 0
      ? remaining === 1
        ? "Acceso prioritario durante 1 día."
        : `Acceso prioritario durante ${remaining} días.`
      : "Acceso prioritario activo.";
    return {
      hasActiveAccess: true,
      state,
      primaryLabel: "Pack especial activo",
      secondaryLabel: suffix,
      daysLeft: remaining,
      ...baseFlags,
    };
  }

  // Fallback: keep the original label if we cannot infer type
  return {
    hasActiveAccess: true,
    state,
    primaryLabel: membershipStatus || "Acceso activo",
    secondaryLabel: remaining > 0 ? `${remaining} ${remaining === 1 ? "día restante" : "días restantes"}` : undefined,
    daysLeft: remaining,
    ...baseFlags,
  };
}
