import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "../../../../lib/prisma.server";
import { createDefaultCreatorPlatforms } from "../../../../lib/creatorPlatforms";
import { getCortexProviderSelection, requestCortexCompletion, type CortexChatMessage } from "../../../../lib/ai/cortexProvider";
import { logCortexLlmUsage } from "../../../../lib/aiUsage.server";
import { evaluateAdultPolicy } from "../../../../server/ai/adultPolicy";
import { buildErrorSnippet, resolveProviderErrorType } from "../../../../server/ai/cortexErrors";
import {
  getLabel,
  normalizeLocale,
  normalizeLocaleTag,
  normalizePreferredLanguage,
  type SupportedLanguage,
} from "../../../../lib/language";
import { getEffectiveTranslateConfig } from "../../../../lib/ai/translateProvider";
import { normalizeObjectiveCode } from "../../../../lib/agency/objectives";
import { sanitizeAiDraftText } from "../../../../lib/text/sanitizeAiDraft";
import { isTooSimilarDraft } from "../../../../lib/text/isTooSimilarDraft";

type DraftSuccessResponse = {
  ok: true;
  draft: string;
  language: string;
  objective?: string | null;
  styleKey?: string | null;
};

type DraftErrorResponse = {
  ok: false;
  error:
    | "CORTEX_NOT_CONFIGURED"
    | "CORTEX_FAILED"
    | "POLICY_BLOCKED"
    | "MODEL_NOT_FOUND"
    | "TIMEOUT"
    | "PROVIDER_ERROR";
  message: string;
};

type DraftResponse = DraftSuccessResponse | DraftErrorResponse;

type DraftLength = "short" | "medium" | "long";
type DraftDirectness = "suave" | "neutro" | "directo";
type DraftTone = "suave" | "intimo" | "picante";
type RewriteMode = "alt" | "shorter" | "softer" | "more_direct";

const MAX_TOKENS_BY_LENGTH: Record<DraftLength, number> = {
  short: 140,
  medium: 260,
  long: 420,
};

type DraftHistoryEntry = { drafts: string[]; updatedAt: number };

const DRAFT_HISTORY_CACHE = new Map<string, DraftHistoryEntry>();
const DRAFT_HISTORY_TTL_MS = 60 * 60 * 1000;
const MAX_DRAFT_HISTORY_KEYS = 200;
const MAX_DRAFT_HISTORY = 6;
const MAX_DRAFT_HISTORY_CHARS = 700;

const DEFAULT_STYLE_GUIDES: Record<string, string> = {
  novia_cercana:
    "Cercana, cálida y natural. Usa frases cortas, detalles cotidianos y trato humano. Sin postureo.",
  juguetona:
    "Juguetona y con chispa. Coqueta, ligera, con picardía suave y ritmo dinámico.",
  elegante:
    "Elegante y sutil. Lenguaje cuidado, seductor sin presión y con calma.",
  intensa:
    "Intensa y segura. Directa, firme y magnética, sin ser agresiva.",
};

const ANGLES: string[] = [
  "Pregunta directa con consentimiento",
  "Dos opciones A/B",
  "Afirmación breve + pregunta concreta",
  "Teaser de extra con límite suave",
  "Juego/retos ligero (1 paso)",
  "Validación emocional + propuesta",
  "Curiosidad + microdetalle sensorial",
  "Cierre con CTA claro",
];

const MAX_VARIATION_ATTEMPTS = 2;
const MAX_AVOID_ENTRIES = 6;
const GENERIC_OPENERS_ES = ["hola amor", "hey amor", "me encanta que", "eres maravilla", "eres increíble", "me fascina que"];
const GENERIC_OPENERS_EN = ["hey there", "hi there", "i love that", "you're amazing", "you are amazing", "i love how"];
const GENERIC_OPENERS_RO = ["salut", "hey", "imi place", "esti minunat", "esti minunata"];
const OPENERS: Record<string, string[]> = {
  es: ["Hey! estaba pensando en ti", "Te cuento algo rapidito", "Tengo una idea para ti", "Traigo una propuesta coqueta", "Vengo con un plan loco", "¿Probamos algo juntos?"],
  en: ["Hey, thinking of you", "Quick thought for you", "Got a cute idea for us", "I have a playful plan", "Wanna try something now?", "I brought you a surprise"],
  ro: ["Salut, ma gândeam la tine", "Am o idee pentru noi", "Ți-am adus o propunere", "Vrei să încercăm ceva?", "Am un plan jucăuș", "O idee rapidă pentru tine"],
};
const STRUCTURES = ["Pregunta directa", "Afirmación + pregunta", "Opción A/B"];
const LAST_DRAFT_HASHES = new Map<string, string[]>();

const requestSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().optional(),
  objectiveKey: z.string().min(1),
  actionKey: z.string().optional(),
  styleKey: z.string().optional(),
  tone: z.enum(["suave", "intimo", "picante"]).optional(),
  directness: z.enum(["suave", "neutro", "directo"]).optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  outputLength: z.enum(["short", "medium", "long"]).optional(),
  variationOf: z.string().optional(),
  uiLevel: z.enum(["simple", "advanced"]).optional(),
  targetLanguage: z.string().optional(),
  intent: z.string().optional(),
  temperatureBucket: z.string().optional(),
  offerId: z.string().optional(),
  offerTitle: z.string().optional(),
  offerPriceCents: z.number().optional(),
  offerCurrency: z.string().optional(),
  regenerateNonce: z.preprocess(
    (val) => (typeof val === "string" || typeof val === "number" ? Number(val) : val),
    z.number().int().min(0).optional()
  ),
  variationNonce: z.preprocess(
    (val) => (typeof val === "string" || typeof val === "number" ? Number(val) : val),
    z.number().int().min(0).optional()
  ),
  avoid: z.array(z.string()).optional(),
  rewriteMode: z.enum(["alt", "shorter", "softer", "more_direct"]).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse<DraftResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "CORTEX_FAILED", message: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "CORTEX_FAILED", message: "PRISMA_NOT_INITIALIZED" });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "CORTEX_FAILED", message: "Bad request" });
  }

  const {
    conversationId,
    messageId,
    objectiveKey: rawObjectiveKey,
    actionKey: rawActionKey,
    styleKey: rawStyleKey,
    tone: rawTone,
    directness: rawDirectness,
    length: rawLength,
    outputLength: rawOutputLength,
    variationOf: rawVariationOf,
    uiLevel,
    targetLanguage,
    intent,
    offerId,
    offerTitle,
    offerPriceCents,
    offerCurrency,
    regenerateNonce,
    variationNonce,
    avoid: rawAvoid,
    rewriteMode: rawRewriteMode,
  } = parsed.data;
  const managerUiLevel = uiLevel ?? "advanced";

  const creatorId = await resolveCreatorId();
  const fan = await prisma.fan.findUnique({
    where: { id: conversationId },
    select: { id: true, creatorId: true, name: true, displayName: true, preferredLanguage: true, locale: true },
  });

  if (!fan) {
    return res.status(404).json({ ok: false, error: "CORTEX_FAILED", message: "Fan no encontrado." });
  }
  if (fan.creatorId !== creatorId) {
    return res.status(403).json({ ok: false, error: "CORTEX_FAILED", message: "Forbidden." });
  }

  const creatorSettings =
    (await prisma.creatorAiSettings.findUnique({ where: { creatorId } })) ??
    (await prisma.creatorAiSettings.create({
      data: { creatorId, platforms: createDefaultCreatorPlatforms() },
    }));
  const allowExplicitAdultContent = Boolean(creatorSettings.allowExplicitAdultContent);

  const selectedMessageText = messageId ? await loadMessageText(messageId, fan.id) : null;
  if (messageId && selectedMessageText === null) {
    return res.status(404).json({ ok: false, error: "CORTEX_FAILED", message: "Mensaje no encontrado." });
  }

  const tone = resolveTone(rawTone);
  const directness = resolveDirectness(rawDirectness);
  const outputLength = resolveLength(rawOutputLength ?? rawLength);
  const objectiveKey = normalizeObjectiveKey(rawObjectiveKey);
  const actionKey = normalizeOptional(rawActionKey);
  const variationOf = normalizeOptional(rawVariationOf);
  const maxTokens = MAX_TOKENS_BY_LENGTH[outputLength];
  const baseTemperature = 0.85;

  const translateConfig = await getEffectiveTranslateConfig(creatorId);
  const creatorLang = normalizePreferredLanguage(translateConfig.creatorLang ?? "es") ?? "es";
  const resolvedFanLanguage = await resolveFanLanguage({
    fanId: fan.id,
    preferredLanguage: fan.preferredLanguage,
  });
  const fanLanguage = resolvedFanLanguage.language;
  const outputLanguage = normalizePreferredLanguage(targetLanguage ?? null) ?? creatorLang;
  const shouldUpdatePreferredLanguage = resolvedFanLanguage.shouldUpdatePreferredLanguage;
  if (shouldUpdatePreferredLanguage) {
    try {
      await prisma.fan.update({
        where: { id: fan.id },
        data: { preferredLanguage: fanLanguage },
      });
    } catch (err) {
      console.warn("fan_language_update_failed", err);
    }
  }
  const contextMessages = await loadContextMessages(fan.id, 12);
  const policyDecision = evaluateAdultPolicy({
    text: selectedMessageText ?? variationOf ?? "",
    messages: contextMessages,
    allowExplicitAdultContent,
  });

  if (!policyDecision.allowed) {
    try {
      await logCortexLlmUsage({
        creatorId,
        fanId: fan.id,
        endpoint: "/api/creator/ai-manager/draft",
        provider: "policy",
        model: null,
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        ok: false,
        errorCode: "POLICY_BLOCKED",
        actionType: "manager_draft",
        context: {
          kind: "manager_draft",
          objectiveKey,
          tone,
          directness,
          outputLength,
          policy: policyDecision.code,
        },
      });
    } catch (err) {
      console.warn("cortex_usage_log_failed", err);
    }
    return res.status(403).json({
      ok: false,
      error: "POLICY_BLOCKED",
      message: "No permitido: menores o no consentimiento.",
    });
  }

  const agencyMeta = await prisma.chatAgencyMeta.findUnique({
    where: { creatorId_fanId: { creatorId, fanId: fan.id } },
    select: { stage: true, objectiveCode: true, intensity: true, playbook: true },
  });

  const objectiveMeta = await resolveObjectiveMeta({
    creatorId,
    objectiveKey,
    locale: outputLanguage,
  });
  const style = await resolveStyleGuide({
    creatorId,
    styleKey: normalizeOptional(rawStyleKey),
    playbook: agencyMeta?.playbook ?? null,
    objectiveCode: objectiveMeta.agencyObjectiveCode ?? null,
    intensity: agencyMeta?.intensity ?? null,
    stage: agencyMeta?.stage ?? null,
    tone,
    locale: outputLanguage,
  });

  const historyKey = buildDraftHistoryKey({ creatorId, fanId: fan.id, actionKey, objectiveKey });
  const recentDrafts = readDraftHistory(historyKey);
  const fanRecentDrafts = readFanDraftHistory(fan.id, creatorId);
  const normalizedAvoid = normalizeAvoidList(rawAvoid);
  const normalizedRecentDrafts = recentDrafts.map((entry) => sanitizeAiDraftText(entry)).filter(Boolean) as string[];
  const normalizedFanDrafts = fanRecentDrafts.map((entry) => sanitizeAiDraftText(entry)).filter(Boolean) as string[];
  const historyAvoid =
    normalizedRecentDrafts.length > 0 ? normalizedRecentDrafts : normalizedFanDrafts.slice(0, MAX_DRAFT_HISTORY);
  const lastDraftKey = `${creatorId}:${fan.id}:${actionKey ?? objectiveKey}`;
  const lastDraftHashes = readLastDraftHashes(lastDraftKey);
  const avoidCandidates = [
    ...normalizedAvoid,
    ...historyAvoid,
    ...resolveGenericOpeners(outputLanguage, MAX_AVOID_ENTRIES),
    ...lastDraftHashes,
  ]
    .filter(Boolean)
    .slice(0, MAX_AVOID_ENTRIES);
  // Variation guardrail: seed angle with creator + fan + action + regenerateNonce and avoid recent drafts + generic openers.
  const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const variationValue = typeof variationNonce === "number" ? variationNonce : regenerateNonce ?? 0;
  const seedActionKey = actionKey ?? objectiveKey;
  const strategySeed = `${creatorId}:${fan.id}:${seedActionKey}:${tone}:${outputLength}:${variationValue}:${todayKey}`;
  const angles = resolveAnglesForObjective();
  let strategyIndex = hashToInt(strategySeed) % angles.length;
  const openers = resolveOpenersForLanguage(outputLanguage);
  const opener = openers[hashToInt(`${strategySeed}:opener`)% openers.length];
  const structure = STRUCTURES[hashToInt(`${strategySeed}:struct`)% STRUCTURES.length];
  const rewriteMode = rawRewriteMode ?? null;
  const offerHint = await resolveOfferHint(creatorId);
  const systemPrompt = buildDraftSystemPrompt({
    language: outputLanguage,
    tone,
    directness,
    outputLength,
    allowExplicitAdultContent,
    objectiveKey,
    objective: objectiveMeta,
    styleKey: style.styleKey,
    styleGuide: style.styleGuide,
    styleSummary: style.styleSummary,
    playbook: style.playbook,
    intensity: agencyMeta?.intensity ?? null,
    stage: agencyMeta?.stage ?? null,
    uiLevel: managerUiLevel,
  });

  const selection = await getCortexProviderSelection({ creatorId });
  if (!selection.configured || selection.provider === "demo") {
    const errorMessage =
      selection.missingVars.length > 0
        ? `Cortex no está configurado. Faltan: ${selection.missingVars.join(", ")}.`
        : "Cortex no está configurado.";
    try {
      await logCortexLlmUsage({
        creatorId,
        fanId: fan.id,
        endpoint: "/api/creator/ai-manager/draft",
        provider: selection.desiredProvider,
        model: selection.model,
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        ok: false,
        errorCode: "CORTEX_NOT_CONFIGURED",
        actionType: "manager_draft",
        context: {
          kind: "manager_draft",
          objectiveKey,
          tone,
          directness,
          outputLength,
          errorMessage,
        },
      });
    } catch (err) {
      console.warn("cortex_usage_log_failed", err);
    }
    return res.status(501).json({ ok: false, error: "CORTEX_NOT_CONFIGURED", message: errorMessage });
  }

  console.info("manager_draft_debug", {
    outputLength,
    resolvedMaxTokens: maxTokens,
    objectiveKey,
    playbook: style.playbook ?? null,
    usedFallback: style.usedFallback,
  });

  let llmResult = null as Awaited<ReturnType<typeof requestCortexCompletion>> | null;
  let draftText = "";
  let usedAngle = angles[strategyIndex] ?? angles[0];

  // regenerateNonce -> angle seed -> avoid list; retry once with next angle + higher temp if too similar.
  for (let attempt = 0; attempt < MAX_VARIATION_ATTEMPTS; attempt++) {
    usedAngle = angles[strategyIndex] ?? angles[0];
    const attemptTemperature = attempt === 0 ? baseTemperature : 0.95;
    const userPrompt = buildDraftUserPrompt({
      fanName: fan.displayName || fan.name || "este fan",
      objectiveKey,
      selectedMessage: selectedMessageText,
      variationOf,
      offerHint,
      recentDrafts,
      intent: intent ?? null,
      offer:
        offerId || offerTitle || offerPriceCents
          ? {
              id: offerId ?? null,
              title: offerTitle ?? null,
              priceCents: offerPriceCents ?? null,
              currency: offerCurrency ?? null,
            }
          : null,
      angle: usedAngle,
      avoid: avoidCandidates,
      rewriteMode,
      targetLanguage: outputLanguage,
      opener,
      structure,
    });
    llmResult = await requestCortexCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        ...contextMessages,
        { role: "user", content: userPrompt },
      ],
      creatorId,
      fanId: fan.id,
      route: "/api/creator/ai-manager/draft",
      selection,
      temperature: attemptTemperature,
      maxTokens,
      outputLength,
      presencePenalty: 0.6,
      frequencyPenalty: 0.4,
      topP: 0.9,
    });

    if (!llmResult.ok || !llmResult.text) {
      break;
    }
    draftText = sanitizeDraftText(llmResult.text);
    if (!draftText) {
      break;
    }
    const tooSimilar = avoidCandidates.length > 0 ? isTooSimilarDraft(draftText, avoidCandidates) : false;
    if (!tooSimilar) {
      break;
    }
    strategyIndex = (strategyIndex + 1) % Math.max(angles.length, 1);
  }

  if (!llmResult || !llmResult.ok || !llmResult.text) {
    const providerErrorType = resolveProviderErrorType({
      errorCode: llmResult?.errorCode,
      errorMessage: llmResult?.errorMessage,
      status: llmResult?.status,
    });
    const errorMessage = buildProviderErrorMessage(providerErrorType, selection.desiredProvider, selection.model);
    try {
      await logCortexLlmUsage({
        creatorId,
        fanId: fan.id,
        endpoint: "/api/creator/ai-manager/draft",
        provider: llmResult?.provider ?? selection.desiredProvider,
        model: llmResult?.model ?? selection.model ?? null,
        tokensIn: llmResult?.tokensIn ?? null,
        tokensOut: llmResult?.tokensOut ?? null,
        latencyMs: llmResult?.latencyMs ?? null,
        ok: false,
        errorCode: providerErrorType,
        actionType: "manager_draft",
        context: {
          kind: "manager_draft",
          objectiveKey,
          tone,
          directness,
          outputLength,
          errorSnippet: buildErrorSnippet(llmResult?.errorMessage ?? ""),
        },
      });
    } catch (err) {
      console.warn("cortex_usage_log_failed", err);
    }
    return res.status(502).json({
      ok: false,
      error: providerErrorType,
      message: errorMessage,
    });
  }

  if (!draftText) {
    return res.status(500).json({ ok: false, error: "CORTEX_FAILED", message: "La IA no devolvió texto." });
  }

  writeDraftHistory(historyKey, draftText);
  pushLastDraftHash(lastDraftKey, draftText);

  try {
    await logCortexLlmUsage({
      creatorId,
      fanId: fan.id,
      endpoint: "/api/creator/ai-manager/draft",
      provider: llmResult.provider,
      model: llmResult.model ?? selection.model ?? null,
      tokensIn: llmResult.tokensIn,
      tokensOut: llmResult.tokensOut,
      latencyMs: llmResult.latencyMs,
      ok: true,
      actionType: "manager_draft",
      context: {
        kind: "manager_draft",
        objectiveKey,
        tone,
        directness,
        outputLength,
        styleKey: style.styleKey ?? undefined,
        uiLevel: managerUiLevel,
        angle: usedAngle,
        rewriteMode: rewriteMode ?? undefined,
      },
    });
  } catch (err) {
    console.warn("cortex_usage_log_failed", err);
  }

  return res.status(200).json({
    ok: true,
    draft: draftText,
    language: outputLanguage,
    objective: objectiveMeta.label ?? null,
    styleKey: style.styleKey ?? null,
  });
}

async function resolveCreatorId(): Promise<string> {
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

function resolveTone(input?: DraftTone | null): DraftTone {
  if (input === "suave" || input === "picante" || input === "intimo") return input;
  return "intimo";
}

function resolveDirectness(input?: DraftDirectness | null): DraftDirectness {
  if (input === "suave" || input === "directo" || input === "neutro") return input;
  return "neutro";
}

function resolveLength(input?: DraftLength | null): DraftLength {
  if (input === "short" || input === "medium" || input === "long") return input;
  return "medium";
}

function normalizeOptional(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildDraftHistoryKey(params: {
  creatorId: string;
  fanId: string;
  actionKey: string | null;
  objectiveKey: string;
}): string {
  const action = params.actionKey ?? `objective:${params.objectiveKey}`;
  return `${params.creatorId}:${params.fanId}:${action}`;
}

function readDraftHistory(key: string): string[] {
  const entry = DRAFT_HISTORY_CACHE.get(key);
  if (!entry) return [];
  if (Date.now() - entry.updatedAt > DRAFT_HISTORY_TTL_MS) {
    DRAFT_HISTORY_CACHE.delete(key);
    return [];
  }
  return entry.drafts;
}

function readFanDraftHistory(fanId: string, creatorId?: string): string[] {
  const drafts: string[] = [];
  const prefix = creatorId ? `${creatorId}:${fanId}:` : `${fanId}:`;
  DRAFT_HISTORY_CACHE.forEach((value, key) => {
    if (!key.startsWith(prefix)) return;
    if (Date.now() - value.updatedAt > DRAFT_HISTORY_TTL_MS) return;
    drafts.push(...value.drafts);
  });
  return drafts.slice(0, MAX_DRAFT_HISTORY);
}

function readLastDraftHashes(key: string): string[] {
  return LAST_DRAFT_HASHES.get(key) ?? [];
}

function pushLastDraftHash(key: string, draft: string): void {
  if (!key || !draft) return;
  const normalized = sanitizeDraftText(draft).slice(0, 120);
  if (!normalized) return;
  const existing = readLastDraftHashes(key);
  const next = [normalized, ...existing.filter((entry) => entry !== normalized)].slice(0, 10);
  LAST_DRAFT_HASHES.set(key, next);
}

function writeDraftHistory(key: string, draft: string): void {
  const normalized = truncate(draft.trim(), MAX_DRAFT_HISTORY_CHARS);
  if (!normalized) return;
  const previous = readDraftHistory(key);
  const merged = [normalized, ...previous].filter((value, index, arr) => arr.indexOf(value) === index);
  const next = merged.slice(0, MAX_DRAFT_HISTORY);
  DRAFT_HISTORY_CACHE.set(key, { drafts: next, updatedAt: Date.now() });
  if (DRAFT_HISTORY_CACHE.size > MAX_DRAFT_HISTORY_KEYS) {
    const oldestKey = DRAFT_HISTORY_CACHE.keys().next().value;
    if (oldestKey) DRAFT_HISTORY_CACHE.delete(oldestKey);
  }
}

function normalizeObjectiveKey(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!normalized) return "BREAK_ICE";
  if (normalized === "ROMPER_HIELO" || normalized === "BIENVENIDA") return "BREAK_ICE";
  if (normalized === "OFRECER_EXTRA") return "UPSELL_EXTRA";
  if (normalized === "LLEVAR_A_MENSUAL") return "CONVERT_MONTHLY";
  if (normalized === "REACTIVAR_FAN_FRIO") return "REENGAGE";
  if (normalized === "RENOVACION") return "RENEWAL";
  if (normalized === "CONNECT") return "BREAK_ICE";
  if (normalized === "SELL_EXTRA") return "UPSELL_EXTRA";
  if (normalized === "SELL_MONTHLY") return "CONVERT_MONTHLY";
  if (normalized === "SELL_PACK") return "UPSELL_EXTRA";
  if (normalized === "UPSELL") return "PROPOSE_1ON1";
  if (normalized === "RECOVER") return "REENGAGE";
  if (normalized === "RETAIN") return "RENEWAL";
  return normalized;
}

async function resolveFanLanguage(params: {
  fanId: string;
  preferredLanguage?: string | null;
}): Promise<{ language: SupportedLanguage; shouldUpdatePreferredLanguage: boolean }> {
  const storedLanguage = normalizeDetectedLanguage(params.preferredLanguage);
  const { lastMessageLanguage, mostFrequentLanguage } = await detectRecentFanLanguage(params.fanId, 3);
  const detectedLanguage = lastMessageLanguage ?? mostFrequentLanguage ?? null;

  let resolvedLanguage = storedLanguage ?? detectedLanguage ?? "es";
  let shouldUpdatePreferredLanguage = false;

  if (detectedLanguage && detectedLanguage !== storedLanguage) {
    resolvedLanguage = detectedLanguage;
    shouldUpdatePreferredLanguage = true;
  } else if (!storedLanguage) {
    shouldUpdatePreferredLanguage = true;
  }

  return { language: resolvedLanguage, shouldUpdatePreferredLanguage };
}

function normalizeDetectedLanguage(value?: string | null): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeLocaleTag(trimmed);
  if (!normalized) return null;
  const base = normalized.split("-")[0]?.toLowerCase() ?? "";
  if (!base || base === "auto" || base === "un" || base === "?") return null;
  return normalizePreferredLanguage(base);
}

async function detectRecentFanLanguage(
  fanId: string,
  limit: number
): Promise<{ lastMessageLanguage: SupportedLanguage | null; mostFrequentLanguage: SupportedLanguage | null }> {
  const messages = await prisma.message.findMany({
    where: { fanId, from: "fan" },
    orderBy: { id: "desc" },
    take: limit,
    select: {
      transcriptLang: true,
      messageTranslations: {
        select: { detectedSourceLang: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const samples = messages.map((message) => {
    const translationLang = normalizeDetectedLanguage(message.messageTranslations?.[0]?.detectedSourceLang ?? null);
    return translationLang ?? normalizeDetectedLanguage(message.transcriptLang ?? null);
  });

  const lastMessageLanguage = samples[0] ?? null;
  const frequency = new Map<SupportedLanguage, number>();
  for (const lang of samples) {
    if (!lang) continue;
    frequency.set(lang, (frequency.get(lang) ?? 0) + 1);
  }

  let mostFrequentLanguage: SupportedLanguage | null = null;
  let highestCount = 0;
  frequency.forEach((count, lang) => {
    if (count > highestCount) {
      mostFrequentLanguage = lang;
      highestCount = count;
    }
  });

  return { lastMessageLanguage, mostFrequentLanguage };
}

function resolveSentenceRange(length: DraftLength): string {
  if (length === "short") return "1–3 frases";
  if (length === "long") return "6–10 frases";
  return "3–6 frases";
}

function resolveToneInstruction(tone: DraftTone): string {
  if (tone === "suave") return "Tono suave, cercano y sin presión.";
  if (tone === "picante") return "Tono picante sugerente, adulto y humano, sin ser agresivo.";
  return "Tono íntimo, natural y humano.";
}

function resolveDirectnessInstruction(directness: DraftDirectness): string {
  if (directness === "suave") return "Habla con delicadeza, evita frases tajantes.";
  if (directness === "directo") return "Sé más directo y claro, sin brusquedad ni presión.";
  return "Directo pero equilibrado, sin sonar vendedor.";
}

function resolveRewriteInstruction(mode: RewriteMode | null): string | null {
  if (!mode) return null;
  if (mode === "shorter") return "Hazlo más breve (reduce 25–40%) manteniendo claridad y cercanía.";
  if (mode === "softer") return "Suaviza el tono, más cariñoso y menos agresivo.";
  if (mode === "more_direct") return "Hazlo más directo y claro, sin sonar brusco ni vendedor pesado.";
  return "Genera una versión distinta con arranque y estructura nuevos (no repitas el mismo patrón).";
}

function buildDraftSystemPrompt(params: {
  language: string;
  tone: DraftTone;
  directness: DraftDirectness;
  outputLength: DraftLength;
  allowExplicitAdultContent: boolean;
  objectiveKey: string;
  objective: { label?: string | null; instruction: string };
  styleKey: string | null;
  styleGuide: string | null;
  styleSummary: string | null;
  playbook: string | null;
  intensity: string | null;
  stage: string | null;
  uiLevel: "simple" | "advanced";
}): string {
  const explicitRule = params.allowExplicitAdultContent
    ? "Se permite lenguaje sexual explícito entre adultos con consentimiento."
    : "Evita contenido sexual explícito; mantén tono sugerente y consensuado.";
  const sentences = resolveSentenceRange(params.outputLength);
  const objectiveLabel = params.objective.label ?? params.objectiveKey;
  const playbookVoice = resolvePlaybookVoice(params.playbook);
  const intensityGuide = resolveIntensityInstruction(params.intensity);
  const stageRule = resolveStageInstruction(params.stage);
  const outputLengthHint =
    params.outputLength === "short"
      ? "Si outputLength=CORTA, reduce a 1–3 frases."
      : params.outputLength === "long"
      ? "Si outputLength=LARGA, extiende a 6–10 frases y desarrolla más sin repetir."
      : "OutputLength=MEDIA: 3–6 frases.";
  const lines = [
    "Eres el Manager IA de NOVSY. Escribes un borrador para que el creador responda al fan.",
    `Responde SOLO en ${params.language}. Prohibido mezclar idiomas, traducciones o texto bilingüe. No uses saludos en otro idioma.`,
    params.uiLevel === "simple"
      ? "Modo Simple: devuelve 1 solo borrador final, claro y directo, con 1 CTA suave si aplica. No ofrezcas variantes, opciones ni bullets."
      : "Incluye 1 micro-CTA según el objetivo; evita dar más de una opción.",
    `Longitud objetivo: ${sentences}.`,
    "Estructura sugerida: apertura coqueta + conexión/beneficio + micro-CTA + pregunta final (ajusta según longitud).",
    "Formato de salida base: 3–6 frases + 1 pregunta + 1 CTA opcional según objetivo.",
    outputLengthHint,
    "Termina con 1 pregunta concreta.",
    "Incluye 1 micro-CTA según el objetivo; para BREAK_ICE usa CTA suave o ninguno.",
    "Si el objetivo es venta, empuja la propuesta de forma natural y humana, sin presión.",
    "No repitas halagos ni arranques; evita frases cliché como “Eres maravilla”.",
    "No repitas la misma frase dentro del mensaje ni el nombre del fan más de 1 vez.",
    playbookVoice,
    intensityGuide,
    resolveToneInstruction(params.tone),
    resolveDirectnessInstruction(params.directness),
    stageRule,
    explicitRule,
    "Si no hay señales de consentimiento/reciprocidad, mantén tono sugerente sin escalar agresivo.",
    "No menciones IA, modelos, prompts ni políticas.",
    "No incluyas encabezados, etiquetas, markdown ni prefijos (no \"Borrador\", \"Mensaje final\", \"Eres el Manager…\").",
    "Devuelve SOLO el mensaje final. Sin etiquetas. Sin explicación.",
    `OBJECTIVE_KEY: ${params.objectiveKey}`,
    `OBJECTIVE_DESC: ${objectiveLabel}`,
    `CTA_RULE: ${params.objective.instruction}`,
    `TEMPLATE_KEY: ${params.styleKey ?? "default"}`,
    params.styleSummary ? `TEMPLATE_DESC: ${params.styleSummary}` : null,
    params.styleGuide ? `STYLE_GUIDE:\n${params.styleGuide}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildDraftUserPrompt(params: {
  fanName: string;
  objectiveKey: string;
  selectedMessage: string | null;
  variationOf: string | null;
  offerHint: string | null;
  recentDrafts: string[];
  intent: string | null;
  offer: {
    id: string | null;
    title: string | null;
    priceCents: number | null;
    currency: string | null;
  } | null;
  angle: string;
  avoid: string[];
  rewriteMode: RewriteMode | null;
  targetLanguage: string;
  opener: string | null;
  structure: string | null;
}): string {
  const shouldMentionCatalog = params.objectiveKey === "UPSELL_EXTRA";
  const recentDrafts = params.recentDrafts
    .map((draft) => draft.trim())
    .filter((draft) => draft && draft !== params.variationOf);
  const recentDraftsBlock =
    recentDrafts.length > 0
      ? `ULTIMOS_BORRADORES (NO repetir frases/arranques/halagos similares):\n${recentDrafts
          .slice(0, MAX_DRAFT_HISTORY)
          .map((draft) => `- ${truncate(draft, 240)}`)
          .join("\n")}`
      : null;
  const avoidBlock =
    params.avoid.length > 0
      ? `NO REPITAS (cambia arranque y estructura, evita frases copiadas):\n${params.avoid
          .slice(0, MAX_AVOID_ENTRIES)
          .map((draft) => `- ${truncate(draft, 240)}`)
          .join("\n")}`
      : null;
  const rewriteInstruction = resolveRewriteInstruction(params.rewriteMode);
  const lines = [
    `Fan: ${params.fanName}`,
    `Idioma objetivo: ${params.targetLanguage}. Devuelve SOLO en este idioma.`,
    params.selectedMessage ? `Mensaje seleccionado: ${truncate(params.selectedMessage, 320)}` : null,
    params.variationOf
      ? `NO repitas estas frases ni estructura:\n${truncate(params.variationOf, 420)}`
      : null,
    recentDraftsBlock,
    avoidBlock,
    params.angle ? `ENFOQUE: ${params.angle}` : null,
    params.structure ? `ESTRUCTURA: ${params.structure}` : null,
    params.opener ? `OPENER sugerido: "${params.opener}". No repitas openers anteriores ni la misma primera frase.` : null,
    params.angle ? "Usa SOLO ese ángulo; no uses otros enfoques." : null,
    rewriteInstruction,
    shouldMentionCatalog
      ? params.offerHint
        ? `CATALOGO_EXTRA: ${params.offerHint}`
        : "CATALOGO_EXTRA: (no disponible)"
      : null,
    params.offer
      ? `OFERTA_SELECCIONADA: ${params.offer.title ?? params.offer.id ?? "Oferta"}${
          typeof params.offer.priceCents === "number" ? ` · ${(params.offer.priceCents / 100).toFixed(0)} ${params.offer.currency ?? "EUR"}` : ""
        }`
      : null,
    params.intent ? `INTENT: ${params.intent}` : null,
    `Objetivo solicitado: ${params.objectiveKey}`,
    "Escribe el borrador final. Devuelve SOLO el mensaje final, sin etiquetas ni explicación.",
  ].filter(Boolean);
  return lines.join("\n");
}

async function resolveObjectiveMeta(params: {
  creatorId: string;
  objectiveKey: string;
  locale: string;
}): Promise<{ label: string | null; instruction: string; agencyObjectiveCode: string | null }> {
  const normalized = normalizeObjectiveCode(params.objectiveKey);
  const mappedAgencyCode = mapObjectiveKeyToAgencyCode(params.objectiveKey);
  const codes = [normalized, mappedAgencyCode].filter((value): value is string => Boolean(value));
  let label: string | null = null;
  let agencyObjectiveCode: string | null = mappedAgencyCode ?? null;

  if (codes.length > 0) {
    const objective = await prisma.agencyObjective.findFirst({
      where: { creatorId: params.creatorId, active: true, code: { in: codes } },
      orderBy: { updatedAt: "desc" },
      select: { code: true, labels: true },
    });
    if (objective?.labels && typeof objective.labels === "object") {
      label = getLabel(objective.labels as Record<string, string>, params.locale, objective.code) ?? null;
      agencyObjectiveCode = objective.code;
    }
  }

  return {
    label,
    instruction: resolveObjectiveInstruction(params.objectiveKey),
    agencyObjectiveCode,
  };
}

function resolveObjectiveInstruction(objectiveKey: string): string {
  switch (objectiveKey) {
    case "BREAK_ICE":
      return "Coqueteo + cercanía + siguiente paso. Invita a responder con un avance suave.";
    case "UPSELL_EXTRA":
      return "Ofrece 1 extra/pack concreto (si hay catálogo). No regales explícito gratis; deja claro que el extra es de pago.";
    case "CONVERT_MONTHLY":
      return "Destaca 1 beneficio del mensual y lanza una invitación clara a probarlo.";
    case "PROPOSE_1ON1":
      return "Propón un 1:1 con ventana de tiempo concreta y pregunta si le va bien.";
    case "REENGAGE":
      return "Reactiva el hilo con cercanía, coqueteo leve y una pregunta sencilla para volver a hablar.";
    case "RENEWAL":
      return "Recuerda la renovación con un beneficio y pregunta si quiere mantener el acceso.";
    default:
      return "Invita a responder con una pregunta concreta y cercana.";
  }
}

function mapObjectiveKeyToAgencyCode(objectiveKey: string): string | null {
  switch (objectiveKey) {
    case "BREAK_ICE":
      return "CONNECT";
    case "UPSELL_EXTRA":
      return "SELL_EXTRA";
    case "CONVERT_MONTHLY":
      return "SELL_MONTHLY";
    case "PROPOSE_1ON1":
      return "UPSELL";
    case "REENGAGE":
      return "RECOVER";
    case "RENEWAL":
      return "RETAIN";
    default:
      return null;
  }
}

async function resolveStyleGuide(params: {
  creatorId: string;
  styleKey: string | null;
  playbook: string | null;
  objectiveCode: string | null;
  intensity: string | null;
  stage: string | null;
  tone: DraftTone;
  locale: string;
}): Promise<{
  styleGuide: string | null;
  styleKey: string | null;
  styleSummary: string | null;
  playbook: string | null;
  usedFallback: boolean;
}> {
  const normalizedStyleKey = normalizeOptional(params.styleKey);
  const normalizedPlaybook = normalizePlaybookValue(params.playbook);
  const candidates = normalizeLocale(params.locale || "es");
  if (!candidates.includes("es")) candidates.push("es");

  const templates = await prisma.agencyTemplate.findMany({
    where: { creatorId: params.creatorId, active: true, language: { in: candidates } },
    select: {
      id: true,
      stage: true,
      objective: true,
      intensity: true,
      playbook: true,
      language: true,
      blocksJson: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  let selected = normalizedStyleKey
    ? templates.find((template) => template.id === normalizedStyleKey) ?? null
    : null;

  const playbookFromStyleKey = resolvePlaybookKey(normalizedStyleKey);
  const fallbackPlaybook = playbookFromStyleKey ?? normalizedPlaybook;
  if (!selected && templates.length > 0) {
    selected = pickTemplateCandidate({
      templates,
      playbook: fallbackPlaybook,
      objective: params.objectiveCode,
      intensity: params.intensity,
      stage: params.stage,
    });
  }
  const templatePlaybook = normalizePlaybookValue(selected?.playbook ?? null);
  const playbook = templatePlaybook ?? fallbackPlaybook;

  if (selected) {
    const styleGuide = buildStyleGuideFromBlocks(selected.blocksJson);
    if (styleGuide) {
      return {
        styleGuide,
        styleKey: selected.id,
        styleSummary: buildStyleSummary(styleGuide),
        playbook,
        usedFallback: false,
      };
    }
  }

  const fallbackKey = resolveFallbackStyleKey({
    styleKey: normalizedStyleKey,
    playbook,
    tone: params.tone,
  });
  const fallbackGuide = fallbackKey ? DEFAULT_STYLE_GUIDES[fallbackKey] : null;
  return {
    styleGuide: fallbackGuide ?? null,
    styleKey: fallbackKey ?? null,
    styleSummary: fallbackGuide ? buildStyleSummary(fallbackGuide) : null,
    playbook,
    usedFallback: true,
  };
}

function pickTemplateCandidate<
  T extends {
    id: string;
    stage: string;
    objective: string;
    intensity: string;
    playbook: string;
    language: string;
    blocksJson: unknown;
  }
>(params: {
  templates: T[];
  playbook: string | null;
  objective: string | null;
  intensity: string | null;
  stage: string | null;
}): T | null {
  let candidates = [...params.templates];
  const filters: Array<(tpl: (typeof params.templates)[number]) => boolean> = [];
  if (params.playbook) filters.push((tpl) => tpl.playbook === params.playbook);
  if (params.stage) filters.push((tpl) => tpl.stage === params.stage);
  if (params.objective) filters.push((tpl) => tpl.objective === params.objective);
  if (params.intensity) filters.push((tpl) => tpl.intensity === params.intensity);

  for (const filter of filters) {
    const next = candidates.filter(filter);
    if (next.length > 0) candidates = next;
  }
  return candidates[0] ?? null;
}

function resolvePlaybookKey(styleKey?: string | null): string | null {
  if (!styleKey) return null;
  const normalized = styleKey.trim().toUpperCase();
  const allowed = new Set(["GIRLFRIEND", "PLAYFUL", "ELEGANT", "SOFT_DOMINANT"]);
  return allowed.has(normalized) ? normalized : null;
}

function resolveFallbackStyleKey(params: {
  styleKey: string | null;
  playbook: string | null;
  tone: DraftTone;
}): string | null {
  if (params.styleKey && DEFAULT_STYLE_GUIDES[params.styleKey]) return params.styleKey;
  const normalizedPlaybook = normalizePlaybookValue(params.playbook);
  if (normalizedPlaybook === "GIRLFRIEND") return "novia_cercana";
  if (normalizedPlaybook === "PLAYFUL") return "juguetona";
  if (normalizedPlaybook === "ELEGANT") return "elegante";
  if (normalizedPlaybook === "SOFT_DOMINANT") return "intensa";
  if (params.tone === "picante") return "intensa";
  if (params.tone === "suave") return "elegante";
  return "novia_cercana";
}

function buildStyleGuideFromBlocks(blocksJson: unknown): string | null {
  if (!blocksJson || typeof blocksJson !== "object" || Array.isArray(blocksJson)) return null;
  const record = blocksJson as Record<string, unknown>;
  const extract = (key: string) => {
    const raw = record[key];
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => typeof item === "string" && item.trim()).slice(0, 3) as string[];
  };
  const openers = extract("openers");
  const bridges = extract("bridges");
  const teases = extract("teases");
  const ctas = extract("ctas");
  const parts = [
    openers.length ? `Openers: ${openers.join(" · ")}` : null,
    bridges.length ? `Bridges: ${bridges.join(" · ")}` : null,
    teases.length ? `Teases: ${teases.join(" · ")}` : null,
    ctas.length ? `CTAs: ${ctas.join(" · ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

function buildStyleSummary(styleGuide: string | null, maxLen = 160): string | null {
  if (!styleGuide) return null;
  const trimmed = styleGuide.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split("\n").map((line) => line.trim()).find(Boolean) ?? trimmed;
  if (firstLine.length <= maxLen) return firstLine;
  return `${firstLine.slice(0, maxLen - 1)}…`;
}

function normalizePlaybookValue(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized ? normalized : null;
}

function resolvePlaybookVoice(playbook: string | null): string | null {
  const normalized = normalizePlaybookValue(playbook);
  if (normalized === "GIRLFRIEND") return "Voz novia cercana: cálida, personal y coqueta, con cercanía cotidiana.";
  if (normalized === "PLAYFUL") return "Voz juguetona: teasing ligero, chispa y ritmo ágil.";
  if (normalized === "ELEGANT") return "Voz elegante: sensual contenida, sofisticada y sin prisa.";
  if (normalized === "SOFT_DOMINANT") return "Voz dominante suave: guía y retadora, segura pero sin agresividad.";
  return null;
}

function resolveIntensityInstruction(intensity: string | null): string | null {
  const normalized = normalizePlaybookValue(intensity);
  if (!normalized) return null;
  if (normalized.includes("SOFT") || normalized.includes("LOW")) {
    return "Intensidad suave: vocabulario tierno, ritmo calmado y cercano.";
  }
  if (normalized.includes("INTENSE") || normalized.includes("HIGH")) {
    return "Intensidad alta: más directo y seguro, sin vulgaridad.";
  }
  if (normalized.includes("MED") || normalized.includes("MID")) {
    return "Intensidad media: coqueteo claro y equilibrado.";
  }
  return null;
}

function resolveStageInstruction(stage: string | null): string | null {
  const normalized = normalizePlaybookValue(stage);
  if (normalized === "BOUNDARY") {
    return "STAGE=BOUNDARY: si el fan pide explícito gratis o insiste en gratis, pon un límite breve y redirige a extra/pack/llamada. Sin moralina ni rechazo duro.";
  }
  return null;
}

async function loadMessageText(messageId: string, fanId: string): Promise<string | null> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, fanId: true, text: true, type: true, transcriptText: true, transcriptStatus: true },
  });
  if (!message || message.fanId !== fanId) return null;
  return resolveMessageContent(message);
}

function resolveMessageContent(message: {
  text?: string | null;
  type?: string | null;
  transcriptText?: string | null;
  transcriptStatus?: string | null;
}) {
  const type = (message.type ?? "").toUpperCase();
  if (type === "VOICE" || type === "AUDIO") {
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
    },
  });

  const mapped = messages
    .map((msg) => {
      const content = resolveMessageContent(msg);
      if (!content) return null;
      return {
        role: msg.from === "creator" ? "assistant" : "user",
        content: truncate(content, 420),
      };
    })
    .filter((msg): msg is CortexChatMessage => Boolean(msg && msg.content))
    .reverse();

  return mapped.slice(-limit);
}

async function resolveOfferHint(creatorId: string): Promise<string | null> {
  const offer = await prisma.offer.findFirst({
    where: { creatorId, active: true },
    select: { title: true, tier: true },
    orderBy: { updatedAt: "desc" },
  });
  if (offer?.title) {
    const tier = offer.tier ? ` (${offer.tier})` : "";
    return `${offer.title}${tier}`.trim();
  }

  const item = await prisma.contentItem.findFirst({
    where: { creatorId, visibility: "EXTRA" },
    select: { title: true },
    orderBy: { updatedAt: "desc" },
  });
  if (item?.title) return item.title.trim();
  return null;
}

function resolveAnglesForObjective(): string[] {
  return ANGLES;
}

function resolveOpenersForLanguage(language: string): string[] {
  const normalized = (language || "").toLowerCase();
  if (normalized.startsWith("es")) return OPENERS.es;
  if (normalized.startsWith("ro")) return OPENERS.ro;
  return OPENERS.en;
}

function hashToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function resolveGenericOpeners(language: string, limit: number): string[] {
  const normalized = (language || "").toLowerCase();
  const isSpanish = normalized.startsWith("es");
  const isEnglish = normalized.startsWith("en");
  const isRomanian = normalized.startsWith("ro");
  if (isSpanish) return GENERIC_OPENERS_ES.slice(0, limit);
  if (isEnglish) return GENERIC_OPENERS_EN.slice(0, limit);
  if (isRomanian) return GENERIC_OPENERS_RO.slice(0, limit);
  return [...GENERIC_OPENERS_EN, ...GENERIC_OPENERS_ES, ...GENERIC_OPENERS_RO].slice(0, limit);
}

function normalizeAvoidList(value?: string[] | null): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? sanitizeAiDraftText(entry) : ""))
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .slice(0, MAX_AVOID_ENTRIES);
}

function sanitizeDraftText(text: string): string {
  const cleaned = sanitizeAiDraftText(text);
  if (!cleaned) return "";
  const trimmed = cleaned.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("“") && trimmed.endsWith("”"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
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
