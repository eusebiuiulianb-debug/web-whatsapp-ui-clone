import type { NextApiRequest, NextApiResponse } from "next";
import { getCortexProviderSelection, type CortexProviderName } from "../../../../lib/ai/cortexProvider";

type HealthResponse = {
  provider: CortexProviderName;
  base_url: string | null;
  model: string | null;
  api_key: string | null;
  reachable: boolean;
};

type ErrorResponse = { error: string; details?: string };

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const PING_TIMEOUT_MS = 1500;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse | ErrorResponse>
) {
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
      provider === "openai" ? OPENAI_BASE_URL : selection.baseUrl?.trim() || null;
    const reachable = await pingProvider({
      provider,
      baseUrl,
      apiKey: selection.apiKey,
      configured: selection.configured,
      desiredProvider: selection.desiredProvider,
    });

    return res.status(200).json({
      provider,
      base_url: baseUrl,
      model: selection.model ?? null,
      api_key: maskKey(selection.apiKey),
      reachable,
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

async function pingProvider(params: {
  provider: CortexProviderName;
  baseUrl: string | null;
  apiKey?: string | null;
  configured: boolean;
  desiredProvider: CortexProviderName;
}) {
  if (!params.configured && params.desiredProvider !== "demo") return false;
  if (params.provider === "demo") return params.desiredProvider === "demo";
  if (!params.baseUrl) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const url =
      params.provider === "openai"
        ? `${OPENAI_BASE_URL}/models`
        : `${params.baseUrl.replace(/\/+$/, "")}/models`;
    const headers =
      params.provider === "openai" || params.provider === "ollama"
        ? { Authorization: `Bearer ${params.apiKey || "ollama"}` }
        : undefined;
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    return res.ok;
  } catch (_err) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
