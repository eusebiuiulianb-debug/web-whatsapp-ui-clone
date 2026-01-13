import { normalizeNextActionNote } from "../nextActionLabel";
import { getFanSuggestions } from "./suggestions";

type NextActionFan = {
  locale?: string | null;
  preferredLanguage?: string | null;
  lang?: string | null;
  language?: string | null;
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

function resolveLanguage(lang: string | null | undefined, fan: NextActionFan): "es" | "en" {
  const candidates = [
    lang,
    fan.preferredLanguage,
    fan.locale,
    fan.lang,
    fan.language,
  ];
  for (const candidate of candidates) {
    const base = normalizeLocaleBase(candidate);
    if (base === "es" || base === "en") return base;
  }
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
    };
  }

  const manualLabel = getManualNextActionLabel(fan);
  if (manualLabel) {
    return {
      needsAction: true,
      nextActionKey: null,
      nextActionLabel: manualLabel,
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

  return {
    needsAction: Boolean(suggestions.nextActionKey),
    nextActionKey: suggestions.nextActionKey ?? null,
    nextActionLabel: suggestions.nextActionLabel ?? "—",
  };
}
