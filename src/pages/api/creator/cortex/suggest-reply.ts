import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "../../../../lib/prisma.server";
import { createDefaultCreatorPlatforms } from "../../../../lib/creatorPlatforms";
import { getEffectiveTranslateConfig } from "../../../../lib/ai/translateProvider";
import { normalizePreferredLanguage } from "../../../../lib/language";
import { sanitizeAiDraftText } from "../../../../lib/text/sanitizeAiDraft";
import {
  getCortexProviderSelection,
  requestCortexCompletion,
  type CortexChatMessage,
  type CortexSuggestContext,
} from "../../../../lib/ai/cortexProvider";
import { logCortexLlmUsage } from "../../../../lib/aiUsage.server";
import { evaluateAdultPolicy } from "../../../../server/ai/adultPolicy";
import { buildErrorSnippet, resolveProviderErrorType } from "../../../../server/ai/cortexErrors";

type SuggestMode = "reply" | "sales" | "clarify";

type SuggestReplyResponse = {
  message: string;
  language: string;
  intent: string;
  follow_up_questions: string[];
};

type SuggestReplyErrorResponse = {
  ok: false;
  error:
    | "CORTEX_NOT_CONFIGURED"
    | "CORTEX_FAILED"
    | "POLICY_BLOCKED"
    | "MODEL_NOT_FOUND"
    | "TIMEOUT"
    | "PROVIDER_ERROR"
    | "JSON_PARSE";
  message: string;
};

type ErrorResponse = { error: string; details?: string; code?: string };

const requestSchema = z.object({
  creatorId: z.string().min(1),
  fanId: z.string().optional(),
  chatId: z.string().optional(),
  mode: z.enum(["reply", "sales", "clarify"]).optional(),
  context: z
    .object({
      original: z.string().optional(),
      translation: z.string().optional(),
      detected: z
        .object({
          src: z.string().optional(),
          tgt: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const responseSchema = z.object({
  message: z.string().min(1),
  language: z.string().min(1),
  intent: z.string().min(1),
  follow_up_questions: z.array(z.string()).default([]),
});

const HISTORY_LIMIT = 40;
const MAX_MESSAGE_CHARS = 700;
const DEFAULT_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_MESSAGES = 40;
const CORTEX_USAGE_KIND = "cortex_suggest_reply";

const MODE_LABELS: Record<SuggestMode, string> = {
  reply: "Responder al fan de forma clara y natural.",
  sales: "Responder con enfoque ventas/upsell suave y CTA.",
  clarify: "Responder pidiendo aclaraciones concretas (1-3 preguntas).",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuggestReplyResponse | SuggestReplyErrorResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", details: "Use POST" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ error: "Forbidden", details: "Creator access required." });
  }

  const messageId = normalizeOptional(req.body?.messageId);
  if (messageId) {
    return handleMessageSuggestReply(req, res, messageId);
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
      .join("; ");
    return res.status(400).json({ error: "Invalid payload", details });
  }

  const creatorId = parsed.data.creatorId.trim();
  if (!creatorId) {
    return res.status(400).json({ error: "creatorId is required", details: "creatorId must be a non-empty string." });
  }

  const fanIdRaw = normalizeOptional(parsed.data.fanId);
  const chatIdRaw = normalizeOptional(parsed.data.chatId);
  const mode: SuggestMode = parsed.data.mode ?? "reply";
  const context = normalizeContext(parsed.data.context);
  const targetFanId = chatIdRaw ?? fanIdRaw ?? null;

  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true } });
  if (!creator) {
    return res.status(404).json({ error: "Creator not found", details: `creatorId=${creatorId}` });
  }

  let fanName: string | null = null;
  let fanPreferredLanguage: string | null = null;
  let fanLocale: string | null = null;
  if (targetFanId) {
    const fan = await prisma.fan.findUnique({
      where: { id: targetFanId },
      select: { id: true, creatorId: true, displayName: true, name: true, preferredLanguage: true, locale: true },
    });
    if (!fan || fan.creatorId !== creatorId) {
      return res.status(404).json({ error: "Fan not found", details: `fanId=${targetFanId}` });
    }
    fanName = fan.displayName ?? fan.name ?? null;
    fanPreferredLanguage = fan.preferredLanguage ?? null;
    fanLocale = fan.locale ?? null;
  }

  const settings =
    (await prisma.creatorAiSettings.findUnique({ where: { creatorId } })) ??
    (await prisma.creatorAiSettings.create({
      data: { creatorId, platforms: createDefaultCreatorPlatforms() },
    }));

  const translateConfig = await getEffectiveTranslateConfig(creatorId);
  const creatorLang = normalizeTargetLang(translateConfig.creatorLang ?? "es") ?? "es";
  const fanLanguage = resolveFanLanguage({
    preferredLanguage: fanPreferredLanguage,
    locale: fanLocale,
    detectedSource: context?.detected?.src ?? null,
    detectedTarget: context?.detected?.tgt ?? null,
    fallback: creatorLang,
  });

  const history = targetFanId ? await loadRecentMessages(targetFanId) : [];
  const allowExplicitAdultContent = Boolean(settings.allowExplicitAdultContent);
  const policyDecision = evaluateAdultPolicy({
    text: [context?.original, context?.translation].filter(Boolean).join("\n"),
    messages: history.map((item) => ({ content: item.text })),
    allowExplicitAdultContent,
  });
  if (!policyDecision.allowed) {
    const errorMessage = "No permitido: menores o no consentimiento.";
    try {
      await logCortexLlmUsage({
        creatorId,
        fanId: targetFanId,
        endpoint: "/api/creator/cortex/suggest-reply",
        provider: "policy",
        model: null,
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        ok: false,
        errorCode: "POLICY_BLOCKED",
        actionType: CORTEX_USAGE_KIND,
        context: {
          kind: CORTEX_USAGE_KIND,
          mode,
          policy: policyDecision.code,
        },
      });
    } catch (err) {
      console.warn("cortex_usage_log_failed", err);
    }
    return res.status(403).json({ error: errorMessage, code: "POLICY_BLOCKED", details: policyDecision.reason });
  }
  const systemPrompt = buildSystemPrompt({ creatorLang, mode, settings, fanLanguage });
  const userPrompt = buildUserPrompt({
    mode,
    creatorLang,
    fanLanguage,
    fanName,
    history,
    context,
  });

  const llmResult = await requestCortexCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    creatorId,
    fanId: targetFanId,
    route: "/api/creator/cortex/suggest-reply",
    mockContext: context ?? null,
    mockMode: mode,
  });

  let status = 200;
  let responseBody: SuggestReplyResponse | ErrorResponse | null = null;
  let errorCode: string | null = null;
  let parseErrorSnippet: string | null = null;

  if (!llmResult.ok || !llmResult.text) {
    status = 500;
    const providerErrorType = resolveProviderErrorType({
      errorCode: llmResult.errorCode,
      errorMessage: llmResult.errorMessage,
      status: llmResult.status,
    });
    errorCode = providerErrorType;
    const errorLabel = buildProviderErrorMessage(providerErrorType, llmResult.provider, llmResult.model);
    responseBody = {
      error: errorLabel,
      code: errorCode,
      details: formatDetails([
        llmResult.provider ? `provider=${llmResult.provider}` : null,
        llmResult.status ? `status=${llmResult.status}` : null,
        errorCode ? `code=${errorCode}` : null,
        llmResult.errorMessage ? `message=${llmResult.errorMessage}` : null,
      ]),
    };
    parseErrorSnippet = buildErrorSnippet(llmResult.errorMessage ?? "");
  } else {
    const fallbackMessage = sanitizeAiDraftText(llmResult.text.trim());
    const parsedResult = safeJsonParse(llmResult.text);
    const validated = responseSchema.safeParse(parsedResult.value);
    if (!validated.success) {
      const fallbackText = sanitizeAiDraftText(resolveFallbackText(parsedResult.value, llmResult.text) || fallbackMessage);
      if (!fallbackText) {
        status = 500;
        errorCode = "JSON_PARSE";
        responseBody = {
          error: "La IA respondió pero no en formato esperado (JSON).",
          code: errorCode,
          details: formatDetails([`code=${errorCode}`]),
        };
      } else {
        responseBody = {
          message: fallbackText.trim(),
          language: fanLanguage,
          intent: "reply",
          follow_up_questions: [],
        };
        errorCode = "JSON_PARSE";
        parseErrorSnippet = buildErrorSnippet(llmResult.text);
      }
    } else {
      responseBody = {
        message: sanitizeAiDraftText(validated.data.message).trim(),
        language: fanLanguage,
        intent: validated.data.intent.trim(),
        follow_up_questions: validated.data.follow_up_questions.filter((q) => q && q.trim()),
      };
    }
    if (!errorCode && parsedResult.parsedFrom !== "direct") {
      errorCode = "JSON_PARSE";
      parseErrorSnippet = buildErrorSnippet(llmResult.text);
    }
  }

  try {
    await logCortexLlmUsage({
      creatorId,
      fanId: targetFanId,
      endpoint: "/api/creator/cortex/suggest-reply",
      provider: llmResult.provider,
      model: llmResult.model,
      tokensIn: llmResult.tokensIn,
      tokensOut: llmResult.tokensOut,
      latencyMs: llmResult.latencyMs,
      ok: status === 200,
      errorCode,
      actionType: CORTEX_USAGE_KIND,
      context: {
        kind: CORTEX_USAGE_KIND,
        mode,
        fanLanguage,
        errorSnippet: parseErrorSnippet ?? undefined,
      },
    });
  } catch (err) {
    console.warn("cortex_usage_log_failed", err);
  }

  if (!responseBody) {
    return res.status(500).json({ error: "No se pudo generar la sugerencia.", details: "response_body_missing" });
  }

  return res.status(status).json(responseBody);
}

async function handleMessageSuggestReply(
  req: NextApiRequest,
  res: NextApiResponse<SuggestReplyResponse | SuggestReplyErrorResponse>,
  messageId: string
): Promise<void> {
  const maxContextMessages = normalizeMaxContextMessages(req.body?.maxContextMessages);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      fanId: true,
      from: true,
      text: true,
      type: true,
      transcriptText: true,
      transcriptStatus: true,
      creatorTranslatedText: true,
      fan: { select: { id: true, creatorId: true, preferredLanguage: true } },
    },
  });

  if (!message) {
    res.status(404).json({ ok: false, error: "CORTEX_FAILED", message: "Mensaje no encontrado." });
    return;
  }

  const creatorId = await resolveCreatorId();
  if (message.fan.creatorId !== creatorId) {
    res.status(403).json({ ok: false, error: "CORTEX_FAILED", message: "Forbidden." });
    return;
  }

  const translateConfig = await getEffectiveTranslateConfig(creatorId);
  const creatorLang = normalizeTargetLang(translateConfig.creatorLang ?? "es") ?? "es";
  const resolvedTargetLang = creatorLang;

  const creatorSettings =
    (await prisma.creatorAiSettings.findUnique({ where: { creatorId } })) ??
    (await prisma.creatorAiSettings.create({
      data: { creatorId, platforms: createDefaultCreatorPlatforms() },
    }));
  const allowExplicitAdultContent = Boolean(creatorSettings.allowExplicitAdultContent);

  const selectedMessageText = resolveCortexMessageContent(message) ?? "";
  const selectedMessageForPrompt =
    message.from === "fan" && typeof message.creatorTranslatedText === "string" && message.creatorTranslatedText.trim()
      ? message.creatorTranslatedText
      : selectedMessageText;
  const contextMessages = await loadContextMessages(message.fanId, maxContextMessages);
  const systemPrompt = buildCortexSuggestSystemPrompt(resolvedTargetLang, allowExplicitAdultContent);
  const userPrompt = buildCortexSuggestUserPrompt(selectedMessageForPrompt);
  const selection = await getCortexProviderSelection({ creatorId });
  const policyDecision = evaluateAdultPolicy({
    text: selectedMessageText,
    messages: contextMessages,
    allowExplicitAdultContent,
  });

  let status = 200;
  let responseBody: SuggestReplyResponse | SuggestReplyErrorResponse | null = null;
  let llmResult: Awaited<ReturnType<typeof requestCortexCompletion>> | null = null;
  let errorCode: SuggestReplyErrorResponse["error"] | null = null;
  let errorMessage: string | null = null;
  let parseErrorSnippet: string | null = null;

  if (!policyDecision.allowed) {
    status = 403;
    errorCode = "POLICY_BLOCKED";
    errorMessage = "No permitido: menores o no consentimiento.";
    responseBody = { ok: false, error: errorCode, message: errorMessage };
  } else if (!selection.configured || selection.provider === "demo") {
    status = 501;
    errorCode = "CORTEX_NOT_CONFIGURED";
    errorMessage =
      selection.missingVars.length > 0
        ? `Cortex no está configurado. Faltan: ${selection.missingVars.join(", ")}.`
        : "Cortex no está configurado.";
    responseBody = { ok: false, error: errorCode, message: errorMessage };
  } else {
    llmResult = await requestCortexCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        ...contextMessages,
        { role: "user", content: userPrompt },
      ],
      creatorId,
      fanId: message.fanId,
      route: "/api/creator/cortex/suggest-reply",
      selection,
    });

    if (!llmResult.ok || !llmResult.text) {
      status = 502;
      const providerErrorType = resolveProviderErrorType({
        errorCode: llmResult.errorCode,
        errorMessage: llmResult.errorMessage,
        status: llmResult.status,
      });
      errorCode = providerErrorType;
      errorMessage = buildProviderErrorMessage(providerErrorType, selection.desiredProvider, selection.model);
      responseBody = { ok: false, error: errorCode, message: errorMessage };
      parseErrorSnippet = buildErrorSnippet(llmResult.errorMessage ?? "");
    } else {
      const fallbackMessage = sanitizeAiDraftText(llmResult.text.trim());
      const fallbackResponse: SuggestReplyResponse = {
        message: fallbackMessage,
        language: resolvedTargetLang,
        intent: "reply",
        follow_up_questions: [],
      };
      const parsedResult = safeJsonParse(llmResult.text);
      const validated = responseSchema.safeParse(parsedResult.value);
      if (!validated.success) {
        const fallbackText = sanitizeAiDraftText(resolveFallbackText(parsedResult.value, llmResult.text) || fallbackMessage);
        if (!fallbackText) {
          status = 500;
          errorCode = "JSON_PARSE";
          errorMessage = "La IA respondió pero no en formato esperado (JSON).";
          responseBody = { ok: false, error: errorCode, message: errorMessage };
        } else {
          responseBody = {
            message: fallbackText.trim(),
            language: resolvedTargetLang,
            intent: "reply",
            follow_up_questions: [],
          };
          errorCode = "JSON_PARSE";
          parseErrorSnippet = buildErrorSnippet(llmResult.text);
        }
      } else {
        const messageText = sanitizeAiDraftText(normalizeOptional(validated.data.message) ?? fallbackMessage);
        responseBody = {
          message: messageText,
          language: resolvedTargetLang,
          intent: normalizeOptional(validated.data.intent) ?? "reply",
          follow_up_questions: validated.data.follow_up_questions.filter((q) => q && q.trim()),
        };
      }
      if (!errorCode && parsedResult.parsedFrom !== "direct") {
        errorCode = "JSON_PARSE";
        parseErrorSnippet = buildErrorSnippet(llmResult.text);
      }
    }
  }

  try {
    await logCortexLlmUsage({
      creatorId,
      fanId: message.fanId,
      endpoint: "/api/creator/cortex/suggest-reply",
      provider: llmResult?.provider ?? selection.desiredProvider,
      model: llmResult?.model ?? selection.model,
      tokensIn: llmResult?.tokensIn,
      tokensOut: llmResult?.tokensOut,
      latencyMs: llmResult?.latencyMs,
      ok: status === 200,
      errorCode,
      actionType: CORTEX_USAGE_KIND,
      context: {
        kind: CORTEX_USAGE_KIND,
        messageId: message.id,
        targetLang: resolvedTargetLang,
        maxContextMessages,
        errorMessage: errorMessage ?? undefined,
        errorSnippet: parseErrorSnippet ?? undefined,
      },
    });
  } catch (err) {
    console.warn("cortex_usage_log_failed", err);
  }

  if (!responseBody) {
    res.status(500).json({
      ok: false,
      error: "CORTEX_FAILED",
      message: "No se pudo generar la sugerencia.",
    });
    return;
  }

  res.status(status).json(responseBody);
}

function normalizeOptional(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeMaxContextMessages(value?: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(Math.floor(value), MAX_CONTEXT_MESSAGES));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(Math.floor(parsed), MAX_CONTEXT_MESSAGES));
    }
  }
  return DEFAULT_CONTEXT_MESSAGES;
}

function resolveFanLanguage(params: {
  preferredLanguage?: string | null;
  locale?: string | null;
  detectedSource?: string | null;
  detectedTarget?: string | null;
  fallback?: string | null;
}): string {
  const preferred = normalizeFanLanguage(params.preferredLanguage);
  if (preferred) return preferred;
  const locale = normalizeFanLanguage(params.locale);
  if (locale) return locale;
  const detected =
    normalizeFanLanguage(params.detectedSource) ?? normalizeFanLanguage(params.detectedTarget);
  if (detected) return detected;
  const fallback = normalizeFanLanguage(params.fallback);
  if (fallback) return fallback;
  return "es";
}

function normalizeFanLanguage(value?: string | null): string | null {
  const normalized = normalizeTargetLang(value);
  if (!normalized) return null;
  const base = normalized.split("-")[0] || normalized;
  const clean = base.toLowerCase();
  if (!clean || clean === "auto" || clean === "un" || clean === "?") return null;
  return normalizePreferredLanguage(clean) ?? clean;
}

function normalizeTargetLang(value?: string | null) {
  const trimmed = normalizeOptional(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/_/g, "-").trim();
  if (!normalized) return null;
  const base = normalized.split("-")[0] || normalized;
  if (base.length === 2) return base.toLowerCase();
  return normalized;
}

function isVoiceMessageType(type?: string | null) {
  const normalized = (type ?? "").trim().toUpperCase();
  return normalized === "VOICE" || normalized === "AUDIO";
}

function resolveCortexMessageContent(message: {
  text?: string | null;
  type?: string | null;
  transcriptText?: string | null;
  transcriptStatus?: string | null;
}) {
  if (isVoiceMessageType(message.type)) {
    const status = (message.transcriptStatus ?? "").toUpperCase();
    if (status === "DONE") {
      return normalizeOptional(message.transcriptText) ?? normalizeOptional(message.text) ?? "[voice]";
    }
    return normalizeOptional(message.text) ?? "[voice]";
  }
  return normalizeOptional(message.text);
}

async function loadContextMessages(fanId: string, limit: number): Promise<CortexChatMessage[]> {
  const messages = await prisma.message.findMany({
    where: {
      fanId,
      audience: { in: ["FAN", "CREATOR"] },
    },
    orderBy: { id: "desc" },
    take: limit,
    select: {
      from: true,
      text: true,
      type: true,
      transcriptText: true,
      transcriptStatus: true,
      creatorTranslatedText: true,
    },
  });

  const mapped = messages
    .map((msg) => {
      const content = resolveCortexMessageContent(msg);
      if (!content) return null;
      const creatorViewText =
        msg.from === "fan" && typeof msg.creatorTranslatedText === "string" && msg.creatorTranslatedText.trim()
          ? msg.creatorTranslatedText
          : content;
      return {
        role: msg.from === "creator" ? "assistant" : "user",
        content: truncate(creatorViewText, MAX_MESSAGE_CHARS),
      };
    })
    .filter((msg): msg is CortexChatMessage => Boolean(msg && msg.content))
    .reverse();

  return mapped.slice(-limit);
}

function buildCortexSuggestSystemPrompt(targetLang: string, allowExplicitAdultContent: boolean) {
  const explicitRule = allowExplicitAdultContent
    ? "Se permite lenguaje sexual explícito entre adultos con consentimiento."
    : "Evita contenido sexual explícito; mantén tono sugerente y consensuado.";
  return [
    `Responde SIEMPRE en ${targetLang}. Natural, corto, tono humano. No digas que eres IA.`,
    "No incluyas traducciones, notas de idioma ni versiones bilingües.",
    `El campo "message" debe ser SOLO el mensaje final en ${targetLang}, sin etiquetas ni explicaciones.`,
    explicitRule,
    "Devuelve SOLO un JSON válido (un único objeto). No agregues texto fuera del JSON.",
    'Formato estricto: {"message":string,"language":string,"intent":string,"follow_up_questions":string[]}',
    `language debe ser ${targetLang} (ISO 639-1 si es posible; si no, repite ${targetLang}).`,
  ].join("\n");
}

function buildCortexSuggestUserPrompt(selectedMessageText: string) {
  const messageText = selectedMessageText.trim() ? selectedMessageText.trim() : "[sin texto]";
  return `Mensaje seleccionado:\n${messageText}\n\nResponde con una sugerencia breve al fan.`;
}

function normalizeContext(raw?: CortexSuggestContext | null): CortexSuggestContext | null {
  if (!raw) return null;
  const original = normalizeOptional(raw.original);
  const translation = normalizeOptional(raw.translation);
  const src = normalizeOptional(raw.detected?.src ?? null);
  const tgt = normalizeOptional(raw.detected?.tgt ?? null);
  const hasDetected = Boolean(src || tgt);
  if (!original && !translation && !hasDetected) return null;
  return {
    original: original ?? undefined,
    translation: translation ?? undefined,
    detected: hasDetected ? { src: src ?? undefined, tgt: tgt ?? undefined } : undefined,
  };
}

async function loadRecentMessages(fanId: string) {
  const messages = await prisma.message.findMany({
    where: {
      OR: [{ fanId }, { id: { startsWith: `${fanId}-` } }],
      audience: { in: ["FAN", "CREATOR"] },
    },
    orderBy: { id: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      from: true,
      text: true,
      type: true,
      transcriptText: true,
      creatorTranslatedText: true,
      deliveredText: true,
      time: true,
    },
  });

  return messages
    .map((msg) => {
      const baseText = resolveMessageText(msg);
      if (!baseText) return null;
      const translation = normalizeOptional(msg.creatorTranslatedText) ?? null;
      const delivered = normalizeOptional(msg.deliveredText) ?? null;
      let content = baseText;
      if (msg.from === "fan" && translation) {
        content = translation !== baseText ? `${translation} (original: ${baseText})` : translation;
      }
      if (msg.from === "creator" && delivered && delivered !== baseText) {
        content = `${content} (enviado: ${delivered})`;
      }
      return {
        role: msg.from === "creator" ? "CREATOR" : "FAN",
        text: truncate(content, MAX_MESSAGE_CHARS),
      };
    })
    .filter((msg): msg is { role: string; text: string } => Boolean(msg && msg.text))
    .reverse();
}

function resolveMessageText(message: {
  text?: string | null;
  type?: string | null;
  transcriptText?: string | null;
}) {
  if ((message.type || "").toUpperCase() === "VOICE") {
    return normalizeOptional(message.transcriptText) ?? normalizeOptional(message.text);
  }
  return normalizeOptional(message.text);
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function buildSystemPrompt(args: {
  creatorLang: string;
  fanLanguage: string;
  mode: SuggestMode;
  settings: {
    tone?: string | null;
    spicinessLevel?: number | null;
    formalityLevel?: number | null;
    emojiUsage?: number | null;
    forbiddenTopics?: string | null;
    forbiddenPromises?: string | null;
    rulesManifest?: string | null;
    turnMode?: string | null;
    allowExplicitAdultContent?: boolean | null;
  };
}) {
  const tone = args.settings.tone ?? "cercano";
  const spiciness = Number.isFinite(args.settings.spicinessLevel) ? args.settings.spicinessLevel : 1;
  const formality = Number.isFinite(args.settings.formalityLevel) ? args.settings.formalityLevel : 1;
  const emojiUsage = Number.isFinite(args.settings.emojiUsage) ? args.settings.emojiUsage : 1;
  const rules = normalizeOptional(args.settings.rulesManifest) ?? "";
  const forbiddenTopics = normalizeOptional(args.settings.forbiddenTopics) ?? "";
  const forbiddenPromises = normalizeOptional(args.settings.forbiddenPromises) ?? "";
  const allowExplicitAdultContent = Boolean(args.settings.allowExplicitAdultContent);
  const explicitRule = allowExplicitAdultContent
    ? "Se permite lenguaje sexual explícito entre adultos con consentimiento."
    : "Evita contenido sexual explícito; mantén tono sugerente y consensuado.";

  return [
    "Eres el Manager IA de NOVSY. Respondes con una sugerencia para escribir al fan.",
    "Devuelve SIEMPRE un JSON válido (un único objeto). No agregues texto fuera del JSON.",
    `Idioma objetivo del creador: ${args.creatorLang}. Responde SOLO en ${args.creatorLang}.`,
    `Idioma del fan: ${args.fanLanguage}. La traducción al fan se hace al enviar; no respondas en ${args.fanLanguage}.`,
    `Modo solicitado: ${args.mode}.`,
    `Tono base: ${tone}. Picante ${spiciness}/3. Formalidad ${formality}/3. Emojis ${emojiUsage}/3.`,
    explicitRule,
    forbiddenTopics ? `Temas prohibidos: ${forbiddenTopics}.` : null,
    forbiddenPromises ? `Promesas prohibidas: ${forbiddenPromises}.` : null,
    rules ? `Reglas del creador:\n${rules}` : null,
    'Formato estricto: {"message":string,"language":string,"intent":string,"follow_up_questions":string[]}',
    "El campo language debe reflejar el idioma real del mensaje sugerido.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(args: {
  mode: SuggestMode;
  creatorLang: string;
  fanLanguage: string;
  fanName?: string | null;
  history: Array<{ role: string; text: string }>;
  context: CortexSuggestContext | null;
}) {
  const modeHint = MODE_LABELS[args.mode] ?? MODE_LABELS.reply;
  const historyLines = args.history.length
    ? args.history.map((line, idx) => `${idx + 1}. ${line.role}: ${line.text}`).join("\n")
    : "Sin historial reciente.";

  const contextBlock = args.context
    ? [
        args.context.original ? `Original (${args.context.detected?.src ?? "?"}): ${args.context.original}` : null,
        args.context.translation
          ? `Traducción (${args.context.detected?.tgt ?? "?"}): ${args.context.translation}`
          : null,
        args.context.detected?.src
          ? `Idioma detectado: ${args.context.detected.src}${args.context.detected.tgt ? ` → ${args.context.detected.tgt}` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Sin contexto de traducción.";

  return [
    modeHint,
    args.fanName ? `Fan: ${args.fanName}` : null,
    `Idioma objetivo del creador: ${args.creatorLang}`,
    `Idioma para responder al fan: ${args.fanLanguage}. Responde solo en ${args.fanLanguage}.`,
    "Contexto de traducción:",
    contextBlock,
    "Historial reciente (hasta 40 mensajes):",
    historyLines,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function safeJsonParse(input: string): { value: unknown; parsedFrom: "direct" | "extracted" | "fallback" } {
  try {
    return { value: JSON.parse(input), parsedFrom: "direct" };
  } catch (_err) {
    const start = input.indexOf("{");
    const end = input.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return { value: JSON.parse(input.slice(start, end + 1)), parsedFrom: "extracted" };
      } catch (_err2) {
        // fall through
      }
    }
    return { value: { text: input.trim() }, parsedFrom: "fallback" };
  }
}

function resolveFallbackText(parsedValue: unknown, rawText: string): string {
  if (parsedValue && typeof parsedValue === "object") {
    const record = parsedValue as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim()) {
      return record.text.trim();
    }
  }
  return rawText?.trim() ?? "";
}

function buildProviderErrorMessage(
  code: "MODEL_NOT_FOUND" | "TIMEOUT" | "PROVIDER_ERROR",
  provider?: string | null,
  model?: string | null
) {
  if (code === "MODEL_NOT_FOUND") {
    return `Modelo no encontrado (AI_MODEL=${model ?? "?"}).`;
  }
  if (code === "TIMEOUT") {
    return provider === "ollama" ? "Timeout hablando con Ollama." : "Timeout en el proveedor de IA.";
  }
  return provider === "ollama" ? "IA local no disponible (Ollama)." : "Proveedor de IA no disponible.";
}

function formatDetails(parts: Array<string | null | undefined>) {
  const filtered = parts.filter((part) => typeof part === "string" && part.trim());
  return filtered.length ? filtered.join(" | ") : undefined;
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

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("No creator found");
  }

  return creator.id;
}
