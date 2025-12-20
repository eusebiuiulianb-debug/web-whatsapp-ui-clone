export const SUPPORTED_LANGUAGES = ["es", "en", "ro"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  es: "Espanol",
  en: "English",
  ro: "Romana",
};

export function normalizePreferredLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(trimmed) ? (trimmed as SupportedLanguage) : null;
}

export function inferPreferredLanguage(input?: string | string[] | null): SupportedLanguage {
  const raw = Array.isArray(input) ? input.join(",") : input || "";
  const lowered = raw.toLowerCase();
  if (lowered.includes("es")) return "es";
  if (lowered.includes("ro")) return "ro";
  return "en";
}
