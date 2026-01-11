import Head from "next/head";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/router";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { AiBaseTone, AiTurnMode, AI_TURN_MODE_OPTIONS, AI_TURN_MODES, normalizeAiBaseTone, normalizeAiTurnMode } from "../../lib/aiSettings";
import { buildDailyUsageFromLogs } from "../../lib/aiUsage";
import { normalizeVoiceTranscriptionSettings, type VoiceTranscriptionMode } from "../../lib/voiceTranscriptionSettings";
import { TRANSLATION_LANGUAGES, getTranslationLanguageName, normalizeTranslationLanguage, type TranslationLanguage } from "../../lib/language";
import { AGENCY_INTENSITIES, type AgencyIntensity } from "../../lib/agency/types";
import {
  CREATOR_PLATFORM_KEYS,
  CreatorPlatformConfig,
  CreatorPlatformKey,
  CreatorPlatforms,
  createDefaultCreatorPlatforms,
  formatPlatformLabel,
  normalizeCreatorPlatforms,
} from "../../lib/creatorPlatforms";
import type { Offer, OfferTier } from "../../types/offers";

type CreatorAiSettings = {
  id: string;
  creatorId: string;
  tone: AiBaseTone;
  allowAutoLowPriority: boolean;
  voiceTranscriptionMode: VoiceTranscriptionMode;
  voiceTranscriptionMinSeconds: number;
  voiceTranscriptionDailyBudgetUsd: number;
  voiceTranscriptionExtractIntentTags: boolean;
  voiceTranscriptionSuggestReply: boolean;
  creditsAvailable: number;
  hardLimitPerDay: number | null;
  createdAt: string;
  updatedAt: string;
  turnMode: AiTurnMode;
  platforms: CreatorPlatforms;
  cortexProvider?: string | null;
  cortexBaseUrl?: string | null;
  cortexModel?: string | null;
  cortexApiKeySaved?: boolean;
  cortexApiKeyInvalid?: boolean;
};

type FormState = {
  tone: AiBaseTone;
  turnMode: AiTurnMode;
  creditsAvailable: number | "";
  hardLimitPerDay: number | "" | null;
  allowAutoLowPriority: boolean;
  voiceTranscriptionMode: VoiceTranscriptionMode;
  voiceTranscriptionMinSeconds: number | "";
  voiceTranscriptionDailyBudgetUsd: number | "";
  voiceTranscriptionExtractIntentTags: boolean;
  voiceTranscriptionSuggestReply: boolean;
  platforms: CreatorPlatforms;
};

type AiStatus = {
  creditsAvailable: number;
  hardLimitPerDay: number | null;
  usedToday: number;
  remainingToday: number | null;
  limitReached: boolean;
  translateConfigured?: boolean;
  translateProvider?: string;
  translateMissingVars?: string[];
  creatorLang?: TranslationLanguage;
};

type TranslateProviderOption = "none" | "libretranslate" | "deepl";

type CortexProviderOption = "ollama" | "openai";

type CortexSettingsForm = {
  provider: CortexProviderOption;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeySaved: boolean;
  apiKeyInvalid: boolean;
};

type TranslateSettingsForm = {
  provider: TranslateProviderOption;
  libretranslateUrl: string;
  libretranslateApiKey: string;
  deeplApiUrl: string;
  deeplApiKey: string;
  libretranslateKeySaved: boolean;
  libretranslateKeyInvalid: boolean;
  deeplKeySaved: boolean;
  deeplKeyInvalid: boolean;
  creatorLang: TranslationLanguage;
};

type OfferFormState = {
  code: string;
  title: string;
  tier: OfferTier;
  priceCents: number | "";
  currency: string;
  oneLiner: string;
  hooksText: string;
  ctasText: string;
  intensityMin: AgencyIntensity;
  active: boolean;
};

type ActionCount = { actionType: string; count: number };
type AiUsageSummary = {
  summary: {
    totalToday: number;
    totalLast7Days: number;
    creditsToday: number;
    creditsLast7Days: number;
    byActionTypeToday: ActionCount[];
    byActionTypeLast7Days: ActionCount[];
  };
  settings: { creditsAvailable: number; hardLimitPerDay: number | null } | null;
  recentLogs: {
    id: string;
    createdAt: string;
    fanId: string | null;
    actionType: string;
    creditsUsed: number;
    suggestedText: string | null;
    outcome: string | null;
    turnMode?: string | null;
  }[];
  dailyUsage?: { date: string; count: number }[];
};

const DEFAULT_TRANSLATE_LANG: TranslationLanguage = "es";
const OFFER_TIER_LABELS: Record<OfferTier, string> = {
  MICRO: "Micro",
  STANDARD: "Standard",
  PREMIUM: "Premium",
  MONTHLY: "Monthly",
};
const AGENCY_INTENSITY_LABELS: Record<AgencyIntensity, string> = {
  SOFT: "Soft",
  MEDIUM: "Medium",
  INTENSE: "Intense",
};
const DEFAULT_OFFER_FORM: OfferFormState = {
  code: "",
  title: "",
  tier: "STANDARD",
  priceCents: "",
  currency: "EUR",
  oneLiner: "",
  hooksText: "",
  ctasText: "",
  intensityMin: "SOFT",
  active: true,
};
const OFFER_LIST_SPLIT_REGEX = /\r?\n|,/g;

function splitOfferLines(value: string): string[] {
  return value
    .split(OFFER_LIST_SPLIT_REGEX)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function joinOfferLines(items?: string[] | null): string {
  if (!Array.isArray(items)) return "";
  return items.join("\n");
}

function formatOfferPriceLabel(priceCents: number, currency?: string | null): string {
  const amount = priceCents / 100;
  const base = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
  const code = (currency || "EUR").toUpperCase();
  return `${base} ${code}`;
}

function resolveDefaultTranslateLang(): TranslationLanguage {
  if (typeof navigator === "undefined") return DEFAULT_TRANSLATE_LANG;
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const base = candidate.split(/[-_]/)[0];
    const normalized = normalizeTranslationLanguage(base);
    if (normalized) return normalized;
  }
  return DEFAULT_TRANSLATE_LANG;
}

export default function CreatorAiSettingsPage() {
  const { config } = useCreatorConfig();
  const router = useRouter();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const defaultLibreUrl = "http://127.0.0.1:5000";
  const defaultCortexBaseUrl = "http://127.0.0.1:11434/v1";
  const defaultCortexModel = "llama3.1:8b";
  const defaultTranslateLang = resolveDefaultTranslateLang();

  const [settings, setSettings] = useState<CreatorAiSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [translateForm, setTranslateForm] = useState<TranslateSettingsForm | null>({
    provider: "none",
    libretranslateUrl: defaultLibreUrl,
    libretranslateApiKey: "",
    deeplApiUrl: "",
    deeplApiKey: "",
    libretranslateKeySaved: false,
    libretranslateKeyInvalid: false,
    deeplKeySaved: false,
    deeplKeyInvalid: false,
    creatorLang: defaultTranslateLang,
  });
  const [translateLoading, setTranslateLoading] = useState(true);
  const [translateLoadError, setTranslateLoadError] = useState("");
  const [translateSaving, setTranslateSaving] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const [translateSuccess, setTranslateSuccess] = useState("");
  const [translateTestToast, setTranslateTestToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );
  const [isTestingTranslate, setIsTestingTranslate] = useState(false);
  const [showDeeplAdvanced, setShowDeeplAdvanced] = useState(false);
  const translateTestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cortexForm, setCortexForm] = useState<CortexSettingsForm | null>({
    provider: "ollama",
    baseUrl: defaultCortexBaseUrl,
    model: defaultCortexModel,
    apiKey: "",
    apiKeySaved: false,
    apiKeyInvalid: false,
  });
  const [cortexSaving, setCortexSaving] = useState(false);
  const [cortexError, setCortexError] = useState("");
  const [cortexSuccess, setCortexSuccess] = useState("");
  const [cortexTestToast, setCortexTestToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );
  const [isTestingCortex, setIsTestingCortex] = useState(false);
  const cortexTestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 10;
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState("");
  const [offerForm, setOfferForm] = useState<OfferFormState>({ ...DEFAULT_OFFER_FORM });
  const [offerEditingId, setOfferEditingId] = useState<string | null>(null);
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerFormError, setOfferFormError] = useState("");
  const [offerSuccess, setOfferSuccess] = useState("");

  const turnModeOptions = AI_TURN_MODE_OPTIONS;
  const voiceModeOptions: { value: VoiceTranscriptionMode; label: string }[] = [
    { value: "MANUAL", label: "Manual (botón Transcribir)" },
    { value: "AUTO_SMART", label: "Auto inteligente (VIP/cola/prioridad)" },
    { value: "AUTO_ALWAYS", label: "Auto siempre (entrantes)" },
  ];
  const platformKeys: CreatorPlatformKey[] = [...CREATOR_PLATFORM_KEYS];
  const translationLangOptions = TRANSLATION_LANGUAGES.map((lang) => ({
    value: lang,
    label: `${getTranslationLanguageName(lang)} (${lang.toUpperCase()})`,
  }));

  function updatePlatform(key: CreatorPlatformKey, patch: Partial<CreatorPlatformConfig>) {
    setForm((prev) => {
      if (!prev) return prev;
      const current = prev.platforms?.[key] ?? { enabled: false, handle: "" };
      const nextHandle = patch.handle !== undefined ? patch.handle : current.handle;
      return {
        ...prev,
        platforms: {
          ...prev.platforms,
          [key]: {
            enabled: patch.enabled ?? current.enabled,
            handle: typeof nextHandle === "string" ? nextHandle : current.handle,
          },
        },
      };
    });
  }

  const normalizeSettings = useCallback((raw: any, cortexKey?: { saved?: boolean; invalid?: boolean }): CreatorAiSettings => {
    const voiceSettings = normalizeVoiceTranscriptionSettings(raw);
    return {
      id: String(raw.id),
      creatorId: raw.creatorId,
      tone: normalizeAiBaseTone(raw.tone),
      allowAutoLowPriority: Boolean(raw.allowAutoLowPriority),
      voiceTranscriptionMode: voiceSettings.mode,
      voiceTranscriptionMinSeconds: voiceSettings.minSeconds,
      voiceTranscriptionDailyBudgetUsd: voiceSettings.dailyBudgetUsd,
      voiceTranscriptionExtractIntentTags: voiceSettings.extractIntentTags,
      voiceTranscriptionSuggestReply: voiceSettings.suggestReply,
      creditsAvailable: Number.isFinite(Number(raw.creditsAvailable))
        ? Number(raw.creditsAvailable)
        : 0,
      hardLimitPerDay: (() => {
        if (raw.hardLimitPerDay === null || raw.hardLimitPerDay === undefined) return null;
        const parsed = Number(raw.hardLimitPerDay);
        return Number.isFinite(parsed) ? parsed : null;
      })(),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      turnMode: turnModeFromRaw(raw.turnMode),
      platforms: normalizeCreatorPlatforms(raw.platforms),
      cortexProvider: normalizeCortexProviderOption(raw.cortexProvider),
      cortexBaseUrl: typeof raw.cortexBaseUrl === "string" ? raw.cortexBaseUrl : null,
      cortexModel: typeof raw.cortexModel === "string" ? raw.cortexModel : null,
      cortexApiKeySaved: Boolean(cortexKey?.saved),
      cortexApiKeyInvalid: Boolean(cortexKey?.invalid),
    };
  }, []);

  function turnModeFromRaw(value: unknown): AiTurnMode {
    const parsed = typeof value === "string" ? value : "";
    const valid = (AI_TURN_MODES as readonly string[]).includes(parsed as AiTurnMode)
      ? (parsed as AiTurnMode)
      : normalizeAiTurnMode(parsed);
    return valid || "auto";
  }

  const applyTranslateFormFromPayload = useCallback(
    (payload?: any) => {
      const provider = normalizeTranslateProviderOption(payload?.provider);
      const libreUrlRaw =
        typeof payload?.libretranslate?.url === "string"
          ? payload.libretranslate.url
          : typeof payload?.libretranslateUrl === "string"
          ? payload.libretranslateUrl
          : "";
      const libretranslateUrl = libreUrlRaw.trim() ? libreUrlRaw : defaultLibreUrl;
      const deeplUrlRaw =
        typeof payload?.deepl?.apiUrl === "string"
          ? payload.deepl.apiUrl
          : typeof payload?.deeplApiUrl === "string"
          ? payload.deeplApiUrl
          : "";
      const deeplApiUrl = deeplUrlRaw.trim() ? deeplUrlRaw : "";
      const libreKey = payload?.libretranslate?.apiKey ?? payload?.libretranslateApiKey ?? {};
      const deeplKey = payload?.deepl?.apiKey ?? payload?.deeplApiKey ?? {};
      const creatorLangRaw = payload?.creatorLanguage ?? payload?.creatorLang;
      const creatorLang = normalizeTranslationLanguage(creatorLangRaw) ?? defaultTranslateLang;

      setTranslateForm({
        provider,
        libretranslateUrl,
        libretranslateApiKey: "",
        deeplApiUrl,
        deeplApiKey: "",
        libretranslateKeySaved: Boolean(libreKey?.saved),
        libretranslateKeyInvalid: Boolean(libreKey?.invalid),
        deeplKeySaved: Boolean(deeplKey?.saved),
        deeplKeyInvalid: Boolean(deeplKey?.invalid),
        creatorLang,
      });
      setShowDeeplAdvanced(provider === "deepl" && deeplApiUrl.length > 0);
    },
    [defaultLibreUrl, defaultTranslateLang]
  );

  const fetchSettings = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) {
        setLoading(true);
        setError("");
      }
      setTranslateLoading(true);
      setTranslateLoadError("");
      const res = await fetch("/api/creator/ai-settings", { cache: "no-store" });
      if (!res.ok) throw new Error("Error fetching settings");
      const data = await res.json();
      const payload = data?.data ?? data;
      const rawSettings = payload?.settings ?? data?.settings;
      if (!rawSettings) {
        throw new Error("Missing settings payload");
      }
      const normalized = normalizeSettings(rawSettings, payload?.ai?.apiKey);
      applyFormFromSettings(normalized);
      applyTranslateFormFromPayload(payload?.translation);
    } catch (err) {
      console.error("Error loading AI settings", err);
      if (!opts?.silent) {
        setError("No se pudieron cargar los ajustes.");
      }
      setTranslateLoadError("No se pudieron cargar los ajustes de traducción.");
    } finally {
      setTranslateLoading(false);
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [applyTranslateFormFromPayload, normalizeSettings]);

  function applyFormFromSettings(next: CreatorAiSettings) {
    setSettings(next);
    setForm({
      tone: next.tone || "auto",
      turnMode: next.turnMode || "auto",
      creditsAvailable: Number.isFinite(next.creditsAvailable) ? next.creditsAvailable : 0,
      hardLimitPerDay: next.hardLimitPerDay === null ? "" : next.hardLimitPerDay,
      allowAutoLowPriority: next.allowAutoLowPriority,
      voiceTranscriptionMode: next.voiceTranscriptionMode,
      voiceTranscriptionMinSeconds: Number.isFinite(next.voiceTranscriptionMinSeconds)
        ? next.voiceTranscriptionMinSeconds
        : "",
      voiceTranscriptionDailyBudgetUsd: Number.isFinite(next.voiceTranscriptionDailyBudgetUsd)
        ? next.voiceTranscriptionDailyBudgetUsd
        : "",
      voiceTranscriptionExtractIntentTags: next.voiceTranscriptionExtractIntentTags,
      voiceTranscriptionSuggestReply: next.voiceTranscriptionSuggestReply,
      platforms: normalizeCreatorPlatforms(next.platforms),
    });
    const provider = normalizeCortexProviderOption(next.cortexProvider) ?? "ollama";
    setCortexForm({
      provider,
      baseUrl: next.cortexBaseUrl?.trim() || defaultCortexBaseUrl,
      model: next.cortexModel?.trim() || defaultCortexModel,
      apiKey: "",
      apiKeySaved: Boolean(next.cortexApiKeySaved),
      apiKeyInvalid: Boolean(next.cortexApiKeyInvalid),
    });
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/ai/status", { cache: "no-store" });
      if (!res.ok) throw new Error("Error fetching status");
      const raw = await res.json();
      const data = raw?.data ?? raw;
      setStatus({
        creditsAvailable: data.creditsAvailable ?? 0,
        hardLimitPerDay: data.hardLimitPerDay ?? null,
        usedToday: data.usedToday ?? 0,
        remainingToday: data.remainingToday ?? null,
        limitReached: Boolean(data.limitReached),
        translateConfigured: Boolean(data.translateConfigured),
        translateProvider: typeof data.translateProvider === "string" ? data.translateProvider : undefined,
        translateMissingVars: Array.isArray(data.translateMissingVars)
          ? data.translateMissingVars.filter((item: unknown) => typeof item === "string" && item.trim().length > 0)
          : [],
        creatorLang: normalizeTranslationLanguage(data.creatorLang) ?? defaultTranslateLang,
      });
    } catch (err) {
      console.error("Error loading AI status", err);
    }
  }, [defaultTranslateLang]);

  const fetchUsageSummary = useCallback(async () => {
    try {
      setUsageLoading(true);
      setUsageError("");
      const res = await fetch("/api/creator/ai-usage/summary");
      if (!res.ok) throw new Error("Error fetching usage summary");
      const data = await res.json();
      setUsageSummary(data as AiUsageSummary);
    } catch (err) {
      console.error("Error loading AI usage summary", err);
      setUsageError("No se pudo cargar la actividad de IA.");
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const fetchOffers = useCallback(async () => {
    setOffersLoading(true);
    setOffersError("");
    try {
      const res = await fetch("/api/creator/agency/offers?includeInactive=1", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(typeof data?.error === "string" ? data.error : res.statusText);
      }
      setOffers(Array.isArray(data.items) ? (data.items as Offer[]) : []);
    } catch (err) {
      console.error("Error loading offers", err);
      setOffersError("No se pudieron cargar las ofertas.");
    } finally {
      setOffersLoading(false);
    }
  }, []);

  const fetchTranslateSettings = useCallback(async () => {
    await fetchSettings({ silent: true });
  }, [fetchSettings]);

  const showTranslateTestToast = useCallback((message: string, variant: "success" | "error") => {
    setTranslateTestToast({ message, variant });
    if (translateTestTimerRef.current) {
      clearTimeout(translateTestTimerRef.current);
    }
    translateTestTimerRef.current = setTimeout(() => setTranslateTestToast(null), 3000);
  }, []);

  const showCortexTestToast = useCallback((message: string, variant: "success" | "error") => {
    setCortexTestToast({ message, variant });
    if (cortexTestTimerRef.current) {
      clearTimeout(cortexTestTimerRef.current);
    }
    cortexTestTimerRef.current = setTimeout(() => setCortexTestToast(null), 3000);
  }, []);

  const handleTestCortex = useCallback(async () => {
    if (isTestingCortex || cortexSaving) return;
    setCortexError("");
    setCortexSuccess("");
    setIsTestingCortex(true);
    try {
      const res = await fetch("/api/creator/cortex/health", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data?.error === "string" && data.error.trim().length > 0
            ? data.error
            : "No se pudo probar la conexión.";
        showCortexTestToast(message, "error");
        return;
      }
      if (!data?.reachable) {
        showCortexTestToast("Proveedor no accesible. Revisa base URL y modelo.", "error");
        return;
      }
      const label =
        typeof data?.provider === "string" ? data.provider.toUpperCase() : "Proveedor";
      showCortexTestToast(`${label} responde OK.`, "success");
    } catch (err) {
      console.error("Error testing cortex provider", err);
      showCortexTestToast("No se pudo probar la conexión.", "error");
    } finally {
      setIsTestingCortex(false);
    }
  }, [cortexSaving, isTestingCortex, showCortexTestToast]);

  const handleTestTranslate = useCallback(async () => {
    if (isTestingTranslate || translateLoading || translateSaving) return;
    if (!translateForm || translateForm.provider === "none") {
      showTranslateTestToast("Selecciona un proveedor y guarda antes de probar.", "error");
      return;
    }
    if (translateForm.provider === "libretranslate" && !translateForm.libretranslateUrl.trim()) {
      showTranslateTestToast("Falta LIBRETRANSLATE_URL.", "error");
      return;
    }
    if (
      translateForm.provider === "deepl" &&
      !translateForm.deeplApiKey.trim() &&
      !translateForm.deeplKeySaved
    ) {
      showTranslateTestToast("Falta DEEPL_API_KEY.", "error");
      return;
    }

    setIsTestingTranslate(true);
    try {
      const res = await fetch("/api/creator/ai/translate-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        const message =
          typeof data?.message === "string" && data.message.trim().length > 0
            ? data.message
            : "No se pudo probar la conexión.";
        showTranslateTestToast(message, "error");
        return;
      }
      const okMessage =
        translateForm.provider === "deepl" ? "DeepL responde OK." : "LibreTranslate responde OK.";
      showTranslateTestToast(okMessage, "success");
    } catch (err) {
      console.error("Error testing translate provider", err);
      showTranslateTestToast("No se pudo probar la conexión.", "error");
    } finally {
      setIsTestingTranslate(false);
    }
  }, [isTestingTranslate, showTranslateTestToast, translateForm, translateLoading, translateSaving]);

  const handleSaveCortexSettings = useCallback(async () => {
    if (!cortexForm) return;
    setCortexError("");
    setCortexSuccess("");

    if (cortexForm.provider === "ollama" && !cortexForm.baseUrl.trim()) {
      setCortexError("AI_BASE_URL es obligatorio.");
      return;
    }
    if (!cortexForm.model.trim()) {
      setCortexError("AI_MODEL es obligatorio.");
      return;
    }
    if (cortexForm.provider === "openai" && !cortexForm.apiKey.trim() && !cortexForm.apiKeySaved) {
      setCortexError("OPENAI_API_KEY es obligatorio.");
      return;
    }

    setCortexSaving(true);
    try {
      const payload: Record<string, string> = {
        cortexProvider: cortexForm.provider,
        cortexBaseUrl: cortexForm.baseUrl.trim(),
        cortexModel: cortexForm.model.trim(),
      };
      if (cortexForm.apiKey.trim()) {
        payload.cortexApiKey = cortexForm.apiKey.trim();
      }

      const res = await fetch("/api/creator/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const message =
          typeof data?.error?.message === "string"
            ? data.error.message
            : typeof data?.error === "string" && data.error.trim().length > 0
            ? data.error
            : "No se pudo guardar la configuración del proveedor.";
        setCortexError(message);
        return;
      }
      await fetchSettings({ silent: true });
      await fetchStatus();
      setCortexSuccess("Proveedor guardado.");
      showCortexTestToast("Ajustes guardados.", "success");
    } catch (err) {
      console.error("Error saving cortex settings", err);
      setCortexError("No se pudo guardar la configuración del proveedor.");
    } finally {
      setCortexSaving(false);
    }
  }, [cortexForm, fetchSettings, fetchStatus, showCortexTestToast]);

  useEffect(() => {
    fetchSettings();
    fetchStatus();
    fetchUsageSummary();
    fetchOffers();
  }, [fetchSettings, fetchStatus, fetchUsageSummary, fetchOffers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [usageSummary?.recentLogs?.length]);

  useEffect(() => {
    if (!router.isReady) return;
    const focusTarget = typeof router.query.focus === "string" ? router.query.focus : "";
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (focusTarget !== "translation" && hash !== "#translation") return;
    const target = document.getElementById("translation");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [router.isReady, router.query.focus, router.asPath]);

  const handleSaveTranslateSettings = useCallback(async () => {
    if (!translateForm) return;
    setTranslateError("");
    setTranslateSuccess("");

    if (translateForm.provider === "libretranslate" && !translateForm.libretranslateUrl.trim()) {
      setTranslateError("LIBRETRANSLATE_URL es obligatorio.");
      return;
    }
    if (
      translateForm.provider === "deepl" &&
      !translateForm.deeplApiKey.trim() &&
      !translateForm.deeplKeySaved
    ) {
      setTranslateError("DEEPL_API_KEY es obligatorio.");
      return;
    }

    setTranslateSaving(true);
    try {
      const payload: Record<string, string> = {
        provider: translateForm.provider,
      };
      if (translateForm.creatorLang) {
        payload.creatorLang = translateForm.creatorLang;
      }
      if (translateForm.provider === "libretranslate") {
        payload.libretranslateUrl = translateForm.libretranslateUrl.trim();
        if (translateForm.libretranslateApiKey.trim()) {
          payload.libretranslateApiKey = translateForm.libretranslateApiKey.trim();
        }
      }
      if (translateForm.provider === "deepl") {
        if (translateForm.deeplApiKey.trim()) {
          payload.deeplApiKey = translateForm.deeplApiKey.trim();
        }
        payload.deeplApiUrl = translateForm.deeplApiUrl.trim();
      }

      const res = await fetch("/api/creator/ai/translate-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const message =
          typeof data?.error?.message === "string"
            ? data.error.message
            : typeof data?.error === "string" && data.error.trim().length > 0
            ? data.error
            : "No se pudo guardar la configuración de traducción.";
        setTranslateError(message);
        return;
      }
      setTranslateSuccess("Configuración de traducción guardada.");
      showTranslateTestToast("Ajustes guardados.", "success");
      await fetchSettings({ silent: true });
      await fetchStatus();
    } catch (err) {
      console.error("Error saving translate settings", err);
      setTranslateError("No se pudo guardar la configuración de traducción.");
    } finally {
      setTranslateSaving(false);
    }
  }, [fetchSettings, fetchStatus, showTranslateTestToast, translateForm]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    setError("");
    setSuccess("");

    const creditsValue = form.creditsAvailable === "" ? 0 : form.creditsAvailable;
    if (creditsValue < 0) {
      setError("Los créditos disponibles no pueden ser negativos.");
      return;
    }

    const limitValue = form.hardLimitPerDay === "" ? null : form.hardLimitPerDay;
    if (limitValue !== null && typeof limitValue === "number" && limitValue < 0) {
      setError("El límite diario no puede ser negativo.");
      return;
    }

    const minSecondsValue = form.voiceTranscriptionMinSeconds === "" ? 0 : form.voiceTranscriptionMinSeconds;
    if (typeof minSecondsValue === "number" && minSecondsValue < 0) {
      setError("El mínimo de segundos no puede ser negativo.");
      return;
    }
    const budgetValue =
      form.voiceTranscriptionDailyBudgetUsd === "" ? 0 : form.voiceTranscriptionDailyBudgetUsd;
    if (typeof budgetValue === "number" && budgetValue < 0) {
      setError("El presupuesto diario no puede ser negativo.");
      return;
    }

    const payload: Partial<CreatorAiSettings> = {
      tone: form.tone,
      turnMode: form.turnMode,
      creditsAvailable: typeof form.creditsAvailable === "number" ? form.creditsAvailable : 0,
      hardLimitPerDay: form.hardLimitPerDay === "" ? null : form.hardLimitPerDay ?? null,
      allowAutoLowPriority: form.allowAutoLowPriority,
      voiceTranscriptionMode: form.voiceTranscriptionMode,
      voiceTranscriptionMinSeconds: typeof minSecondsValue === "number" ? minSecondsValue : 0,
      voiceTranscriptionDailyBudgetUsd: typeof budgetValue === "number" ? budgetValue : 0,
      voiceTranscriptionExtractIntentTags: form.voiceTranscriptionExtractIntentTags,
      voiceTranscriptionSuggestReply: form.voiceTranscriptionSuggestReply,
      platforms: form.platforms ?? createDefaultCreatorPlatforms(),
    };

    try {
      setSaving(true);
      const res = await fetch("/api/creator/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error("Error saving settings");
      }
      await fetchSettings({ silent: true });
      fetchStatus();
      setSuccess("Ajustes guardados.");
    } catch (err) {
      console.error("Error saving AI settings", err);
      setError("No se han podido guardar los ajustes. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const resetOfferForm = useCallback(() => {
    setOfferForm({ ...DEFAULT_OFFER_FORM });
    setOfferEditingId(null);
    setOfferFormError("");
    setOfferSuccess("");
  }, []);

  const applyOfferToForm = useCallback((offer: Offer) => {
    setOfferForm({
      code: offer.code ?? "",
      title: offer.title ?? "",
      tier: offer.tier ?? "STANDARD",
      priceCents: Number.isFinite(offer.priceCents) ? offer.priceCents : 0,
      currency: (offer.currency || "EUR").toUpperCase(),
      oneLiner: offer.oneLiner ?? "",
      hooksText: joinOfferLines(offer.hooks),
      ctasText: joinOfferLines(offer.ctas),
      intensityMin: offer.intensityMin ?? "SOFT",
      active: Boolean(offer.active),
    });
    setOfferEditingId(offer.id);
    setOfferFormError("");
    setOfferSuccess("");
  }, []);

  const handleOfferSave = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (offerSaving) return;
      setOfferFormError("");
      setOfferSuccess("");

      const code = offerForm.code.trim();
      const title = offerForm.title.trim();
      const oneLiner = offerForm.oneLiner.trim();
      const currency = offerForm.currency.trim().toUpperCase() || "EUR";
      const priceCents =
        typeof offerForm.priceCents === "number" && Number.isFinite(offerForm.priceCents)
          ? Math.round(offerForm.priceCents)
          : null;
      const hooks = splitOfferLines(offerForm.hooksText);
      const ctas = splitOfferLines(offerForm.ctasText);

      if (!code || !title || !oneLiner) {
        setOfferFormError("Código, título y one-liner son obligatorios.");
        return;
      }
      if (priceCents === null) {
        setOfferFormError("El precio es obligatorio.");
        return;
      }
      if (priceCents < 0) {
        setOfferFormError("El precio no puede ser negativo.");
        return;
      }
      if (hooks.length < 3 || hooks.length > 6) {
        setOfferFormError("Los hooks deben tener entre 3 y 6 opciones.");
        return;
      }
      if (ctas.length < 3 || ctas.length > 6) {
        setOfferFormError("Los CTAs deben tener entre 3 y 6 opciones.");
        return;
      }

      try {
        setOfferSaving(true);
        const endpoint = offerEditingId
          ? `/api/creator/agency/offers/${offerEditingId}`
          : "/api/creator/agency/offers";
        const method = offerEditingId ? "PUT" : "POST";
        const res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            title,
            tier: offerForm.tier,
            priceCents,
            currency,
            oneLiner,
            hooks,
            ctas,
            intensityMin: offerForm.intensityMin,
            active: offerForm.active,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          const message =
            data?.error === "OFFER_CODE_TAKEN"
              ? "Ese código ya existe."
              : typeof data?.error === "string" && data.error.trim()
              ? data.error
              : "No se pudo guardar la oferta.";
          setOfferFormError(message);
          return;
        }
        const saved = data?.item ?? (Array.isArray(data.items) ? data.items[0] : null);
        if (saved) {
          if (offerEditingId) {
            applyOfferToForm(saved as Offer);
          } else {
            resetOfferForm();
          }
        } else if (!offerEditingId) {
          resetOfferForm();
        }
        setOfferSuccess(offerEditingId ? "Oferta actualizada." : "Oferta creada.");
        await fetchOffers();
      } catch (err) {
        console.error("Error saving offer", err);
        setOfferFormError("No se pudo guardar la oferta.");
      } finally {
        setOfferSaving(false);
      }
    },
    [applyOfferToForm, fetchOffers, offerEditingId, offerForm, offerSaving, resetOfferForm]
  );

  const handleOfferDeactivate = useCallback(
    async (offer: Offer) => {
      if (offerSaving) return;
      setOfferFormError("");
      setOfferSuccess("");
      try {
        setOfferSaving(true);
        const res = await fetch(`/api/creator/agency/offers/${offer.id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(typeof data?.error === "string" ? data.error : res.statusText);
        }
        const saved = data?.item;
        if (saved && offerEditingId === offer.id) {
          applyOfferToForm(saved as Offer);
        }
        setOfferSuccess("Oferta desactivada.");
        await fetchOffers();
      } catch (err) {
        console.error("Error deactivating offer", err);
        setOfferFormError("No se pudo desactivar la oferta.");
      } finally {
        setOfferSaving(false);
      }
    },
    [applyOfferToForm, fetchOffers, offerEditingId, offerSaving]
  );

  const handleOfferActivate = useCallback(
    async (offer: Offer) => {
      if (offerSaving) return;
      setOfferFormError("");
      setOfferSuccess("");
      try {
        setOfferSaving(true);
        const res = await fetch(`/api/creator/agency/offers/${offer.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(typeof data?.error === "string" ? data.error : res.statusText);
        }
        const saved = data?.item;
        if (saved && offerEditingId === offer.id) {
          applyOfferToForm(saved as Offer);
        }
        setOfferSuccess("Oferta activada.");
        await fetchOffers();
      } catch (err) {
        console.error("Error activating offer", err);
        setOfferFormError("No se pudo activar la oferta.");
      } finally {
        setOfferSaving(false);
      }
    },
    [applyOfferToForm, fetchOffers, offerEditingId, offerSaving]
  );

  function formatDate(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("es-ES", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function mapActionType(actionType: string) {
    const map: Record<string, string> = {
      welcome_suggestion: "Saludo",
      warmup_suggestion: "Warmup",
      quick_extra_suggestion: "Extra rápido",
      followup_suggestion: "Seguimiento extra",
      renewal_suggestion: "Renovación",
      reactivation_suggestion: "Reactivación",
      boundaries_suggestion: "Límites",
      support_suggestion: "Soporte",
      pack_offer_suggestion: "Pack especial",
    };
    return map[actionType] ?? actionType;
  }

  function normalizeTranslateProviderOption(raw: unknown): TranslateProviderOption {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (value === "libre") return "libretranslate";
    if (value === "libretranslate") return "libretranslate";
    if (value === "deepl") return "deepl";
    return "none";
  }

  function normalizeCortexProviderOption(raw: unknown): CortexProviderOption | null {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (value === "ollama") return "ollama";
    if (value === "openai") return "openai";
    return null;
  }

  const dailyUsageForChart = (() => {
    if (usageSummary?.dailyUsage && usageSummary.dailyUsage.length > 0) return usageSummary.dailyUsage;
    if (usageSummary?.recentLogs) {
      return buildDailyUsageFromLogs(usageSummary.recentLogs as any, 30).map((d) => ({
        date: d.date,
        count: d.suggestionsCount,
      }));
    }
    return [];
  })();
  const historyLogs = usageSummary?.recentLogs ?? [];
  const totalRows = historyLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = historyLogs.slice(startIndex, endIndex);
  const translateConfigured = status?.translateConfigured === true;
  const translateStatusLabel = status ? (translateConfigured ? "Configurada" : "No configurada") : "Cargando...";
  const translateBadgeClass = !status
    ? "rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--muted)]"
    : translateConfigured
    ? "rounded-full border border-[color:rgba(34,197,94,0.5)] bg-[color:rgba(34,197,94,0.12)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]"
    : "rounded-full border border-[color:rgba(244,63,94,0.5)] bg-[color:rgba(244,63,94,0.12)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]";
  const selectedTranslateProvider = translateForm?.provider ?? "none";
  const showTranslateLoadError = Boolean(
    !translateLoading && translateLoadError && !status?.translateConfigured
  );
  const showLibreFields = selectedTranslateProvider === "libretranslate";
  const showDeeplFields = selectedTranslateProvider === "deepl";
  const isTranslateFormDisabled = translateLoading || translateSaving;
  const selectedCortexProvider = cortexForm?.provider ?? "ollama";
  const isCortexFormDisabled = cortexSaving || isTestingCortex;
  const offerHooksCount = splitOfferLines(offerForm.hooksText).length;
  const offerCtasCount = splitOfferLines(offerForm.ctasText).length;
  const offerPricePreview =
    typeof offerForm.priceCents === "number" && Number.isFinite(offerForm.priceCents)
      ? formatOfferPriceLabel(Math.round(offerForm.priceCents), offerForm.currency)
      : "";

  function AiUsageChart({ data }: { data: { date: string; count: number }[] }) {
    if (!data || data.length === 0 || data.every((d) => !d.count)) {
      return (
        <div className="flex h-40 items-center justify-center text-[11px] text-[color:var(--muted)]">
          Aún no hay actividad suficiente para mostrar el uso diario.
        </div>
      );
    }
    const max = Math.max(...data.map((d) => d.count || 0));
    const safeMax = max || 1;

    return (
      <div className="w-full overflow-x-auto">
        <div className="min-w-[480px] flex flex-col gap-2">
          <div className="flex h-36 items-end gap-1 px-1">
            {data.map((point) => {
              const ratio = point.count / safeMax;
              const heightPx = point.count === 0 ? 0 : Math.max(12, Math.round(ratio * 120));
              const label = new Date(point.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
              return (
                <div key={point.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t-md bg-[color:rgba(var(--brand-rgb),0.8)]"
                    style={{ height: `${heightPx}px` }}
                    title={`${label}: ${point.count} sugerencias`}
                    aria-label={`${label}: ${point.count} sugerencias`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-[color:var(--muted)] px-1">
            {data.map((point, idx) => {
              const shouldShow = data.length <= 7 || idx === 0 || idx === data.length - 1 || idx % 5 === 0;
              return (
                <span key={`${point.date}-label`} className="flex-1 text-center truncate">
                  {shouldShow ? point.date.slice(5) : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Ajustes de IA – NOVSY</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <CreatorHeader
          name={config.creatorName}
          role="Creador"
          subtitle={config.creatorSubtitle}
          initial={creatorInitial}
          avatarUrl={config.avatarUrl}
          onOpenSettings={() => {}}
        />

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Ajustes de IA</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Configura cómo y cuánto puede responder la IA por ti a lo largo del día.
          </p>
        </div>

        <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 sm:p-6">
          {loading && <div className="text-sm text-[color:var(--muted)]">Cargando...</div>}
          {error && <div className="text-sm text-[color:var(--danger)] mb-3">{error}</div>}
          {success && <div className="text-sm text-[color:var(--brand)] mb-3">{success}</div>}

          {form && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-[color:var(--text)] font-medium">Tono base de la IA</label>
                  <select
                    value={form.tone}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, tone: normalizeAiBaseTone(e.target.value) } : prev
                      )
                    }
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  >
                    {[
                      { value: "auto", label: "Automático (según fan)" },
                      { value: "soft", label: "Suave" },
                      { value: "intimate", label: "Íntimo" },
                      { value: "spicy", label: "Picante" },
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[color:var(--muted)]">
                    La IA usará este tono como base cuando no haya contexto claro. El Manager IA puede ajustar el tono fan a fan.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-[color:var(--text)] font-medium">Modo de turno de la IA</label>
                  <select
                    value={form.turnMode}
                    onChange={(e) =>
                      setForm((prev) => (prev ? { ...prev, turnMode: e.target.value as AiTurnMode } : prev))
                    }
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  >
                    {turnModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[color:var(--muted)]">
                    Define la estrategia general de la IA. El Manager IA sigue usando el objetivo de cada fan; esto solo orienta la priorización cuando haya varias opciones válidas.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-[color:var(--text)] font-medium">Créditos disponibles</label>
                  <input
                    type="number"
                    min={0}
                    value={form.creditsAvailable === "" ? "" : form.creditsAvailable}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) =>
                        prev
                          ? { ...prev, creditsAvailable: value === "" ? "" : Number(value) }
                          : prev
                      );
                    }}
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--text)]">Proveedor de IA (Cortex/Manager)</h3>
                    <p className="text-xs text-[color:var(--muted)]">
                      Configura el modelo que responde en el Cortex y el Manager.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-xs text-[color:var(--muted)]">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[color:var(--text)]">Proveedor</span>
                    <select
                      value={cortexForm?.provider ?? "ollama"}
                      onChange={(event) => {
                        const nextProvider = normalizeCortexProviderOption(event.target.value) ?? "ollama";
                        setCortexForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                provider: nextProvider,
                              }
                            : prev
                        );
                        setCortexError("");
                        setCortexSuccess("");
                      }}
                      disabled={isCortexFormDisabled}
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <option value="ollama">Ollama (local)</option>
                      <option value="openai">OpenAI</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[color:var(--text)]">AI_BASE_URL</span>
                    <input
                      type="text"
                      value={cortexForm?.baseUrl ?? defaultCortexBaseUrl}
                      onChange={(event) =>
                        setCortexForm((prev) =>
                          prev ? { ...prev, baseUrl: event.target.value } : prev
                        )
                      }
                      disabled={isCortexFormDisabled}
                      placeholder={defaultCortexBaseUrl}
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[color:var(--text)]">AI_MODEL</span>
                    <input
                      type="text"
                      value={cortexForm?.model ?? defaultCortexModel}
                      onChange={(event) =>
                        setCortexForm((prev) =>
                          prev ? { ...prev, model: event.target.value } : prev
                        )
                      }
                      disabled={isCortexFormDisabled}
                      placeholder={defaultCortexModel}
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[color:var(--text)]">
                      AI_API_KEY {selectedCortexProvider === "ollama" ? "(opcional)" : "(obligatoria)"}
                    </span>
                    <input
                      type="password"
                      value={cortexForm?.apiKey ?? ""}
                      onChange={(event) =>
                        setCortexForm((prev) =>
                          prev ? { ...prev, apiKey: event.target.value } : prev
                        )
                      }
                      disabled={isCortexFormDisabled}
                      placeholder={
                        cortexForm?.apiKeySaved
                          ? "Key guardada"
                          : selectedCortexProvider === "ollama"
                          ? "Opcional"
                          : "Obligatoria"
                      }
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                    {cortexForm?.apiKeyInvalid && !cortexForm.apiKey && (
                      <span className="text-[10px] text-[color:var(--danger)]">Key inválida. Vuelve a guardarla.</span>
                    )}
                    {cortexForm?.apiKeySaved && !cortexForm.apiKey && !cortexForm.apiKeyInvalid && (
                      <span className="text-[10px] text-[color:var(--muted)]">Key guardada en servidor.</span>
                    )}
                  </label>

                  {cortexError && <div className="text-[11px] text-[color:var(--danger)]">{cortexError}</div>}
                  {cortexSuccess && <div className="text-[11px] text-[color:rgba(34,197,94,0.9)]">{cortexSuccess}</div>}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleTestCortex}
                    disabled={isTestingCortex || cortexSaving}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-full border px-4 py-2 text-[11px] font-semibold transition",
                      isTestingCortex || cortexSaving
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                    )}
                  >
                    {isTestingCortex ? "Probando..." : "Probar conexión"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCortexSettings}
                    disabled={cortexSaving || !cortexForm}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-full border px-4 py-2 text-[11px] font-semibold transition",
                      cortexSaving || !cortexForm
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
                    )}
                  >
                    {cortexSaving ? "Guardando..." : "Guardar ajustes"}
                  </button>
                </div>
                {cortexTestToast && (
                  <div
                    className={clsx(
                      "mt-2 text-[11px] whitespace-pre-wrap",
                      cortexTestToast.variant === "success"
                        ? "text-[color:rgba(34,197,94,0.9)]"
                        : "text-[color:var(--danger)]"
                    )}
                  >
                    {cortexTestToast.message}
                  </div>
                )}
              </div>

              <div
                id="translation"
                className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--text)]">Traducción</h3>
                    <p className="text-xs text-[color:var(--muted)]">Configura el proveedor para activar “Traducir”.</p>
                  </div>
                  <span className={translateBadgeClass}>{translateStatusLabel}</span>
                </div>

                <div className="mt-3 text-xs text-[color:var(--muted)]">
                  {translateLoading && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Cargando ajustes de traducción...</span>
                      <button
                        type="button"
                        onClick={fetchTranslateSettings}
                        disabled={translateLoading}
                        className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                  {showTranslateLoadError && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[color:var(--danger)]">{translateLoadError}</span>
                      <button
                        type="button"
                        onClick={fetchTranslateSettings}
                        className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-3 text-xs text-[color:var(--muted)]">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[color:var(--text)]">Proveedor</span>
                    <select
                      value={translateForm?.provider ?? "none"}
                      onChange={(event) => {
                        const nextProvider = normalizeTranslateProviderOption(event.target.value);
                        setTranslateForm((prev) =>
                          prev ? { ...prev, provider: nextProvider } : prev
                        );
                        if (nextProvider !== "deepl") {
                          setShowDeeplAdvanced(false);
                        } else if (translateForm?.deeplApiUrl.trim()) {
                          setShowDeeplAdvanced(true);
                        }
                        setTranslateError("");
                        setTranslateSuccess("");
                      }}
                      disabled={isTranslateFormDisabled}
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <option value="none">Ninguno</option>
                      <option value="libretranslate">LibreTranslate (self-hosted)</option>
                      <option value="deepl">DeepL</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[color:var(--text)]">Idioma del creador</span>
                    <select
                      value={translateForm?.creatorLang ?? defaultTranslateLang}
                      onChange={(event) => {
                        const nextLang = normalizeTranslationLanguage(event.target.value) ?? defaultTranslateLang;
                        setTranslateForm((prev) => (prev ? { ...prev, creatorLang: nextLang } : prev));
                        setTranslateError("");
                        setTranslateSuccess("");
                      }}
                      disabled={isTranslateFormDisabled}
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {translationLangOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-[color:var(--muted)]">
                      Las traducciones se generan hacia este idioma.
                    </span>
                  </label>

                  {showLibreFields && (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold text-[color:var(--text)]">LIBRETRANSLATE_URL</span>
                        <input
                          type="text"
                          value={translateForm?.libretranslateUrl ?? defaultLibreUrl}
                          onChange={(event) =>
                            setTranslateForm((prev) =>
                              prev ? { ...prev, libretranslateUrl: event.target.value } : prev
                            )
                          }
                          disabled={isTranslateFormDisabled}
                          placeholder="http://127.0.0.1:5000"
                          className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold text-[color:var(--text)]">
                          LIBRETRANSLATE_API_KEY (opcional)
                        </span>
                        <input
                          type="password"
                          value={translateForm?.libretranslateApiKey ?? ""}
                          onChange={(event) =>
                            setTranslateForm((prev) =>
                              prev ? { ...prev, libretranslateApiKey: event.target.value } : prev
                            )
                          }
                          disabled={isTranslateFormDisabled}
                          placeholder={translateForm?.libretranslateKeySaved ? "Key guardada" : "Opcional"}
                          className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                        />
                        {translateForm?.libretranslateKeyInvalid && !translateForm.libretranslateApiKey && (
                          <span className="text-[10px] text-[color:var(--danger)]">
                            Key inválida. Vuelve a guardarla.
                          </span>
                        )}
                        {translateForm?.libretranslateKeySaved &&
                          !translateForm.libretranslateApiKey &&
                          !translateForm.libretranslateKeyInvalid && (
                            <span className="text-[10px] text-[color:var(--muted)]">Key guardada en servidor.</span>
                          )}
                      </label>
                    </>
                  )}

                  {showDeeplFields && (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold text-[color:var(--text)]">DEEPL_API_KEY</span>
                        <input
                          type="password"
                          value={translateForm?.deeplApiKey ?? ""}
                          onChange={(event) =>
                            setTranslateForm((prev) =>
                              prev ? { ...prev, deeplApiKey: event.target.value } : prev
                            )
                          }
                          disabled={isTranslateFormDisabled}
                          placeholder={translateForm?.deeplKeySaved ? "Key guardada" : "Obligatoria"}
                          className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                        />
                        {translateForm?.deeplKeyInvalid && !translateForm.deeplApiKey && (
                          <span className="text-[10px] text-[color:var(--danger)]">
                            Key inválida. Vuelve a guardarla.
                          </span>
                        )}
                        {translateForm?.deeplKeySaved &&
                          !translateForm.deeplApiKey &&
                          !translateForm.deeplKeyInvalid && (
                            <span className="text-[10px] text-[color:var(--muted)]">Key guardada en servidor.</span>
                          )}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowDeeplAdvanced((prev) => !prev)}
                        className="w-fit text-[10px] font-semibold text-[color:var(--text)] hover:text-[color:var(--muted)]"
                      >
                        {showDeeplAdvanced ? "Ocultar avanzado" : "Avanzado"}
                      </button>
                      {showDeeplAdvanced && (
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-[color:var(--text)]">
                            DeepL API URL (opcional)
                          </span>
                          <input
                            type="text"
                            value={translateForm?.deeplApiUrl ?? ""}
                            onChange={(event) =>
                              setTranslateForm((prev) =>
                                prev ? { ...prev, deeplApiUrl: event.target.value } : prev
                              )
                            }
                            disabled={isTranslateFormDisabled}
                            placeholder="https://api-free.deepl.com"
                            className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>
                      )}
                    </>
                  )}

                  {translateError && <div className="text-[11px] text-[color:var(--danger)]">{translateError}</div>}
                  {translateSuccess && <div className="text-[11px] text-[color:rgba(34,197,94,0.9)]">{translateSuccess}</div>}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleTestTranslate}
                    disabled={isTestingTranslate || translateSaving || translateLoading}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-full border px-4 py-2 text-[11px] font-semibold transition",
                      isTestingTranslate || translateSaving || translateLoading
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                    )}
                  >
                    {isTestingTranslate ? "Probando..." : "Probar conexión"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTranslateSettings}
                    disabled={translateSaving || translateLoading || !translateForm}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-full border px-4 py-2 text-[11px] font-semibold transition",
                      translateSaving || translateLoading || !translateForm
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
                    )}
                  >
                    {translateSaving ? "Guardando..." : "Guardar ajustes"}
                  </button>
                </div>
                {translateTestToast && (
                  <div
                    className={clsx(
                      "mt-2 text-[11px] whitespace-pre-wrap",
                      translateTestToast.variant === "success"
                        ? "text-[color:rgba(34,197,94,0.9)]"
                        : "text-[color:var(--danger)]"
                    )}
                  >
                    {translateTestToast.message}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-[color:var(--text)] font-medium">Límite diario de créditos (opcional)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Sin límite"
                    value={form.hardLimitPerDay === "" || form.hardLimitPerDay === null ? "" : form.hardLimitPerDay}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              hardLimitPerDay: value === "" ? "" : Number(value),
                            }
                          : prev
                      );
                    }}
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  />
                  <p className="text-xs text-[color:var(--muted)]">
                    Déjalo vacío si no quieres un límite diario.
                  </p>
                </div>

                <div className="flex items-center gap-3 border border-[color:var(--surface-border)] rounded-xl px-4 py-3 bg-[color:var(--surface-1)]">
                  <input
                    id="allowAutoLowPriority"
                    type="checkbox"
                    checked={form.allowAutoLowPriority}
                    onChange={(e) =>
                      setForm((prev) => (prev ? { ...prev, allowAutoLowPriority: e.target.checked } : prev))
                    }
                    className="h-5 w-5 rounded border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--brand)] focus:ring-[color:var(--ring)]"
                  />
                  <div className="flex flex-col">
                    <label htmlFor="allowAutoLowPriority" className="text-sm font-medium text-[color:var(--text)]">
                      Permitir respuestas automáticas para fans de baja prioridad
                    </label>
                    <p className="text-xs text-[color:var(--muted)]">
                      Si está activado, la IA puede contestar por ti cuando la cola esté muy llena. Solo se usa con fans marcados como baja prioridad.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4">
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--text)]">Transcripción de notas de voz</h3>
                    <p className="text-xs text-[color:var(--muted)]">
                      Controla cuándo se transcriben los audios y limita el gasto diario.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-[color:var(--text)] font-medium">Modo</label>
                      <select
                        value={form.voiceTranscriptionMode}
                        onChange={(e) =>
                          setForm((prev) =>
                            prev ? { ...prev, voiceTranscriptionMode: e.target.value as VoiceTranscriptionMode } : prev
                          )
                        }
                        className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                      >
                        {voiceModeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-[color:var(--text)] font-medium">Mínimo (segundos)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.voiceTranscriptionMinSeconds === "" ? "" : form.voiceTranscriptionMinSeconds}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((prev) =>
                            prev
                              ? { ...prev, voiceTranscriptionMinSeconds: value === "" ? "" : Number(value) }
                              : prev
                          );
                        }}
                        className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-[color:var(--text)] font-medium">Presupuesto diario (USD)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={
                          form.voiceTranscriptionDailyBudgetUsd === ""
                            ? ""
                            : form.voiceTranscriptionDailyBudgetUsd
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  voiceTranscriptionDailyBudgetUsd: value === "" ? "" : Number(value),
                                }
                              : prev
                          );
                        }}
                        className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                      />
                      <p className="text-xs text-[color:var(--muted)]">0 = auto pausado por presupuesto.</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-xs text-[color:var(--muted)]">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.voiceTranscriptionExtractIntentTags}
                        onChange={(e) =>
                          setForm((prev) =>
                            prev ? { ...prev, voiceTranscriptionExtractIntentTags: e.target.checked } : prev
                          )
                        }
                        className="h-4 w-4 rounded border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--brand)] focus:ring-[color:var(--ring)]"
                      />
                      Extraer intención/tags del audio.
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.voiceTranscriptionSuggestReply}
                        onChange={(e) =>
                          setForm((prev) =>
                            prev ? { ...prev, voiceTranscriptionSuggestReply: e.target.checked } : prev
                          )
                        }
                        className="h-4 w-4 rounded border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--brand)] focus:ring-[color:var(--ring)]"
                      />
                      Sugerir respuestas (no auto-enviar).
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-lg bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--brand)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Guardando..." : "Guardar ajustes"}
                </button>
              </div>

              <div className="text-xs text-[color:var(--muted)]">
                Usados hoy:{" "}
                {status ? `${status.usedToday}/${status.hardLimitPerDay ?? "∞"}` : "—"} · Créditos restantes:{" "}
                {status ? status.creditsAvailable : "—"}
              </div>
            </form>
          )}

          {!loading && !form && (
            <div className="text-sm text-[color:var(--muted)]">No hay datos de ajustes disponibles en este momento.</div>
          )}
        </div>

        <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--text)]">Ofertas</h2>
              <p className="text-sm text-[color:var(--muted)]">
                Gestiona el catálogo para insertar ofertas humanas desde el Manager IA.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetOfferForm}
                className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]"
              >
                Nueva oferta
              </button>
              <button
                type="button"
                onClick={fetchOffers}
                disabled={offersLoading}
                className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Refrescar
              </button>
            </div>
          </div>

          {offersError && <div className="text-sm text-[color:var(--danger)] mb-2">{offersError}</div>}
          {offerFormError && <div className="text-sm text-[color:var(--danger)] mb-2">{offerFormError}</div>}
          {offerSuccess && (
            <div className="text-sm text-[color:rgba(34,197,94,0.9)] mb-2">{offerSuccess}</div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[color:var(--text)]">Listado</div>
                <div className="text-xs text-[color:var(--muted)]">
                  {offers.length} {offers.length === 1 ? "oferta" : "ofertas"}
                </div>
              </div>
              {offersLoading && (
                <div className="mt-3 text-xs text-[color:var(--muted)]">Cargando ofertas...</div>
              )}
              {!offersLoading && offers.length === 0 && (
                <div className="mt-3 text-xs text-[color:var(--muted)]">Aún no has creado ofertas.</div>
              )}
              {!offersLoading && offers.length > 0 && (
                <div className="mt-3 divide-y divide-[color:var(--surface-border)]">
                  {offers.map((offer) => (
                    <div
                      key={offer.id}
                      className="py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[color:var(--text)]">{offer.title}</span>
                          {!offer.active && (
                            <span className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                              Inactiva
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[color:var(--muted)]">
                          <span className="font-mono">{offer.code}</span> · {OFFER_TIER_LABELS[offer.tier]} ·{" "}
                          {formatOfferPriceLabel(offer.priceCents, offer.currency)} ·{" "}
                          {AGENCY_INTENSITY_LABELS[offer.intensityMin]}
                        </div>
                        {offer.oneLiner && (
                          <div className="text-[11px] text-[color:var(--muted)]">{offer.oneLiner}</div>
                        )}
                        <div className="text-[10px] text-[color:var(--muted)]">
                          Hooks: {offer.hooks.length} · CTAs: {offer.ctas.length}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applyOfferToForm(offer)}
                          className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]"
                        >
                          Editar
                        </button>
                        {offer.active ? (
                          <button
                            type="button"
                            onClick={() => handleOfferDeactivate(offer)}
                            disabled={offerSaving}
                            className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOfferActivate(offer)}
                            disabled={offerSaving}
                            className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Activar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4">
              <form onSubmit={handleOfferSave} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text)]">
                      {offerEditingId ? "Editar oferta" : "Nueva oferta"}
                    </div>
                    <div className="text-xs text-[color:var(--muted)]">3-6 hooks y CTAs para variar el copy.</div>
                  </div>
                  {offerEditingId && (
                    <button
                      type="button"
                      onClick={resetOfferForm}
                      className="text-[11px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    >
                      Cancelar
                    </button>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                  <span className="font-semibold text-[color:var(--text)]">Código</span>
                  <input
                    type="text"
                    value={offerForm.code}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, code: event.target.value }))}
                    placeholder="micro-1"
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                  <span className="font-semibold text-[color:var(--text)]">Título</span>
                  <input
                    type="text"
                    value={offerForm.title}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Extra rápido"
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--text)]">Tier</span>
                    <select
                      value={offerForm.tier}
                      onChange={(event) =>
                        setOfferForm((prev) => ({ ...prev, tier: event.target.value as OfferTier }))
                      }
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                    >
                      {Object.entries(OFFER_TIER_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--text)]">Intensidad mínima</span>
                    <select
                      value={offerForm.intensityMin}
                      onChange={(event) =>
                        setOfferForm((prev) => ({ ...prev, intensityMin: event.target.value as AgencyIntensity }))
                      }
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                    >
                      {AGENCY_INTENSITIES.map((intensity) => (
                        <option key={intensity} value={intensity}>
                          {AGENCY_INTENSITY_LABELS[intensity]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--text)]">Precio (céntimos)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={offerForm.priceCents === "" ? "" : offerForm.priceCents}
                      onChange={(event) => {
                        const value = event.target.value;
                        setOfferForm((prev) => ({
                          ...prev,
                          priceCents: value === "" ? "" : Number(value),
                        }));
                      }}
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                    />
                    {offerPricePreview && (
                      <span className="text-[10px] text-[color:var(--muted)]">Vista: {offerPricePreview}</span>
                    )}
                  </label>

                  <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--text)]">Moneda</span>
                    <input
                      type="text"
                      value={offerForm.currency}
                      onChange={(event) =>
                        setOfferForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
                      }
                      placeholder="EUR"
                      className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                  <span className="font-semibold text-[color:var(--text)]">One-liner</span>
                  <input
                    type="text"
                    value={offerForm.oneLiner}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, oneLiner: event.target.value }))}
                    placeholder="Te preparo algo corto y con chispa."
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                  <span className="font-semibold text-[color:var(--text)]">Hooks ({offerHooksCount}/6)</span>
                  <textarea
                    rows={4}
                    value={offerForm.hooksText}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, hooksText: event.target.value }))}
                    placeholder={
                      "Hoy te puedo sorprender.\nTengo algo corto y directo.\n¿Te apetece algo con más chispa?"
                    }
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                  />
                  <span className="text-[10px] text-[color:var(--muted)]">3-6 líneas, una por hook.</span>
                </label>

                <label className="flex flex-col gap-1 text-[11px] text-[color:var(--muted)]">
                  <span className="font-semibold text-[color:var(--text)]">CTAs ({offerCtasCount}/6)</span>
                  <textarea
                    rows={4}
                    value={offerForm.ctasText}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, ctasText: event.target.value }))}
                    placeholder={"¿Te lo preparo?\n¿Quieres que lo deje listo?\n¿Te apetece hoy?"}
                    className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
                  />
                  <span className="text-[10px] text-[color:var(--muted)]">
                    3-6 líneas, mejor en forma de pregunta.
                  </span>
                </label>

                <label className="flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
                  <input
                    type="checkbox"
                    checked={offerForm.active}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, active: event.target.checked }))}
                    className="h-4 w-4 rounded border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--brand)] focus:ring-[color:var(--ring)]"
                  />
                  Activa
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={offerSaving}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-full border px-4 py-2 text-[11px] font-semibold transition",
                      offerSaving
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
                    )}
                  >
                    {offerSaving ? "Guardando..." : offerEditingId ? "Guardar cambios" : "Crear oferta"}
                  </button>
                  {offerEditingId && (
                    <button
                      type="button"
                      onClick={resetOfferForm}
                      className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-[11px] font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]"
                    >
                      Nueva oferta
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>

              <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[color:var(--text)]">Uso de IA</h2>
                    <p className="text-sm text-[color:var(--muted)]">Sugerencias y créditos recientes.</p>
            </div>
            <button
              type="button"
              onClick={fetchUsageSummary}
              className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-xs text-[color:var(--text)] hover:border-[color:var(--brand)]"
            >
              Refrescar
            </button>
          </div>
          {usageError && <div className="text-sm text-[color:var(--danger)] mb-2">{usageError}</div>}
          {usageLoading && <div className="text-sm text-[color:var(--muted)]">Cargando actividad...</div>}

          {usageSummary && (
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-[color:var(--text)]">Resumen rápido</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                    <div className="text-xs text-[color:var(--muted)]">Sugerencias hoy</div>
                    <div className="text-2xl font-semibold text-[color:var(--text)]">{usageSummary.summary.totalToday}</div>
                    <div className="text-[11px] text-[color:var(--muted)] mt-1">Peticiones al Manager IA hoy</div>
                  </div>
                  <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                    <div className="text-xs text-[color:var(--muted)]">Sugerencias últimos 7 días</div>
                    <div className="text-2xl font-semibold text-[color:var(--text)]">{usageSummary.summary.totalLast7Days}</div>
                    <div className="text-[11px] text-[color:var(--muted)] mt-1">Peticiones de los últimos 7 días</div>
                  </div>
                  <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                    <div className="text-xs text-[color:var(--muted)]">Créditos usados hoy</div>
                    <div className="text-2xl font-semibold text-[color:var(--text)]">{usageSummary.summary.creditsToday}</div>
                    <div className="text-[11px] text-[color:var(--muted)] mt-1">Créditos consumidos hoy</div>
                  </div>
                  <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                    <div className="text-xs text-[color:var(--muted)]">Créditos disponibles</div>
                    <div className="text-2xl font-semibold text-[color:var(--text)]">
                      {usageSummary.settings?.creditsAvailable ?? "—"}
                    </div>
                    <div className="text-[11px] text-[color:var(--muted)] mt-1">Saldo disponible de la IA</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <div className="text-xs font-semibold text-[color:var(--text)] mb-2">Por tipo (últimos 7 días)</div>
                <div className="flex flex-wrap gap-2 text-[11px] text-[color:var(--text)]">
                  {usageSummary.summary.byActionTypeLast7Days.length === 0 && <span className="text-[color:var(--muted)]">Sin datos</span>}
                  {usageSummary.summary.byActionTypeLast7Days.map((item) => (
                    <span key={item.actionType} className="rounded-full border border-[color:var(--surface-border)] px-2 py-1">
                      {mapActionType(item.actionType)}: {item.count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[color:var(--text)]">Uso de IA (30 días)</div>
                    <div className="text-[11px] text-[color:var(--muted)]">Sugerencias por día</div>
                  </div>
                </div>
                <div className="mt-3">
                  <AiUsageChart data={dailyUsageForChart} />
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-[color:var(--text)]">Historial de IA (últimos 30 días)</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm text-[color:var(--text)]">
                    <thead>
                      <tr className="text-xs text-[color:var(--muted)] border-b border-[color:var(--surface-border)]">
                        <th className="py-2 pr-3">Fecha</th>
                        <th className="py-2 pr-3">Fan</th>
                        <th className="py-2 pr-3">Acción</th>
                        <th className="py-2 pr-3">Créditos</th>
                        <th className="py-2 pr-3">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-2 text-[color:var(--muted)]">
                            Sin actividad reciente.
                          </td>
                        </tr>
                      )}
                      {pageRows.map((log) => (
                        <tr key={log.id} className="border-b border-[color:var(--surface-border)]/60">
                          <td className="py-2 pr-3">{formatDate(log.createdAt)}</td>
                          <td className="py-2 pr-3">{log.fanId ?? "-"}</td>
                          <td className="py-2 pr-3">{mapActionType(log.actionType)}</td>
                          <td className="py-2 pr-3">{log.creditsUsed}</td>
                          <td className="py-2 pr-3 text-[color:var(--muted)]">{log.outcome ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalRows > 0 && (
                  <div className="mt-3 flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                    <span>
                      Mostrando {startIndex + 1}-{Math.min(endIndex, totalRows)} de {totalRows}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                      className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>
                      <span className="text-[color:var(--muted)]">Página {safePage} de {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                      className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
