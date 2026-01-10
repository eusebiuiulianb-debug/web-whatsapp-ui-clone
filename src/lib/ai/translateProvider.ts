import { translateText as translateWithOpenAi } from "../../server/ai/translateText";
import prisma from "../prisma.server";
import { decryptSecretSafe } from "../crypto/secrets";
import { normalizeTranslationLanguage, type TranslationLanguage } from "../language";

export type TranslateProvider = "deepl" | "google" | "openai" | "libretranslate" | "none";

export type TranslateConfig = {
  provider: TranslateProvider;
  configured: boolean;
  missingVars: string[];
  creatorLang: TranslationLanguage;
};

type ResolvedTranslateConfig = TranslateConfig & {
  source: "db" | "env";
  libretranslateUrl?: string | null;
  libretranslateApiKey?: string | null;
  deeplApiUrl?: string | null;
  deeplApiKey?: string | null;
};

type TranslateRequest = {
  text: string;
  targetLang: TranslationLanguage;
  sourceLang?: string | null;
  creatorId?: string;
  fanId?: string | null;
  configOverride?: ResolvedTranslateConfig;
};

type TranslateResult = { translatedText: string; detectedSourceLang?: string | null };

const LIBRETRANSLATE_DOCKER_CMD =
  "docker run -d --name libretranslate -p 5000:5000 libretranslate/libretranslate:latest";
const LIBRETRANSLATE_HELP_MESSAGE =
  `No se pudo conectar a LibreTranslate. Tienes el servidor levantado? Ejecuta: ${LIBRETRANSLATE_DOCKER_CMD}`;

const PROVIDERS = new Set<TranslateProvider>(["deepl", "google", "openai", "libretranslate", "none"]);
const DEFAULT_CREATOR_LANG: TranslationLanguage = "es";

export function getLibreTranslateHelpMessage() {
  return LIBRETRANSLATE_HELP_MESSAGE;
}

function normalizeTranslateProvider(raw?: string | null): TranslateProvider {
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (normalized === "libre") return "libretranslate";
  if (PROVIDERS.has(normalized as TranslateProvider)) {
    return normalized as TranslateProvider;
  }
  return "none";
}

async function getDbTranslateConfig(creatorId: string): Promise<ResolvedTranslateConfig | null> {
  try {
    const settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
      select: {
        translateProvider: true,
        libretranslateUrl: true,
        libretranslateApiKeyEnc: true,
        deeplApiUrl: true,
        deeplApiKeyEnc: true,
        priorityOrderJson: true,
      },
    });

    if (!settings || settings.translateProvider === null) {
      return null;
    }

    const provider = normalizeTranslateProvider(settings.translateProvider);
    const libretranslateUrl = normalizeLibreTranslateUrl(settings.libretranslateUrl);
    const deeplApiUrl = normalizeDeepLApiUrl(settings.deeplApiUrl);

    let libretranslateApiKey: string | null = null;
    if (settings.libretranslateApiKeyEnc) {
      const decrypted = decryptSecretSafe(settings.libretranslateApiKeyEnc);
      if (decrypted.ok) {
        libretranslateApiKey = decrypted.value;
      }
    }

    let deeplApiKey: string | null = null;
    if (settings.deeplApiKeyEnc) {
      const decrypted = decryptSecretSafe(settings.deeplApiKeyEnc);
      if (decrypted.ok) {
        deeplApiKey = decrypted.value;
      }
    }

    return buildTranslateConfig({
      provider,
      libretranslateUrl,
      libretranslateApiKey,
      deeplApiUrl,
      deeplApiKey,
      creatorLang: resolveCreatorLangFromPriority(settings.priorityOrderJson),
      source: "db",
    });
  } catch (err) {
    console.error("Error loading translate settings from DB.", err);
    return null;
  }
}

function getEnvTranslateConfig(): ResolvedTranslateConfig {
  const provider = getTranslateProvider();
  const libretranslateUrl = normalizeLibreTranslateUrl(process.env.LIBRETRANSLATE_URL);
  const libretranslateApiKey = getProviderKey("libretranslate");
  const deeplApiKey = getProviderKey("deepl");
  const creatorLang = normalizeTranslationLanguage(process.env.CREATOR_LANG) ?? DEFAULT_CREATOR_LANG;

  return buildTranslateConfig({
    provider,
    libretranslateUrl,
    libretranslateApiKey,
    deeplApiUrl: null,
    deeplApiKey,
    creatorLang,
    source: "env",
  });
}

export async function getEffectiveTranslateConfig(creatorId?: string | null): Promise<ResolvedTranslateConfig> {
  if (creatorId) {
    const dbConfig = await getDbTranslateConfig(creatorId);
    if (dbConfig) {
      return dbConfig;
    }
  }
  return getEnvTranslateConfig();
}

function buildTranslateConfig(params: {
  provider: TranslateProvider;
  libretranslateUrl?: string | null;
  libretranslateApiKey?: string | null;
  deeplApiUrl?: string | null;
  deeplApiKey?: string | null;
  creatorLang?: TranslationLanguage | null;
  source: "db" | "env";
}): ResolvedTranslateConfig {
  const missingVars: string[] = [];
  const creatorLang = normalizeTranslationLanguage(params.creatorLang) ?? DEFAULT_CREATOR_LANG;

  if (params.provider === "none") {
    if (params.source === "env") {
      missingVars.push("TRANSLATE_PROVIDER");
    }
    return {
      provider: params.provider,
      configured: false,
      missingVars,
      creatorLang,
      source: params.source,
      libretranslateUrl: params.libretranslateUrl ?? null,
      libretranslateApiKey: params.libretranslateApiKey ?? null,
      deeplApiUrl: params.deeplApiUrl ?? null,
      deeplApiKey: params.deeplApiKey ?? null,
    };
  }

  if (params.provider === "libretranslate") {
    if (!params.libretranslateUrl) {
      missingVars.push("LIBRETRANSLATE_URL");
    }
    return {
      provider: params.provider,
      configured: missingVars.length === 0,
      missingVars,
      creatorLang,
      source: params.source,
      libretranslateUrl: params.libretranslateUrl ?? null,
      libretranslateApiKey: params.libretranslateApiKey ?? null,
      deeplApiUrl: params.deeplApiUrl ?? null,
      deeplApiKey: params.deeplApiKey ?? null,
    };
  }

  if (params.provider === "deepl") {
    if (!params.deeplApiKey || isPlaceholderKey(params.deeplApiKey)) {
      missingVars.push("DEEPL_API_KEY");
    }
    return {
      provider: params.provider,
      configured: missingVars.length === 0,
      missingVars,
      creatorLang,
      source: params.source,
      libretranslateUrl: params.libretranslateUrl ?? null,
      libretranslateApiKey: params.libretranslateApiKey ?? null,
      deeplApiUrl: params.deeplApiUrl ?? null,
      deeplApiKey: params.deeplApiKey ?? null,
    };
  }

  if (params.provider === "google") {
    const key = getProviderKey("google");
    if (!key || isPlaceholderKey(key)) {
      missingVars.push("GOOGLE_API_KEY");
    }
    return {
      provider: params.provider,
      configured: missingVars.length === 0,
      missingVars,
      creatorLang,
      source: params.source,
      libretranslateUrl: params.libretranslateUrl ?? null,
      libretranslateApiKey: params.libretranslateApiKey ?? null,
      deeplApiUrl: params.deeplApiUrl ?? null,
      deeplApiKey: params.deeplApiKey ?? null,
    };
  }

  if (params.provider === "openai") {
    const key = getProviderKey("openai");
    if (!key || isPlaceholderKey(key)) {
      missingVars.push("OPENAI_API_KEY");
    }
    if (!process.env.OPENAI_MODEL || !process.env.OPENAI_MODEL.trim()) {
      missingVars.push("OPENAI_MODEL");
    }
    const mode = normalizeAiMode(process.env.AI_MODE ?? "mock");
    if (mode !== "live") {
      missingVars.push("AI_MODE=live");
    }
    return {
      provider: params.provider,
      configured: missingVars.length === 0,
      missingVars,
      creatorLang,
      source: params.source,
      libretranslateUrl: params.libretranslateUrl ?? null,
      libretranslateApiKey: params.libretranslateApiKey ?? null,
      deeplApiUrl: params.deeplApiUrl ?? null,
      deeplApiKey: params.deeplApiKey ?? null,
    };
  }

  return {
    provider: "none",
    configured: false,
    missingVars: ["TRANSLATE_PROVIDER"],
    creatorLang,
    source: params.source,
    libretranslateUrl: params.libretranslateUrl ?? null,
    libretranslateApiKey: params.libretranslateApiKey ?? null,
    deeplApiUrl: params.deeplApiUrl ?? null,
    deeplApiKey: params.deeplApiKey ?? null,
  };
}

export function getTranslateProvider(): TranslateProvider {
  return normalizeTranslateProvider(process.env.TRANSLATE_PROVIDER);
}

export async function getTranslateConfig(creatorId?: string | null): Promise<TranslateConfig> {
  const config = await getEffectiveTranslateConfig(creatorId);
  return {
    provider: config.provider,
    configured: config.configured,
    missingVars: config.missingVars,
    creatorLang: config.creatorLang,
  };
}

export async function isTranslateConfigured(creatorId?: string | null): Promise<boolean> {
  const config = await getTranslateConfig(creatorId);
  return config.configured;
}

export async function translateText(params: TranslateRequest): Promise<TranslateResult> {
  const config = params.configOverride ?? (await getEffectiveTranslateConfig(params.creatorId));
  const provider = config.provider;
  if (!config.configured) {
    const error = new Error("TRANSLATE_NOT_CONFIGURED") as Error & { code?: string };
    error.code = "TRANSLATE_NOT_CONFIGURED";
    throw error;
  }

  const trimmed = typeof params.text === "string" ? params.text.trim() : "";
  if (!trimmed) {
    throw new Error("translation_empty");
  }

  switch (provider) {
    case "openai": {
      const translatedText = await translateWithOpenAi({
        text: trimmed,
        targetLanguage: params.targetLang,
        creatorId: params.creatorId,
        fanId: params.fanId ?? null,
      });
      if (!translatedText) {
        throw new Error("translation_failed");
      }
      return { translatedText, detectedSourceLang: null };
    }
    case "google":
      return translateWithGoogle({
        text: trimmed,
        targetLang: params.targetLang,
        sourceLang: params.sourceLang ?? null,
      });
    case "deepl":
      return translateWithDeepL({
        text: trimmed,
        targetLang: params.targetLang,
        sourceLang: null,
        apiKey: config.deeplApiKey ?? "",
        apiUrlOverride: config.deeplApiUrl ?? null,
      });
    case "libretranslate":
      return translateWithLibre({
        text: trimmed,
        targetLang: params.targetLang,
        sourceLang: params.sourceLang ?? null,
        baseUrl: config.libretranslateUrl ?? "",
        apiKey: config.libretranslateApiKey ?? null,
      });
    default: {
      const error = new Error("TRANSLATE_NOT_CONFIGURED") as Error & { code?: string };
      error.code = "TRANSLATE_NOT_CONFIGURED";
      throw error;
    }
  }
}

function normalizeAiMode(raw?: string | null) {
  const lowered = (raw || "").toLowerCase();
  if (lowered === "openai" || lowered === "live") return "live";
  if (lowered === "demo") return "demo";
  return "mock";
}

function createTranslateError(code: string, message: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

function normalizeDetectedLang(value?: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function isPlaceholderKey(value: string) {
  const lowered = value.trim().toLowerCase();
  if (!lowered) return true;
  if (lowered.includes("tu_key") || lowered.includes("your_key")) return true;
  if (lowered.startsWith("tu_") || lowered.startsWith("your_")) return true;
  if (lowered.includes("placeholder") || lowered.includes("changeme") || lowered.includes("example")) return true;
  return false;
}

function getProviderKey(provider: TranslateProvider): string | null {
  switch (provider) {
    case "deepl":
      return typeof process.env.DEEPL_API_KEY === "string" && process.env.DEEPL_API_KEY.trim()
        ? process.env.DEEPL_API_KEY.trim()
        : null;
    case "google":
      return typeof process.env.GOOGLE_API_KEY === "string" && process.env.GOOGLE_API_KEY.trim()
        ? process.env.GOOGLE_API_KEY.trim()
        : null;
    case "openai":
      return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim()
        ? process.env.OPENAI_API_KEY.trim()
        : null;
    case "libretranslate":
      return typeof process.env.LIBRETRANSLATE_API_KEY === "string" && process.env.LIBRETRANSLATE_API_KEY.trim()
        ? process.env.LIBRETRANSLATE_API_KEY.trim()
        : null;
    default:
      return null;
  }
}

function normalizeLibreTranslateUrl(raw?: string | null): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function normalizeDeepLApiUrl(raw?: string | null): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  let normalized = trimmed.replace(/\/+$/, "");
  if (normalized.endsWith("/v2/translate")) {
    normalized = normalized.slice(0, -"/v2/translate".length);
  } else if (normalized.endsWith("/v2")) {
    normalized = normalized.slice(0, -"/v2".length);
  }
  return normalized.replace(/\/+$/, "");
}

function resolveCreatorLangFromPriority(raw?: unknown): TranslationLanguage {
  if (!raw || typeof raw !== "object") return DEFAULT_CREATOR_LANG;
  const record = raw as Record<string, unknown>;
  const translation = record.translation;
  if (translation && typeof translation === "object" && !Array.isArray(translation)) {
    const nested = (translation as Record<string, unknown>).creatorLang;
    const normalized = normalizeTranslationLanguage(nested);
    if (normalized) return normalized;
  }
  const normalized = normalizeTranslationLanguage(record.creatorLang);
  return normalized ?? DEFAULT_CREATOR_LANG;
}

export function resolveDeepLBaseUrl(apiKey: string, apiUrlOverride?: string | null): string {
  const normalizedOverride = normalizeDeepLApiUrl(apiUrlOverride);
  if (normalizedOverride) return normalizedOverride;
  return apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

async function translateWithGoogle(params: {
  text: string;
  targetLang: string;
  sourceLang?: string | null;
}): Promise<TranslateResult> {
  const apiKey = getProviderKey("google");
  if (!apiKey) {
    throw new Error("translation_failed");
  }

  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", apiKey);

  const payload: Record<string, string> = {
    q: params.text,
    target: params.targetLang,
  };
  if (params.sourceLang) {
    payload.source = params.sourceLang;
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    const error = new Error("translation_failed") as Error & {
      code?: string;
      status?: number;
      detail?: string;
    };
    error.code = "DEEPL_ERROR";
    error.status = res.status;
    error.detail = errorText || res.statusText;
    throw error;
  }

  const data = await res.json().catch(() => ({}));
  const translatedText = data?.data?.translations?.[0]?.translatedText;
  if (typeof translatedText !== "string" || !translatedText.trim()) {
    throw new Error("translation_failed");
  }
  const detectedSourceLang = normalizeDetectedLang(data?.data?.translations?.[0]?.detectedSourceLanguage);

  return { translatedText: translatedText.trim(), detectedSourceLang };
}

async function translateWithDeepL(params: {
  text: string;
  targetLang: string;
  sourceLang?: string | null;
  apiKey: string;
  apiUrlOverride?: string | null;
}): Promise<TranslateResult> {
  const apiKey = params.apiKey;
  if (!apiKey) {
    throw new Error("translation_failed");
  }

  const baseUrl = resolveDeepLBaseUrl(apiKey, params.apiUrlOverride);
  const endpoint = `${baseUrl}/v2/translate`;
  const body = new URLSearchParams();
  body.set("text", params.text);
  body.set("target_lang", params.targetLang.toUpperCase());
  if (params.sourceLang) {
    body.set("source_lang", params.sourceLang.toUpperCase());
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `DeepL-Auth-Key ${apiKey}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error("translation_failed");
  }

  const data = await res.json().catch(() => ({}));
  const translatedText = data?.translations?.[0]?.text;
  if (typeof translatedText !== "string" || !translatedText.trim()) {
    throw new Error("translation_failed");
  }
  const detectedSourceLang = normalizeDetectedLang(data?.translations?.[0]?.detected_source_language);

  return { translatedText: translatedText.trim(), detectedSourceLang };
}

async function translateWithLibre(params: {
  text: string;
  targetLang: string;
  sourceLang?: string | null;
  baseUrl: string;
  apiKey?: string | null;
}): Promise<TranslateResult> {
  const baseUrl = normalizeLibreTranslateUrl(params.baseUrl);
  if (!baseUrl) {
    throw new Error("translation_failed");
  }

  const apiKey = params.apiKey ?? null;
  const endpoint = `${baseUrl}/translate`;
  const payload: Record<string, string> = {
    q: params.text,
    source: params.sourceLang ? params.sourceLang : "auto",
    target: params.targetLang,
    format: "text",
  };
  void params.sourceLang;
  if (apiKey) {
    payload.api_key = apiKey;
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const error = createTranslateError("NETWORK_ERROR", getLibreTranslateHelpMessage());
    (error as Error & { cause?: unknown }).cause = err;
    throw error;
  }

  if (!res.ok) {
    throw createTranslateError("NETWORK_ERROR", getLibreTranslateHelpMessage());
  }

  const data = await res.json().catch(() => ({}));
  const translatedText = data?.translatedText;
  if (typeof translatedText !== "string" || !translatedText.trim()) {
    throw new Error("translation_failed");
  }
  const detectedSourceLang = normalizeDetectedLang(
    (data as { detectedLanguage?: { language?: string } | null })?.detectedLanguage?.language
  );

  return { translatedText: translatedText.trim(), detectedSourceLang };
}
