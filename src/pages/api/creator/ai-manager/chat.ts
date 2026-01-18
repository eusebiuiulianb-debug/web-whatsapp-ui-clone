import type { NextApiRequest, NextApiResponse } from "next";
import { AiUsageOrigin, AiUsageType, ExtraSlot, ExtraTier, ManagerAiRole, ManagerAiTab, TimeOfDay } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { buildManagerContext } from "../../../../lib/ai/manager/context";
import {
  buildGrowthPrompts,
  buildManagerSystemPrompt,
  buildManagerUserPrompt,
  normalizeManagerAction,
} from "../../../../lib/ai/manager/prompts";
import {
  normalizeAgencyIntensity,
  normalizeAgencyPlaybook,
  normalizeAgencyStage,
  type AgencyIntensity,
  type AgencyPlaybook,
  type AgencyStage,
} from "../../../../lib/agency/types";
import { normalizeObjectiveCode, resolveObjectiveForScoring } from "../../../../lib/agency/objectives";
import { buildAgencyDraft } from "../../../../server/agencyTemplates";
import { buildDemoManagerReply, type ManagerDemoReply } from "../../../../lib/ai/manager/demo";
import { registerAiUsage } from "../../../../lib/ai/registerAiUsage";
import { logCortexLlmUsage } from "../../../../lib/aiUsage.server";
import { getCortexProviderSelection, requestCortexCompletion } from "../../../../lib/ai/cortexProvider";
import { getEffectiveTranslateConfig } from "../../../../lib/ai/translateProvider";
import { buildOllamaOpenAiRequest } from "../../../../lib/ai/providers/ollama";
import { sanitizeForOpenAi } from "../../../../server/ai/sanitizeForOpenAi";
import { toSafeErrorMessage } from "../../../../server/ai/openAiError";
import { evaluateAdultPolicy } from "../../../../server/ai/adultPolicy";
import { buildErrorSnippet, resolveProviderErrorType } from "../../../../server/ai/cortexErrors";
import { AI_ENABLED, sendAiDisabled } from "../../../../lib/features";

type ManagerReply = ManagerDemoReply & { mode: "STRATEGY" | "CONTENT" | "GROWTH"; text: string };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type StandardProvider = "ollama" | "openai_compat" | "mock";

type ChatStatus = "ok" | "refusal" | "provider_down" | "needs_age_gate" | "crypto_misconfigured";

type HeatLevel = "suave" | "intimo" | "picante";

type ChatMeta = {
  providerUsed: StandardProvider;
  modelUsed: string | null;
  action: string | null;
  usedFallback: boolean;
  latencyMs: number;
};

type ChatOffer = {
  tier: ExtraTier;
  dayPart: "DAY" | "NIGHT" | "ANY";
  contentId?: string;
  title?: string;
  price?: number;
};

type ChatErrorCode =
  | "bad_request"
  | "empty_ai_response"
  | "ai_error"
  | "method_not_allowed"
  | "REFUSAL"
  | "PROVIDER_UNAVAILABLE"
  | "CRYPTO_MISCONFIGURED"
  | "POLICY_BLOCKED"
  | "MODEL_NOT_FOUND"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "JSON_PARSE";

type ChatOkResponse = {
  ok: true;
  reply: { content: string };
  status: ChatStatus;
  meta: ChatMeta;
  error?: { code: ChatErrorCode; message: string };
  offer?: ChatOffer;
  data: {
    reply: { role: "assistant"; content: string };
    usedFallback: boolean;
    provider: StandardProvider;
    model: string | null;
    messages: ChatMessage[];
    offer?: ChatOffer;
    replyMeta?: ManagerReply;
    creditsUsed?: number;
    creditsRemaining?: number;
    settingsStatus?: "ok" | "settings_missing" | "decrypt_failed";
    aiMode?: "demo" | "live";
    meta: ChatMeta;
    status: ChatStatus;
  };
  message?: { role: "assistant"; content: string };
  items?: Array<{ role: "assistant"; content: string }>;
  messages?: ChatMessage[];
  replyMeta?: ManagerReply;
  creditsUsed?: number;
  creditsRemaining?: number;
  usedFallback?: boolean;
  settingsStatus?: "ok" | "settings_missing" | "decrypt_failed";
  aiMode?: "demo" | "live";
};

type ChatErrorResponse = {
  ok: false;
  error: { code: ChatErrorCode; message: string };
  status: ChatStatus;
  meta: ChatMeta;
  code?: ChatErrorCode;
  message?: string;
  details?: string;
  reply?: { content: string };
  offer?: ChatOffer;
  data?: {
    usedFallback?: boolean;
    provider?: StandardProvider;
    model?: string | null;
    latencyMs?: number;
    offer?: ChatOffer;
  };
};

const HISTORY_LIMIT = 20;
const DEFAULT_MAX_TOKENS = 300;
const buildAgencySystemGuard = (allowExplicitAdultContent: boolean) => {
  const explicitRule = allowExplicitAdultContent
    ? "Tono adulto; lenguaje explícito permitido si hay consentimiento."
    : "Tono sugerente adulto, NO explícito (sin anatomía ni pornografía).";
  const explicitRequestRule = allowExplicitAdultContent
    ? "Si el fan pide algo explícito, responde de forma explícita y consensuada."
    : "Si el fan pide algo explícito, pon un límite elegante + alternativa sugerente + pregunta.";
  return [
    "Respondes al fan como creadora, en español.",
    "Formato: 1–2 frases + 1 pregunta. <240 caracteres. 1 emoji máximo.",
    explicitRule,
    "No moralices, no sermonees ni hables de políticas o bibliotecas.",
    "Escalera suave: Suave → Picante → Directo → Final (sin mencionar tiers/PPV).",
    "Evita palabras de catálogo (pack/premium/oferta/suscripción/mensual/link) salvo que el fan las use.",
    "No hagas copy: no repitas literalmente el mensaje del fan.",
    "Si el fan pide privado, ofrece Suave o Picante y pregunta cuál.",
    explicitRequestRule,
    "Solo habla de edad si el fan sugiere que no es +18; entonces pide verificación +18 y corta.",
    "Output: SOLO el mensaje final para enviar al fan.",
  ].join(" ");
};
const AGE_VERIFICATION_REPLY =
  "Antes de seguir: aquí solo +18. Si eres mayor de edad, confírmamelo y seguimos, ¿sí? 🙂";
const EXPLICIT_REQUEST_TEMPLATES = [
  "Uff, vas directo 😈. Aquí voy subiendo poco a poco; si quieres, te mando un extra en Directo o Final. ¿Cuál prefieres?",
  "Me gusta tu atrevimiento 😌. En el chat me quedo sugerente, pero en extra puedo ir a Directo o Final. ¿Te va cuál?",
  "Vas fuerte 😏. En abierto lo dejo pícaro; si quieres subir, te preparo un extra en Directo o Final. ¿Qué te apetece?",
];
const PRIVATE_REQUEST_TEMPLATES = [
  "Me gusta cómo suena 😏. ¿Lo hacemos Suave o Picante en privado?",
  "Perfecto 😌. ¿Prefieres algo Suave o más Picante?",
  "Me encanta esa idea 😏. ¿Te apetece Suave o Picante?",
];
const PROVIDER_UNAVAILABLE_REPLY = "Ahora mismo no puedo responder. ¿Reintentamos en unos segundos?";
const GENERIC_ERROR_REPLY = "No pude generar una respuesta ahora. ¿Probamos otra versión?";
const CRYPTO_MISCONFIGURED_REPLY =
  'Crypto mal configurado. Define APP_SECRET_KEYS="<newBase64>,hex:<oldHex>" (32 bytes), vuelve a guardar la API key en Ajustes → IA y reinicia el servidor.';
const PHASE_ACTIONS: Record<string, "suave" | "picante" | "directo" | "final"> = {
  phase_suave: "suave",
  phase_picante: "picante",
  phase_directo: "directo",
  phase_final: "final",
};
const PHASE_LABELS: Record<"suave" | "picante" | "directo" | "final", string> = {
  suave: "Suave",
  picante: "Picante",
  directo: "Directo",
  final: "Final",
};
const PHASE_DAYPART: Record<"suave" | "picante" | "directo" | "final", "DAY" | "NIGHT"> = {
  suave: "DAY",
  picante: "DAY",
  directo: "NIGHT",
  final: "NIGHT",
};
const PHASE_TIER: Record<"suave" | "picante" | "directo" | "final", ExtraTier> = {
  suave: "T1",
  picante: "T2",
  directo: "T2",
  final: "T3",
};
const BANNED_WORDS = ["pack", "premium", "oferta", "suscripción", "mensual", "link"];
const FAN_FEW_SHOTS: Array<{ fan: string; objective: string; heat: string; reply: string }> = [
  {
    fan: "Hola, ¿estás?",
    objective: "romper_hielo",
    heat: "suave",
    reply: "Hey, me alegra leerte. ¿Cómo te apetece seguir, suave o con un toque de chispa? 🙂",
  },
  {
    fan: "Hoy estoy cansado.",
    objective: "calentar",
    heat: "suave",
    reply: "Ven, te dejo algo suave para relajarte un poco. ¿Lo quieres corto o más lento?",
  },
  {
    fan: "¿Tienes algo más picante?",
    objective: "subir_nivel",
    heat: "picante",
    reply: "Podemos subir un poquito sin ir a lo bruto. ¿Lo hacemos picante o prefieres directo?",
  },
  {
    fan: "Me encantaría verte desnuda.",
    objective: "limite",
    heat: "picante",
    reply: "Aquí me quedo sugerente, pero puedo subir un paso con algo más intenso. ¿Te apetece suave o directo?",
  },
  {
    fan: "¿Podemos hablar en privado?",
    objective: "privado",
    heat: "intimo",
    reply: "Sí, podemos hacerlo más íntimo. ¿Te va algo suave o con más chispa?",
  },
  {
    fan: "Me gustó lo de anoche.",
    objective: "continuar",
    heat: "intimo",
    reply: "Me encanta que te quedaras con ganas. ¿Repetimos suave o subimos un poco hoy?",
  },
  {
    fan: "¿Qué me propones hoy?",
    objective: "ofrecer_extra",
    heat: "suave",
    reply: "Te preparo algo corto y rico para empezar. ¿Te apetece suave o con un toque más atrevido?",
  },
  {
    fan: "Estoy solo y con ganas.",
    objective: "conectar",
    heat: "picante",
    reply: "Entonces te acompaño con algo sugerente y lento. ¿Quieres que suba el tono o lo dejamos suave? 😏",
  },
];
const MARKETING_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bpacks?\b/gi, replacement: "extra" },
  { pattern: /\bpremium\b/gi, replacement: "algo más especial" },
  { pattern: /\bofertas?\b/gi, replacement: "propuesta" },
  { pattern: /\bsuscripci[oó]n(es)?\b/gi, replacement: "seguir por aquí" },
  { pattern: /\bmensual(idad|es)?\b/gi, replacement: "seguir más seguido" },
  { pattern: /\blinks?\b/gi, replacement: "por aquí" },
];
const GENERIC_RESPONSE_PATTERNS: RegExp[] = [
  /\bhola[,! ]/i,
  /\bqu[eé]\s+tal\b/i,
  /\bcomo\s+est[aá]s\b/i,
  /\ben\s+qu[eé]\s+puedo\s+ayudar(te)?\b/i,
  /\bestoy\s+aquí\s+para\s+ayudar(te)?\b/i,
  /\bgracias\s+por\s+escribir\b/i,
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatOkResponse | ChatErrorResponse>
) {
  if (!AI_ENABLED) {
    return sendAiDisabled(res);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json(
        buildChatErrorResponse(
          "method_not_allowed",
          "Method not allowed",
          undefined,
          undefined,
          undefined,
          "refusal",
          { content: "Method not allowed" }
        )
      );
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }
  const agencyContext = parseAgencyContext(body);

  const rawTab = typeof body.tab === "string" ? body.tab : "";
  const tab = rawTab ? normalizeTab(rawTab) : null;
  if (rawTab && !tab) {
    return sendBadRequest(res, "tab must be STRATEGY, CONTENT or GROWTH");
  }
  const mode = normalizeManagerMode(body.mode, tab);

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const rawLegacyMessage = typeof body.message === "string" ? body.message.trim() : "";
  const incomingText = rawText || rawLegacyMessage;
  const rawAction = typeof body.action === "string" ? body.action.trim() : "";
  const actionLabel = rawAction || null;

  const incomingMessages = normalizeChatMessages(body.messages);
  const ageSignal = resolveAgeSignal(body.ageSignal, incomingText, incomingMessages);
  const hasText = Boolean(incomingText);
  const hasMessages = incomingMessages.length > 0;

  if (!hasText && !hasMessages) {
    return sendBadRequest(res, "text or messages is required");
  }

  const fanIdRaw = typeof body.fanId === "string" ? body.fanId.trim() : "";
  if (!tab && !fanIdRaw) {
    return sendBadRequest(res, "fanId is required");
  }
  const fanId = fanIdRaw || null;

  try {
    const selection = await getCortexProviderSelection({ creatorId });
    if (selection.decryptFailed) {
      const provider = mapProvider(selection.provider);
      const model = selection.model ?? null;
      const meta = buildChatMeta({
        provider,
        model,
        action: actionLabel,
        usedFallback: true,
        latencyMs: 0,
      });
      const errorMessage = selection.decryptErrorMessage?.trim() || "crypto_misconfigured";
      return res
        .status(200)
        .json(
          buildChatErrorResponse(
            "CRYPTO_MISCONFIGURED",
            errorMessage,
            undefined,
            { usedFallback: true, provider, model, latencyMs: 0 },
            meta,
            "crypto_misconfigured",
            { content: CRYPTO_MISCONFIGURED_REPLY },
            null
          )
        );
    }

    if (!tab) {
      const baseMessages: ChatMessage[] =
        incomingMessages.length > 0 ? incomingMessages : [{ role: "user", content: incomingText }];
      const creatorSettings = await loadCreatorVoiceProfile(creatorId);
      const allowExplicitAdultContent = Boolean(creatorSettings.allowExplicitAdultContent);
      const policyDecision = evaluateAdultPolicy({
        text: incomingText,
        messages: baseMessages,
        allowExplicitAdultContent,
      });
      if (!policyDecision.allowed) {
        const provider: StandardProvider = "mock";
        const model = selection.model ?? null;
        const meta = buildChatMeta({
          provider,
          model,
          action: actionLabel,
          usedFallback: true,
          latencyMs: 0,
        });
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback: true,
          action: actionLabel,
          promptLength: getPromptLength(baseMessages),
          debug: null,
          meta,
        });
        return res
          .status(200)
          .json(
            buildChatErrorResponse(
              "POLICY_BLOCKED",
              "No permitido: menores o no consentimiento.",
              policyDecision.reason,
              { usedFallback: true, provider, model, latencyMs: 0 },
              meta,
              "refusal",
              { content: "No permitido: menores o no consentimiento." }
            )
          );
      }
      const isRewriteAction = Boolean(actionLabel && actionLabel.toLowerCase().startsWith("rewrite_"));
      const explicitRequest = resolveExplicitRequest(incomingText, baseMessages);
      const privateRequest = resolvePrivateRequest(incomingText, baseMessages);
      const enforceExplicitLimit = explicitRequest && !allowExplicitAdultContent;
      const phaseAction = resolvePhaseAction(actionLabel);
      const offerSuggestion = resolveOfferSuggestion({
        phaseAction,
        explicitRequest: !isRewriteAction && explicitRequest,
        privateRequest: !isRewriteAction && privateRequest,
      });
      const offerItem = offerSuggestion
        ? await selectPpvOffer({ creatorId, tier: offerSuggestion.tier, dayPart: offerSuggestion.dayPart })
        : null;
      const offer = offerSuggestion ? buildOfferPayload({ suggestion: offerSuggestion, item: offerItem ?? undefined }) : null;
      const fanLastMessage = resolveFanLastMessage(incomingText, baseMessages);
      const objective = resolveObjective({
        actionLabel,
        phaseAction,
        explicitRequest: enforceExplicitLimit,
        privateRequest,
      });
      const heatLevel = resolveHeatLevel({ actionLabel, phaseAction, explicitRequest, privateRequest });
      const creatorVoiceProfile = buildCreatorVoiceProfile(creatorSettings);
      const requestMessages = buildFanPromptMessages({
        baseMessages,
        phaseAction,
        fanPromptContext: buildFanPromptContext({
          fanLastMessage,
          creatorVoiceProfile,
          objective,
          heatLevel,
          bannedWords: BANNED_WORDS,
          agency: agencyContext ?? undefined,
        }),
        allowExplicitAdultContent,
      });
      const sanitizedMessages = sanitizeMessages(requestMessages, allowExplicitAdultContent);
      const promptLength = getPromptLength(requestMessages);
      if (ageSignal) {
        const assistantText = AGE_VERIFICATION_REPLY.trim();
        const assistantMessage = { role: "assistant" as const, content: assistantText };
        const responseMessages = [...requestMessages, assistantMessage];
        const provider: StandardProvider = "mock";
        const model = null;
        const meta = buildChatMeta({
          provider,
          model,
          action: actionLabel,
          usedFallback: true,
          latencyMs: 0,
        });
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback: true,
          action: actionLabel,
          promptLength,
          debug: null,
          meta,
        });
        return res
          .status(200)
          .json(
            buildChatSuccessResponse({
              assistantMessage,
              messages: responseMessages,
              usedFallback: true,
              provider,
              model,
              meta,
              status: "needs_age_gate",
              offer: null,
            })
          );
      }
      if (explicitRequest && !allowExplicitAdultContent) {
        const assistantText = pickExplicitTemplate();
        const assistantMessage = { role: "assistant" as const, content: assistantText };
        const responseMessages = [...requestMessages, assistantMessage];
        const provider: StandardProvider = "mock";
        const model = selection.model ?? null;
        const usedFallback = true;
        const meta = buildChatMeta({
          provider,
          model,
          action: actionLabel,
          usedFallback,
          latencyMs: 0,
        });
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback,
          action: actionLabel,
          promptLength,
          debug: null,
          meta,
        });
        return res
          .status(200)
          .json(
            buildChatSuccessResponse({
              assistantMessage,
              messages: responseMessages,
              usedFallback,
              provider,
              model,
              meta,
              status: "ok",
              offer: offer ?? undefined,
            })
          );
      }
      if (!phaseAction && privateRequest) {
        const assistantText = pickPrivateTemplate();
        const assistantMessage = { role: "assistant" as const, content: assistantText };
        const responseMessages = [...requestMessages, assistantMessage];
        const provider = mapProvider(selection.provider);
        const model = selection.model ?? null;
        const usedFallback = selection.provider === "demo" || !selection.configured;
        const meta = buildChatMeta({
          provider,
          model,
          action: actionLabel,
          usedFallback,
          latencyMs: 0,
        });
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback,
          action: actionLabel,
          promptLength,
          debug: null,
          meta,
        });
        return res
          .status(200)
          .json(
            buildChatSuccessResponse({
              assistantMessage,
              messages: responseMessages,
              usedFallback,
              provider,
              model,
              meta,
              status: "ok",
              offer: offer ?? undefined,
            })
          );
      }
      const debugInfo =
        selection.provider === "ollama"
          ? buildOllamaOpenAiRequest({
              baseUrl: selection.baseUrl || "",
              path: "chat/completions",
              payload: {
                model: selection.model ?? "ollama",
                messages: sanitizedMessages,
                temperature: resolveTemperature(),
                max_tokens: DEFAULT_MAX_TOKENS,
              },
              creatorId,
            }).debug
          : null;

      const aiResult = await requestCortexCompletion({
        messages: sanitizedMessages,
        creatorId,
        fanId,
        route: "/api/creator/ai-manager/chat",
        selection,
      });

      let usedFallback = aiResult.provider === "demo";
      let provider = mapProvider(aiResult.provider);
      let model = aiResult.model ?? selection.model ?? null;
      let meta = buildChatMeta({
        provider,
        model,
        action: actionLabel,
        usedFallback,
        latencyMs: aiResult.latencyMs,
      });

      if (!aiResult.ok) {
        const providerErrorType = resolveProviderErrorType({
          errorCode: aiResult.errorCode,
          errorMessage: aiResult.errorMessage,
          status: aiResult.status,
        });
        const providerUnavailable = isProviderUnavailableError(aiResult);
        const refusalByCode = isRefusalErrorCode(aiResult.errorCode);
        const fallbackText = await buildTemplateFallback({
          creatorId,
          fanLastMessage,
          agency: agencyContext,
          offer,
          phaseAction,
        });
        console.error("manager_ai_provider_error", {
          creatorId,
          fanId,
          provider: aiResult.provider,
          status: aiResult.status ?? null,
          code: aiResult.errorCode ?? "ai_error",
          message: aiResult.errorMessage ?? "ai_error",
        });
        if (refusalByCode) {
          const assistantMessage = { role: "assistant" as const, content: fallbackText };
          const responseMessages = [...requestMessages, assistantMessage];
          const fallbackMeta = buildChatMeta({
            provider,
            model,
            action: actionLabel,
            usedFallback: true,
            latencyMs: meta.latencyMs,
          });
          logDevManagerRequest({
            route: "/api/creator/ai-manager/chat",
            creatorId,
            fanId,
            hasText,
            hasMessages,
            usedFallback: true,
            action: actionLabel,
            promptLength,
            debug: debugInfo,
            meta: fallbackMeta,
          });
          return res
            .status(200)
            .json(
              buildChatSuccessResponse({
                assistantMessage,
                messages: responseMessages,
                usedFallback: true,
                provider,
                model,
                meta: fallbackMeta,
                status: "ok",
                offer: offer ?? undefined,
              })
            );
        }
        try {
          await logCortexLlmUsage({
            creatorId,
            fanId,
            endpoint: "/api/creator/ai-manager/chat",
            provider: aiResult.provider,
            model: aiResult.model ?? selection.model ?? null,
            tokensIn: aiResult.tokensIn,
            tokensOut: aiResult.tokensOut,
            latencyMs: aiResult.latencyMs,
            ok: false,
            errorCode: providerErrorType,
            actionType: "manager_chat",
            context: {
              kind: "manager_chat",
              errorSnippet: buildErrorSnippet(aiResult.errorMessage ?? ""),
            },
          });
        } catch (err) {
          console.warn("cortex_usage_log_failed", err);
        }
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback,
          action: actionLabel,
          promptLength,
          debug: debugInfo,
          meta,
        });
        const details = formatDetails([
          aiResult.provider ? `provider=${aiResult.provider}` : null,
          aiResult.status ? `status=${aiResult.status}` : null,
          aiResult.errorCode ? `code=${aiResult.errorCode}` : null,
          aiResult.errorMessage ? `message=${aiResult.errorMessage}` : null,
        ]);
        const errorCode: ChatErrorCode =
          providerErrorType === "MODEL_NOT_FOUND"
            ? "MODEL_NOT_FOUND"
            : providerErrorType === "TIMEOUT"
            ? "TIMEOUT"
            : providerErrorType === "PROVIDER_ERROR"
            ? "PROVIDER_ERROR"
            : providerUnavailable
            ? "PROVIDER_UNAVAILABLE"
            : "ai_error";
        const errorMessage =
          providerErrorType === "MODEL_NOT_FOUND"
            ? `Modelo no encontrado (AI_MODEL=${model ?? "?"}).`
            : providerErrorType === "TIMEOUT"
            ? "Timeout hablando con Ollama."
            : providerErrorType === "PROVIDER_ERROR"
            ? "IA local no disponible (Ollama)."
            : providerUnavailable
            ? "IA local no disponible (Ollama)."
            : "No se pudo procesar el chat del Manager IA";
        const reply =
          providerErrorType === "MODEL_NOT_FOUND" || providerErrorType === "TIMEOUT" || providerErrorType === "PROVIDER_ERROR"
            ? errorMessage
            : providerUnavailable
            ? PROVIDER_UNAVAILABLE_REPLY
            : GENERIC_ERROR_REPLY;
        const status: ChatStatus =
          providerErrorType === "MODEL_NOT_FOUND" ? "refusal" : providerUnavailable ? "provider_down" : "refusal";
        return res
          .status(200)
          .json(
            buildChatErrorResponse(
              errorCode,
              errorMessage,
              details,
              { usedFallback, provider, model, latencyMs: meta.latencyMs, offer: offer ?? undefined },
              meta,
              status,
              { content: reply },
              offer
            )
          );
      }

      let assistantText = typeof aiResult.text === "string" ? aiResult.text.trim() : "";
      if (mode === "message") {
        assistantText = sanitizeManagerMessageForFan(assistantText);
      }
      if (!ageSignal && hasUnderageTerms(assistantText)) {
        const underageFallback = phaseAction ? buildPhaseFallback(phaseAction) : SAFE_FALLBACK_MESSAGE;
        const safeMessages = injectSystemInstruction(
          sanitizedMessages,
          buildUnderageRegenerateInstruction()
        );
        const retryResult = await requestCortexCompletion({
          messages: safeMessages,
          creatorId,
          fanId,
          route: "/api/creator/ai-manager/chat",
          selection,
        });
        if (retryResult.ok) {
          const retryTextRaw = typeof retryResult.text === "string" ? retryResult.text.trim() : "";
          const retryText = sanitizeManagerMessageForFan(retryTextRaw);
          if (retryText && !hasUnderageTerms(retryText) && !isRefusalLike(retryText) && !isSoftRefusal(retryText)) {
            assistantText = retryText;
            usedFallback = retryResult.provider === "demo";
            provider = mapProvider(retryResult.provider);
            model = retryResult.model ?? selection.model ?? null;
            meta = buildChatMeta({
              provider,
              model,
              action: actionLabel,
              usedFallback,
              latencyMs: retryResult.latencyMs,
            });
          } else {
            assistantText = underageFallback;
            usedFallback = true;
            provider = "mock";
            model = null;
            meta = buildChatMeta({
              provider,
              model,
              action: actionLabel,
              usedFallback,
              latencyMs: 0,
            });
          }
        } else {
          assistantText = underageFallback;
          usedFallback = true;
          provider = "mock";
          model = null;
          meta = buildChatMeta({
            provider,
            model,
            action: actionLabel,
            usedFallback,
            latencyMs: 0,
          });
        }
      }
      if (isRefusalLike(assistantText) || isSoftRefusal(assistantText) || looksMoralizing(assistantText)) {
        const fallbackText = await buildTemplateFallback({
          creatorId,
          fanLastMessage,
          agency: agencyContext,
          offer,
          phaseAction,
        });
        const assistantMessage = { role: "assistant" as const, content: fallbackText };
        const responseMessages = [...requestMessages, assistantMessage];
        const fallbackMeta = buildChatMeta({
          provider,
          model,
          action: actionLabel,
          usedFallback: true,
          latencyMs: meta.latencyMs,
        });
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback: true,
          action: actionLabel,
          promptLength,
          debug: debugInfo,
          meta: fallbackMeta,
        });
        return res
          .status(200)
          .json(
            buildChatSuccessResponse({
              assistantMessage,
              messages: responseMessages,
              usedFallback: true,
              provider,
              model,
              meta: fallbackMeta,
              status: "ok",
              offer: offer ?? undefined,
            })
          );
      }
      if (!assistantText) {
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback,
          action: actionLabel,
          promptLength,
          debug: debugInfo,
          meta,
        });
        return res
          .status(200)
          .json(
            buildChatErrorResponse(
              "empty_ai_response",
              "empty_ai_response",
              undefined,
              { usedFallback, provider, model, latencyMs: meta.latencyMs, offer: offer ?? undefined },
              meta,
              "refusal",
              { content: GENERIC_ERROR_REPLY },
              offer
            )
          );
      }

      const genericFallback = buildGenericFallback(heatLevel);
      let marketingResult = postProcessMarketing(assistantText, fanLastMessage);
      assistantText = marketingResult.text;
      if (marketingResult.shouldRegenerate) {
        const regenMessages = injectSystemInstruction(
          sanitizedMessages,
          buildRegenerateInstruction(BANNED_WORDS)
        );
        const regenResult = await requestCortexCompletion({
          messages: regenMessages,
          creatorId,
          fanId,
          route: "/api/creator/ai-manager/chat",
          selection,
        });
        if (regenResult.ok) {
          const regenTextRaw = typeof regenResult.text === "string" ? regenResult.text.trim() : "";
          const regenText = mode === "message" ? sanitizeManagerMessageForFan(regenTextRaw) : regenTextRaw;
          assistantText = regenText || assistantText;
          usedFallback = regenResult.provider === "demo";
          provider = mapProvider(regenResult.provider);
          model = regenResult.model ?? selection.model ?? null;
          meta = buildChatMeta({
            provider,
            model,
            action: actionLabel,
            usedFallback,
            latencyMs: regenResult.latencyMs,
          });
        }
        const postRegen = postProcessMarketing(assistantText, fanLastMessage);
        assistantText = postRegen.text;
      }
      if (isGenericResponse(assistantText)) {
        assistantText = genericFallback;
        usedFallback = true;
        meta = buildChatMeta({
          provider,
          model,
          action: actionLabel,
          usedFallback,
          latencyMs: meta.latencyMs,
        });
      }
      const enforcedText = enforceResponseConstraints(assistantText, genericFallback);
      if (enforcedText !== assistantText) {
        assistantText = enforcedText;
        usedFallback = true;
        meta = buildChatMeta({
          provider,
          model,
          action: actionLabel,
          usedFallback,
          latencyMs: meta.latencyMs,
        });
      }

      const assistantMessage = { role: "assistant" as const, content: assistantText };
      const responseMessages = [...requestMessages, assistantMessage];
      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback,
        action: actionLabel,
        promptLength,
        debug: debugInfo,
        meta,
      });

      return res
        .status(200)
        .json(
          buildChatSuccessResponse({
            assistantMessage,
            messages: responseMessages,
            usedFallback,
            provider,
            model,
            meta,
            status: "ok",
            offer,
          })
        );
    }

    const incomingMessage = incomingText;
    if (!incomingMessage) {
      return sendBadRequest(res, "message is required");
    }

    const action = normalizeManagerAction(actionLabel);
    const growthAction = actionLabel && actionLabel.startsWith("growth_") ? actionLabel : null;

    const context = await buildManagerContext(creatorId);
    const translateConfig = await getEffectiveTranslateConfig(creatorId);
    const creatorLang = translateConfig.creatorLang ?? "es";
    const safeContext = sanitizeForOpenAi(context, { creatorId }) as any;

    await logMessage({
      creatorId,
      tab,
      role: ManagerAiRole.CREATOR,
      content: incomingMessage,
      meta: action
        ? { action: actionLabel ?? action ?? growthAction ?? undefined }
        : actionLabel
        ? { action: actionLabel }
        : undefined,
    });

    const settingsStatus: ChatOkResponse["settingsStatus"] =
      selection.decryptFailed
        ? "decrypt_failed"
        : selection.provider === "demo" || !selection.configured
        ? "settings_missing"
        : "ok";

    if (selection.decryptFailed || selection.provider === "demo" || !selection.configured) {
      const demoReply = buildDemoManagerReply(tabToString(tab), context) as ManagerReply;
      await logMessage({
        creatorId,
        tab,
        role: ManagerAiRole.ASSISTANT,
        content: demoReply.text,
        meta: { ...demoReply, action: actionLabel ?? action ?? growthAction ?? undefined },
        creditsUsed: 0,
      });

      const assistantText = typeof demoReply.text === "string" ? demoReply.text.trim() : "";
      if (!assistantText) {
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback: true,
          action: actionLabel,
          promptLength: 0,
          debug: null,
          meta: buildChatMeta({
            provider: "mock",
            model: selection.model ?? "demo",
            action: actionLabel,
            usedFallback: true,
            latencyMs: 0,
          }),
        });
        return res
          .status(200)
          .json(
            buildChatErrorResponse(
              "empty_ai_response",
              "empty_ai_response",
              undefined,
              { usedFallback: true, provider: "mock", model: selection.model ?? "demo", latencyMs: 0 },
              buildChatMeta({
                provider: "mock",
                model: selection.model ?? "demo",
                action: actionLabel,
                usedFallback: true,
                latencyMs: 0,
              }),
              "refusal",
              { content: GENERIC_ERROR_REPLY }
            )
          );
      }

      const assistantMessage = { role: "assistant" as const, content: assistantText };
      const baseMessages =
        incomingMessages.length > 0 ? incomingMessages : [{ role: "user" as const, content: incomingMessage }];
      const responseMessages = [...baseMessages, assistantMessage];
      const provider: StandardProvider = "mock";
      const model = selection.model ?? "demo";
      const meta = buildChatMeta({
        provider,
        model,
        action: actionLabel,
        usedFallback: true,
        latencyMs: 0,
      });
      const promptLength = getPromptLength(baseMessages);

      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback: true,
        action: actionLabel,
        promptLength,
        debug: null,
        meta,
      });

      return res
        .status(200)
        .json(
          buildChatSuccessResponse({
            assistantMessage,
            messages: responseMessages,
            usedFallback: true,
            provider,
            model,
            replyMeta: demoReply,
            creditsUsed: 0,
            creditsRemaining: context.settings.creditsAvailable,
            settingsStatus,
            aiMode: "demo",
            meta,
            status: "ok",
          })
        );
    }

    const history = await prisma.managerAiMessage.findMany({
      where: { creatorId, tab },
      orderBy: { createdAt: "asc" },
      take: HISTORY_LIMIT + 1,
    });

    const isGrowth = tab === ManagerAiTab.GROWTH;
    const { systemPrompt, userPrompt } = isGrowth
      ? (() => {
          const prompts = buildGrowthPrompts({
            context: safeContext,
            metrics: incomingMessage,
            action: growthAction as any,
            language: creatorLang,
          });
          return { systemPrompt: prompts.system, userPrompt: prompts.user };
        })()
      : {
          systemPrompt: buildManagerSystemPrompt(tabToString(tab), safeContext.settings, action, creatorLang),
          userPrompt: buildManagerUserPrompt(safeContext, incomingMessage, action),
        };

    const historyMessages: Array<{ role: "user" | "assistant"; content: string }> = history
      .slice(-HISTORY_LIMIT)
      .map((msg) => ({
        role: msg.role === ManagerAiRole.CREATOR ? "user" : "assistant",
        content: msg.content,
      }));

    const openAiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userPrompt },
    ];
    const promptLength = getPromptLength(openAiMessages);

    const debugInfo =
      selection.provider === "ollama"
        ? buildOllamaOpenAiRequest({
            baseUrl: selection.baseUrl || "",
            path: "chat/completions",
            payload: {
              model: selection.model ?? "ollama",
              messages: openAiMessages,
              temperature: resolveTemperature(),
              max_tokens: DEFAULT_MAX_TOKENS,
            },
            creatorId,
          }).debug
        : null;

    const aiResult = await requestCortexCompletion({
      messages: openAiMessages,
      creatorId,
      fanId: null,
      route: "/api/creator/ai-manager/chat",
      selection,
    });
    const provider = mapProvider(aiResult.provider);
    const model = aiResult.model ?? selection.model ?? null;
    const meta = buildChatMeta({
      provider,
      model,
      action: actionLabel,
      usedFallback: false,
      latencyMs: aiResult.latencyMs,
    });

    if (!aiResult.ok) {
      const providerErrorType = resolveProviderErrorType({
        errorCode: aiResult.errorCode,
        errorMessage: aiResult.errorMessage,
        status: aiResult.status,
      });
      const providerUnavailable = isProviderUnavailableError(aiResult);
      console.error("manager_ai_provider_error", {
        creatorId,
        provider: aiResult.provider,
        status: aiResult.status ?? null,
        code: aiResult.errorCode ?? "ai_error",
        message: aiResult.errorMessage ?? "ai_error",
      });
      try {
        await logCortexLlmUsage({
          creatorId,
          fanId: null,
          endpoint: "/api/creator/ai-manager/chat",
          provider: aiResult.provider,
          model: aiResult.model ?? selection.model ?? null,
          tokensIn: aiResult.tokensIn,
          tokensOut: aiResult.tokensOut,
          latencyMs: aiResult.latencyMs,
          ok: false,
          errorCode: providerErrorType,
          actionType: "manager_chat",
          context: {
            kind: "manager_chat",
            tab: tabToString(tab),
            errorSnippet: buildErrorSnippet(aiResult.errorMessage ?? ""),
          },
        });
      } catch (err) {
        console.warn("cortex_usage_log_failed", err);
      }
      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback: false,
        action: actionLabel,
        promptLength,
        debug: debugInfo,
        meta,
      });
      const details = formatDetails([
        aiResult.provider ? `provider=${aiResult.provider}` : null,
        aiResult.status ? `status=${aiResult.status}` : null,
        aiResult.errorCode ? `code=${aiResult.errorCode}` : null,
        aiResult.errorMessage ? `message=${aiResult.errorMessage}` : null,
      ]);
      const errorCode: ChatErrorCode =
        providerErrorType === "MODEL_NOT_FOUND"
          ? "MODEL_NOT_FOUND"
          : providerErrorType === "TIMEOUT"
          ? "TIMEOUT"
          : providerErrorType === "PROVIDER_ERROR"
          ? "PROVIDER_ERROR"
          : providerUnavailable
          ? "PROVIDER_UNAVAILABLE"
          : "ai_error";
      const errorMessage =
        providerErrorType === "MODEL_NOT_FOUND"
          ? `Modelo no encontrado (AI_MODEL=${model ?? "?"}).`
          : providerErrorType === "TIMEOUT"
          ? "Timeout hablando con Ollama."
          : providerErrorType === "PROVIDER_ERROR"
          ? "IA local no disponible (Ollama)."
          : providerUnavailable
          ? "IA local no disponible (Ollama)."
          : "No se pudo procesar el chat del Manager IA";
      const reply =
        providerErrorType === "MODEL_NOT_FOUND" || providerErrorType === "TIMEOUT" || providerErrorType === "PROVIDER_ERROR"
          ? errorMessage
          : providerUnavailable
          ? PROVIDER_UNAVAILABLE_REPLY
          : GENERIC_ERROR_REPLY;
      const status: ChatStatus =
        providerErrorType === "MODEL_NOT_FOUND" ? "refusal" : providerUnavailable ? "provider_down" : "refusal";
      return res
        .status(200)
        .json(
          buildChatErrorResponse(
            errorCode,
            errorMessage,
            details,
            { usedFallback: false, provider, model, latencyMs: meta.latencyMs },
            meta,
            status,
            { content: reply }
          )
        );
    }

    const reply: ManagerReply = parseManagerReply(aiResult.text ?? "", tab);
    if (reply?.meta && (reply.meta as any).parseError) {
      try {
        await logCortexLlmUsage({
          creatorId,
          fanId: null,
          endpoint: "/api/creator/ai-manager/chat",
          provider: aiResult.provider,
          model: aiResult.model ?? selection.model ?? null,
          tokensIn: aiResult.tokensIn,
          tokensOut: aiResult.tokensOut,
          latencyMs: aiResult.latencyMs,
          ok: true,
          errorCode: "JSON_PARSE",
          actionType: "manager_chat",
          context: {
            kind: "manager_chat",
            tab: tabToString(tab),
            errorSnippet: buildErrorSnippet(aiResult.text ?? ""),
          },
        });
      } catch (err) {
        console.warn("cortex_usage_log_failed", err);
      }
    }
    const assistantText = typeof reply.text === "string" ? reply.text.trim() : "";
    if (!assistantText) {
      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback: false,
        action: actionLabel,
        promptLength,
        debug: debugInfo,
        meta,
      });
      return res
        .status(200)
        .json(
          buildChatErrorResponse(
            "empty_ai_response",
            "empty_ai_response",
            undefined,
            { usedFallback: false, provider, model, latencyMs: meta.latencyMs },
            meta,
            "refusal",
            { content: GENERIC_ERROR_REPLY }
          )
        );
    }

    const totalTokens = (aiResult.tokensIn ?? 0) + (aiResult.tokensOut ?? 0);
    const creditsUsed = calculateCredits(totalTokens);
    const usedFallback = false;
    const aiMode: ChatOkResponse["aiMode"] = "live";

    await logMessage({
      creatorId,
      tab,
      role: ManagerAiRole.ASSISTANT,
      content: reply.text,
      meta: reply
        ? { ...reply, action: actionLabel ?? action ?? growthAction ?? undefined }
        : { action: actionLabel ?? action ?? growthAction ?? undefined },
      creditsUsed,
    });

    if (!usedFallback && creditsUsed > 0) {
      await registerAiUsage({
        creatorId,
        fanId: null,
        type: AiUsageType.MANAGER,
        origin:
          tab === ManagerAiTab.STRATEGY
            ? AiUsageOrigin.MANAGER_STRATEGY
            : tab === ManagerAiTab.CONTENT
            ? AiUsageOrigin.MANAGER_CONTENT
            : AiUsageOrigin.MANAGER_GROWTH,
        creditsUsed,
        context: { tab: tabToString(tab), reply },
      });
    }

    const assistantMessage = { role: "assistant" as const, content: assistantText };
    const baseMessages =
      incomingMessages.length > 0 ? incomingMessages : [{ role: "user" as const, content: incomingMessage }];
    const responseMessages = [...baseMessages, assistantMessage];

    logDevManagerRequest({
      route: "/api/creator/ai-manager/chat",
      creatorId,
      fanId,
      hasText,
      hasMessages,
      usedFallback,
      action: actionLabel,
      promptLength,
      debug: debugInfo,
      meta,
    });

    return res
      .status(200)
      .json(
        buildChatSuccessResponse({
          assistantMessage,
          messages: responseMessages,
          usedFallback,
          provider,
          model,
          replyMeta: reply,
          creditsUsed,
          creditsRemaining: context.settings.creditsAvailable - creditsUsed,
          settingsStatus,
          aiMode,
          meta,
          status: "ok",
        })
      );
  } catch (err) {
    console.error("Error processing manager chat", toSafeErrorMessage(err));
    return res
      .status(200)
      .json(
        buildChatErrorResponse(
          "ai_error",
          "No se pudo procesar el chat del Manager IA",
          toSafeErrorMessage(err),
          undefined,
          undefined,
          "refusal",
          { content: GENERIC_ERROR_REPLY }
        )
      );
  }
}

async function logMessage(data: {
  creatorId: string;
  tab: ManagerAiTab;
  role: ManagerAiRole;
  content: string;
  meta?: Record<string, any> | null;
  creditsUsed?: number;
}) {
  try {
    await prisma.managerAiMessage.create({
      data: {
        creatorId: data.creatorId,
        tab: data.tab,
        role: data.role,
        content: data.content,
        meta: data.meta ?? undefined,
        creditsUsed: data.creditsUsed ?? 0,
      },
    });
  } catch (err) {
    console.error("Error saving manager AI message", err);
  }
}

function normalizeTab(tab: string): ManagerAiTab | null {
  const upper = (tab || "").toUpperCase();
  if (upper === "STRATEGY") return ManagerAiTab.STRATEGY;
  if (upper === "CONTENT") return ManagerAiTab.CONTENT;
  if (upper === "GROWTH") return ManagerAiTab.GROWTH;
  return null;
}

function tabToString(tab: ManagerAiTab): "STRATEGY" | "CONTENT" | "GROWTH" {
  if (tab === ManagerAiTab.CONTENT) return "CONTENT";
  if (tab === ManagerAiTab.GROWTH) return "GROWTH";
  return "STRATEGY";
}

function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: ChatMessage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const roleRaw = typeof record.role === "string" ? record.role.trim().toLowerCase() : "";
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (!content) continue;
    if (roleRaw === "system" || roleRaw === "user" || roleRaw === "assistant") {
      out.push({ role: roleRaw as ChatMessage["role"], content });
    }
  }
  return out;
}

function resolveAgeSignal(value: unknown, text: string, messages: ChatMessage[]): boolean {
  if (coerceBoolean(value)) return true;
  if (detectAgeSignal(text)) return true;
  if (messages.length === 0) return false;
  const combined = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");
  return detectAgeSignal(combined);
}

function resolveExplicitRequest(text: string, messages: ChatMessage[]): boolean {
  if (isExplicitRequest(text)) return true;
  if (messages.length === 0) return false;
  const combined = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");
  return isExplicitRequest(combined);
}

function resolvePrivateRequest(text: string, messages: ChatMessage[]): boolean {
  if (isPrivateRequest(text)) return true;
  if (messages.length === 0) return false;
  const combined = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");
  return isPrivateRequest(combined);
}

function coerceBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function detectAgeSignal(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const patterns = [
    /\b(tengo|cumplo)\s*1[0-7]\b/i,
    /\b(tengo|cumplo)\s*1[0-7]\s*(años|anos)\b/i,
    /\b1[0-7]\s*(años|anos)\b/i,
    /\bsoy\s*menor\b/i,
    /\bmenor\s+de\s+edad\b/i,
    /\bsoy\s*1[0-7]\b/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isExplicitRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const patterns = [
    /\b(tetas|pechos|pezones|polla|pene|vagina|clitoris|clítoris|culo)\b/i,
    /\b(nudes?|desnuda|desnudo)\b/i,
    /\b(fotos?)\b/i,
    /\b(sexo|sex|anal|oral|mamada|corrida|masturbar|masturbando|masturbaci[oó]n)\b/i,
    /\b(blowjob|boobs?|tits?|dick|cock|pussy)\b/i,
    /\b(pack\s+(caliente|hot|xxx|sexy))\b/i,
    /\bfoto\s+(hot|sexy|desnuda|desnudo|nude|nudes)\b/i,
    /\b(ens[eé]ñame|muestrame|mostrar|ver)\s+(las|los|tu|tus)?\s*(tetas|pechos|polla|pene|culo)\b/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isPrivateRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const patterns = [
    /\bprivado\b/i,
    /\bprivada\b/i,
    /\bprivadito\b/i,
    /\bpor privado\b/i,
    /\bpor dm\b/i,
    /\bpor mensaje\b/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function pickExplicitTemplate(): string {
  if (EXPLICIT_REQUEST_TEMPLATES.length === 0) return "";
  const index = Math.floor(Math.random() * EXPLICIT_REQUEST_TEMPLATES.length);
  return EXPLICIT_REQUEST_TEMPLATES[index];
}

function pickPrivateTemplate(): string {
  if (PRIVATE_REQUEST_TEMPLATES.length === 0) return "";
  const index = Math.floor(Math.random() * PRIVATE_REQUEST_TEMPLATES.length);
  return PRIVATE_REQUEST_TEMPLATES[index];
}

function buildPhaseFallback(phase: "suave" | "picante" | "directo" | "final"): string {
  if (phase === "suave") return "Vamos con algo Suave 😏. ¿Lo dejamos así o subimos a Picante con un extra?";
  if (phase === "picante") return "Subimos a Picante 😏. ¿Te va así o prefieres Directo en privado?";
  if (phase === "directo") return "Te preparo algo Directo 😏. ¿Lo quieres Directo o Final?";
  return "Vamos a Final 😏. ¿Te apetece Final o lo dejamos Directo?";
}

async function buildTemplateFallback(args: {
  creatorId: string;
  fanLastMessage: string;
  agency: AgencyContext | null;
  offer: ChatOffer | null;
  phaseAction: "suave" | "picante" | "directo" | "final" | null;
}): Promise<string> {
  const fallback = args.phaseAction ? buildPhaseFallback(args.phaseAction) : SAFE_FALLBACK_MESSAGE;
  try {
    const defaultStage = args.phaseAction ? "HEAT" : "WARM_UP";
    const stage =
      (args.agency?.stage && normalizeAgencyStage(args.agency.stage)) ||
      (defaultStage as AgencyStage);
    const normalizedStage = stage === "NEW" ? (defaultStage as AgencyStage) : stage;
    const objective = resolveObjectiveForScoring(
      normalizeObjectiveCode(args.agency?.objective)
    );
    const intensity =
      (args.agency?.intensity && normalizeAgencyIntensity(args.agency.intensity)) ||
      ("MEDIUM" as AgencyIntensity);
    const playbook =
      (args.agency?.playbook && normalizeAgencyPlaybook(args.agency.playbook)) ||
      ("GIRLFRIEND" as AgencyPlaybook);
    const offer =
      args.offer && typeof args.offer === "object"
        ? {
            title: args.offer.title ?? null,
            tier: args.offer.tier ?? null,
            priceCents: typeof args.offer.price === "number" ? args.offer.price : null,
            currency: null,
          }
        : null;
    const result = await buildAgencyDraft({
      creatorId: args.creatorId,
      fanName: null,
      lastFanMsg: args.fanLastMessage,
      stage: normalizedStage,
      objective,
      intensity,
      playbook,
      offer,
      mode: "full",
    });
    return result.text?.trim() || fallback;
  } catch (err) {
    console.error("Error building template fallback", err);
    return fallback;
  }
}

function sanitizeForModel(text: string, allowExplicitAdultContent: boolean): string {
  if (!text) return text;
  if (allowExplicitAdultContent) return text;
  const patterns: RegExp[] = [
    /\b(tetas|pechos|pezones|polla|pene|vagina|clitoris|clítoris|culo)\b/gi,
    /\b(sexo|sex|follar|anal|oral|mamada|corrida|masturbar|masturbando|masturbaci[oó]n)\b/gi,
    /\b(desnuda|desnudo|nudes?)\b/gi,
    /\b(boobs?|tits?|dick|cock|pussy)\b/gi,
  ];
  let sanitized = text;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, "[PETICION_EXPLICITA]");
  }
  return sanitized;
}

function sanitizeMessages(messages: ChatMessage[], allowExplicitAdultContent: boolean): ChatMessage[] {
  if (allowExplicitAdultContent) return messages;
  return messages.map((msg) => ({
    ...msg,
    content: sanitizeForModel(msg.content, allowExplicitAdultContent),
  }));
}

function hasUnderageTerms(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const patterns = [
    /\bmenor(es)?\b/i,
    /\bunderage\b/i,
    /\bchild\b/i,
    /\bchildren\b/i,
    /\bexplotaci[oó]n\b/i,
    /\bexploitation\b/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function getPromptLength(messages: ChatMessage[]): number {
  if (!messages.length) return 0;
  return messages.reduce((total, msg) => total + msg.content.length, 0);
}

function resolvePhaseAction(action?: string | null): "suave" | "picante" | "directo" | "final" | null {
  const normalized = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (!normalized) return null;
  return PHASE_ACTIONS[normalized] ?? null;
}

function resolveOfferSuggestion(params: {
  phaseAction: "suave" | "picante" | "directo" | "final" | null;
  explicitRequest: boolean;
  privateRequest: boolean;
}): { tier: ExtraTier; dayPart: "DAY" | "NIGHT" | "ANY" } | null {
  if (params.phaseAction) {
    return { tier: PHASE_TIER[params.phaseAction], dayPart: PHASE_DAYPART[params.phaseAction] };
  }
  if (params.explicitRequest) {
    return { tier: "T2", dayPart: "ANY" };
  }
  if (params.privateRequest) {
    return { tier: "T1", dayPart: "ANY" };
  }
  return null;
}

function buildOfferPayload(params: {
  suggestion: { tier: ExtraTier; dayPart: "DAY" | "NIGHT" | "ANY" };
  item?: { id: string; title: string } | null;
}): ChatOffer {
  const offer: ChatOffer = {
    tier: params.suggestion.tier,
    dayPart: params.suggestion.dayPart,
  };
  if (params.item?.id && params.item?.title) {
    offer.contentId = params.item.id;
    offer.title = params.item.title;
  }
  return offer;
}

function isProviderUnavailableError(params: { errorCode?: string; status?: number | null; errorMessage?: string }): boolean {
  const code = (params.errorCode ?? "").toString().toLowerCase();
  const message = (params.errorMessage ?? "").toString().toLowerCase();
  const status = typeof params.status === "number" ? params.status : null;
  const networkSignals = ["timeout", "econnrefused", "enotfound", "ehostunreach", "econnreset", "etimedout", "fetch_failed"];
  if (networkSignals.some((signal) => code.includes(signal))) return true;
  if (message.includes("fetch failed") || message.includes("connection refused")) return true;
  if (status !== null && status >= 500) return true;
  return false;
}

function resolveSlotFromLegacy(slot?: ExtraSlot | null, timeOfDay?: TimeOfDay | null): ExtraSlot {
  if (slot) return slot;
  if (timeOfDay === "DAY") return "DAY_1";
  if (timeOfDay === "NIGHT") return "NIGHT_1";
  return "ANY";
}

function matchesDayPart(slot: ExtraSlot, dayPart: "DAY" | "NIGHT" | "ANY"): boolean {
  if (dayPart === "ANY") return slot === "ANY";
  if (dayPart === "DAY") return slot === "DAY_1" || slot === "DAY_2";
  return slot === "NIGHT_1" || slot === "NIGHT_2";
}

async function selectPpvOffer(params: {
  creatorId: string;
  tier: ExtraTier;
  dayPart: "DAY" | "NIGHT" | "ANY";
}): Promise<{ id: string; title: string } | null> {
  const items = await prisma.contentItem.findMany({
    where: {
      creatorId: params.creatorId,
      visibility: "EXTRA",
      extraTier: params.tier,
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  if (!items.length) return null;

  const resolved = items.map((item) => ({
    id: item.id,
    title: item.title,
    slot: resolveSlotFromLegacy(item.extraSlot, item.timeOfDay),
  }));

  if (params.dayPart === "ANY") {
    const anySlot = resolved.find((item) => item.slot === "ANY");
    return anySlot ?? resolved[0] ?? null;
  }

  const directMatch = resolved.find((item) => matchesDayPart(item.slot, params.dayPart));
  if (directMatch) return directMatch;
  const anyMatch = resolved.find((item) => item.slot === "ANY");
  return anyMatch ?? null;
}

const SAFE_FALLBACK_MESSAGE = "Uff, vas directo 😈. Aquí me gusta subir poco a poco. ¿Suave o picante?";

function sendBadRequest(res: NextApiResponse<ChatErrorResponse>, message: string) {
  return res
    .status(200)
    .json(buildChatErrorResponse("bad_request", message, undefined, undefined, undefined, "refusal", { content: message }));
}

function parseManagerReply(raw: string, tab: ManagerAiTab): ManagerReply {
  if (tab === ManagerAiTab.GROWTH) {
    return { mode: "GROWTH", text: raw, meta: {} } as ManagerReply;
  }
  const parsedResult = safeJsonParse(raw);
  if (!parsedResult.value || typeof parsedResult.value !== "object") {
    return {
      mode: tabToString(tab),
      text: raw,
      suggestedFans: [],
      dailyScripts: [],
      packIdeas: [],
      meta: { parseError: true },
    } as ManagerReply;
  }
  const parsed = parsedResult.value as Partial<ManagerReply>;
  const text = typeof parsed.text === "string" && parsed.text.trim().length > 0 ? parsed.text : raw;
  const reply: ManagerReply = {
    ...(parsed as any),
    mode: tabToString(tab),
    text,
  };
  if (parsedResult.parsedFrom !== "direct") {
    reply.meta = { ...(reply.meta ?? {}), parseError: true };
  }
  return reply;
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

function calculateCredits(totalTokens: number | null): number {
  if (!totalTokens || totalTokens <= 0) return 1;
  return Math.max(1, Math.ceil(totalTokens / 1000));
}

function formatDetails(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(" | ");
}

function resolveTemperature(): number {
  const raw = process.env.AI_TEMPERATURE ?? process.env.CORTEX_AI_TEMPERATURE;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return 0.4;
}

function normalizeManagerMode(value: unknown, tab: ManagerAiTab | null): "message" | "analysis" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "analysis") return "analysis";
  if (normalized === "message") return "message";
  return tab ? "analysis" : "message";
}

function mapProvider(value: unknown): StandardProvider {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "ollama") return "ollama";
  if (normalized === "openai") return "openai_compat";
  if (normalized === "demo" || normalized === "mock") return "mock";
  return "mock";
}

type CreatorVoiceProfile = {
  tone: string | null;
  spicinessLevel: number | null;
  formalityLevel: number | null;
  emojiUsage: number | null;
  forbiddenTopics: string | null;
  forbiddenPromises: string | null;
  rulesManifest: string | null;
  allowExplicitAdultContent: boolean;
};

async function loadCreatorVoiceProfile(creatorId: string): Promise<CreatorVoiceProfile> {
  const settings = await prisma.creatorAiSettings.findUnique({
    where: { creatorId },
    select: {
      tone: true,
      spicinessLevel: true,
      formalityLevel: true,
      emojiUsage: true,
      forbiddenTopics: true,
      forbiddenPromises: true,
      rulesManifest: true,
      allowExplicitAdultContent: true,
    },
  });
  return {
    tone: settings?.tone ?? "cercano",
    spicinessLevel: typeof settings?.spicinessLevel === "number" ? settings.spicinessLevel : 1,
    formalityLevel: typeof settings?.formalityLevel === "number" ? settings.formalityLevel : 1,
    emojiUsage: typeof settings?.emojiUsage === "number" ? settings.emojiUsage : 1,
    forbiddenTopics: settings?.forbiddenTopics ?? null,
    forbiddenPromises: settings?.forbiddenPromises ?? null,
    rulesManifest: settings?.rulesManifest ?? null,
    allowExplicitAdultContent: Boolean(settings?.allowExplicitAdultContent),
  };
}

function buildCreatorVoiceProfile(settings: CreatorVoiceProfile): string {
  const tone = settings.tone || "cercano";
  const spiciness = normalizeLevel(settings.spicinessLevel);
  const formality = normalizeLevel(settings.formalityLevel);
  const emojiUsage = normalizeLevel(settings.emojiUsage);
  const parts = [
    `tono=${tone}`,
    `picante=${spiciness}/3`,
    `formalidad=${formality}/3`,
    `emoji=${emojiUsage}/3`,
  ];
  if (settings.forbiddenTopics?.trim()) {
    parts.push(`temas_prohibidos=${settings.forbiddenTopics.trim()}`);
  }
  if (settings.forbiddenPromises?.trim()) {
    parts.push(`promesas_prohibidas=${settings.forbiddenPromises.trim()}`);
  }
  if (settings.rulesManifest?.trim()) {
    parts.push(`reglas=${settings.rulesManifest.trim()}`);
  }
  return parts.join(" | ");
}

function normalizeLevel(value: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(1, Math.round(value)));
}

function buildFanPromptContext(params: {
  fanLastMessage: string;
  creatorVoiceProfile: string;
  objective: string;
  heatLevel: HeatLevel;
  bannedWords: string[];
  agency?: {
    stage?: string | null;
    objective?: string | null;
    intensity?: string | null;
    playbook?: string | null;
    nextAction?: string | null;
  };
}): string {
  const fanMessage = params.fanLastMessage ? `«${truncateForPrompt(params.fanLastMessage, 220)}»` : "(no detectado)";
  const agencyLines = buildAgencyPromptLines(params.agency);
  return [
    "Contexto útil (no lo repitas):",
    `fan_last_message: ${fanMessage}`,
    `creator_voice_profile: ${params.creatorVoiceProfile}`,
    `objective: ${params.objective}`,
    `heat_level: ${params.heatLevel}`,
    ...agencyLines,
    `banned_words: ${params.bannedWords.join(", ")}`,
  ].join("\n");
}

function buildFanFewShotMessages(): ChatMessage[] {
  return FAN_FEW_SHOTS.flatMap((example) => [
    {
      role: "user",
      content: [
        `fan_last_message: "${example.fan}"`,
        `objective: ${example.objective}`,
        `heat_level: ${example.heat}`,
        "Responde al fan.",
      ].join("\n"),
    },
    { role: "assistant", content: example.reply },
  ]);
}

function buildFanPromptMessages(params: {
  baseMessages: ChatMessage[];
  phaseAction: "suave" | "picante" | "directo" | "final" | null;
  fanPromptContext: string;
  allowExplicitAdultContent: boolean;
}): ChatMessage[] {
  const normalizedBaseMessages = params.baseMessages.map((msg) => {
    if (msg.role !== "user") return msg;
    return { ...msg, content: normalizeCreatorPrompt(msg.content) };
  });
  const messages: ChatMessage[] = [
    { role: "system", content: buildAgencySystemGuard(params.allowExplicitAdultContent) },
    { role: "system", content: params.fanPromptContext },
    ...buildFanFewShotMessages(),
    ...normalizedBaseMessages,
  ];
  return injectPhaseContext(messages, params.phaseAction);
}

function resolveFanLastMessage(incomingText: string, messages: ChatMessage[]): string {
  const candidates = [incomingText, ...messages.map((msg) => msg.content).reverse()];
  for (const candidate of candidates) {
    const extracted = extractFanLastMessageFromContext(candidate);
    if (extracted) return extracted;
  }
  const fallback = incomingText.trim();
  if (fallback && !looksLikeCreatorInstruction(fallback)) return fallback;
  return "";
}

function extractFanLastMessageFromContext(text: string): string | null {
  const marker = "Últimos mensajes:";
  const index = text.toLowerCase().indexOf(marker.toLowerCase());
  if (index === -1) return null;
  const after = text.slice(index + marker.length).trim();
  if (!after) return null;
  const stopPrefixes = [
    "Texto seleccionado:",
    "Borrador actual:",
    "Borradores internos:",
    "Perfil del fan:",
    "Seguimiento activo:",
  ];
  const lines = after.split(/\r?\n/);
  const collected: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (stopPrefixes.some((prefix) => trimmed.startsWith(prefix))) break;
    collected.push(trimmed);
  }
  for (let i = collected.length - 1; i >= 0; i -= 1) {
    const match = collected[i].match(/^fan\s*:\s*(.+)$/i);
    if (match) return match[1].trim();
  }
  if (collected.length === 0) return null;
  const last = collected[collected.length - 1].replace(/^(fan|creador)\s*:\s*/i, "").trim();
  if (/sin historial/i.test(last)) return null;
  return last;
}

function looksLikeCreatorInstruction(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("reescribe") ||
    normalized.includes("reformula") ||
    normalized.includes("texto del mensaje") ||
    normalized.includes("contexto:") ||
    normalized.includes("qué quiero") ||
    normalized.includes("que quiero")
  );
}

function normalizeCreatorPrompt(text: string): string {
  if (!looksLikeCreatorInstruction(text)) return text;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const filtered = lines.filter(
    (line) => !/^reescribe\b/i.test(line) && !/^reformula\b/i.test(line)
  );
  const rest = filtered.filter(Boolean).join("\n").trim();
  if (!rest) return "Responde al fan.";
  if (/responde al fan/i.test(rest)) return rest;
  return `Responde al fan.\n${rest}`;
}

type AgencyContext = {
  stage?: string | null;
  objective?: string | null;
  intensity?: string | null;
  playbook?: string | null;
  nextAction?: string | null;
};

function parseAgencyContext(body: Record<string, unknown>): AgencyContext | null {
  const raw = body.agency;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const stage = normalizeAgencyStage(record.stage);
  const objective = normalizeObjectiveCode(
    typeof record.objectiveCode === "string" ? record.objectiveCode : record.objective
  );
  const intensity = normalizeAgencyIntensity(record.intensity);
  const playbook = normalizeAgencyPlaybook(record.playbook);
  const nextAction = typeof record.nextAction === "string" ? record.nextAction.trim() : "";
  if (!stage && !objective && !intensity && !playbook && !nextAction) return null;
  return {
    stage,
    objective,
    intensity,
    playbook,
    nextAction: nextAction || null,
  };
}

function buildAgencyPromptLines(agency?: AgencyContext | null): string[] {
  if (!agency) return [];
  const lines: string[] = [];
  if (agency.stage) lines.push(`agency_stage: ${agency.stage}`);
  if (agency.objective) lines.push(`agency_objective: ${agency.objective}`);
  if (agency.intensity) lines.push(`agency_intensity: ${agency.intensity}`);
  if (agency.playbook) lines.push(`agency_playbook: ${agency.playbook}`);
  if (agency.nextAction) {
    lines.push(`agency_next_action: «${truncateForPrompt(agency.nextAction, 120)}»`);
  }
  return lines;
}

function resolveObjective(params: {
  actionLabel: string | null;
  phaseAction: "suave" | "picante" | "directo" | "final" | null;
  explicitRequest: boolean;
  privateRequest: boolean;
}): string {
  const normalizedAction = (params.actionLabel ?? "").toLowerCase();
  if (normalizedAction.startsWith("rewrite_")) return "refinar_respuesta";
  if (normalizedAction === "quote_manager") return "responder_cita";
  if (normalizedAction === "rephrase_manager") return "reformular";
  if (params.phaseAction) return `fase_${params.phaseAction}`;
  if (params.explicitRequest) return "limite_elegante";
  if (params.privateRequest) return "privado_suave";
  return "conversar";
}

function resolveHeatLevel(params: {
  actionLabel: string | null;
  phaseAction: "suave" | "picante" | "directo" | "final" | null;
  explicitRequest: boolean;
  privateRequest: boolean;
}): HeatLevel {
  const normalizedAction = (params.actionLabel ?? "").toLowerCase();
  if (params.explicitRequest) return "picante";
  if (params.phaseAction === "picante" || params.phaseAction === "directo" || params.phaseAction === "final") {
    return "picante";
  }
  if (normalizedAction.includes("picante") || normalizedAction.includes("directo")) return "picante";
  if (params.privateRequest) return "intimo";
  return "suave";
}

function truncateForPrompt(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}…`;
}

function sanitizeManagerMessageForFan(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  const metaPrefixes = [
    /^aqui tienes/i,
    /^aquí tienes/i,
    /^este mensaje/i,
    /^aqui va/i,
    /^aquí va/i,
    /^te dejo/i,
    /^te paso/i,
    /^te comparto/i,
    /^mensaje sugerido/i,
    /^sugerencia de mensaje/i,
  ];
  const filtered = lines.filter((line) => !metaPrefixes.some((pattern) => pattern.test(line)));
  const candidate = filtered.length > 0 ? filtered : lines;
  return candidate.join("\n").trim();
}

function isSoftRefusal(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLowerCase();
  if (lowered.includes("lo siento") && lowered.includes("no puedo")) return true;
  const patterns = [
    /\bno puedo cumplir\b/i,
    /\bno puedo ayudar(te)?\b/i,
    /\bno puedo hacer (eso|esto)\b/i,
    /\bno puedo (proporcionar|ofrecer|brindar) (ayuda|asistencia)?\b/i,
    /\bno puedo con eso\b/i,
  ];
  return patterns.some((pattern) => pattern.test(lowered));
}

function isRefusalLike(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLowerCase();
  const refusalPhrases = [
    /lo siento/i,
    /\bno puedo\b/i,
    /\bno puedo ayudar\b/i,
    /\bno puedo ayudar(te)?\b/i,
    /\bno puedo (proporcionar|ofrecer|brindar) asistencia\b/i,
    /\bi can('|)t\b/i,
    /\bi cannot\b/i,
    /\bcan't help\b/i,
    /\bcannot help\b/i,
    /\bunable to\b/i,
  ];
  const policySignals = [
    /pol[ií]tica(s)?\b/i,
    /\bpolicy\b/i,
    /\bseguridad\b/i,
    /\bsafety\b/i,
    /\bmenor(es)?\b/i,
    /\bunderage\b/i,
    /\bchild\b/i,
    /\bchildren\b/i,
    /\bilegal\b/i,
    /\billegal\b/i,
    /\bexplotaci[oó]n\b/i,
    /\bexploitation\b/i,
  ];
  const hasRefusal = refusalPhrases.some((pattern) => pattern.test(lowered));
  const hasPolicy = policySignals.some((pattern) => pattern.test(lowered));
  return hasRefusal && hasPolicy;
}

function looksMoralizing(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLowerCase();
  if (/\b\+18\b/.test(lowered) || /\bmayor de edad\b/.test(lowered)) return false;
  const patterns = [
    /no es el momento/i,
    /no es apropiado/i,
    /no es adecuado/i,
    /no puedo ayudarte/i,
    /no puedo ayudarte con eso/i,
    /contenido inapropiado/i,
    /contenido sensible/i,
    /biblioteca/i,
    /relajante/i,
    /pol[ií]tica(s)?/i,
  ];
  return patterns.some((pattern) => pattern.test(lowered));
}

function postProcessMarketing(
  text: string,
  fanLastMessage: string
): { text: string; shouldRegenerate: boolean } {
  const fanAsked = containsMarketingWord(fanLastMessage);
  if (fanAsked) return { text, shouldRegenerate: false };
  if (!containsMarketingWord(text)) return { text, shouldRegenerate: false };
  const replaced = applyMarketingReplacements(text);
  if (!containsMarketingWord(replaced)) {
    return { text: replaced, shouldRegenerate: false };
  }
  return { text: replaced, shouldRegenerate: true };
}

function containsMarketingWord(text: string): boolean {
  return MARKETING_REPLACEMENTS.some((entry) => {
    entry.pattern.lastIndex = 0;
    return entry.pattern.test(text);
  });
}

function applyMarketingReplacements(text: string): string {
  let updated = text;
  for (const entry of MARKETING_REPLACEMENTS) {
    updated = updated.replace(entry.pattern, entry.replacement);
  }
  return updated;
}

function buildRegenerateInstruction(bannedWords: string[]): string {
  return `Regenera la respuesta al fan: natural, 1–2 frases, termina en pregunta, sin ${bannedWords.join(
    "/"
  )}.`;
}

function buildUnderageRegenerateInstruction(): string {
  return "Regenera la respuesta al fan sin mencionar edad ni verificación. Sugerente, no explícito, termina con una pregunta.";
}

function injectSystemInstruction(messages: ChatMessage[], instruction: string): ChatMessage[] {
  const next: ChatMessage[] = [...messages];
  const firstSystemIndex = next.findIndex((msg) => msg.role === "system");
  if (firstSystemIndex === -1) {
    return [{ role: "system", content: instruction }, ...next];
  }
  return [
    ...next.slice(0, firstSystemIndex + 1),
    { role: "system", content: instruction },
    ...next.slice(firstSystemIndex + 1),
  ];
}

function isGenericResponse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length > 140) return false;
  const lowered = trimmed.toLowerCase();
  const hasLadderSignal = [
    "suave",
    "picante",
    "directo",
    "final",
    "subimos",
    "subir",
    "prefieres",
    "te apetece",
    "quieres",
  ].some((signal) => lowered.includes(signal));
  if (hasLadderSignal) return false;
  return GENERIC_RESPONSE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function buildGenericFallback(heatLevel: HeatLevel): string {
  if (heatLevel === "picante") {
    return "Me dejaste con ganas 😏. ¿Lo hacemos suave o subimos un poco? Si quieres, te preparo algo y seguimos aquí, ¿te va?";
  }
  if (heatLevel === "intimo") {
    return "Me apetece seguir contigo, cerquita. ¿Lo hacemos suave o con más chispa? Si quieres, te preparo algo y seguimos aquí, ¿te apetece?";
  }
  return "Me alegra leerte. ¿Lo dejamos suave o le damos un toque más juguetón? Si quieres, te preparo algo y seguimos aquí, ¿te va?";
}

function enforceResponseConstraints(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  let output = trimmed.replace(/\s+/g, " ");
  if (!/[?¿][^?¿]*$/.test(output)) {
    output = output.replace(/[.!?…]+$/, "").trim();
    output = `${output}?`;
  }
  if (output.length > 240) return fallback;
  return output;
}

function isRefusalErrorCode(code?: string): boolean {
  const normalized = (code ?? "").toString().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("refusal") ||
    normalized.includes("safety") ||
    normalized.includes("policy") ||
    normalized.includes("content_policy")
  );
}

function buildChatSuccessResponse(params: {
  assistantMessage: { role: "assistant"; content: string };
  messages: ChatMessage[];
  usedFallback: boolean;
  provider: StandardProvider;
  model: string | null;
  offer?: ChatOffer | null;
  replyMeta?: ManagerReply;
  creditsUsed?: number;
  creditsRemaining?: number;
  settingsStatus?: "ok" | "settings_missing" | "decrypt_failed";
  aiMode?: "demo" | "live";
  meta: ChatMeta;
  status?: ChatStatus;
  error?: { code: ChatErrorCode; message: string };
}): ChatOkResponse {
  const status = params.status ?? "ok";
  const hasContent = params.assistantMessage.content.trim().length > 0;
  return {
    ok: true,
    reply: { content: params.assistantMessage.content },
    status,
    meta: params.meta,
    error: params.error,
    offer: params.offer ?? undefined,
    data: {
      reply: params.assistantMessage,
      usedFallback: params.usedFallback,
      provider: params.provider,
      model: params.model,
      messages: params.messages,
      offer: params.offer ?? undefined,
      replyMeta: params.replyMeta,
      creditsUsed: params.creditsUsed,
      creditsRemaining: params.creditsRemaining,
      settingsStatus: params.settingsStatus,
      aiMode: params.aiMode,
      meta: params.meta,
      status,
    },
    message: hasContent ? params.assistantMessage : undefined,
    items: hasContent ? [params.assistantMessage] : [],
    messages: params.messages,
    replyMeta: params.replyMeta,
    creditsUsed: params.creditsUsed,
    creditsRemaining: params.creditsRemaining,
    usedFallback: params.usedFallback,
    settingsStatus: params.settingsStatus,
    aiMode: params.aiMode,
  };
}

function buildChatErrorResponse(
  code: ChatErrorCode,
  message: string,
  details?: string,
  data?: { usedFallback?: boolean; provider?: StandardProvider; model?: string | null; latencyMs?: number; offer?: ChatOffer },
  meta?: ChatMeta,
  status?: ChatStatus,
  reply?: { content: string },
  offer?: ChatOffer | null
): ChatErrorResponse {
  const resolvedMeta =
    meta ??
    buildChatMeta({
      provider: "mock",
      model: null,
      action: null,
      usedFallback: true,
      latencyMs: 0,
    });
  const resolvedStatus = status ?? "refusal";
  const response: ChatErrorResponse = {
    ok: false,
    error: { code, message },
    status: resolvedStatus,
    meta: resolvedMeta,
    code,
    message,
  };
  if (details) response.details = details;
  if (data) response.data = data;
  response.reply = reply ?? { content: message };
  if (offer !== undefined) {
    response.offer = offer ?? undefined;
    if (response.data) {
      response.data.offer = offer ?? undefined;
    } else {
      response.data = { offer: offer ?? undefined };
    }
  }
  return response;
}

function logDevManagerRequest(params: {
  route: string;
  creatorId: string;
  fanId: string | null;
  hasText: boolean;
  hasMessages: boolean;
  usedFallback: boolean;
  action?: string | null;
  promptLength: number;
  debug: { url: string; maxTokensType: string; maxTokensValue: unknown } | null;
  meta?: ChatMeta;
}) {
  void params;
}

function buildPhaseContextMessage(phase: "suave" | "picante" | "directo" | "final"): ChatMessage {
  const dayPart = PHASE_DAYPART[phase] === "DAY" ? "Día" : "Noche";
  return {
    role: "system",
    content: `Fase objetivo: ${PHASE_LABELS[phase]} (${dayPart}).`,
  };
}

function injectPhaseContext(messages: ChatMessage[], phase: "suave" | "picante" | "directo" | "final" | null): ChatMessage[] {
  if (!phase) return messages;
  const contextMessage = buildPhaseContextMessage(phase);
  const alreadyIncluded = messages.some(
    (msg) => msg.role === "system" && msg.content.trim() === contextMessage.content.trim()
  );
  if (alreadyIncluded) return messages;
  if (messages.length === 0) return [contextMessage];
  if (messages[0].role === "system") {
    return [messages[0], contextMessage, ...messages.slice(1)];
  }
  return [contextMessage, ...messages];
}

function buildChatMeta(params: {
  provider: StandardProvider;
  model: string | null;
  action: string | null;
  usedFallback: boolean;
  latencyMs: number | null | undefined;
}): ChatMeta {
  const latencyRaw = typeof params.latencyMs === "number" && Number.isFinite(params.latencyMs) ? params.latencyMs : 0;
  const latencyMs = Math.max(0, Math.trunc(latencyRaw));
  return {
    providerUsed: params.provider,
    modelUsed: params.model,
    action: params.action,
    usedFallback: params.usedFallback,
    latencyMs,
  };
}

function buildChatRefusalResponse(params: { meta: ChatMeta; errorMessage?: string }): ChatErrorResponse {
  const message = params.errorMessage?.trim() || "REFUSAL";
  const fallbackText = pickExplicitTemplate();
  return buildChatErrorResponse(
    "REFUSAL",
    message,
    undefined,
    {
      usedFallback: params.meta.usedFallback,
      provider: params.meta.providerUsed,
      model: params.meta.modelUsed,
      latencyMs: params.meta.latencyMs,
    },
    params.meta,
    "refusal",
    { content: fallbackText }
  );
}
