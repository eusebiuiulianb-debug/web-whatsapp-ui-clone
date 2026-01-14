export const SUPPORTED_LANGUAGES = ["es", "en", "ro"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const UI_LOCALES = ["es", "en", "fr", "de", "it", "pt", "pt-PT", "pt-BR"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const TRANSLATION_LANGUAGES = [
  "es",
  "en",
  "de",
  "fr",
  "it",
  "pt",
  "nl",
  "ro",
  "ru",
  "zh",
  "ar",
  "ja",
  "ko",
] as const;
export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  es: "Espanol",
  en: "English",
  ro: "Romana",
};

export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  es: "Espanol",
  en: "English",
  fr: "Francais",
  de: "Deutsch",
  it: "Italiano",
  pt: "Portugues",
  "pt-PT": "Portugues (PT)",
  "pt-BR": "Portugues (BR)",
};

export const TRANSLATION_LANGUAGE_NAMES: Record<TranslationLanguage, string> = {
  es: "Spanish",
  en: "English",
  de: "German",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ro: "Romanian",
  ru: "Russian",
  zh: "Chinese",
  ar: "Arabic",
  ja: "Japanese",
  ko: "Korean",
};

export function normalizePreferredLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(trimmed) ? (trimmed as SupportedLanguage) : null;
}

export function normalizeUiLocale(value: unknown): UiLocale | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeLocaleTag(value);
  if (!normalized) return null;
  const match = (UI_LOCALES as readonly string[]).find(
    (locale) => normalizeLocaleTag(locale) === normalized
  );
  return match ? (match as UiLocale) : null;
}

export function normalizeTranslationLanguage(value: unknown): TranslationLanguage | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return (TRANSLATION_LANGUAGES as readonly string[]).includes(trimmed)
    ? (trimmed as TranslationLanguage)
    : null;
}

export function getTranslationLanguageName(code?: string | null): string {
  if (typeof code !== "string") return "Idioma desconocido";
  const normalized = code.trim().toLowerCase();
  if (!normalized || normalized === "un" || normalized === "auto" || normalized === "?") {
    return "Idioma desconocido";
  }
  const base = normalized.split(/[-_]/)[0] || normalized;
  return TRANSLATION_LANGUAGE_NAMES[base as TranslationLanguage] ?? base.toUpperCase();
}

export function normalizeLocale(value?: string | null): string[] {
  if (typeof value !== "string") return [];
  const normalized = normalizeLocaleTag(value);
  if (!normalized) return [];
  const base = normalized.split("-")[0];
  if (base && base !== normalized) return [normalized, base];
  return base ? [base] : [];
}

export function normalizeLocaleTag(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = trimmed.replace(/_/g, "-").split("-").filter(Boolean);
  if (parts.length === 0) return "";
  const base = parts[0].toLowerCase();
  const rest = parts.slice(1).map((part) => {
    const lower = part.toLowerCase();
    if (lower.length === 2) return lower.toUpperCase();
    return lower;
  });
  return [base, ...rest].join("-");
}

export function getLabel(
  labels: Record<string, string> | null | undefined,
  locale?: string | null,
  fallback?: string | null
): string | null {
  if (!labels || typeof labels !== "object") return fallback ?? null;
  const normalizedLabels = new Map<string, string>();
  Object.entries(labels).forEach(([key, value]) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const normalizedKey = normalizeLocaleTag(key);
    if (normalizedKey) {
      normalizedLabels.set(normalizedKey, trimmed);
    }
  });
  if (normalizedLabels.size === 0) return fallback ?? null;

  const candidates = normalizeLocale(locale ?? "");
  for (const candidate of candidates) {
    const normalized = normalizeLocaleTag(candidate);
    if (!normalized) continue;
    const match = normalizedLabels.get(normalized);
    if (match) return match;
  }

  const english = normalizedLabels.get("en");
  if (english) return english;

  const first = normalizedLabels.values().next().value;
  return first ?? fallback ?? null;
}

export function inferPreferredLanguage(input?: string | string[] | null): SupportedLanguage {
  const raw = Array.isArray(input) ? input.join(",") : input || "";
  const lowered = raw.toLowerCase();
  if (lowered.includes("es")) return "es";
  if (lowered.includes("ro")) return "ro";
  return "en";
}

export function inferLocale(input?: string | string[] | null): string | null {
  const raw = Array.isArray(input) ? input.join(",") : input || "";
  const first = raw.split(",")[0]?.trim() ?? "";
  const normalized = normalizeLocaleTag(first);
  return normalized || null;
}
