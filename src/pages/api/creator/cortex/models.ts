import type { NextApiRequest, NextApiResponse } from "next";
import { getCortexProviderSelection } from "../../../../lib/ai/cortexProvider";
import { toSafeErrorMessage } from "../../../../server/ai/openAiError";
import { AI_ENABLED, sendAiDisabled } from "../../../../lib/features";

type ModelsResponse = {
  models: string[];
  error?: string;
};

const OPENAI_BASE_URL = "https://api.openai.com/v1";

export default async function handler(req: NextApiRequest, res: NextApiResponse<ModelsResponse>) {
  if (!AI_ENABLED) {
    return sendAiDisabled(res);
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ models: [], error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  try {
    const creatorId = "creator-1";
    const selection = await getCortexProviderSelection({ creatorId });
    if (!selection.configured && selection.desiredProvider !== "demo") {
      return res.status(200).json({ models: [], error: "Cortex no está configurado." });
    }

    if (selection.provider === "demo") {
      return res.status(200).json({ models: [], error: "Proveedor demo no soporta detección de modelos." });
    }

    if (selection.provider === "ollama") {
      const baseUrl = selection.baseUrl?.trim() || process.env.AI_BASE_URL?.trim() || "";
      const host = normalizeOllamaHost(baseUrl);
      if (!host) {
        return res.status(200).json({ models: [], error: "AI_BASE_URL no configurado." });
      }
      const url = `${host}/api/tags`;
      try {
        const response = await fetch(url, { method: "GET" });
        if (!response.ok) {
          const raw = await response.text();
          return res.status(200).json({
            models: [],
            error: raw?.trim() ? `No se pudo listar modelos: ${raw.trim()}` : "No se pudo listar modelos de Ollama.",
          });
        }
        const data = (await response.json().catch(() => null)) as any;
        const items = Array.isArray(data?.models) ? data.models : [];
        const models = items
          .map((item: any) => (typeof item?.name === "string" ? item.name.trim() : ""))
          .filter((name: string) => name.length > 0);
        return res.status(200).json({ models: uniqueSorted(models) });
      } catch (err) {
        return res.status(200).json({
          models: [],
          error: `No puedo conectar con ${host}. ¿Ollama está instalado/ejecutándose?`,
        });
      }
    }

    const baseUrl =
      selection.baseUrl?.trim() || process.env.AI_BASE_URL?.trim() || OPENAI_BASE_URL;
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    const apiKey =
      selection.apiKey?.trim() ||
      process.env.AI_API_KEY?.trim() ||
      process.env.CORTEX_OPENAI_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      "";
    if (!apiKey) {
      return res.status(200).json({ models: [], error: "Falta AI_API_KEY para listar modelos." });
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        const raw = await response.text();
        return res.status(200).json({
          models: [],
          error: raw?.trim() ? `No se pudo listar modelos: ${raw.trim()}` : "No se pudo listar modelos del proveedor.",
        });
      }
      const data = (await response.json().catch(() => null)) as any;
      const items = Array.isArray(data?.data) ? data.data : [];
      const models = items
        .map((item: any) => (typeof item?.id === "string" ? item.id.trim() : ""))
        .filter((id: string) => id.length > 0);
      return res.status(200).json({ models: uniqueSorted(models) });
    } catch (err) {
      const message = toSafeErrorMessage(err);
      return res.status(200).json({
        models: [],
        error: message ? `No se pudo listar modelos: ${message}` : "No se pudo listar modelos del proveedor.",
      });
    }
  } catch (err) {
    const message = toSafeErrorMessage(err);
    return res.status(200).json({ models: [], error: message || "No se pudieron listar modelos." });
  }
}

function normalizeOllamaHost(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.toLowerCase().endsWith("/v1")) {
    return trimmed.slice(0, -3).replace(/\/+$/, "");
  }
  return trimmed;
}

function uniqueSorted(models: string[]): string[] {
  const set = new Set<string>();
  for (const model of models) {
    const trimmed = model.trim();
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
