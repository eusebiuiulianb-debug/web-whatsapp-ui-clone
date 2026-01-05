export type MessageAudience = "FAN" | "CREATOR" | "INTERNAL";
export type NormalizedFrom = "fan" | "creator" | "other";

const AUDIENCE_VALUES: MessageAudience[] = ["FAN", "CREATOR", "INTERNAL"];

export function normalizeFrom(value?: string | null): NormalizedFrom {
  const lowered = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (lowered === "fan") return "fan";
  if (lowered === "creator") return "creator";
  return "other";
}

export function normalizeAudience(value?: string | null): MessageAudience | null {
  if (!value || typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (upper === "CREATOR_ONLY") return "CREATOR";
  return (AUDIENCE_VALUES.find((item) => item === upper) as MessageAudience | undefined) ?? null;
}

export function deriveAudience(message: { audience?: string | null; from?: string | null }): MessageAudience {
  const explicit = normalizeAudience(message.audience);
  if (explicit) return explicit;
  const origin = normalizeFrom(message.from);
  if (origin === "fan") return "FAN";
  if (origin === "creator") return "CREATOR";
  return "INTERNAL";
}

export function isVisibleToFan(message: { audience?: string | null; from?: string | null; type?: string | null }): boolean {
  if (message?.type === "SYSTEM") {
    return normalizeAudience(message.audience) !== "INTERNAL";
  }
  const audience = deriveAudience(message);
  return audience === "FAN" || audience === "CREATOR";
}

export function parseAudienceFilter(value: unknown, fallback: MessageAudience[] = ["FAN", "CREATOR"]): MessageAudience[] {
  if (!value) return fallback;
  const raw = Array.isArray(value) ? value.join(",") : value;
  if (typeof raw !== "string") return fallback;
  const parsed = raw
    .split(",")
    .map((part) => normalizeAudience(part))
    .filter((part): part is MessageAudience => Boolean(part));
  return parsed.length ? parsed : fallback;
}
