import type { AgencyIntensity, AgencyObjective, AgencyStage } from "./types";
import { resolveObjectiveForScoring } from "./objectives";

export type AgencyPriorityFlags = {
  vip?: boolean;
  expired?: boolean;
  atRisk?: boolean;
  isNew?: boolean;
};

export type AgencyPriorityInput = {
  lastIncomingAt?: Date | string | null;
  lastOutgoingAt?: Date | string | null;
  spent7d?: number | null;
  spent30d?: number | null;
  stage?: AgencyStage | null;
  objective?: AgencyObjective | string | null;
  intensity?: AgencyIntensity | null;
  flags?: AgencyPriorityFlags | null;
  now?: Date;
};

const STAGE_SCORES: Record<AgencyStage, number> = {
  NEW: 10,
  WARM_UP: 15,
  HEAT: 25,
  OFFER: 30,
  CLOSE: 35,
  AFTERCARE: 8,
  RECOVERY: 20,
  BOUNDARY: 5,
};

const OBJECTIVE_SCORES: Record<AgencyObjective, number> = {
  CONNECT: 4,
  SELL_EXTRA: 8,
  SELL_PACK: 9,
  SELL_MONTHLY: 10,
  RECOVER: 8,
  RETAIN: 6,
  UPSELL: 9,
};

const INTENSITY_SCORES: Record<AgencyIntensity, number> = {
  SOFT: 2,
  MEDIUM: 4,
  INTENSE: 6,
};

export function computeAgencyPriorityScore(input: AgencyPriorityInput): number {
  const now = input.now instanceof Date ? input.now : new Date();
  const incomingAt = parseDate(input.lastIncomingAt);
  const outgoingAt = parseDate(input.lastOutgoingAt);

  let score = 0;
  if (input.stage && STAGE_SCORES[input.stage] !== undefined) score += STAGE_SCORES[input.stage];
  const resolvedObjective = resolveObjectiveForScoring(input.objective);
  if (resolvedObjective && OBJECTIVE_SCORES[resolvedObjective] !== undefined) {
    score += OBJECTIVE_SCORES[resolvedObjective];
  }
  if (input.intensity && INTENSITY_SCORES[input.intensity] !== undefined) score += INTENSITY_SCORES[input.intensity];

  const incomingHours = hoursSince(incomingAt, now);
  if (incomingHours !== null) {
    if (incomingHours <= 2) score += 15;
    else if (incomingHours <= 12) score += 10;
    else if (incomingHours <= 48) score += 6;
    else if (incomingHours <= 168) score += 3;
  }

  const outgoingHours = hoursSince(outgoingAt, now);
  if (incomingAt && outgoingAt && outgoingAt > incomingAt && outgoingHours !== null) {
    if (outgoingHours <= 6) score -= 6;
    else if (outgoingHours <= 24) score -= 3;
  }

  score += scoreSpend(input.spent7d, [
    [150, 10],
    [75, 8],
    [30, 6],
    [10, 3],
    [1, 1],
  ]);
  score += scoreSpend(input.spent30d, [
    [300, 10],
    [150, 8],
    [60, 6],
    [20, 3],
    [1, 1],
  ]);

  const flags = input.flags ?? {};
  if (flags.vip) score += 8;
  if (flags.expired) score += 9;
  if (flags.atRisk) score += 7;
  if (flags.isNew) score += 4;

  return Math.max(0, Math.round(score));
}

function parseDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function hoursSince(value: Date | null, now: Date): number | null {
  if (!value) return null;
  const diffMs = now.getTime() - value.getTime();
  if (!Number.isFinite(diffMs)) return null;
  const hours = diffMs / (1000 * 60 * 60);
  return hours < 0 ? 0 : hours;
}

function scoreSpend(amount: number | null | undefined, tiers: Array<[number, number]>): number {
  const safe = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  for (const [threshold, score] of tiers) {
    if (safe >= threshold) return score;
  }
  return 0;
}
