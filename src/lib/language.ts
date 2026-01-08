export const SUPPORTED_LANGUAGES = ["es", "en", "ro"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

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

export function inferPreferredLanguage(input?: string | string[] | null): SupportedLanguage {
  const raw = Array.isArray(input) ? input.join(",") : input || "";
  const lowered = raw.toLowerCase();
  if (lowered.includes("es")) return "es";
  if (lowered.includes("ro")) return "ro";
  return "en";
}
