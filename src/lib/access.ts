type AccessInput = {
  membershipStatus?: string | null;
  daysLeft?: number | null;
};

type AccessState = "active" | "expiring" | "expired";

export function getAccessState({ daysLeft, membershipStatus }: AccessInput): AccessState {
  if (!membershipStatus || membershipStatus.trim().length === 0) return "expired";
  const remaining = daysLeft ?? 0;
  if (remaining > 7) return "active";
  if (remaining >= 1) return "expiring";
  return "expired";
}

export function getAccessLabel({
  membershipStatus,
  daysLeft,
}: AccessInput): string {
  if (!membershipStatus || membershipStatus.trim().length === 0) return "Acceso caducado";
  const remaining = daysLeft ?? 0;
  if (remaining <= 0) return `${membershipStatus} · acceso caducado`;
  const suffix = remaining === 1 ? "día restante" : "días restantes";
  return `${membershipStatus} · ${remaining} ${suffix}`;
}
