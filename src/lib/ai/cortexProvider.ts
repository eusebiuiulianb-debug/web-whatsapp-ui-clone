import { sanitizeForOpenAi } from "../../server/ai/sanitizeForOpenAi";
import { parseOpenAiError, toSafeErrorMessage } from "../../server/ai/openAiError";
import { maybeDecrypt } from "../../server/crypto/maybeDecrypt";
import prisma from "../prisma.server";
import { decryptSecret } from "../crypto/secrets";
import { buildOllamaOpenAiRequest, requestOllamaChatCompletion } from "./providers/ollama";

export type CortexChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CortexSuggestContext = {
  original?: string;
  translation?: string;
  detected?: { src?: string; tgt?: string };
};

export type CortexProviderName = "openai" | "ollama" | "demo";

export type CortexProviderStatus = {
  provider: CortexProviderName;
  configured: boolean;
  missingVars: string[];
};

export type CortexProviderResult = {
  ok: boolean;
  text: string;
  provider: CortexProviderName;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  errorCode?: string;
  status?: number | null;
  errorMessage?: string;
};

type CortexProviderParams = {
  messages: CortexChatMessage[];
  creatorId?: string;
  fanId?: string | null;
  route?: string;
  mockContext?: CortexSuggestContext | null;
  mockMode?: string | null;
  selection?: CortexProviderSelection;
};

export type CortexProviderSelection = {
  provider: CortexProviderName;
  desiredProvider: CortexProviderName;
  configured: boolean;
  missingVars: string[];
  model: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  source?: "db" | "env";
  decryptFailed?: boolean;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 300;
const DEFAULT_TIMEOUT_MS = 20_000;

function normalizeProvider(raw?: string | null): CortexProviderName {
  const normalized = (raw || "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "live") return "openai";
  if (normalized === "ollama") return "ollama";
  if (normalized === "mock" || normalized === "demo") return "demo";
  return "demo";
}

function resolveDesiredProvider(): CortexProviderName {
  const envProvider = process.env.AI_PROVIDER ?? process.env.CORTEX_AI_PROVIDER ?? process.env.AI_MODE ?? "demo";
  return normalizeProvider(envProvider);
}

function resolveTemperature(): number {
  const raw = process.env.AI_TEMPERATURE ?? process.env.CORTEX_AI_TEMPERATURE;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return 0.4;
}

function normalizeOptionalString(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveEnvProviderSelection(params: { creatorId?: string }): CortexProviderSelection {
  const desiredProvider = resolveDesiredProvider();

  if (desiredProvider === "ollama") {
    const baseUrl = process.env.AI_BASE_URL?.trim() ?? "";
    const model = process.env.AI_MODEL?.trim() ?? process.env.CORTEX_AI_MODEL?.trim() ?? "";
    const missingVars: string[] = [];
    if (!baseUrl) missingVars.push("AI_BASE_URL");
    if (!model) missingVars.push("AI_MODEL");

    if (missingVars.length) {
      return {
        provider: "demo",
        desiredProvider,
        configured: false,
        missingVars,
        model: model || null,
        source: "env",
      };
    }

    const apiKeyRaw = process.env.AI_API_KEY ?? "";
    const apiKey = maybeDecrypt(apiKeyRaw, { creatorId: params.creatorId, label: "AI_API_KEY" }) ?? "ollama";

    return {
      provider: "ollama",
      desiredProvider,
      configured: true,
      missingVars: [],
      model,
      baseUrl,
      apiKey,
      source: "env",
    };
  }

  if (desiredProvider === "openai") {
    const apiKeyRaw = process.env.CORTEX_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
    const apiKey = maybeDecrypt(apiKeyRaw, { creatorId: params.creatorId, label: "OPENAI_API_KEY" });
    const model = process.env.CORTEX_AI_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    const missingVars: string[] = [];

    if (!apiKey || !apiKey.trim()) missingVars.push("OPENAI_API_KEY");

    if (missingVars.length) {
      return {
        provider: "demo",
        desiredProvider,
        configured: false,
        missingVars,
        model,
        source: "env",
      };
    }

    return {
      provider: "openai",
      desiredProvider,
      configured: true,
      missingVars: [],
      model,
      apiKey,
      source: "env",
    };
  }

  return {
    provider: "demo",
    desiredProvider: "demo",
    configured: false,
    missingVars: [],
    model: "demo",
    source: "env",
  };
}

async function resolveDbProviderSelection(creatorId: string): Promise<CortexProviderSelection | null> {
  try {
    const settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
      select: {
        cortexProvider: true,
        cortexBaseUrl: true,
        cortexModel: true,
        cortexApiKeyEnc: true,
      },
    });
    if (!settings || !settings.cortexProvider) return null;

    const desiredProvider = normalizeProvider(settings.cortexProvider);
    if (desiredProvider === "demo") {
      return {
        provider: "demo",
        desiredProvider,
        configured: false,
        missingVars: [],
        model: "demo",
        source: "db",
      };
    }

    const baseUrl = normalizeOptionalString(settings.cortexBaseUrl);
    const model = normalizeOptionalString(settings.cortexModel);
    let apiKey: string | null = null;
    let decryptFailed = false;

    if (settings.cortexApiKeyEnc) {
      try {
        apiKey = decryptSecret(settings.cortexApiKeyEnc);
      } catch (err) {
        decryptFailed = true;
        console.warn("cortex_provider_decrypt_failed", {
          creatorId,
          provider: desiredProvider,
          error: err instanceof Error ? err.message : "unknown_error",
        });
      }
    }

    if (decryptFailed) {
      return {
        provider: "demo",
        desiredProvider,
        configured: false,
        missingVars: ["CORTEX_API_KEY"],
        model: model ?? null,
        baseUrl: baseUrl ?? null,
        apiKey: null,
        source: "db",
        decryptFailed: true,
      };
    }

    if (desiredProvider === "ollama") {
      const missingVars: string[] = [];
      if (!baseUrl) missingVars.push("CORTEX_BASE_URL");
      if (!model) missingVars.push("CORTEX_MODEL");
      const configured = missingVars.length === 0;
      return {
        provider: configured ? "ollama" : "demo",
        desiredProvider,
        configured,
        missingVars,
        model: model ?? null,
        baseUrl: baseUrl ?? null,
        apiKey: apiKey ?? "ollama",
        source: "db",
      };
    }

    const missingVars: string[] = [];
    const resolvedModel = model ?? DEFAULT_MODEL;
    if (!apiKey || !apiKey.trim()) missingVars.push("CORTEX_API_KEY");
    const configured = missingVars.length === 0;
    return {
      provider: configured ? "openai" : "demo",
      desiredProvider,
      configured,
      missingVars,
      model: resolvedModel,
      apiKey: apiKey ?? null,
      source: "db",
    };
  } catch (err) {
    console.error("cortex_provider_db_error", err);
    return null;
  }
}

async function resolveProviderSelection(params: { creatorId?: string }): Promise<CortexProviderSelection> {
  if (params.creatorId) {
    const dbSelection = await resolveDbProviderSelection(params.creatorId);
    if (dbSelection) return dbSelection;
  }
  return resolveEnvProviderSelection({ creatorId: params.creatorId });
}

export async function getCortexProviderStatus(params?: { creatorId?: string }): Promise<CortexProviderStatus> {
  const selection = await resolveProviderSelection({ creatorId: params?.creatorId });
  return {
    provider: selection.desiredProvider,
    configured: selection.configured,
    missingVars: selection.missingVars,
  };
}

export async function getCortexProviderSelection(params?: { creatorId?: string }): Promise<CortexProviderSelection> {
  return resolveProviderSelection({ creatorId: params?.creatorId });
}

function buildMockResponse(params: CortexProviderParams, latencyMs: number): CortexProviderResult {
  if (process.env.CORTEX_AI_MOCK_ERROR === "1" || process.env.AI_MOCK_ERROR === "1") {
    return {
      ok: false,
      text: "",
      provider: "demo",
      model: "demo",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs,
      errorCode: "demo_error",
      status: 500,
    };
  }

  const context = params.mockContext ?? {};
  const srcLang = context.detected?.src || context.detected?.tgt || "es";
  const intent = params.mockMode?.trim() ? params.mockMode.trim() : "reply";
  const pieces = [
    context.original ? `ORIG:${context.original.trim()}` : null,
    context.translation ? `TRAD:${context.translation.trim()}` : null,
  ].filter(Boolean);
  const baseMessage = pieces.length > 0 ? pieces.join(" | ") : "Sugerencia demo.";
  const message = `SUGERENCIA MOCK · ${baseMessage}`.trim();
  const payload = JSON.stringify({
    message,
    language: srcLang,
    intent,
    follow_up_questions: [],
  });

  return {
    ok: true,
    text: payload,
    provider: "demo",
    model: "demo",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs,
  };
}

export async function requestCortexCompletion(params: CortexProviderParams): Promise<CortexProviderResult> {
  const selection =
    params.selection ?? (await resolveProviderSelection({ creatorId: params.creatorId }));
  const startedAt = Date.now();

  if (selection.provider === "demo") {
    if (selection.desiredProvider !== "demo" && selection.missingVars.length > 0) {
      console.warn("cortex_provider_fallback", {
        route: params.route ?? "unknown",
        creatorId: params.creatorId ?? null,
        fanId: params.fanId ?? null,
        desiredProvider: selection.desiredProvider,
        missingVars: selection.missingVars,
      });
    }
    const latencyMs = Math.max(1, Date.now() - startedAt);
    return buildMockResponse(params, latencyMs);
  }

  if (selection.provider === "ollama") {
    const preparedRequest = buildOllamaOpenAiRequest({
      baseUrl: selection.baseUrl || "",
      path: "chat/completions",
      payload: {
        model: selection.model ?? "ollama",
        temperature: resolveTemperature(),
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: params.messages,
      },
      creatorId: params.creatorId,
    });
    const payload = preparedRequest.payload ?? {};
    const payloadLength = JSON.stringify(payload).length;
    const messageCount = Array.isArray((payload as any)?.messages) ? (payload as any).messages.length : 0;

    const result = await requestOllamaChatCompletion({
      baseUrl: selection.baseUrl || "",
      apiKey: selection.apiKey ?? "ollama",
      model: selection.model ?? "ollama",
      messages: params.messages,
      temperature: resolveTemperature(),
      maxTokens: DEFAULT_MAX_TOKENS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      creatorId: params.creatorId,
    });

    if (!result.ok) {
      const debug = process.env.NODE_ENV === "development" ? result.debug : undefined;
      console.error("cortex_ollama_error", {
        route: params.route ?? "unknown",
        creatorId: params.creatorId ?? null,
        fanId: params.fanId ?? null,
        status: result.status ?? null,
        code: result.errorCode ?? "ollama_error",
        message: result.errorMessage ?? "ollama_error",
        payloadLength,
        messageCount,
        ...(debug ? { debug } : {}),
      });
    }

    return {
      ok: result.ok,
      text: result.text,
      provider: "ollama",
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      errorCode: result.errorCode,
      status: result.status,
      errorMessage: result.errorMessage,
    };
  }

  const model = selection.model ?? DEFAULT_MODEL;
  const payload = sanitizeForOpenAi(
    {
      model,
      temperature: resolveTemperature(),
      messages: params.messages,
    },
    { creatorId: params.creatorId }
  );
  const payloadLength = typeof payload === "object" ? JSON.stringify(payload).length : 0;
  const messageCount = Array.isArray((payload as any)?.messages) ? (payload as any).messages.length : 0;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${selection.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);

    if (!response.ok) {
      const errorInfo = await parseOpenAiError(response, { creatorId: params.creatorId });
      console.warn("cortex_openai_error", {
        route: params.route ?? "unknown",
        creatorId: params.creatorId ?? null,
        fanId: params.fanId ?? null,
        status: errorInfo.status,
        code: errorInfo.code ?? "openai_error",
        message: "[redacted]",
        payloadLength,
        messageCount,
      });
      return {
        ok: false,
        text: "",
        provider: "openai",
        model,
        tokensIn: null,
        tokensOut: null,
        latencyMs,
        errorCode: errorInfo.code ?? "openai_error",
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
      provider: "openai",
      model,
      tokensIn,
      tokensOut,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    console.warn("cortex_openai_error", {
      route: params.route ?? "unknown",
      creatorId: params.creatorId ?? null,
      fanId: params.fanId ?? null,
      status: (err as any)?.status ?? null,
      code: (err as any)?.code ?? "openai_error",
      message: "[redacted]",
      payloadLength,
      messageCount,
      error: toSafeErrorMessage(err, { creatorId: params.creatorId }),
    });
    return {
      ok: false,
      text: "",
      provider: "openai",
      model,
      tokensIn: null,
      tokensOut: null,
      latencyMs,
      errorCode: (err as any)?.code ?? "openai_error",
      status: (err as any)?.status ?? null,
      errorMessage: toSafeErrorMessage(err, { creatorId: params.creatorId }),
    };
  }
}
