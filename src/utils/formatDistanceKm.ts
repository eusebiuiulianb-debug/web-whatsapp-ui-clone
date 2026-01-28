export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return "";
  const value = Math.max(0, km);
  const rounded = Math.max(5, Math.round(value / 5) * 5);
  return `~${rounded} km`;
}
