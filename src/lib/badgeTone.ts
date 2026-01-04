import { type BadgeTone } from "../components/ui/Badge";

const MUTED_LABELS = new Set(["es", "en", "ro", "pt", "fr", "de", "it"]);

export function toneForLabel(label?: string | null): BadgeTone {
  if (!label) return "muted";
  const value = label.trim().toLowerCase();
  if (!value) return "muted";
  if (MUTED_LABELS.has(value)) return "muted";
  if (value.includes("habitual")) return "muted";
  if (value.includes("alta prioridad") || value === "alta") return "warn";
  if (value.includes("caduc")) return "danger";
  if (value.includes("suscripción") || value.includes("mensual")) return "warn";
  if (value.includes("prueba") || value.includes("renueva")) return "warn";
  if (value.includes("pack especial") || value.includes("especial pareja")) return "warn";
  if (value.includes("extras")) return "accent";
  if (value.includes("nuevo")) return "accent";
  if (value.includes("riesgo")) return "danger";
  if (value.includes("vip")) return "warn";
  return "muted";
}
