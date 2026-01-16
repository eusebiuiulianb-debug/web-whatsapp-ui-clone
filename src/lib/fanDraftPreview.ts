const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export const FAN_DRAFT_PREVIEW_MAX_LEN = 160;
export const FAN_DRAFT_PREVIEW_TTL_MS = 1500;
export const FAN_DRAFT_PREVIEW_THROTTLE_MS = 300;

function normalizeFlag(raw?: string | null): boolean | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

export function isFanDraftPreviewEnabled(): boolean {
  const raw =
    process.env.NEXT_PUBLIC_ENABLE_FAN_DRAFT_PREVIEW ?? process.env.ENABLE_FAN_DRAFT_PREVIEW;
  const resolved = normalizeFlag(raw);
  if (resolved !== null) return resolved;
  return process.env.NODE_ENV !== "production";
}

export function normalizeFanDraftText(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, FAN_DRAFT_PREVIEW_MAX_LEN);
}
