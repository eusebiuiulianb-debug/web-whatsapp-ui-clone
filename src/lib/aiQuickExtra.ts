import { AiTemplateUsage } from "./aiTemplateTypes";

export type AiTone = "cercano" | "profesional" | "jugueton";

export const ACTION_TYPE_FOR_USAGE: Record<AiTemplateUsage, string> = {
  welcome: "welcome_suggestion",
  warmup: "warmup_suggestion",
  extra_quick: "quick_extra_suggestion",
  pack_offer: "pack_offer_suggestion",
  followup: "followup_suggestion",
  renewal: "renewal_suggestion",
  reactivation: "reactivation_suggestion",
  boundaries: "boundaries_suggestion",
  support: "support_suggestion",
};

export function normalizeTone(tone: string | null | undefined): AiTone {
  const value = (tone || "").toLowerCase().replace("ó", "o").replace("ò", "o");
  if (value === "profesional") return "profesional";
  if (value === "jugueton") return "jugueton";
  return "cercano";
}

export function getQuickExtraSuggestion(rawTone: string | null | undefined): string {
  const tone = normalizeTone(rawTone);
  const templates: Record<AiTone, string[]> = {
    cercano: [
      "Te propongo una foto extra muy cuidada solo para ti por 9 €. Si te apetece, te explico cómo hacer el pago y te la envío.",
      "Tengo una foto extra íntima que creo que te va a gustar. Son 9 €. Si quieres, te cuento ahora mismo cómo conseguirla.",
    ],
    profesional: [
      "Puedo ofrecerte una foto extra exclusiva por 9 €. Si te interesa, dime “sí” y te explico el proceso de pago.",
      "Tengo disponible una foto extra en alta calidad por 9 €. Confírmame si quieres que te comparta los pasos para recibirla.",
    ],
    jugueton: [
      "Tengo una foto extra un poco más íntima solo para ti por 9 €. Si te apetece jugar un poco más, dime y te explico cómo recibirla.",
      "Me ha quedado una foto extra bastante traviesa por 9 €. Si te tienta, dime “quiero” y te cuento cómo te la envío ;)",
    ],
  };

  const options = templates[tone] ?? templates.cercano;
  const index = Math.floor(Math.random() * options.length);
  return options[index];
}

// Server-only helpers that hit Prisma live in aiQuickExtra.server.ts to keep the browser bundle clean.
