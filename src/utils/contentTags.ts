export type TimeOfDayTag = "day" | "night" | "none";

export function getTimeOfDayTag(title: string): TimeOfDayTag {
  const trimmed = title.trim().toUpperCase();

  if (trimmed.startsWith("[DÍA]") || trimmed.startsWith("[DIA]")) {
    return "day";
  }
  if (trimmed.startsWith("[NOCHE]")) {
    return "night";
  }
  return "none";
}
