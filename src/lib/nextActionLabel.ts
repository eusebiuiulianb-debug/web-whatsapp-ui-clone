const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_SCHEDULE_RE = /\s*\(para\s+\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?\)\s*$/i;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const shortDateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
});
const GENERIC_FOLLOW_UPS = new Set([
  "seguimiento",
  "follow up",
  "followup",
]);

function parseDateInput(value?: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = DATE_ONLY_RE.test(trimmed) ? `${trimmed}T00:00:00` : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function dayStamp(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeNoteForMatch(note: string): string {
  return note.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isSameDay(a?: Date | string | null, b?: Date | string | null): boolean {
  const left = parseDateInput(a);
  const right = parseDateInput(b);
  if (!left || !right) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isToday(value?: Date | string | null, now: Date = new Date()): boolean {
  return isSameDay(value, now);
}

export function isTomorrow(value?: Date | string | null, now: Date = new Date()): boolean {
  const target = parseDateInput(value);
  if (!target) return false;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return isSameDay(target, tomorrow);
}

export function formatWhen(value?: Date | string | null, now: Date = new Date()): string {
  const target = parseDateInput(value);
  if (!target) return "";
  const diffDays = Math.round((dayStamp(target) - dayStamp(now)) / MS_PER_DAY);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ma\u00f1ana";
  if (diffDays >= 2 && diffDays <= 7) return `En ${diffDays}d`;
  return shortDateFormatter.format(target);
}

export function normalizeNextActionNote(note?: string | null): string {
  if (typeof note !== "string") return "";
  const trimmed = note.trim();
  if (!trimmed) return "";
  return trimmed.replace(LEGACY_SCHEDULE_RE, "").trim();
}

export function isGenericNextActionNote(note?: string | null): boolean {
  const normalized = normalizeNoteForMatch(normalizeNextActionNote(note));
  return !normalized || GENERIC_FOLLOW_UPS.has(normalized);
}

export function getNextActionNoteLabel(note?: string | null, hasDate: boolean = false): string {
  const normalized = normalizeNextActionNote(note);
  if (!normalized || isGenericNextActionNote(normalized)) {
    return hasDate ? "Seguimiento (sin nota)" : "Seguimiento";
  }
  return normalized;
}

export function formatIsoDate(value?: Date | string | null): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_ONLY_RE.test(trimmed)) return trimmed;
  }
  const target = parseDateInput(value);
  if (!target) return "";
  return target.toISOString().slice(0, 10);
}

export function formatNextActionTooltip(
  value?: Date | string | null,
  note?: string | null
): string {
  const dateLabel = formatIsoDate(value);
  const noteLabel = getNextActionNoteLabel(note, Boolean(dateLabel));
  if (!dateLabel && !noteLabel) return "";
  if (!dateLabel) return noteLabel;
  return `${noteLabel} \u00b7 ${dateLabel}`;
}

export function formatNextActionLabel(
  value?: Date | string | null,
  note?: string | null,
  now: Date = new Date()
): string {
  const when = formatWhen(value, now);
  if (!when && !normalizeNextActionNote(note)) return "";
  const noteLabel = getNextActionNoteLabel(note, Boolean(when));
  if (!when) return `\u23F0 ${noteLabel}`;
  return `\u23F0 ${when} \u00b7 ${noteLabel}`;
}
