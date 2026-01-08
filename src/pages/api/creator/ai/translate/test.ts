import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { getEffectiveTranslateConfig, getLibreTranslateHelpMessage } from "../../../../../lib/ai/translateProvider";

const TIMEOUT_MS = 4000;

type TestResponse = { ok: true } | { ok: false; error: string; message?: string };

function resolveViewerRole(req: NextApiRequest): "creator" | "fan" {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TestResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const creatorId = await resolveCreatorId();
  const translateConfig = await getEffectiveTranslateConfig(creatorId);
  if (translateConfig.provider !== "libretranslate") {
    return res.status(400).json({ ok: false, error: "PROVIDER_NOT_LIBRETRANSLATE" });
  }

  const baseUrl = normalizeUrl(translateConfig.libretranslateUrl);
  if (!baseUrl) {
    return res.status(400).json({ ok: false, error: "LIBRETRANSLATE_URL_MISSING" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/languages`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "NETWORK_ERROR",
        message: getLibreTranslateHelpMessage(),
      });
    }
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data)) {
      return res.status(502).json({
        ok: false,
        error: "NETWORK_ERROR",
        message: getLibreTranslateHelpMessage(),
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return res.status(504).json({
        ok: false,
        error: "NETWORK_ERROR",
        message: getLibreTranslateHelpMessage(),
      });
    }
    return res.status(502).json({
      ok: false,
      error: "NETWORK_ERROR",
      message: getLibreTranslateHelpMessage(),
    });
  } finally {
    clearTimeout(timer);
  }
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
