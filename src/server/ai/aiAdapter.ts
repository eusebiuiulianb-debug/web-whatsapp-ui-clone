import {
  OPENAI_FALLBACK_MESSAGE,
  safeOpenAiChatCompletion,
  type OpenAiChatMessage,
  type SafeOpenAiChatResult,
} from "./openAiClient";

type FallbackMessage = string | (() => string | Promise<string>) | undefined;

const REQUIRED_OPENAI_ENVS = ["OPENAI_API_KEY", "OPENAI_MODEL"] as const;

function normalizeMode(raw?: string | null) {
  const lowered = (raw || "").toLowerCase();
  if (lowered === "openai" || lowered === "live") return "live";
  if (lowered === "demo") return "demo";
  return "mock";
}

async function resolveFallbackMessage(fallback?: FallbackMessage) {
  if (!fallback) return OPENAI_FALLBACK_MESSAGE;
  if (typeof fallback === "string") return fallback;
  return fallback();
}

export type AiAdapterResult = SafeOpenAiChatResult & {
  needsConfig?: boolean;
  missingEnv?: string[];
  status?: number | null;
};

type BaseAiParams = {
  messages: OpenAiChatMessage[];
  apiKey?: string | null;
  model?: string | null;
  temperature?: number;
  aiMode?: string | null;
  creatorId?: string;
  fanId?: string | null;
  route?: string;
  fallbackMessage?: FallbackMessage;
};

export async function runAiCompletion(params: BaseAiParams): Promise<AiAdapterResult> {
  const mode = normalizeMode(params.aiMode ?? process.env.AI_MODE ?? "mock");
  const useOpenAi = mode === "live";
  const fallbackMessage = params.fallbackMessage ?? OPENAI_FALLBACK_MESSAGE;

  const missingEnv = REQUIRED_OPENAI_ENVS.filter((key) => {
    if (key === "OPENAI_API_KEY") {
      const value = params.apiKey ?? process.env.OPENAI_API_KEY;
      return !value || !value.trim();
    }
    if (key === "OPENAI_MODEL") {
      const value = params.model ?? process.env.OPENAI_MODEL;
      return !value || !value.trim();
    }
    return false;
  });

  if (useOpenAi && missingEnv.length > 0) {
    const text = await resolveFallbackMessage(fallbackMessage);
    return {
      text,
      totalTokens: 0,
      usedFallback: true,
      mode: "demo",
      status: 500,
      needsConfig: true,
      missingEnv,
      errorCode: "ai_not_configured",
    };
  }

  if (!useOpenAi) {
    const text = await resolveFallbackMessage(fallbackMessage);
    return {
      text,
      totalTokens: 0,
      usedFallback: true,
      mode: "demo",
      status: 200,
    };
  }

  const result = await safeOpenAiChatCompletion({
    ...params,
    aiMode: mode,
    model: params.model ?? process.env.OPENAI_MODEL,
  });

  return {
    ...result,
    mode: result.mode ?? "live",
    needsConfig: false,
    missingEnv: [],
    status: result.status ?? 200,
  };
}
