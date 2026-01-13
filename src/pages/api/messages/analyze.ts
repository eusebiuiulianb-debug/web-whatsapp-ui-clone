import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { dedupeGet, dedupeSet, hashText, rateLimitOrThrow } from "../../../lib/ai/guardrails";
import { runAiCompletion } from "../../../server/ai/aiAdapter";
import { maybeDecrypt } from "../../../server/crypto/maybeDecrypt";
import { normalizePreferredLanguage } from "../../../lib/language";
import { detectIntentWithFallback } from "../../../lib/ai/intentClassifier";
import type { IntentResult } from "../../../lib/ai/intents";
import {
  mergeVoiceInsightsJson,
  safeParseVoiceAnalysis,
  safeParseVoiceTranslation,
  type VoiceAnalysis,
} from "../../../types/voiceAnalysis";

type AnalyzeResult = {
  analysis: VoiceAnalysis;
  cacheStatus: "db" | "dedupe" | "miss";
  rateLimitRemaining?: number;
};

const inFlight = new Map<string, Promise<AnalyzeResult>>();
const DEDUPE_TTL_SEC = 30 * 60;
const FALLBACK_ANALYSIS_JSON =
  '{"intent":"other","confidence":0.1,"urgency":"low","tags":["manual"],"summary":"No disponible","suggestions":[{"label":"principal","text":"Lo siento, ahora no puedo analizar."},{"label":"alternativa","text":"Lo reviso en un momento."},{"label":"corta","text":"Ahora no puedo."}]}';

const INTENT_VALUES = [
  "extra",
  "purchase",
  "question",
  "complaint",
  "logistics",
  "flirt",
  "boundaries",
  "other",
] as const;
const URGENCY_VALUES = ["low", "medium", "high"] as const;

type AnalyzeRequest = {
  messageId?: string;
  variant?: "default" | "shorter" | "alternate";
  tone?: "suave" | "intimo" | "picante";
  text?: string;
  lang?: string;
  contextMessages?: string[];
  includeIntent?: boolean;
};

type AnalyzeResponse =
  | { ok: true; analysis?: VoiceAnalysis; cached?: boolean; intent?: IntentResult }
  | { ok: false; error: string; reason?: string; retryAfterSec?: number };

export default async function handler(req: NextApiRequest, res: NextApiResponse<AnalyzeResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const { messageId, variant, tone, text, lang, contextMessages, includeIntent } = (req.body || {}) as AnalyzeRequest;
  const normalizedId = typeof messageId === "string" ? messageId.trim() : "";

  if (includeIntent) {
    const intent = await detectIntentForAnalyze({
      messageId: normalizedId || null,
      text: typeof text === "string" ? text : null,
      lang,
      contextMessages,
    });
    if (!intent) {
      return res.status(400).json({ ok: false, error: "text is required" });
    }
    return res.status(200).json({ ok: true, intent });
  }

  if (!normalizedId) {
    return res.status(400).json({ ok: false, error: "messageId is required" });
  }

  const mode = variant === "shorter" || variant === "alternate" ? variant : "default";
  const key = `${normalizedId}:${mode}`;
  const existingPromise = inFlight.get(key);
  if (existingPromise) {
    try {
      const result = await existingPromise;
      applyCacheHeaders(res, result);
      return res.status(200).json({
        ok: true,
        analysis: result.analysis,
        cached: result.cacheStatus !== "miss",
      });
    } catch (err) {
      inFlight.delete(key);
      if (isRateLimitError(err)) {
        const retryAfterSec = err.retryAfterSec ?? 60;
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({ ok: false, error: "RATE_LIMITED", retryAfterSec });
      }
      return res.status(500).json({ ok: false, error: "No se pudo analizar la nota de voz" });
    }
  }

  const analysisPromise = analyzeVoiceMessage({ messageId: normalizedId, variant: mode, tone });
  inFlight.set(key, analysisPromise);

  try {
    const result = await analysisPromise;
    applyCacheHeaders(res, result);
    return res.status(200).json({
      ok: true,
      analysis: result.analysis,
      cached: result.cacheStatus !== "miss",
    });
  } catch (err) {
    if (isRateLimitError(err)) {
      const retryAfterSec = err.retryAfterSec ?? 60;
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ ok: false, error: "RATE_LIMITED", retryAfterSec });
    }
    const safeMessage = err instanceof VoiceAnalysisError ? err.message : "No se pudo analizar la nota de voz";
    const status = err instanceof VoiceAnalysisError ? err.status : 500;
    if (err instanceof VoiceAnalysisError && err.reason === "missing_transcript") {
      return res.status(status).json({ ok: false, error: safeMessage, reason: err.reason });
    }
    return res.status(status).json({ ok: false, error: safeMessage });
  } finally {
    inFlight.delete(key);
  }
}

async function detectIntentForAnalyze(params: {
  messageId: string | null;
  text: string | null;
  lang?: string;
  contextMessages?: string[];
}): Promise<IntentResult | null> {
  let baseText = typeof params.text === "string" ? params.text.trim() : "";
  let creatorId: string | null = null;
  let fanId: string | null = null;
  let inferredLang = normalizePreferredLanguage(params.lang ?? null) ?? null;

  if (!baseText && params.messageId) {
    const message = await prisma.message.findUnique({
      where: { id: params.messageId },
      select: {
        text: true,
        transcriptText: true,
        transcriptStatus: true,
        fanId: true,
        fan: { select: { preferredLanguage: true, creatorId: true } },
      },
    });
    if (!message) return null;
    baseText =
      typeof message.text === "string" && message.text.trim()
        ? message.text
        : message.transcriptStatus === "DONE" && typeof message.transcriptText === "string"
        ? message.transcriptText
        : "";
    inferredLang = inferredLang ?? normalizePreferredLanguage(message.fan?.preferredLanguage);
    creatorId = message.fan?.creatorId ?? null;
    fanId = message.fanId ?? null;
  }

  if (!baseText.trim()) return null;
  const context =
    Array.isArray(params.contextMessages) && params.contextMessages.length
      ? params.contextMessages.filter((entry) => typeof entry === "string" && entry.trim())
      : [];
  const lang = inferredLang ?? "es";
  return detectIntentWithFallback({
    text: baseText,
    lang,
    context,
    creatorId: creatorId ?? undefined,
    fanId: fanId ?? undefined,
  });
}

class VoiceAnalysisError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status = 500, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function analyzeVoiceMessage(params: {
  messageId: string;
  variant: "default" | "shorter" | "alternate";
  tone?: AnalyzeRequest["tone"];
}): Promise<AnalyzeResult> {
  const message = await prisma.message.findUnique({
    where: { id: params.messageId },
    select: {
      id: true,
      fanId: true,
      from: true,
      type: true,
      transcriptText: true,
      transcriptStatus: true,
      voiceAnalysisJson: true,
      voiceAnalysisUpdatedAt: true,
      fan: { select: { creatorId: true, displayName: true, name: true } },
    },
  });

  if (!message) {
    throw new VoiceAnalysisError("Mensaje no encontrado", 404);
  }
  const messageFrom = typeof message.from === "string" ? message.from.toLowerCase() : "";
  if (message.type !== "VOICE" || messageFrom !== "fan") {
    throw new VoiceAnalysisError("Sin permisos para analizar este mensaje", 403);
  }

  const transcriptText = typeof message.transcriptText === "string" ? message.transcriptText.trim() : "";
  if (!transcriptText || message.transcriptStatus !== "DONE") {
    throw new VoiceAnalysisError("Necesita transcripcion", 409, "missing_transcript");
  }

  const creatorId = await resolveCreatorId();
  if (message.fan.creatorId !== creatorId) {
    throw new VoiceAnalysisError("Sin permisos para analizar este mensaje", 403);
  }

  const existing = safeParseVoiceAnalysis(message.voiceAnalysisJson);
  const existingTranslation = safeParseVoiceTranslation(message.voiceAnalysisJson);
  if (params.variant === "default" && existing) {
    return { analysis: existing, cacheStatus: "db" };
  }

  const toneLabel = formatToneLabel(params.tone);
  const baseAnalysis = params.variant !== "default" ? existing : null;

  const sourceHash = hashText(transcriptText);
  const dedupeKey = `ai:voice_insights:${creatorId}:${message.id}:${params.variant}:${sourceHash}`;
  const deduped = await dedupeGet<VoiceAnalysis>(dedupeKey);
  if (deduped) {
    return { analysis: deduped, cacheStatus: "dedupe" };
  }

  const rateLimit = await rateLimitOrThrow({ creatorId, action: "voice_insights" });

  const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId, label: "OPENAI_API_KEY" });
  const aiResult = await runAiCompletion({
    apiKey,
    creatorId,
    fanId: message.fanId,
    temperature: 0.35,
    route: "voice_analysis",
    fallbackMessage: FALLBACK_ANALYSIS_JSON,
    messages: buildAnalysisMessages({
      transcriptText,
      toneLabel,
      variant: params.variant,
      baseAnalysis,
      fanName: message.fan.displayName || message.fan.name || "Fan",
    }),
  });

  if (aiResult.needsConfig) {
    throw new VoiceAnalysisError("AI no configurada", 500);
  }

  const parsed = parseVoiceAnalysis(aiResult.text ?? "");
  if (!parsed) {
    console.error("voice-analysis parse error", { messageId: params.messageId, output: aiResult.text });
    throw new VoiceAnalysisError("No se pudo analizar la nota de voz", 500);
  }

  const now = new Date();
  const normalized = normalizeVoiceAnalysis(parsed, now.toISOString());
  const merged = baseAnalysis
    ? {
        ...baseAnalysis,
        suggestions: normalized.suggestions,
        followUpQuestion: normalized.followUpQuestion,
        updatedAt: normalized.updatedAt,
      }
    : normalized;
  const persisted = mergeVoiceInsightsJson(message.voiceAnalysisJson, {
    analysis: merged,
    translation: existingTranslation,
  });

  await prisma.message.update({
    where: { id: message.id },
    data: {
      voiceAnalysisJson: persisted,
      voiceAnalysisUpdatedAt: now,
    },
  });

  await dedupeSet(dedupeKey, merged, DEDUPE_TTL_SEC);

  return { analysis: merged, cacheStatus: "miss", rateLimitRemaining: rateLimit.remaining };
}

function buildAnalysisMessages(params: {
  transcriptText: string;
  toneLabel: string;
  variant: "default" | "shorter" | "alternate";
  baseAnalysis: VoiceAnalysis | null;
  fanName: string;
}) {
  const system = [
    "Eres un asistente para creadores. Analiza una transcripcion de nota de voz.",
    "Responde SOLO JSON estricto sin texto adicional.",
    "No generes contenido explicito; manten un tono sugerente y soft.",
  ].join(" ");

  const schema = `Formato JSON requerido:\n{
  "intent": "extra|purchase|question|complaint|logistics|flirt|boundaries|other",
  "confidence": 0.0,
  "urgency": "low|medium|high",
  "tags": ["..."],
  "summary": "1-2 lineas",
  "suggestions": [
     {"label":"principal","text":"..."},
     {"label":"alternativa","text":"..."},
     {"label":"corta","text":"..."}
  ],
  "followUpQuestion": "una pregunta corta opcional"
}`;

  const intentList = INTENT_VALUES.join(", ");
  const urgencyList = URGENCY_VALUES.join(", ");
  const baseGuide = params.baseAnalysis
    ? `Analisis existente: ${JSON.stringify(params.baseAnalysis)}\n\nManten intent, tags, urgency y summary. Solo cambia suggestions y, si procede, followUpQuestion.`
    : "";
  const variantHint =
    params.variant === "shorter"
      ? "Las sugerencias deben ser mas cortas que las anteriores."
      : params.variant === "alternate"
      ? "Las sugerencias deben ser variantes distintas (mismo tono e intencion)."
      : "";

  const user = [
    `Fan: ${params.fanName}.`,
    `Tono deseado: ${params.toneLabel}.`,
    "No seas explicito, evita lenguaje sexual grafico.",
    `Intents posibles: ${intentList}. Urgencia: ${urgencyList}.`,
    variantHint,
    baseGuide,
    "Transcripcion:",
    `"""${params.transcriptText}"""`,
    schema,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

function normalizeVoiceAnalysis(input: VoiceAnalysis, updatedAt: string): VoiceAnalysis {
  const intent = INTENT_VALUES.includes(input.intent) ? input.intent : "other";
  const urgency = URGENCY_VALUES.includes(input.urgency) ? input.urgency : "low";
  const confidence = clampNumber(input.confidence, 0, 1);
  const tags = Array.isArray(input.tags)
    ? Array.from(new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 7)
    : [];
  const summary = String(input.summary || "").trim();
  const suggestions = Array.isArray(input.suggestions)
    ? input.suggestions
        .map((suggestion) => ({
          label: String(suggestion?.label || "").trim() || "Sugerencia",
          text: String(suggestion?.text || "").trim(),
        }))
        .filter((suggestion) => suggestion.text.length > 0)
        .slice(0, 3)
    : [];
  const followUpQuestion = typeof input.followUpQuestion === "string" ? input.followUpQuestion.trim() : "";
  return {
    intent,
    urgency,
    confidence,
    tags,
    summary,
    suggestions,
    followUpQuestion: followUpQuestion || undefined,
    updatedAt,
  };
}

function parseVoiceAnalysis(raw?: string | null): VoiceAnalysis | null {
  return safeParseVoiceAnalysis(raw);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatToneLabel(tone?: "suave" | "intimo" | "picante") {
  switch (tone) {
    case "suave":
      return "suave, respetuoso y calido";
    case "picante":
      return "picante pero sutil, sugerente sin ser explicito";
    case "intimo":
      return "intimo, cercano y empatico";
    default:
      return "equilibrado, cercano y respetuoso";
  }
}

function applyCacheHeaders(res: NextApiResponse, result: AnalyzeResult) {
  res.setHeader("x-cache", result.cacheStatus);
  if (typeof result.rateLimitRemaining === "number") {
    res.setHeader("x-ratelimit-remaining", String(result.rateLimitRemaining));
  }
}

function resolveViewerRole(req: NextApiRequest): "creator" | "fan" {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

function isRateLimitError(err: unknown): err is { status?: number; retryAfterSec?: number } {
  if (!err || typeof err !== "object") return false;
  return "status" in err && (err as { status?: number }).status === 429;
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new VoiceAnalysisError("No hay creador", 500);
  }

  return creator.id;
}
