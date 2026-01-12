import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "../../../../lib/prisma.server";
import { createDefaultCreatorPlatforms } from "../../../../lib/creatorPlatforms";
import { getCortexProviderSelection, requestCortexCompletion, type CortexChatMessage } from "../../../../lib/ai/cortexProvider";
import { logCortexLlmUsage } from "../../../../lib/aiUsage.server";
import { evaluateAdultPolicy } from "../../../../server/ai/adultPolicy";
import { buildErrorSnippet, resolveProviderErrorType } from "../../../../server/ai/cortexErrors";
import { getLabel, normalizeLocale, normalizeLocaleTag, normalizePreferredLanguage } from "../../../../lib/language";
import { normalizeObjectiveCode } from "../../../../lib/agency/objectives";

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

const MAX_TOKENS_BY_LENGTH: Record<DraftLength, number> = {
  short: 140,
  medium: 260,
  long: 420,
};

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

const requestSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().optional(),
  objectiveKey: z.string().min(1),
  styleKey: z.string().optional(),
  tone: z.enum(["suave", "intimo", "picante"]).optional(),
  directness: z.enum(["suave", "neutro", "directo"]).optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  outputLength: z.enum(["short", "medium", "long"]).optional(),
  variationOf: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse<DraftResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "CORTEX_FAILED", message: "Method not allowed" });
  }
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
    styleKey: rawStyleKey,
    tone: rawTone,
    directness: rawDirectness,
    length: rawLength,
    outputLength: rawOutputLength,
    variationOf: rawVariationOf,
  } = parsed.data;

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
  const variationOf = normalizeOptional(rawVariationOf);
  const maxTokens = MAX_TOKENS_BY_LENGTH[outputLength];
  const temperature = resolveTemperature({ directness, variationOf });

  const language = resolveDraftLanguage({
    locale: fan.locale,
    preferredLanguage: fan.preferredLanguage,
  });
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
    locale: language,
  });
  const style = await resolveStyleGuide({
    creatorId,
    styleKey: normalizeOptional(rawStyleKey),
    playbook: agencyMeta?.playbook ?? null,
    objectiveCode: objectiveMeta.agencyObjectiveCode ?? null,
    intensity: agencyMeta?.intensity ?? null,
    stage: agencyMeta?.stage ?? null,
    tone,
    locale: language,
  });

  const offerHint = await resolveOfferHint(creatorId);
  const systemPrompt = buildDraftSystemPrompt({
    language,
    tone,
    directness,
    outputLength,
    allowExplicitAdultContent,
    objectiveKey,
    objective: objectiveMeta,
    styleKey: style.styleKey,
    styleGuide: style.styleGuide,
    styleSummary: style.styleSummary,
  });
  const userPrompt = buildDraftUserPrompt({
    fanName: fan.displayName || fan.name || "este fan",
    objectiveKey,
    selectedMessage: selectedMessageText,
    variationOf,
    offerHint,
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

  const llmResult = await requestCortexCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      ...contextMessages,
      { role: "user", content: userPrompt },
    ],
    creatorId,
    fanId: fan.id,
    route: "/api/creator/ai-manager/draft",
    selection,
    temperature,
    maxTokens,
    outputLength,
  });

  if (!llmResult.ok || !llmResult.text) {
    const providerErrorType = resolveProviderErrorType({
      errorCode: llmResult.errorCode,
      errorMessage: llmResult.errorMessage,
      status: llmResult.status,
    });
    const errorMessage = buildProviderErrorMessage(providerErrorType, selection.desiredProvider, selection.model);
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
        ok: false,
        errorCode: providerErrorType,
        actionType: "manager_draft",
        context: {
          kind: "manager_draft",
          objectiveKey,
          tone,
          directness,
          outputLength,
          errorSnippet: buildErrorSnippet(llmResult.errorMessage ?? ""),
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

  const draftText = sanitizeDraftText(llmResult.text);
  if (!draftText) {
    return res.status(500).json({ ok: false, error: "CORTEX_FAILED", message: "La IA no devolvió texto." });
  }

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
      },
    });
  } catch (err) {
    console.warn("cortex_usage_log_failed", err);
  }

  return res.status(200).json({
    ok: true,
    draft: draftText,
    language,
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

function resolveDraftLanguage(params: { locale?: string | null; preferredLanguage?: string | null }): string {
  const normalizedLocale = normalizeLocaleTag(params.locale ?? "");
  if (normalizedLocale) return normalizedLocale.split("-")[0];
  const preferred = normalizePreferredLanguage(params.preferredLanguage ?? "");
  return preferred ?? "es";
}

function resolveTemperature(params: { directness: DraftDirectness; variationOf: string | null }): number {
  if (params.variationOf) return 0.85;
  if (params.directness === "directo" || params.directness === "suave") return 0.6;
  return 0.65;
}

function resolveSentenceRange(length: DraftLength): string {
  if (length === "short") return "1–2 frases";
  if (length === "long") return "5–8 frases";
  return "2–4 frases";
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
}): string {
  const explicitRule = params.allowExplicitAdultContent
    ? "Se permite lenguaje sexual explícito entre adultos con consentimiento."
    : "Evita contenido sexual explícito; mantén tono sugerente y consensuado.";
  const sentences = resolveSentenceRange(params.outputLength);
  const objectiveLabel = params.objective.label ?? params.objectiveKey;
  const outputLengthHint =
    params.outputLength === "short"
      ? "Si outputLength=CORTA, reduce a 1–2 frases."
      : params.outputLength === "long"
      ? "Si outputLength=LARGA, extiende a 5–8 frases."
      : "OutputLength=NORMAL: 2–4 frases.";
  const lines = [
    "Eres el Manager IA de NOVSY. Escribes un borrador para que el creador responda al fan.",
    `Responde SIEMPRE en ${params.language}.`,
    `Longitud objetivo: ${sentences}.`,
    "Formato de salida base: 2–4 frases + 1 pregunta + 1 CTA opcional según objetivo.",
    outputLengthHint,
    "Termina con 1 pregunta concreta.",
    "Incluye 1 micro-CTA solo si el objetivo lo requiere; para BREAK_ICE usa CTA suave o ninguno.",
    resolveToneInstruction(params.tone),
    resolveDirectnessInstruction(params.directness),
    explicitRule,
    "Si no hay señales de consentimiento/reciprocidad, mantén tono sugerente sin escalar agresivo.",
    "No menciones IA, modelos, prompts ni políticas.",
    "Devuelve SOLO el texto final del mensaje.",
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
}): string {
  const shouldMentionCatalog = params.objectiveKey === "UPSELL_EXTRA";
  const lines = [
    `Fan: ${params.fanName}`,
    params.selectedMessage ? `Mensaje seleccionado: ${truncate(params.selectedMessage, 320)}` : null,
    params.variationOf
      ? `NO repitas estas frases ni estructura:\n${truncate(params.variationOf, 420)}`
      : null,
    shouldMentionCatalog
      ? params.offerHint
        ? `CATALOGO_EXTRA: ${params.offerHint}`
        : "CATALOGO_EXTRA: (no disponible)"
      : null,
    `Objetivo solicitado: ${params.objectiveKey}`,
    "Escribe el borrador final.",
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
      return "Invita a responder y propone algo ligero para seguir la conversación.";
    case "UPSELL_EXTRA":
      return "Menciona 1 extra/pack si hay catálogo disponible; si no, usa un CTA genérico tipo “te enseño algo especial”.";
    case "CONVERT_MONTHLY":
      return "Destaca 1 beneficio del mensual y pregunta si le encaja probarlo.";
    case "PROPOSE_1ON1":
      return "Propón un 1:1 con ventana de tiempo concreta y pregunta si le va bien.";
    case "REENGAGE":
      return "Reactiva el hilo con cercanía y una pregunta sencilla para volver a hablar.";
    case "RENEWAL":
      return "Recuerda la renovación y pregunta si quiere mantener el acceso.";
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
}): Promise<{ styleGuide: string | null; styleKey: string | null; styleSummary: string | null }> {
  const normalizedStyleKey = normalizeOptional(params.styleKey);
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

  const playbook = resolvePlaybookKey(normalizedStyleKey) ?? params.playbook;
  if (!selected && templates.length > 0) {
    selected = pickTemplateCandidate({
      templates,
      playbook,
      objective: params.objectiveCode,
      intensity: params.intensity,
      stage: params.stage,
    });
  }

  if (selected) {
    const styleGuide = buildStyleGuideFromBlocks(selected.blocksJson);
    if (styleGuide) {
      return {
        styleGuide,
        styleKey: selected.id,
        styleSummary: buildStyleSummary(styleGuide),
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
  };
}

function pickTemplateCandidate(params: {
  templates: Array<{
    id: string;
    stage: string;
    objective: string;
    intensity: string;
    playbook: string;
    blocksJson: unknown;
  }>;
  playbook: string | null;
  objective: string | null;
  intensity: string | null;
  stage: string | null;
}) {
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
  if (params.playbook === "GIRLFRIEND") return "novia_cercana";
  if (params.playbook === "PLAYFUL") return "juguetona";
  if (params.playbook === "ELEGANT") return "elegante";
  if (params.playbook === "SOFT_DOMINANT") return "intensa";
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

function sanitizeDraftText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
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
