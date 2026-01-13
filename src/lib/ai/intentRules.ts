import type { IntentKey, IntentResult } from "./intents";

export function normalizeIntentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const KEYWORDS: Record<IntentKey, string[]> = {
  GREETING: ["hola", "hey", "hi", "hello", "salut", "buenas", "holi"],
  FLIRT: ["guap", "sexy", "linda", "handsome", "pretty", "te deseo", "hot", "atractiv"],
  CONTENT_REQUEST: [
    "quiero ver",
    "enséñame",
    "send pic",
    "send photo",
    "send video",
    "foto",
    "video",
    "poze",
    "poza",
    "vedea",
  ],
  CUSTOM_REQUEST: ["custom", "personaliz", "a medida", "hazme", "quiero uno especial", "pedido especial"],
  PRICE_ASK: ["precio", "cuánto", "cuesta", "how much", "price", "cat costa", "cât costă", "pret"],
  BUY_NOW: ["lo quiero", "ok", "vale", "send link", "i’ll buy", "ill buy", "take it", "vreau", "buy now"],
  SUBSCRIBE: ["suscribir", "subscribe", "suscripción", "abonament", "abonar"],
  CANCEL: ["cancel", "cancelar", "unsubscribe", "desuscribir", "renovar no", "anular"],
  OFF_PLATFORM: ["telegram", "whatsapp", "insta", "instagram", "snap", "snapchat", "discord"],
  SUPPORT: ["no puedo pagar", "error", "doesn't work", "doesnt work", "nu merge", "payment failed", "falló", "falla"],
  OBJECTION: ["caro", "expensive", "later", "más tarde", "no sé", "nose", "maybe", "not sure", "dubiu"],
  RUDE_OR_HARASS: ["idiot", "estupido", "imbecil", "perra", "puta", "bitch", "cállate", "retard", "asshole"],
  UNSAFE_MINOR: [],
  OTHER: [],
};

const AGE_REGEX = /\b(?:tengo\s+)?(1[0-7]|[0-9]{1,2})\s?(?:años|an|ani|yo|y\.o\.|years|yrs)?\b/;

export function detectIntentRules(rawText: string, lang?: string | null): IntentResult | null {
  const text = normalizeIntentText(rawText);
  if (!text) return null;

  const matched = (keys: string[]) => keys.find((kw) => text.includes(kw));

  const ageMatch = text.match(AGE_REGEX);
  if (ageMatch) {
    const ageNum = Number(ageMatch[1]);
    if (Number.isFinite(ageNum) && ageNum < 18) {
      return { intent: "UNSAFE_MINOR", confidence: 0.95, signals: { matchedKeywords: [ageMatch[0]], lang } };
    }
  }

  const entries: Array<{ intent: IntentKey; keywords: string[]; confidence: number }> = [
    { intent: "PRICE_ASK", keywords: KEYWORDS.PRICE_ASK, confidence: 0.85 },
    { intent: "BUY_NOW", keywords: KEYWORDS.BUY_NOW, confidence: 0.8 },
    { intent: "OFF_PLATFORM", keywords: KEYWORDS.OFF_PLATFORM, confidence: 0.85 },
    { intent: "SUBSCRIBE", keywords: KEYWORDS.SUBSCRIBE, confidence: 0.8 },
    { intent: "CANCEL", keywords: KEYWORDS.CANCEL, confidence: 0.8 },
    { intent: "SUPPORT", keywords: KEYWORDS.SUPPORT, confidence: 0.82 },
    { intent: "OBJECTION", keywords: KEYWORDS.OBJECTION, confidence: 0.78 },
    { intent: "CONTENT_REQUEST", keywords: KEYWORDS.CONTENT_REQUEST, confidence: 0.8 },
    { intent: "CUSTOM_REQUEST", keywords: KEYWORDS.CUSTOM_REQUEST, confidence: 0.8 },
    { intent: "GREETING", keywords: KEYWORDS.GREETING, confidence: 0.75 },
    { intent: "FLIRT", keywords: KEYWORDS.FLIRT, confidence: 0.76 },
    { intent: "RUDE_OR_HARASS", keywords: KEYWORDS.RUDE_OR_HARASS, confidence: 0.9 },
  ];

  for (let i = 0; i < entries.length; i += 1) {
    const match = matched(entries[i].keywords);
    if (match) {
      return {
        intent: entries[i].intent,
        confidence: entries[i].confidence,
        signals: { matchedKeywords: [match], lang: lang ?? null },
      };
    }
  }

  return null;
}
