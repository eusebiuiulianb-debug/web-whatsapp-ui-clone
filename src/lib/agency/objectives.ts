import { getLabel, normalizeLocaleTag } from "../language";
import { AGENCY_OBJECTIVES, type AgencyObjective } from "./types";

export const BUILT_IN_OBJECTIVES = AGENCY_OBJECTIVES;

export const BUILT_IN_OBJECTIVE_LABELS: Record<string, Record<AgencyObjective, string>> = {
  es: {
    CONNECT: "Conectar",
    SELL_EXTRA: "Vender extra",
    SELL_PACK: "Vender pack",
    SELL_MONTHLY: "Vender mensual",
    RECOVER: "Recuperar",
    RETAIN: "Retener",
    UPSELL: "Upsell",
  },
  en: {
    CONNECT: "Connect",
    SELL_EXTRA: "Sell extra",
    SELL_PACK: "Sell pack",
    SELL_MONTHLY: "Sell monthly",
    RECOVER: "Recover",
    RETAIN: "Retain",
    UPSELL: "Upsell",
  },
  ro: {
    CONNECT: "Connect",
    SELL_EXTRA: "Sell extra",
    SELL_PACK: "Sell pack",
    SELL_MONTHLY: "Sell monthly",
    RECOVER: "Recover",
    RETAIN: "Retain",
    UPSELL: "Upsell",
  },
};

export type ObjectiveLabels = Record<string, string>;

export function isBuiltInObjectiveCode(code: string): code is AgencyObjective {
  return (BUILT_IN_OBJECTIVES as readonly string[]).includes(code);
}

export function normalizeObjectiveCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const code = slugifyObjectiveCode(trimmed);
  return code || null;
}

export function slugifyObjectiveCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveObjectiveLabel(params: {
  code: string | null | undefined;
  locale?: string | null;
  labelsByCode?: Map<string, ObjectiveLabels> | Record<string, ObjectiveLabels> | null;
}): string | null {
  const normalized = normalizeObjectiveCode(params.code);
  if (!normalized) return null;
  if (isBuiltInObjectiveCode(normalized)) {
    const labels = buildBuiltInLabels(normalized);
    return getLabel(labels, params.locale, normalized);
  }
  const labels = lookupLabels(params.labelsByCode, normalized);
  return getLabel(labels, params.locale, normalized);
}

export function resolveObjectiveForScoring(code: string | null | undefined): AgencyObjective {
  const normalized = normalizeObjectiveCode(code);
  if (normalized && isBuiltInObjectiveCode(normalized)) return normalized;
  return "CONNECT";
}

function buildBuiltInLabels(code: AgencyObjective): ObjectiveLabels {
  const labels: ObjectiveLabels = {};
  Object.entries(BUILT_IN_OBJECTIVE_LABELS).forEach(([locale, map]) => {
    const label = map[code];
    if (!label) return;
    const normalizedKey = normalizeLocaleTag(locale);
    if (!normalizedKey) return;
    labels[normalizedKey] = label;
  });
  return labels;
}

export function lookupLabels(
  labelsByCode: Map<string, ObjectiveLabels> | Record<string, ObjectiveLabels> | null | undefined,
  code: string
): ObjectiveLabels | null {
  if (!labelsByCode) return null;
  if (labelsByCode instanceof Map) {
    return labelsByCode.get(code) ?? null;
  }
  const record = labelsByCode as Record<string, ObjectiveLabels>;
  return record[code] ?? null;
}
