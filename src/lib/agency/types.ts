export const AGENCY_STAGES = [
  "NEW",
  "WARM_UP",
  "HEAT",
  "OFFER",
  "CLOSE",
  "AFTERCARE",
  "RECOVERY",
  "BOUNDARY",
] as const;

export const AGENCY_OBJECTIVES = [
  "CONNECT",
  "SELL_EXTRA",
  "SELL_PACK",
  "SELL_MONTHLY",
  "RECOVER",
  "RETAIN",
  "UPSELL",
] as const;

export const AGENCY_INTENSITIES = ["SOFT", "MEDIUM", "INTENSE"] as const;
export const AGENCY_PLAYBOOKS = ["GIRLFRIEND", "PLAYFUL", "ELEGANT", "SOFT_DOMINANT"] as const;

export type AgencyStage = typeof AGENCY_STAGES[number];
export type AgencyObjective = typeof AGENCY_OBJECTIVES[number];
export type AgencyIntensity = typeof AGENCY_INTENSITIES[number];
export type AgencyPlaybook = typeof AGENCY_PLAYBOOKS[number];

function normalizeAgencyEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!normalized) return null;
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : null;
}

export function normalizeAgencyStage(value: unknown): AgencyStage | null {
  return normalizeAgencyEnum(value, AGENCY_STAGES);
}

export function normalizeAgencyObjective(value: unknown): AgencyObjective | null {
  return normalizeAgencyEnum(value, AGENCY_OBJECTIVES);
}

export function normalizeAgencyIntensity(value: unknown): AgencyIntensity | null {
  return normalizeAgencyEnum(value, AGENCY_INTENSITIES);
}

export function normalizeAgencyPlaybook(value: unknown): AgencyPlaybook | null {
  return normalizeAgencyEnum(value, AGENCY_PLAYBOOKS);
}
