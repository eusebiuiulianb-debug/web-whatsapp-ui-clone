import { parseOpenAiError, toSafeErrorMessage } from "../../../server/ai/openAiError";
import { sanitizeForOpenAi } from "../../../server/ai/sanitizeForOpenAi";

export type OllamaChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OllamaCompletionResult = {
  ok: boolean;
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  status?: number | null;
  errorCode?: string;
  errorMessage?: string;
};

type OllamaRequestParams = {
  baseUrl: string;
  apiKey?: string | null;
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  creatorId?: string;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 300;

export async function requestOllamaChatCompletion(params: OllamaRequestParams): Promise<OllamaCompletionResult> {
  const startedAt = Date.now();
  const baseUrl = params.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = sanitizeForOpenAi(
      {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.4,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
      { creatorId: params.creatorId }
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey || "ollama"}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);

    if (!response.ok) {
      const errorInfo = await parseOpenAiError(response, { creatorId: params.creatorId });
      return {
        ok: false,
        text: "",
        model: params.model,
        tokensIn: null,
        tokensOut: null,
        latencyMs,
        errorCode: errorInfo.code ?? "ollama_error",
        status: errorInfo.status,
        errorMessage: errorInfo.message,
      };
    }

    const data = (await response.json()) as any;
    const completionText =
      typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : "";
    const tokensIn = typeof data?.usage?.prompt_tokens === "number" ? data.usage.prompt_tokens : null;
    const tokensOut = typeof data?.usage?.completion_tokens === "number" ? data.usage.completion_tokens : null;

    return {
      ok: Boolean(completionText && completionText.trim()),
      text: completionText?.trim() ?? "",
      model: params.model,
      tokensIn,
      tokensOut,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const isTimeout = typeof (err as any)?.name === "string" && (err as any).name === "AbortError";
    return {
      ok: false,
      text: "",
      model: params.model,
      tokensIn: null,
      tokensOut: null,
      latencyMs,
      errorCode: isTimeout ? "ollama_timeout" : (err as any)?.code ?? "ollama_error",
      status: (err as any)?.status ?? null,
      errorMessage: toSafeErrorMessage(err, { creatorId: params.creatorId }),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
