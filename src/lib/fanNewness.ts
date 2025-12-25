type FanNewnessInput = {
  id?: string | null;
  createdAt?: Date | string | number | null;
  firstSeenAt?: Date | string | number | null;
  inviteCreatedAt?: Date | string | number | null;
  inviteUsedAt?: Date | string | number | null;
};

function parseDateValue(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseTimestampFromFanId(id?: string | null): Date | null {
  if (!id) return null;
  const parts = id.split("-");
  const last = parts[parts.length - 1];
  const ts = Number(last);
  if (!Number.isFinite(ts) || last.length < 10) return null;
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function getFanCreatedAt(input: FanNewnessInput): Date | null {
  return (
    parseDateValue(input.createdAt) ||
    parseDateValue(input.firstSeenAt) ||
    parseDateValue(input.inviteCreatedAt) ||
    parseDateValue(input.inviteUsedAt) ||
    parseTimestampFromFanId(input.id)
  );
}

export function isNewWithinDays(input: FanNewnessInput, days: number, now: Date = new Date()): boolean {
  if (!Number.isFinite(days) || days <= 0) return false;
  const createdAt = getFanCreatedAt(input);
  if (!createdAt) return false;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return createdAt.getTime() >= cutoff;
}
