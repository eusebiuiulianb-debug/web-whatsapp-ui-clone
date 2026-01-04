import { type BadgeTone } from "../components/ui/Badge";

const MUTED_LABELS = new Set(["es", "en", "ro", "pt", "fr", "de", "it"]);

export function badgeToneForLabel(label?: string | null): BadgeTone {
  if (!label) return "muted";
  const value = label.trim().toLowerCase();
  if (!value) return "muted";
  if (MUTED_LABELS.has(value)) return "muted";
  if (value.includes("habitual")) return "muted";
  if (value.includes("prueba") || value.includes("trial")) return "muted";
  if (value.includes("caduc")) return "danger";
  if (value.includes("alta prioridad") || value === "alta") return "warn";
  if (value.includes("suscripción") || value.includes("suscripcion") || value.includes("mensual")) return "warn";
  if (value.includes("extras")) return "accent";
  if (value.includes("nuevo")) return "accent";
  if (value.includes("riesgo")) return "danger";
  if (value.includes("vip")) return "warn";
  return "muted";
}

export const toneForLabel = badgeToneForLabel;
