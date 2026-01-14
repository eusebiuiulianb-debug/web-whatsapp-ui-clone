import { normalizeNextActionNote } from "../nextActionLabel";
import { getFanSuggestions } from "./suggestions";

type NextActionFan = {
  language?: string | null;
  locale?: string | null;
  preferredLanguage?: string | null;
  lang?: string | null;
  lastInboundText?: string | null;
  temperatureBucket?: string | null;
  temperatureScore?: number | null;
  heatScore?: number | null;
  heatLabel?: string | null;
  lastIntentKey?: string | null;
  nextAction?: string | null;
  nextActionNote?: string | null;
  nextActionSnippet?: string | null;
  nextActionSummary?: string | null;
  membershipStatus?: string | null;
  daysLeft?: number | null;
  lastInboundAt?: string | Date | null;
  extraSessionToday?: {
    todayLastPurchaseAt?: string | null;
  } | null;
  extraLadderStatus?: {
    lastPurchaseAt?: string | null;
  } | null;
};

type NextActionSummaryInput = {
  fan: NextActionFan;
  lang?: string | null;
  hasUnreadInbound: boolean;
};

type NextActionSummary = {
  needsAction: boolean;
  nextActionKey: string | null;
  nextActionLabel: string;
  nextActionText: string | null;
  nextActionSource: "reply" | "manual" | "suggested" | "none";
  nextActionLanguage: "es" | "en";
};

const SUGGESTED_ACTION_KEYS = new Set([
  "BREAK_ICE",
  "BUILD_RAPPORT",
  "OFFER_EXTRA",
  "PUSH_MONTHLY",
  "SEND_PAYMENT_LINK",
  "SUPPORT",
  "SAFETY",
]);

function normalizeLocaleBase(value?: string | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.replace(/_/g, "-").split("-")[0] || "";
}

function inferLanguageFromText(value?: string | null): "es" | "en" | null {
  if (!value) return null;
  const text = value.toLowerCase();
  if (!text.trim()) return null;
  let scoreEs = 0;
  let scoreEn = 0;
  if (/\b(hola|gracias|buenas|por favor|quiero|cuando|donde|porque|pero|vale)\b/.test(text)) {
    scoreEs += 2;
  }
  if (/\b(the|and|you|thanks|hello|hi|please|want|when|where|because|but|ok|okay)\b/.test(text)) {
    scoreEn += 2;
  }
  if (/\b(que|para|como|esta|estoy|tengo|puedo)\b/.test(text)) {
    scoreEs += 1;
  }
  if (/\b(what|how|i am|im|are you|do you|can you|i have)\b/.test(text)) {
    scoreEn += 1;
  }
  if (scoreEs === scoreEn) return null;
  return scoreEs > scoreEn ? "es" : "en";
}

function resolveLanguage(lang: string | null | undefined, fan: NextActionFan): "es" | "en" {
  const candidates = [
    lang,
    fan.language,
    fan.preferredLanguage,
    fan.locale,
    fan.lang,
  ];
  for (const candidate of candidates) {
    const base = normalizeLocaleBase(candidate);
    if (base === "es" || base === "en") return base;
  }
  const inferred = inferLanguageFromText(fan.lastInboundText);
  if (inferred) return inferred;
  return "es";
}

function isSuggestedActionKey(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return SUGGESTED_ACTION_KEYS.has(normalized);
}

function getManualNextActionLabel(fan: NextActionFan): string {
  const raw =
    (typeof fan.nextActionSummary === "string" ? fan.nextActionSummary : "") ||
    (typeof fan.nextActionSnippet === "string" ? fan.nextActionSnippet : "") ||
    (typeof fan.nextActionNote === "string" ? fan.nextActionNote : "");
  const normalized = normalizeNextActionNote(raw);
  if (normalized) return normalized;
  if (typeof fan.nextAction === "string" && fan.nextAction.trim() && !isSuggestedActionKey(fan.nextAction)) {
    return normalizeNextActionNote(fan.nextAction);
  }
  return "";
}

export function getNextActionSummary({
  fan,
  lang,
  hasUnreadInbound,
}: NextActionSummaryInput): NextActionSummary {
  const language = resolveLanguage(lang, fan);
  if (hasUnreadInbound) {
    return {
      needsAction: true,
      nextActionKey: "REPLY",
      nextActionLabel: language === "en" ? "Reply" : "Responder",
      nextActionText:
        language === "en"
          ? "Thanks for your message! What are you in the mood for today?"
          : "¡Gracias por escribirme! ¿Qué te apetece hoy?",
      nextActionSource: "reply",
      nextActionLanguage: language,
    };
  }

  const manualLabel = getManualNextActionLabel(fan);
  if (manualLabel) {
    return {
      needsAction: true,
      nextActionKey: null,
      nextActionLabel: manualLabel,
      nextActionText: null,
      nextActionSource: "manual",
      nextActionLanguage: language,
    };
  }

  const temperatureScore =
    typeof fan.temperatureScore === "number"
      ? fan.temperatureScore
      : typeof fan.heatScore === "number"
      ? fan.heatScore
      : null;
  const suggestions = getFanSuggestions({
    language,
    temperatureBucket: typeof fan.temperatureBucket === "string" ? fan.temperatureBucket : null,
    temperatureScore,
    lastIntentKey: typeof fan.lastIntentKey === "string" ? fan.lastIntentKey : null,
    nextAction: typeof fan.nextAction === "string" ? fan.nextAction : null,
    membershipStatus: typeof fan.membershipStatus === "string" ? fan.membershipStatus : null,
    daysLeft: typeof fan.daysLeft === "number" ? fan.daysLeft : null,
    lastPurchaseAt:
      fan.extraSessionToday?.todayLastPurchaseAt ??
      fan.extraLadderStatus?.lastPurchaseAt ??
      null,
    lastInboundAt: fan.lastInboundAt ?? null,
  });

  const hasSuggestion = Boolean(suggestions.nextActionKey);
  return {
    needsAction: hasSuggestion,
    nextActionKey: suggestions.nextActionKey ?? null,
    nextActionLabel: suggestions.nextActionLabel ?? "—",
    nextActionText: suggestions.nextActionText ?? null,
    nextActionSource: hasSuggestion ? "suggested" : "none",
    nextActionLanguage: language,
  };
}
