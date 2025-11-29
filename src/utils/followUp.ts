export type FollowUpTag = "none" | "trial_soon" | "monthly_soon" | "expired";
export type UrgencyLevel = "none" | "low" | "medium" | "high";

export function getFollowUpTag(
  membershipStatus: string | null | undefined,
  daysLeft: number | null | undefined
): FollowUpTag {
  const status = (membershipStatus || "").toLowerCase();
  const days = typeof daysLeft === "number" ? daysLeft : null;

  if (days !== null && days <= 0) return "expired";
  if (status === "trial" && days !== null && days > 0 && days <= 2) return "trial_soon";
  if ((status === "monthly" || status === "suscripción mensual") && days !== null && days > 0 && days <= 3) {
    return "monthly_soon";
  }

  return "none";
}

export function needsFollowUpToday(
  tag: FollowUpTag,
  lastCreatorMessageAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (tag !== "trial_soon" && tag !== "monthly_soon") {
    return false;
  }
  if (!lastCreatorMessageAt) return true;

  const last = new Date(lastCreatorMessageAt);
  const sameDay =
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate();

  return !sameDay;
}

export function getUrgencyLevel(
  tag: FollowUpTag,
  daysLeft?: number | null
): UrgencyLevel {
  if (tag !== "trial_soon" && tag !== "monthly_soon") {
    return "none";
  }

  const d = typeof daysLeft === "number" ? daysLeft : Number.POSITIVE_INFINITY;

  if (d <= 1) return "high";
  if (d <= 3) return "medium";
  return "low";
}
