import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { IconGlyph } from "./ui/IconGlyph";
import { type VoiceAnalysis, type VoiceTranslation } from "../types/voiceAnalysis";
import type { FanTone } from "../types/manager";
import { getTranslationLanguageName, type TranslationLanguage } from "../lib/language";

const analysisInFlight = new Map<string, Promise<VoiceAnalysis>>();
const transcriptInFlight = new Map<string, Promise<string>>();
const transcribeInFlight = new Map<string, Promise<void>>();
const translationInFlight = new Map<string, Promise<VoiceTranslation | null>>();
const MIN_TRANSCRIPT_LEN = 3;
const MAX_TRANSCRIPT_LEN = 4000;

const isTranslateNotConfiguredError = (err: unknown) => {
  if (!err || typeof err !== "object") return false;
  return "code" in err && (err as { code?: string }).code === "TRANSLATE_NOT_CONFIGURED";
};

type VoiceInsightsCardProps = {
  messageId: string;
  fanId: string;
  transcriptText: string | null;
  transcriptStatus?: string | null;
  transcriptError?: string | null;
  isFromFan?: boolean;
  tone?: FanTone;
  onTranscribe?: (messageId: string) => Promise<void> | void;
  onInsertText?: (text: string) => void;
  onInsertManager?: (text: string) => void;
  onCopyTranscript?: (text: string) => void;
  onUseTranscript?: (text: string) => void;
  onTranscriptSaved?: (transcript: string) => void;
  onAnalysisSaved?: (analysis: VoiceAnalysis) => void;
  onTranslationSaved?: (translation: VoiceTranslation) => void;
  initialTranslation?: VoiceTranslation | null;
  onToast?: (message: string) => void;
  onTranslateNotConfigured?: () => void;
  initialAnalysis?: VoiceAnalysis | null;
  disabled?: boolean;
  translateEnabled?: boolean;
  translateConfigured?: boolean;
  targetLang?: TranslationLanguage;
};

const INTENT_LABELS: Record<VoiceAnalysis["intent"], string> = {
  extra: "Extra",
  purchase: "Compra",
  question: "Duda",
  complaint: "Queja",
  logistics: "Logistica",
  flirt: "Coqueteo",
  boundaries: "Limites",
  other: "Otro",
};

const URGENCY_LABELS: Record<VoiceAnalysis["urgency"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const formatTranslationLang = (value: string | null | undefined, fallback: string) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return fallback;
  const upper = trimmed.toUpperCase();
  if (upper === "AUTO" || upper === "UN" || upper === "?") return fallback;
  return upper;
};

const buildManagerTranslationPayload = (
  sourceLabel: string,
  targetLabel: string,
  originalText: string,
  translatedText: string,
  isSourceUnknown: boolean
) => {
  const cleanOriginal = originalText.trim();
  const cleanTranslated = translatedText.trim();
  const instruction = isSourceUnknown
    ? "Responde en el mismo idioma del mensaje original. Devuelve SOLO el texto final."
    : `Responde al fan en el idioma detectado (${sourceLabel}). Devuelve SOLO el texto final.`;
  return (
    `Original (${sourceLabel}): ${cleanOriginal}\n\n` +
    `Traducción (${targetLabel}): ${cleanTranslated}\n\n` +
    `Idioma detectado: ${sourceLabel}\n` +
    `Instrucción: ${instruction}`
  );
};

export function VoiceInsightsCard({
  messageId,
  fanId,
  transcriptText,
  transcriptStatus,
  transcriptError,
  isFromFan,
  tone,
  onTranscribe,
  onInsertText,
  onInsertManager,
  onCopyTranscript,
  onUseTranscript,
  onTranscriptSaved,
  onAnalysisSaved,
  onTranslationSaved,
  initialTranslation,
  onToast,
  onTranslateNotConfigured,
  initialAnalysis,
  disabled,
  translateEnabled = true,
  translateConfigured = true,
  targetLang,
}: VoiceInsightsCardProps) {
  const hasInitialSuggestions = Boolean(initialAnalysis?.suggestions?.length);
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(initialAnalysis ?? null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    initialAnalysis ? "done" : "idle"
  );
  const [error, setError] = useState("");
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState(transcriptText ?? "");
  const [manualError, setManualError] = useState("");
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");
  const [translation, setTranslation] = useState<VoiceTranslation | null>(initialTranslation ?? null);
  const [translationStatus, setTranslationStatus] = useState<"idle" | "loading" | "ready" | "error">(
    initialTranslation ? "ready" : "idle"
  );
  const [translationError, setTranslationError] = useState("");
  const [translationOpen, setTranslationOpen] = useState(false);
  const transcriptStorageKey = messageId ? `voiceTranscriptOpen:${messageId}` : "";
  const legacyTranscriptStorageKey = messageId ? `novsy:voice-transcript:${messageId}` : "";
  const [transcriptOpen, setTranscriptOpen] = useState(() => {
    if (!transcriptStorageKey || typeof window === "undefined") return false;
    try {
      const stored = window.localStorage.getItem(transcriptStorageKey);
      if (stored === "1" || stored === "0") return stored === "1";
      if (!legacyTranscriptStorageKey) return false;
      return window.localStorage.getItem(legacyTranscriptStorageKey) === "1";
    } catch (_err) {
      return false;
    }
  });
  const insightsStorageKey = messageId ? `novsy:voice-insights:${messageId}` : "";
  const [showInsights, setShowInsights] = useState(() => {
    if (!insightsStorageKey || typeof window === "undefined") return !hasInitialSuggestions;
    try {
      const stored = window.localStorage.getItem(insightsStorageKey);
      if (stored === "1" || stored === "0") return stored === "1";
    } catch (_err) {
      return !hasInitialSuggestions;
    }
    return !hasInitialSuggestions;
  });
  const latestAnalysisRef = useRef<VoiceAnalysis | null>(initialAnalysis ?? null);
  const latestTranslationRef = useRef<VoiceTranslation | null>(initialTranslation ?? null);
  const lastVariantRef = useRef<"default" | "shorter" | "alternate">("default");

  const cleanedTranscript = transcriptText ? transcriptText.trim() : "";
  const hasTranscript = Boolean(cleanedTranscript);
  const normalizedStatus =
    transcriptStatus === "PENDING" || transcriptStatus === "DONE" || transcriptStatus === "FAILED"
      ? transcriptStatus
      : "OFF";
  const isDisabled = disabled || !messageId || !fanId;
  const isProviderMissing =
    typeof transcriptError === "string" && transcriptError.toLowerCase().includes("no provider configured");
  const resolvedTargetLang = targetLang ?? "es";

  useEffect(() => {
    if (!initialAnalysis) return;
    const prev = latestAnalysisRef.current;
    if (prev?.updatedAt && initialAnalysis.updatedAt && prev.updatedAt === initialAnalysis.updatedAt) return;
    latestAnalysisRef.current = initialAnalysis;
    setAnalysis(initialAnalysis);
    setStatus("done");
    setError("");
  }, [initialAnalysis]);

  useEffect(() => {
    if (!initialTranslation) return;
    const prev = latestTranslationRef.current;
    if (prev?.updatedAt && initialTranslation.updatedAt && prev.updatedAt === initialTranslation.updatedAt) return;
    latestTranslationRef.current = initialTranslation;
    setTranslation(initialTranslation);
    setTranslationStatus("ready");
    setTranslationError("");
  }, [initialTranslation]);

  useEffect(() => {
    if (!hasTranscript) return;
    setIsEditingTranscript(false);
    setTranscriptDraft(transcriptText ?? "");
    setManualError("");
    setTranscribeError("");
  }, [hasTranscript, transcriptText]);

  useEffect(() => {
    if (!hasTranscript && transcriptOpen) {
      setTranscriptOpen(false);
    }
  }, [hasTranscript, transcriptOpen]);

  useEffect(() => {
    if (!transcriptStorageKey || typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(transcriptStorageKey);
      if (stored === "1" || stored === "0") {
        setTranscriptOpen(stored === "1");
        return;
      }
      if (!legacyTranscriptStorageKey) return;
      setTranscriptOpen(window.localStorage.getItem(legacyTranscriptStorageKey) === "1");
    } catch (_err) {
      setTranscriptOpen(false);
    }
  }, [legacyTranscriptStorageKey, transcriptStorageKey]);

  useEffect(() => {
    if (!transcriptStorageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(transcriptStorageKey, transcriptOpen ? "1" : "0");
      if (legacyTranscriptStorageKey) {
        window.localStorage.setItem(legacyTranscriptStorageKey, transcriptOpen ? "1" : "0");
      }
    } catch (_err) {
      return;
    }
  }, [legacyTranscriptStorageKey, transcriptOpen, transcriptStorageKey]);

  useEffect(() => {
    if (!insightsStorageKey || typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(insightsStorageKey);
      if (stored === "1" || stored === "0") {
        setShowInsights(stored === "1");
      }
    } catch (_err) {
      return;
    }
  }, [insightsStorageKey]);

  useEffect(() => {
    if (!insightsStorageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(insightsStorageKey, showInsights ? "1" : "0");
    } catch (_err) {
      return;
    }
  }, [insightsStorageKey, showInsights]);

  useEffect(() => {
    if (normalizedStatus !== "PENDING") {
      setIsTranscribing(false);
    }
    if (normalizedStatus === "DONE") {
      setTranscribeError("");
    }
  }, [normalizedStatus]);

  const handleAnalyze = useCallback(
    async (variant: "default" | "shorter" | "alternate") => {
      if (!messageId || isDisabled || !hasTranscript) return;
      const key = `${messageId}:${variant}`;
      if (analysisInFlight.has(key)) return;
      lastVariantRef.current = variant;

      setStatus("loading");
      setError("");

      const request = fetch("/api/messages/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
        cache: "no-store",
        body: JSON.stringify({ messageId, variant, tone, fanId }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.ok) {
            const isMissingTranscript = data?.reason === "missing_transcript";
            const errorMessage = isMissingTranscript
              ? "Necesitas una transcripcion para analizar."
              : "No se pudo analizar la nota de voz.";
            throw new Error(errorMessage);
          }
          return data.analysis as VoiceAnalysis;
        })
        .finally(() => {
          analysisInFlight.delete(key);
        });

      analysisInFlight.set(key, request);

      try {
        const result = await request;
        if (!result || typeof result !== "object") {
          throw new Error("No se pudo analizar la nota de voz.");
        }
        latestAnalysisRef.current = result;
        setAnalysis(result);
        onAnalysisSaved?.(result);
        setStatus("done");
        setShowInsights(true);
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0 ? err.message : "No se pudo analizar la nota de voz.";
        setError(message);
        setStatus("error");
        onToast?.(message);
      }
    },
    [fanId, hasTranscript, isDisabled, messageId, onAnalysisSaved, onToast, tone]
  );

  const handleTranscribe = useCallback(async () => {
    if (!messageId || isDisabled || !onTranscribe) return;
    if (transcribeInFlight.has(messageId)) return;
    setIsTranscribing(true);
    setTranscribeError("");

    const request = Promise.resolve(onTranscribe(messageId)).finally(() => {
      transcribeInFlight.delete(messageId);
    });

    transcribeInFlight.set(messageId, request);

    try {
      await request;
    } catch (_err) {
      const message = "No se pudo transcribir.";
      setTranscribeError(message);
      onToast?.(message);
    } finally {
      setIsTranscribing(false);
    }
  }, [isDisabled, messageId, onToast, onTranscribe]);

  const handleTranslate = useCallback(async () => {
    if (!messageId || isDisabled || !hasTranscript || !translateEnabled) return;
    if (translateConfigured === false) {
      setTranslationStatus("idle");
      setTranslationError("");
      onTranslateNotConfigured?.();
      return;
    }
    if (translationInFlight.has(messageId)) return;
    setTranslationStatus("loading");
    setTranslationError("");

    const request = fetch("/api/creator/messages/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-novsy-viewer": "creator" },
      cache: "no-store",
      body: JSON.stringify({ messageId, targetLang: resolvedTargetLang, sourceKind: "voice_transcript" }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errorCode =
            typeof data?.code === "string"
              ? data.code
              : typeof data?.error === "string"
              ? data.error
              : "";
          const errorMessage =
            typeof data?.message === "string" && data.message.trim().length > 0
              ? data.message
              : errorCode || "translation_failed";
          const error = new Error(errorMessage) as Error & { code?: string };
          error.code = errorCode;
          throw error;
        }
        const translatedText =
          typeof data?.translatedText === "string" ? data.translatedText.trim() : "";
        if (!translatedText) {
          throw new Error("No se pudo traducir.");
        }
        const translationPayload: VoiceTranslation = {
          text: translatedText,
          targetLang: typeof data?.targetLang === "string" ? data.targetLang : resolvedTargetLang,
          sourceLang: typeof data?.detectedSourceLang === "string" ? data.detectedSourceLang : null,
          updatedAt: typeof data?.createdAt === "string" ? data.createdAt : new Date().toISOString(),
        };
        return translationPayload;
      })
      .finally(() => {
        translationInFlight.delete(messageId);
      });

    translationInFlight.set(messageId, request);

    try {
      const result = await request;
      if (!result?.text) {
        throw new Error("No se pudo traducir.");
      }
      latestTranslationRef.current = result;
      setTranslation(result);
      setTranslationStatus("ready");
      onTranslationSaved?.(result);
    } catch (err) {
      if (isTranslateNotConfiguredError(err)) {
        setTranslationStatus("idle");
        setTranslationError("");
        onTranslateNotConfigured?.();
        return;
      }
      const message = "No se pudo traducir.";
      setTranslationError(message);
      setTranslationStatus("error");
      onToast?.(message);
    }
  }, [
    hasTranscript,
    isDisabled,
    messageId,
    onToast,
    onTranslationSaved,
    onTranslateNotConfigured,
    translateConfigured,
    translateEnabled,
    resolvedTargetLang,
  ]);

  const handleSaveTranscript = useCallback(async () => {
    if (!messageId || isDisabled) return;
    const trimmed = transcriptDraft.trim();
    if (trimmed.length < MIN_TRANSCRIPT_LEN) {
      setManualError("La transcripcion es muy corta.");
      return;
    }
    if (trimmed.length > MAX_TRANSCRIPT_LEN) {
      setManualError(`Maximo ${MAX_TRANSCRIPT_LEN} caracteres.`);
      return;
    }
    const key = `transcript:${messageId}`;
    if (transcriptInFlight.has(key)) return;
    setIsSavingTranscript(true);
    setManualError("");

    const request = fetch("/api/messages/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        messageId,
        fanId,
        transcript: trimmed,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error("No se pudo guardar la transcripcion.");
        }
        return typeof data?.transcript === "string" ? data.transcript : trimmed;
      })
      .finally(() => {
        transcriptInFlight.delete(key);
      });

    transcriptInFlight.set(key, request);

    try {
      const saved = await request;
      setTranscriptDraft(saved);
      setIsEditingTranscript(false);
      setManualError("");
      onTranscriptSaved?.(saved);
    } catch (err) {
      const message = "No se pudo guardar la transcripcion.";
      setManualError(message);
      onToast?.(message);
    } finally {
      setIsSavingTranscript(false);
    }
  }, [fanId, isDisabled, messageId, onToast, onTranscriptSaved, transcriptDraft]);

  const tags = useMemo(() => {
    if (!analysis?.tags) return [];
    return analysis.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 3);
  }, [analysis?.tags]);

  const suggestions = useMemo(() => {
    if (!analysis?.suggestions) return [];
    return analysis.suggestions.filter((suggestion) => suggestion.text && suggestion.text.trim()).slice(0, 3);
  }, [analysis?.suggestions]);

  const onInsert = useCallback(
    (text: string) => {
      if (!onInsertText) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      onInsertText(trimmed);
    },
    [onInsertText]
  );

  const copyTextToClipboard = useCallback(async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_err) {
        return false;
      }
    }
    if (typeof document === "undefined") return false;
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch (_err) {
      return false;
    }
  }, []);

  const handleCopyTranslation = useCallback(async () => {
    if (!translation?.text) return;
    const ok = await copyTextToClipboard(translation.text);
    onToast?.(ok ? "Texto copiado." : "No se pudo copiar.");
  }, [copyTextToClipboard, onToast, translation?.text]);

  const translationSourceLabel = formatTranslationLang(translation?.sourceLang, "?");
  const translationTargetLabel = formatTranslationLang(
    translation?.targetLang,
    formatTranslationLang(resolvedTargetLang, "ES")
  );
  const isTranslationSourceUnknown = translationSourceLabel === "?";
  const translationBadgeTitle = `${getTranslationLanguageName(translationSourceLabel)} → ${getTranslationLanguageName(
    translationTargetLabel
  )}`;

  const handleSendTranslationToManager = useCallback(() => {
    if (!translation?.text || !onInsertManager) return;
    const original = cleanedTranscript.trim();
    if (!original) return;
    const payload = buildManagerTranslationPayload(
      translationSourceLabel,
      translationTargetLabel,
      original,
      translation.text,
      isTranslationSourceUnknown
    );
    onInsertManager(payload);
  }, [
    cleanedTranscript,
    isTranslationSourceUnknown,
    onInsertManager,
    translation?.text,
    translationSourceLabel,
    translationTargetLabel,
  ]);

  const analysisLabel = analysis ? INTENT_LABELS[analysis.intent] : null;
  const urgencyLabel = analysis ? URGENCY_LABELS[analysis.urgency] : null;
  const hasAnalysis = Boolean(analysis);
  const hasTranslation = Boolean(translation?.text);
  const isTranscribingActive = isTranscribing || normalizedStatus === "PENDING";
  const hasTranscribeFailure = !hasTranscript && normalizedStatus === "FAILED";
  const showTranscribeError = Boolean(transcribeError) || (hasTranscribeFailure && !isProviderMissing);
  const transcribeLabel =
    isTranscribingActive ? "Transcribiendo..." : showTranscribeError || hasTranscribeFailure ? "Reintentar" : "Transcribir";
  const analyzeLabel =
    status === "loading" ? "Analizando..." : status === "error" && !hasAnalysis ? "Reintentar" : "Analizar";
  const translateLabel =
    translationStatus === "loading" ? "Traduciendo..." : translationStatus === "error" ? "Reintentar" : "Traducir";
  const showManualOption = !hasTranscript;
  const summaryTags = tags.length > 0 ? tags : hasAnalysis ? ["Manual"] : [];

  if (!messageId || isFromFan === false) return null;

  return (
    <div className="mt-2 rounded-xl border border-[color:rgba(var(--brand-rgb),0.25)] bg-[color:rgba(var(--brand-rgb),0.06)] px-3 py-2 text-[11px] text-[color:var(--text)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--brand)]">
          Analisis de voz
        </div>
        {hasTranscript && (
          <div className="flex items-center gap-2">
            {!hasAnalysis && (
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  isDisabled || status === "loading"
                    ? "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                    : "border-[color:rgba(var(--brand-rgb),0.6)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.12)]"
                )}
                onClick={() => handleAnalyze("default")}
                disabled={isDisabled || status === "loading"}
              >
                <IconGlyph name="spark" size="sm" />
                <span>{analyzeLabel}</span>
              </button>
            )}
            {translateEnabled && (
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  isDisabled || !hasTranscript || translationStatus === "loading"
                    ? "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                    : "border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                )}
                onClick={handleTranslate}
                disabled={isDisabled || !hasTranscript || translationStatus === "loading"}
              >
                <IconGlyph name="globe" size="sm" />
                <span>{translateLabel}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {!hasTranscript && (
        <div className="mt-2 space-y-2 text-[10px] text-[color:var(--muted)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5">Sin transcripcion</span>
            {isTranscribingActive && <span>Transcribiendo...</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTranscribe}
              className={clsx(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                isDisabled || !onTranscribe || isTranscribingActive
                  ? "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                  : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
              )}
              disabled={isDisabled || !onTranscribe || isTranscribingActive}
            >
              {transcribeLabel}
            </button>
            <button
              type="button"
              title="Genera una transcripcion automatica (si esta configurada) y luego puedes analizarla."
              className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
              disabled={isDisabled}
            >
              Que hace esto?
            </button>
            {showManualOption && !isEditingTranscript && (
              <button
                type="button"
                onClick={() => setIsEditingTranscript(true)}
                className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                disabled={isDisabled}
              >
                Transcripcion manual
              </button>
            )}
          </div>
          {isProviderMissing && <div>Transcripcion automatica no configurada.</div>}
          {showTranscribeError && <div className="text-[color:var(--danger)]">No se pudo transcribir.</div>}
        </div>
      )}

      {isEditingTranscript && (
        <div className="mt-2 space-y-2">
          <textarea
            className="w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-[12px] text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            rows={3}
            value={transcriptDraft}
            onChange={(evt) => setTranscriptDraft(evt.target.value)}
            placeholder="Escribe la transcripcion manual..."
            disabled={isSavingTranscript}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[color:var(--muted)]">
            <span>{transcriptDraft.trim().length}/{MAX_TRANSCRIPT_LEN}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditingTranscript(false);
                  setManualError("");
                }}
                className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                disabled={isSavingTranscript}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTranscript}
                className={clsx(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                  isSavingTranscript
                    ? "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                    : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
                )}
                disabled={isSavingTranscript}
              >
                {isSavingTranscript ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
          {manualError && (
            <div className="flex items-center gap-2 text-[10px] text-[color:var(--danger)]">
              <span>{manualError}</span>
              <button
                type="button"
                onClick={handleSaveTranscript}
                className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                disabled={isSavingTranscript}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      )}

      {(hasTranscript || hasAnalysis) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[color:var(--muted)]">
          <div className="flex flex-wrap gap-2">
            {analysisLabel && (
              <span className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5">
                Intento: {analysisLabel}
              </span>
            )}
            {urgencyLabel && (
              <span className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5">
                Urgencia: {urgencyLabel}
              </span>
            )}
            {summaryTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
            {hasTranscript && (
              <button
                type="button"
                onClick={() => setTranscriptOpen((prev) => !prev)}
                className={clsx(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition",
                  transcriptOpen
                    ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                )}
              >
                {transcriptOpen ? "Ocultar texto" : "Texto"}
              </button>
            )}
          </div>
          {suggestions.length > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
              onClick={() => setShowInsights((prev) => !prev)}
            >
              <span>
                {showInsights
                  ? `Ocultar respuestas (${suggestions.length})`
                  : `Ver respuestas (${suggestions.length})`}
              </span>
              <IconGlyph
                name="chevronDown"
                size="sm"
                className={clsx("transition-transform", showInsights ? "rotate-180" : "")}
              />
            </button>
          )}
        </div>
      )}

      {hasTranscript && transcriptOpen && (
        <div className="mt-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2">
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[12px] text-[color:var(--text)]">
            {cleanedTranscript}
          </p>
          {(onCopyTranscript || onUseTranscript) && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
              {onCopyTranscript && (
                <button
                  type="button"
                  className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                  onClick={() => onCopyTranscript(cleanedTranscript)}
                >
                  Copiar texto
                </button>
              )}
              {onUseTranscript && (
                <button
                  type="button"
                  className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                  onClick={() => onUseTranscript(cleanedTranscript)}
                >
                  Usar en Manager
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {hasTranslation && (
        <div className="mt-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
            <div className="flex flex-wrap items-center gap-2">
              <span>TRADUCCIÓN</span>
              <span
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[9px] font-semibold text-[color:var(--muted)]"
                title={translationBadgeTitle}
              >
                {`DETECTADO: ${translationSourceLabel} → ${translationTargetLabel}`}
              </span>
            </div>
            <button
              type="button"
              className="text-[color:var(--muted)] hover:text-[color:var(--text)]"
              onClick={() => setTranslationOpen((prev) => !prev)}
            >
              {translationOpen ? "Ocultar" : "Ver traduccion"}
            </button>
          </div>
          <p className={clsx("text-[12px] text-[color:var(--text)]", translationOpen ? "" : "line-clamp-2")}>
            {translation?.text}
          </p>
          {translation?.text && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
              <button
                type="button"
                className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                onClick={handleCopyTranslation}
              >
                Copiar
              </button>
              {onInsertManager && (
                <button
                  type="button"
                  onClick={handleSendTranslationToManager}
                  className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                >
                  Enviar al Manager
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {translateEnabled && translationStatus === "error" && translationError && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[color:var(--danger)]">
          <span className="whitespace-pre-wrap">{translationError}</span>
          <button
            type="button"
            onClick={handleTranslate}
            className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
            disabled={isDisabled || !hasTranscript}
          >
            Reintentar
          </button>
        </div>
      )}

      {hasAnalysis && (
        <div className="mt-2 space-y-2">
          {showInsights && suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((suggestion, idx) => (
                <div
                  key={`${suggestion.label}-${idx}`}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 space-y-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                    {suggestion.label || `Sugerencia ${idx + 1}`}
                  </div>
                  <div className="text-[12px] text-[color:var(--text)]">{suggestion.text}</div>
                  {onInsertText && (
                    <button
                      type="button"
                      onClick={() => onInsert(suggestion.text)}
                      className="inline-flex items-center rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1 text-[11px] font-medium text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] transition"
                    >
                      Usar en mensaje
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {showInsights && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleAnalyze("alternate")}
                disabled={isDisabled || status === "loading"}
                className={clsx(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                  isDisabled || status === "loading"
                    ? "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                )}
              >
                Otra version
              </button>
              <button
                type="button"
                onClick={() => handleAnalyze("shorter")}
                disabled={isDisabled || status === "loading"}
                className={clsx(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                  isDisabled || status === "loading"
                    ? "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                )}
              >
                Mas corta
              </button>
            </div>
          )}
        </div>
      )}

      {status === "error" && error && hasAnalysis && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[color:var(--danger)]">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => handleAnalyze(lastVariantRef.current)}
            className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
            disabled={isDisabled}
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
