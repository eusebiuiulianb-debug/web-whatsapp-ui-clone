import type { AiTurnMode } from "./aiSettings";
import { AI_TURN_MODES as AI_TURN_MODE_VALUES } from "./aiSettings";

export const AI_TEMPLATE_USAGES = [
  "welcome",
  "warmup",
  "extra_quick",
  "pack_offer",
  "followup",
  "renewal",
  "reactivation",
  "boundaries",
  "support",
] as const;

export type AiTemplateUsage = (typeof AI_TEMPLATE_USAGES)[number];

export const AI_TURN_MODES = AI_TURN_MODE_VALUES;
export type AiTurnMode = (typeof AI_TURN_MODES)[number];

export const USAGE_LABELS: Record<AiTemplateUsage, string> = {
  welcome: "Bienvenida (nuevo fan)",
  warmup: "Charla / calentamiento",
  extra_quick: "Extra rápido (venta de extra)",
  pack_offer: "Pack especial / upsell",
  followup: "Seguimiento después de extra",
  renewal: "Renovación de suscripción",
  reactivation: "Reactivar fans inactivos",
  boundaries: "Límites y cuidado",
  support: "Soporte / problemas típicos",
};
