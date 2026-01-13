import { getCortexProviderSelection, requestCortexCompletion } from "./cortexProvider";
import type { IntentKey, IntentResult } from "./intents";
import { detectIntentRules, normalizeIntentText } from "./intentRules";

type ClassifyParams = {
  text: string;
  lang?: string | null;
  context?: string[] | null;
  creatorId?: string | null;
  fanId?: string | null;
};

const INTENT_VALUES: IntentKey[] = [
  "GREETING",
  "FLIRT",
  "CONTENT_REQUEST",
  "CUSTOM_REQUEST",
  "PRICE_ASK",
  "BUY_NOW",
  "SUBSCRIBE",
  "CANCEL",
  "OFF_PLATFORM",
  "SUPPORT",
  "OBJECTION",
  "RUDE_OR_HARASS",
  "UNSAFE_MINOR",
  "OTHER",
];

function parseIntentResponse(raw: string): IntentResult | null {
  const trimmed = raw.trim().replace(/^```json/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    const intent = typeof parsed?.intent === "string" ? parsed.intent.toUpperCase() : "";
    if (!INTENT_VALUES.includes(intent as IntentKey)) return null;
    const confidence =
      typeof parsed?.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : 0.4;
    const signals = parsed?.signals && typeof parsed.signals === "object" ? parsed.signals : undefined;
    return { intent: intent as IntentKey, confidence, signals };
  } catch (err) {
    return null;
  }
}

export async function classifyIntentLLM(params: ClassifyParams): Promise<IntentResult> {
  const selection = await getCortexProviderSelection({ creatorId: params.creatorId ?? undefined });
  const systemPrompt =
    "Eres un clasificador de intención. Devuelve SOLO JSON válido con schema {\"intent\":string,\"confidence\":0..1,\"signals\":{}}. No añadas texto extra.";
  const contextBlock =
    params.context && params.context.length
      ? `Contexto previo:\n${params.context.map((line) => `- ${line}`).join("\n")}`
      : null;
  const userPrompt = [
    `Texto (${params.lang ?? "es"}): ${params.text}`,
    contextBlock,
    "Claves válidas: GREETING, FLIRT, CONTENT_REQUEST, CUSTOM_REQUEST, PRICE_ASK, BUY_NOW, SUBSCRIBE, CANCEL, OFF_PLATFORM, SUPPORT, OBJECTION, RUDE_OR_HARASS, UNSAFE_MINOR, OTHER.",
    "Si es menor de edad (<18), intent=UNSAFE_MINOR y confidence alta.",
    "Si no estás seguro, usa intent OTHER con confidence baja.",
  ]
    .filter(Boolean)
    .join("\n");

  const llm = await requestCortexCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    creatorId: params.creatorId ?? undefined,
    fanId: params.fanId ?? undefined,
    route: "/api/messages/analyze",
    selection,
    temperature: 0.15,
    maxTokens: 160,
  });

  if (!llm.ok || !llm.text) {
    return { intent: "OTHER", confidence: 0.3, signals: { reason: "llm_failed" } };
  }
  const parsed = parseIntentResponse(llm.text);
  if (parsed) return parsed;
  return { intent: "OTHER", confidence: 0.35, signals: { reason: "parse_failed" } };
}

export async function detectIntentWithFallback(
  params: ClassifyParams & { minRuleConfidence?: number }
): Promise<IntentResult> {
  const normalizedText = normalizeIntentText(params.text || "");
  if (!normalizedText) {
    return { intent: "OTHER", confidence: 0.3, signals: { reason: "empty" } };
  }
  const minRuleConfidence = typeof params.minRuleConfidence === "number" ? params.minRuleConfidence : 0.75;
  const ruleResult = detectIntentRules(normalizedText, params.lang);
  if (ruleResult && ruleResult.confidence >= minRuleConfidence) {
    return ruleResult;
  }
  try {
    const llmResult = await classifyIntentLLM({
      text: normalizedText,
      lang: params.lang,
      context: params.context,
      creatorId: params.creatorId,
      fanId: params.fanId,
    });
    return llmResult;
  } catch (err) {
    return ruleResult ?? { intent: "OTHER", confidence: 0.3, signals: { reason: "fallback_error" } };
  }
}
