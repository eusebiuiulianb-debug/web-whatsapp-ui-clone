import { sanitizeForOpenAi } from "./sanitizeForOpenAi";
import { isInvalidEncryptedContentError, parseOpenAiError, toSafeErrorMessage } from "./openAiError";

export type OpenAiChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type SafeOpenAiChatResult = {
  text: string;
  totalTokens: number | null;
  mode: "live" | "demo";
  usedFallback: boolean;
  errorCode?: string;
  status?: number;
};

type SafeOpenAiChatParams = {
  messages: OpenAiChatMessage[];
  model?: string;
  temperature?: number;
  apiKey?: string | null;
  aiMode?: string | null;
  creatorId?: string;
  fanId?: string | null;
  route?: string;
  fallbackMessage?: string | (() => string | Promise<string>);
};

export const OPENAI_FALLBACK_MESSAGE = "No se pudo generar ahora. Revisa configuración de IA.";

async function resolveFallbackMessage(fallback?: SafeOpenAiChatParams["fallbackMessage"]) {
  if (!fallback) return OPENAI_FALLBACK_MESSAGE;
  if (typeof fallback === "string") return fallback;
  return fallback();
}

export async function safeOpenAiChatCompletion(params: SafeOpenAiChatParams): Promise<SafeOpenAiChatResult> {
  const aiMode = (params.aiMode || process.env.AI_MODE || "mock").toLowerCase();
  const shouldForceDemo = aiMode === "demo";
  const resolvedApiKey = shouldForceDemo ? null : params.apiKey ?? process.env.OPENAI_API_KEY ?? null;

  if (!resolvedApiKey) {
    const text = await resolveFallbackMessage(params.fallbackMessage);
    return { text, totalTokens: 0, mode: "demo", usedFallback: true, errorCode: "missing_api_key" };
  }

  const basePayload = {
    model: process.env.OPENAI_MODEL || params.model || "gpt-4o-mini",
    temperature: params.temperature ?? 0.4,
    messages: params.messages,
  };

  const safePayload = sanitizeForOpenAi(basePayload, { creatorId: params.creatorId });
  const payloadLength = typeof safePayload === "object" ? JSON.stringify(safePayload).length : 0;
  const messageCount = Array.isArray((safePayload as any)?.messages) ? (safePayload as any).messages.length : 0;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedApiKey}`,
      },
      body: JSON.stringify(safePayload),
    });

    if (!response.ok) {
      const errorInfo = await parseOpenAiError(response, { creatorId: params.creatorId });
      const text = await resolveFallbackMessage(params.fallbackMessage);
      console.warn("openai_chat_error", {
        route: params.route ?? "unknown",
        creatorId: params.creatorId ?? null,
        fanId: params.fanId ?? null,
        status: errorInfo.status,
        code: errorInfo.code ?? "openai_error",
        message: "[redacted]",
        payloadLength,
        messageCount,
      });
      return { text, totalTokens: 0, mode: "demo", usedFallback: true, errorCode: errorInfo.code ?? "openai_error", status: errorInfo.status };
    }

    const data = (await response.json()) as any;
    const completionText = data?.choices?.[0]?.message?.content;
    const totalTokens = typeof data?.usage?.total_tokens === "number" ? data.usage.total_tokens : null;

    if (typeof completionText !== "string" || !completionText.trim()) {
      throw new Error("empty_response");
    }

    return { text: completionText.trim(), totalTokens, mode: "live", usedFallback: false };
  } catch (err) {
    const text = await resolveFallbackMessage(params.fallbackMessage);
    console.warn("openai_chat_error", {
      route: params.route ?? "unknown",
      creatorId: params.creatorId ?? null,
      fanId: params.fanId ?? null,
      status: (err as any)?.status ?? null,
      code: (err as any)?.code ?? (isInvalidEncryptedContentError(err) ? "invalid_encrypted_content" : "openai_error"),
      message: "[redacted]",
      payloadLength,
      messageCount,
      error: toSafeErrorMessage(err, { creatorId: params.creatorId }),
    });
    return {
      text,
      totalTokens: 0,
      mode: "demo",
      usedFallback: true,
      errorCode: (err as any)?.code ?? (isInvalidEncryptedContentError(err) ? "invalid_encrypted_content" : "openai_error"),
      status: (err as any)?.status ?? null,
    };
  }
}
