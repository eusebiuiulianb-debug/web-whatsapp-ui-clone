type FanNameSource = {
  displayName?: string | null;
  creatorLabel?: string | null;
  name?: string | null;
};

export function getFanDisplayName(fan: FanNameSource): string {
  const displayName = typeof fan.displayName === "string" ? fan.displayName.trim() : "";
  if (displayName) return displayName;
  const creatorLabel = typeof fan.creatorLabel === "string" ? fan.creatorLabel.trim() : "";
  if (creatorLabel) return creatorLabel;
  const rawName = typeof fan.name === "string" ? fan.name.trim() : "";
  if (rawName) return rawName;
  return "Invitado";
}
