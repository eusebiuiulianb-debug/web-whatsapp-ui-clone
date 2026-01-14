import { parseOpenAiError, toSafeErrorMessage } from "../../../server/ai/openAiError";
import { sanitizeForOpenAi } from "../../../server/ai/sanitizeForOpenAi";

export type OllamaChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OllamaDebugInfo = {
  url: string;
  maxTokensType: string;
  maxTokensValue: unknown;
  resolvedMaxTokens?: number;
  outputLength?: string | null;
};

export type OllamaOpenAiRequest = {
  url: string;
  payload?: Record<string, unknown>;
  debug: OllamaDebugInfo;
};

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
  debug?: OllamaDebugInfo;
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
  outputLength?: string;
  presencePenalty?: number;
  frequencyPenalty?: number;
  topP?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 300;

function coerceInt(value: unknown): number | undefined {
  if (typeof value === "string") {
    if (!value.trim()) return undefined;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "bigint") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return undefined;
}

function normalizeOllamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  const withoutV1 = withoutTrailing.replace(/\/v1$/i, "");
  return withoutV1.replace(/\/+$/, "");
}

export function buildOllamaOpenAiRequest(params: {
  baseUrl: string;
  path: string;
  payload?: Record<string, unknown>;
  creatorId?: string;
  presencePenalty?: number;
  frequencyPenalty?: number;
  topP?: number;
}): OllamaOpenAiRequest {
  const baseUrl = normalizeOllamaBaseUrl(params.baseUrl);
  const cleanPath = params.path.replace(/^\/+/, "");
  const url = baseUrl ? `${baseUrl}/v1/${cleanPath}` : `/v1/${cleanPath}`;
  const payload = params.payload
    ? (sanitizeForOpenAi(params.payload, { creatorId: params.creatorId }) as Record<string, unknown>)
    : undefined;
  if (payload && Object.prototype.hasOwnProperty.call(payload, "max_tokens")) {
    const coerced = coerceInt(payload.max_tokens);
    if (coerced === undefined) {
      delete payload.max_tokens;
    } else {
      payload.max_tokens = coerced;
    }
  }
  const maxTokensValue = payload?.max_tokens;
  return {
    url,
    payload,
    debug: {
      url,
      maxTokensType: typeof maxTokensValue,
      maxTokensValue,
    },
  };
}

export async function requestOllamaChatCompletion(params: OllamaRequestParams): Promise<OllamaCompletionResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resolvedMaxTokens =
    typeof params.maxTokens === "number" && Number.isFinite(params.maxTokens)
      ? Math.trunc(params.maxTokens)
      : DEFAULT_MAX_TOKENS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const prepared = buildOllamaOpenAiRequest({
    baseUrl: params.baseUrl,
    path: "chat/completions",
    payload: {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.4,
      max_tokens: resolvedMaxTokens,
      ...(typeof params.presencePenalty === "number" ? { presence_penalty: params.presencePenalty } : {}),
      ...(typeof params.frequencyPenalty === "number" ? { frequency_penalty: params.frequencyPenalty } : {}),
      ...(typeof params.topP === "number" ? { top_p: params.topP } : {}),
    },
    creatorId: params.creatorId,
  });
  const payload = prepared.payload ?? {};
  const debug: OllamaDebugInfo = {
    ...prepared.debug,
    resolvedMaxTokens,
    outputLength: params.outputLength ?? null,
  };

  try {
    const response = await fetch(prepared.url, {
      method: "POST",
      cache: "no-store",
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
        debug,
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
      debug,
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
      debug,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
