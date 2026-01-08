import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { encryptSecret } from "../../../../lib/crypto/secrets";
import { getEffectiveTranslateConfig } from "../../../../lib/ai/translateProvider";

type TranslateProvider = "none" | "libretranslate" | "deepl";

type TranslateSettingsResponse = {
  provider: TranslateProvider;
  libretranslateUrl: string | null;
  deeplApiUrl: string | null;
  hasLibreKey: boolean;
  hasDeeplKey: boolean;
};

type ErrorResponse = { error: string; message?: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TranslateSettingsResponse | ErrorResponse>
) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<TranslateSettingsResponse | ErrorResponse>
) {
  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
      select: {
        translateProvider: true,
        libretranslateUrl: true,
        libretranslateApiKeyEnc: true,
        deeplApiUrl: true,
        deeplApiKeyEnc: true,
      },
    });

    if (!settings || settings.translateProvider === null) {
      const effective = await getEffectiveTranslateConfig(creatorId);
      return res.status(200).json({
        provider: normalizeProvider(effective.provider),
        libretranslateUrl: effective.libretranslateUrl ?? null,
        deeplApiUrl: normalizeDeepLApiUrl(effective.deeplApiUrl ?? null),
        hasLibreKey: Boolean(effective.libretranslateApiKey),
        hasDeeplKey: Boolean(effective.deeplApiKey),
      });
    }

    return res.status(200).json({
      provider: normalizeProvider(settings.translateProvider),
      libretranslateUrl: normalizeUrl(settings.libretranslateUrl),
      deeplApiUrl: normalizeDeepLApiUrl(settings.deeplApiUrl),
      hasLibreKey: Boolean(settings.libretranslateApiKeyEnc),
      hasDeeplKey: Boolean(settings.deeplApiKeyEnc),
    });
  } catch (err) {
    console.error("Error loading translate settings", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<TranslateSettingsResponse | ErrorResponse>
) {
  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Payload must be an object" });
  }

  const rawProvider = typeof req.body?.provider === "string" ? req.body.provider : "";
  const provider = normalizeProvider(rawProvider);
  if (!["none", "libretranslate", "deepl"].includes(provider)) {
    return res.status(400).json({ error: "provider is invalid" });
  }

  const creatorId = await resolveCreatorId();
  const existing = await prisma.creatorAiSettings.findUnique({
    where: { creatorId },
    select: {
      id: true,
      libretranslateApiKeyEnc: true,
      deeplApiUrl: true,
      deeplApiKeyEnc: true,
    },
  });

  const libretranslateUrl = normalizeUrl(
    typeof req.body?.libretranslateUrl === "string" ? req.body.libretranslateUrl : ""
  );
  const libretranslateApiKeyRaw =
    typeof req.body?.libretranslateApiKey === "string" ? req.body.libretranslateApiKey.trim() : undefined;
  const deeplApiKeyRaw =
    typeof req.body?.deeplApiKey === "string" ? req.body.deeplApiKey.trim() : undefined;
  const deeplApiUrlRaw =
    typeof req.body?.deeplApiUrl === "string" ? req.body.deeplApiUrl.trim() : undefined;
  const deeplApiUrl = deeplApiUrlRaw !== undefined ? normalizeDeepLApiUrl(deeplApiUrlRaw) : null;

  if (provider === "libretranslate" && !libretranslateUrl) {
    return res.status(400).json({ error: "LIBRETRANSLATE_URL is required" });
  }

  if (provider === "deepl") {
    if (deeplApiKeyRaw && isPlaceholderKey(deeplApiKeyRaw)) {
      return res.status(400).json({ error: "DEEPL_API_KEY is invalid" });
    }
    if (!deeplApiKeyRaw && !existing?.deeplApiKeyEnc) {
      return res.status(400).json({ error: "DEEPL_API_KEY is required" });
    }
  }

  const updateData: Prisma.CreatorAiSettingsUncheckedUpdateInput = {
    translateProvider: provider,
  };
  const createData: Prisma.CreatorAiSettingsUncheckedCreateInput = {
    creatorId,
    translateProvider: provider,
  };

  if (provider === "libretranslate") {
    updateData.libretranslateUrl = libretranslateUrl;
    createData.libretranslateUrl = libretranslateUrl;
  } else {
    updateData.libretranslateUrl = null;
    createData.libretranslateUrl = null;
  }

  if (provider === "deepl") {
    if (deeplApiUrlRaw !== undefined) {
      updateData.deeplApiUrl = deeplApiUrl;
    }
    createData.deeplApiUrl = deeplApiUrl ?? null;
  } else {
    updateData.deeplApiUrl = null;
    createData.deeplApiUrl = null;
  }

  if (libretranslateApiKeyRaw !== undefined) {
    updateData.libretranslateApiKeyEnc = libretranslateApiKeyRaw
      ? encryptSecret(libretranslateApiKeyRaw)
      : null;
    createData.libretranslateApiKeyEnc = updateData.libretranslateApiKeyEnc as string | null;
  }

  if (deeplApiKeyRaw !== undefined) {
    updateData.deeplApiKeyEnc = deeplApiKeyRaw ? encryptSecret(deeplApiKeyRaw) : null;
    createData.deeplApiKeyEnc = updateData.deeplApiKeyEnc as string | null;
  }

  try {
    const settings = await prisma.creatorAiSettings.upsert({
      where: { creatorId },
      update: updateData,
      create: createData,
      select: {
        translateProvider: true,
        libretranslateUrl: true,
        libretranslateApiKeyEnc: true,
        deeplApiUrl: true,
        deeplApiKeyEnc: true,
      },
    });

    return res.status(200).json({
      provider: normalizeProvider(settings.translateProvider),
      libretranslateUrl: normalizeUrl(settings.libretranslateUrl),
      deeplApiUrl: normalizeDeepLApiUrl(settings.deeplApiUrl),
      hasLibreKey: Boolean(settings.libretranslateApiKeyEnc),
      hasDeeplKey: Boolean(settings.deeplApiKeyEnc),
    });
  } catch (err) {
    console.error("Error saving translate settings", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
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

function normalizeProvider(raw?: string | null): TranslateProvider {
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (normalized === "libre") return "libretranslate";
  if (normalized === "deepl") return "deepl";
  if (normalized === "libretranslate") return "libretranslate";
  return "none";
}

function normalizeUrl(raw?: string | null): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function normalizeDeepLApiUrl(raw?: string | null): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  let normalized = trimmed.replace(/\/+$/, "");
  if (normalized.endsWith("/v2/translate")) {
    normalized = normalized.slice(0, -"/v2/translate".length);
  } else if (normalized.endsWith("/v2")) {
    normalized = normalized.slice(0, -"/v2".length);
  }
  return normalized.replace(/\/+$/, "");
}

function isPlaceholderKey(value: string) {
  const lowered = value.trim().toLowerCase();
  if (!lowered) return true;
  if (lowered.includes("tu_key") || lowered.includes("your_key")) return true;
  if (lowered.startsWith("tu_") || lowered.startsWith("your_")) return true;
  if (lowered.includes("placeholder") || lowered.includes("changeme") || lowered.includes("example")) return true;
  return false;
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
