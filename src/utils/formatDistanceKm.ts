export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return "";
  const value = Math.max(0, km);
  if (value < 1) return "<1 km";
  if (value < 10) return `~${Math.round(value)} km`;
  if (value < 50) return `~${Math.round(value / 5) * 5} km`;
  return `~${Math.round(value / 10) * 10} km`;
}
