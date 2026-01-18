import type { NextApiRequest, NextApiResponse } from "next";
import { getCortexProviderSelection, type CortexProviderName } from "../../../../lib/ai/cortexProvider";
import { resolveProviderErrorType } from "../../../../server/ai/cortexErrors";
import { parseOpenAiError, toSafeErrorMessage } from "../../../../server/ai/openAiError";
import { AI_ENABLED, sendAiDisabled } from "../../../../lib/features";

type HealthResponse = {
  ok: boolean;
  provider: CortexProviderName;
  base_url: string | null;
  model: string | null;
  api_key: string | null;
  reachable: boolean;
  errorCode?: "MODEL_NOT_FOUND" | "PROVIDER_UNAVAILABLE";
  message?: string;
};

type ErrorResponse = { error: string; details?: string };

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 120_000;
const TEST_PAYLOAD = {
  messages: [{ role: "user", content: "Di solo: OK" }],
  temperature: 0,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse | ErrorResponse>
) {
  if (!AI_ENABLED) {
    return sendAiDisabled(res);
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", details: "Use GET" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  try {
    const creatorId = "creator-1";
    const selection = await getCortexProviderSelection({ creatorId });
    const provider = selection.provider;
    const baseUrl =
      selection.baseUrl?.trim() ||
      process.env.AI_BASE_URL?.trim() ||
      (provider === "openai" ? OPENAI_BASE_URL : null);
    if (!selection.configured && selection.desiredProvider !== "demo") {
      return res.status(200).json({
        ok: false,
        provider,
        base_url: baseUrl,
        model: selection.model ?? null,
        api_key: maskKey(selection.apiKey),
        reachable: false,
        errorCode: "PROVIDER_UNAVAILABLE",
        message: "Cortex no está configurado.",
      });
    }

    if (provider === "demo") {
      return res.status(200).json({
        ok: true,
        provider,
        base_url: baseUrl,
        model: selection.model ?? null,
        api_key: maskKey(selection.apiKey),
        reachable: true,
      });
    }

    const timeoutMs = resolveTimeoutMs();
    const testResult = await runChatCompletionTest({
      baseUrl: baseUrl ?? "",
      url: buildChatCompletionUrl(baseUrl ?? ""),
      apiKey: selection.apiKey ?? "ollama",
      model: selection.model ?? "",
      timeoutMs,
      creatorId,
      provider,
    });

    if (!testResult.ok) {
      return res.status(200).json({
        ok: false,
        provider,
        base_url: baseUrl,
        model: selection.model ?? null,
        api_key: maskKey(selection.apiKey),
        reachable: false,
        errorCode: testResult.errorCode,
        message: testResult.message,
      });
    }

    return res.status(200).json({
      ok: true,
      provider,
      base_url: baseUrl,
      model: selection.model ?? null,
      api_key: maskKey(selection.apiKey),
      reachable: true,
    });
  } catch (err) {
    console.error("Error checking cortex health", err);
    return res.status(500).json({ error: "Internal error", details: "health_check_failed" });
  }
}

function maskKey(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length <= 4) return "***";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function resolveTimeoutMs(): number {
  const raw = process.env.AI_TIMEOUT_MS ?? process.env.CORTEX_AI_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1000, Math.trunc(parsed));
  }
  return DEFAULT_TIMEOUT_MS;
}

function buildChatCompletionUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return `${trimmed}/chat/completions`;
}

function buildModelNotFoundMessage(model: string | null) {
  const label = model?.trim() ? model.trim() : "AI_MODEL";
  return [
    `Modelo no encontrado: ${label}. Revisa "ollama list" y ajusta AI_MODEL.`,
    "Ejemplo: deepseek-r1:7b",
  ].join("\n");
}

function buildProviderUnavailableMessage(baseUrl: string | null, provider: CortexProviderName) {
  const label = baseUrl?.trim() ? baseUrl.trim() : "AI_BASE_URL";
  if (provider === "ollama") {
    return `No puedo conectar con ${label}. ¿Ollama está instalado/ejecutándose?`;
  }
  return `No puedo conectar con ${label}.`;
}

function resolveHealthErrorCode(params: { errorCode?: string; errorMessage?: string; status?: number | null }) {
  const type = resolveProviderErrorType(params);
  if (type === "MODEL_NOT_FOUND") return "MODEL_NOT_FOUND";
  if (params.status === 404) return "MODEL_NOT_FOUND";
  return "PROVIDER_UNAVAILABLE";
}

function resolveHealthMessage(
  code: "MODEL_NOT_FOUND" | "PROVIDER_UNAVAILABLE",
  model: string | null,
  baseUrl: string | null,
  provider: CortexProviderName
) {
  if (code === "MODEL_NOT_FOUND") return buildModelNotFoundMessage(model);
  return buildProviderUnavailableMessage(baseUrl, provider);
}

async function runChatCompletionTest(params: {
  baseUrl: string;
  url: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  creatorId: string;
  provider: CortexProviderName;
}): Promise<{ ok: boolean; errorCode?: "MODEL_NOT_FOUND" | "PROVIDER_UNAVAILABLE"; message?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);
  const payload = { ...TEST_PAYLOAD, model: params.model };
  try {
    const response = await fetch(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorInfo = await parseOpenAiError(response, { creatorId: params.creatorId });
      const errorCode = resolveHealthErrorCode({
        errorCode: errorInfo.code,
        errorMessage: errorInfo.message,
        status: errorInfo.status,
      });
      return {
        ok: false,
        errorCode,
        message: resolveHealthMessage(errorCode, params.model, params.baseUrl, params.provider),
      };
    }

    const data = (await response.json().catch(() => null)) as any;
    const content =
      typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    if (!content) {
      return {
        ok: false,
        errorCode: "PROVIDER_UNAVAILABLE",
        message: "Respuesta inválida del proveedor.",
      };
    }

    return { ok: true };
  } catch (err) {
    const message = toSafeErrorMessage(err, { creatorId: params.creatorId });
    const code = resolveProviderErrorType({ errorMessage: message });
    const errorCode = code === "MODEL_NOT_FOUND" ? "MODEL_NOT_FOUND" : "PROVIDER_UNAVAILABLE";
    return {
      ok: false,
      errorCode,
      message: resolveHealthMessage(errorCode, params.model, params.baseUrl, params.provider),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
