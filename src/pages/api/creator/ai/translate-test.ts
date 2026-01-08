import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { getEffectiveTranslateConfig, getLibreTranslateHelpMessage, resolveDeepLBaseUrl } from "../../../../lib/ai/translateProvider";

type TestResponse = { ok: true } | { ok: false; error: string; message?: string };

const TIMEOUT_MS = 4000;

export default async function handler(req: NextApiRequest, res: NextApiResponse<TestResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const config = await getEffectiveTranslateConfig(creatorId);

    if (!config.configured) {
      return res.status(400).json({ ok: false, error: "TRANSLATE_NOT_CONFIGURED", message: "Traducción no configurada." });
    }

    if (config.provider === "libretranslate") {
      return await testLibreTranslate(config.libretranslateUrl ?? "", res);
    }

    if (config.provider === "deepl") {
      return await testDeepL({ apiKey: config.deeplApiKey ?? "", apiUrlOverride: config.deeplApiUrl ?? null }, res);
    }

    return res.status(400).json({ ok: false, error: "PROVIDER_NOT_SUPPORTED", message: "Proveedor no soportado." });
  } catch (err) {
    console.error("translate-test error", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

async function testLibreTranslate(baseUrl: string, res: NextApiResponse<TestResponse>) {
  const normalized = normalizeUrl(baseUrl);
  if (!normalized) {
    return res.status(400).json({ ok: false, error: "LIBRETRANSLATE_URL_MISSING", message: "Falta LIBRETRANSLATE_URL." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${normalized}/languages`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return res.status(502).json({ ok: false, error: "NETWORK_ERROR", message: getLibreTranslateHelpMessage() });
    }
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data)) {
      return res.status(502).json({ ok: false, error: "NETWORK_ERROR", message: getLibreTranslateHelpMessage() });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return res.status(504).json({ ok: false, error: "NETWORK_ERROR", message: getLibreTranslateHelpMessage() });
    }
    return res.status(502).json({ ok: false, error: "NETWORK_ERROR", message: getLibreTranslateHelpMessage() });
  } finally {
    clearTimeout(timer);
  }
}

async function testDeepL(
  params: { apiKey: string; apiUrlOverride?: string | null },
  res: NextApiResponse<TestResponse>
) {
  const apiKey = params.apiKey;
  if (!apiKey) {
    return res.status(400).json({ ok: false, error: "DEEPL_API_KEY_MISSING", message: "Falta DEEPL_API_KEY." });
  }
  const baseUrl = resolveDeepLBaseUrl(apiKey, params.apiUrlOverride);
  const endpoint = `${baseUrl}/v2/usage`;
  const isDev = process.env.NODE_ENV !== "production";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      if (isDev) {
        console.warn("DeepL test failed", { status: response.status, baseUrl });
      }
      return res.status(502).json({
        ok: false,
        error: "DEEPL_AUTH_FAILED",
        message: "No se pudo autenticar en DeepL. Revisa tu API key.",
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      if (isDev) {
        console.warn("DeepL test timed out", { baseUrl });
      }
      return res.status(504).json({ ok: false, error: "NETWORK_ERROR", message: "DeepL no respondió a tiempo." });
    }
    if (isDev) {
      console.warn("DeepL test error", { baseUrl, err });
    }
    return res.status(502).json({ ok: false, error: "NETWORK_ERROR", message: "No se pudo conectar con DeepL." });
  } finally {
    clearTimeout(timer);
  }
}

function resolveViewerRole(req: NextApiRequest): "creator" | "fan" {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

function normalizeUrl(raw?: string | null): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("Creator not found");
  }

  return creator.id;
}
