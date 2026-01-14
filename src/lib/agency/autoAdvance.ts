import type { AgencyStage } from "./types";

type AutoAdvanceRule = {
  from: AgencyStage[];
  to: AgencyStage;
  match: Array<string | RegExp>;
};

const AUTO_ADVANCE_RULES: AutoAdvanceRule[] = [
  {
    from: ["NEW", "WARM_UP", "HEAT", "OFFER", "CLOSE", "AFTERCARE", "RECOVERY"],
    to: "RECOVERY",
    match: [
      /^reengage:/,
      "reactivate_cold",
      "renewal",
      "intent:reactivar_fan_frio",
      "intent:renovacion",
      /^autopilot:(reactivar_fan_frio|renovacion)$/,
    ],
  },
  {
    from: ["NEW", "WARM_UP", "HEAT"],
    to: "OFFER",
    match: [
      /^offer:/,
      /^ppv:/,
      /^pack:/,
      "offer_extra",
      "monthly_upsell",
      "intent:ofrecer_extra",
      "intent:llevar_a_mensual",
      /^autopilot:(ofrecer_extra|llevar_a_mensual)$/,
    ],
  },
  {
    from: ["OFFER"],
    to: "CLOSE",
    match: [
      /^offer:/,
      /^ppv:/,
      /^pack:/,
      "offer_extra",
      "monthly_upsell",
      "intent:llevar_a_mensual",
      /^autopilot:(ofrecer_extra|llevar_a_mensual)$/,
    ],
  },
  {
    from: ["NEW"],
    to: "WARM_UP",
    match: [
      "break_ice",
      "welcome",
      "intent:romper_hielo",
      "intent:bienvenida",
      /^manager:/,
      /^draft:/,
      /^autopilot:(romper_hielo|bienvenida)$/,
    ],
  },
  {
    from: ["NEW"],
    to: "WARM_UP",
    match: [/^template:soft$/],
  },
  {
    from: ["NEW", "WARM_UP"],
    to: "HEAT",
    match: [/^template:(medium|intense)$/],
  },
];

export function getAutoAdvanceStage(params: {
  currentStage: AgencyStage;
  actionKey?: string | null;
}): AgencyStage | null {
  const key = normalizeActionKey(params.actionKey);
  if (!key) return null;
  for (const rule of AUTO_ADVANCE_RULES) {
    if (!rule.from.includes(params.currentStage)) continue;
    if (rule.match.some((matcher) => matchesRule(key, matcher))) {
      return rule.to;
    }
  }
  return null;
}

function normalizeActionKey(actionKey?: string | null): string | null {
  if (typeof actionKey !== "string") return null;
  const trimmed = actionKey.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("intent:") || trimmed.startsWith("autopilot:")) return trimmed;
  return trimmed;
}

function matchesRule(value: string, matcher: string | RegExp): boolean {
  if (matcher instanceof RegExp) return matcher.test(value);
  return value === matcher;
}
