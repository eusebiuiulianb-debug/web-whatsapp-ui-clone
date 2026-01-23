export function formatCount(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value < 1000) return String(value);
  if (value < 1_000_000) return formatCompact(value, 1000, "k");
  return formatCompact(value, 1_000_000, "M");
}

function formatCompact(value: number, divisor: number, suffix: string) {
  const compact = value / divisor;
  const rounded = Math.round(compact * 10) / 10;
  const normalized = rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
  return `${normalized}${suffix}`;
}
