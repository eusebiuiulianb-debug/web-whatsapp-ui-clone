export type AiBaseTone = "auto" | "soft" | "intimate" | "spicy";

export function normalizeAiBaseTone(value: string | null | undefined): AiBaseTone {
  if (value === "auto" || value === "soft" || value === "intimate" || value === "spicy") return value;
  const lower = (value || "").toLowerCase();
  if (lower === "playful") return "spicy";
  if (lower === "professional") return "soft";
  if (lower === "warm" || lower === "close" || lower === "friendly" || lower === "cercano") return "intimate";
  if (lower === "jugueton" || lower === "juguetón") return "spicy";
  if (lower === "profesional") return "soft";
  if (lower === "intimo" || lower === "íntimo") return "intimate";
  return "auto";
}

export const AI_BASE_TONES: { value: AiBaseTone; label: string }[] = [
  { value: "auto", label: "Automático (según fan)" },
  { value: "soft", label: "Suave" },
  { value: "intimate", label: "Íntimo" },
  { value: "spicy", label: "Picante" },
];

export type AiTurnMode = "auto" | "push_pack" | "care_new" | "vip_focus";

export function normalizeAiTurnMode(value: string | null | undefined): AiTurnMode {
  if (value === "auto" || value === "push_pack" || value === "care_new" || value === "vip_focus") return value;
  const lower = (value || "").toLowerCase();
  if (lower === "pack_push") return "push_pack";
  if (lower === "vip_care" || lower === "vip" || lower === "with_vip") return "vip_focus";
  if (lower === "care_renewals" || lower === "renewals" || lower === "renewal_focus" || lower === "care_new") return "care_new";
  if (lower === "heatup" || lower === "warmup" || lower === "calentar") return "auto";
  return "auto";
}

export const AI_TURN_MODES: readonly AiTurnMode[] = ["auto", "push_pack", "care_new", "vip_focus"] as const;

export const AI_TURN_MODE_OPTIONS: { value: AiTurnMode; label: string }[] = [
  { value: "auto", label: "Automático (equilibrado)" },
  { value: "push_pack", label: "Empujar pack" },
  { value: "care_new", label: "Cuidar nuevos" },
  { value: "vip_focus", label: "Mimar VIP" },
];
