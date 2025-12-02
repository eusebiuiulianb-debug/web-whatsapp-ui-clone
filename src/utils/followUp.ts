export type FollowUpTag = "none" | "trial_soon" | "monthly_soon" | "expired" | "today";
export type UrgencyLevel = "none" | "low" | "medium" | "high";

export function getFollowUpTag(
  membershipStatus: string | null | undefined,
  daysLeft: number | null | undefined,
  activeGrantTypes?: string[] | null
): FollowUpTag {
  const status = (membershipStatus || "").toLowerCase();
  const days = typeof daysLeft === "number" ? daysLeft : null;
  const activeTypes = (activeGrantTypes ?? []).map((type) => type.toLowerCase());

  if (days !== null && days <= 0) return "expired";
  if (status === "expired") return "expired";
  if (status === "none" || status.trim().length === 0) return "none";

  const hasTrialAccess =
    activeTypes.includes("trial") ||
    status === "trial" ||
    status.includes("prueba");
  const hasMonthlyAccess =
    activeTypes.includes("monthly") ||
    status === "monthly" ||
    status.includes("suscripción mensual") ||
    status.includes("suscripcion mensual");

  if (hasTrialAccess && days !== null && days > 0 && days <= 2) return "trial_soon";
  if (hasMonthlyAccess && days !== null && days > 0 && days <= 3) {
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
  if (tag === "expired") return "none";
  const d = typeof daysLeft === "number" ? daysLeft : Number.POSITIVE_INFINITY;
  if (d <= 0) return "none";

  if (tag === "today") return d <= 1 ? "high" : "medium";
  if (tag !== "trial_soon" && tag !== "monthly_soon") {
    if (d <= 1) return "high";
    if (d <= 3) return "medium";
    return "none";
  }

  if (d <= 1) return "high";
  if (d <= 3) return "medium";
  return "low";
}

export function shouldFollowUpToday({
  membershipStatus,
  daysLeft,
  followUpTag,
}: {
  membershipStatus?: string | null;
  daysLeft?: number | null;
  followUpTag?: FollowUpTag | null;
}): boolean {
  const status = (membershipStatus || "").toLowerCase();
  if (status === "active" && typeof daysLeft === "number" && daysLeft <= 1) return true;
  if (followUpTag === "today") return true;
  return false;
}

export function isExpiredAccess({
  membershipStatus,
  daysLeft,
  followUpTag,
}: {
  membershipStatus?: string | null;
  daysLeft?: number | null;
  followUpTag?: FollowUpTag | null;
}) {
  if (typeof daysLeft === "number" && daysLeft <= 0) return true;
  const status = (membershipStatus || "").toLowerCase();
  if (status === "expired") return true;
  return followUpTag === "expired";
}
