import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { decryptSecretSafe, encryptSecret, isCryptoConfigError } from "../../../../lib/crypto/secrets";
import { normalizeTranslationLanguage, type TranslationLanguage } from "../../../../lib/language";

type TranslateProvider = "none" | "libretranslate" | "deepl";

type KeyStatus = { saved: boolean; invalid: boolean };

type TranslateSettingsPayload = {
  provider: TranslateProvider;
  libretranslateUrl: string | null;
  deeplApiUrl: string | null;
  libretranslateApiKey: KeyStatus;
  deeplApiKey: KeyStatus;
  creatorLang: TranslationLanguage;
};

type TranslateSettingsResponse =
  | { ok: true; data: TranslateSettingsPayload; settings?: TranslateSettingsPayload }
  | { ok: false; error: string; message?: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TranslateSettingsResponse>
) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res
    .status(405)
    .json({ ok: false, error: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<TranslateSettingsResponse>
) {
  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  try {
    res.setHeader("Cache-Control", "no-store");
    const creatorId = await resolveCreatorId();
    const settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
      select: {
        translateProvider: true,
        libretranslateUrl: true,
        libretranslateApiKeyEnc: true,
        deeplApiUrl: true,
        deeplApiKeyEnc: true,
        priorityOrderJson: true,
      },
    });

    const payload = buildTranslatePayload(settings);
    return res.status(200).json({ ok: true, data: payload, settings: payload });
  } catch (err) {
    console.error("Error loading translate settings", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<TranslateSettingsResponse>
) {
  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ ok: false, error: "Payload must be an object" });
  }

  const rawProvider = typeof req.body?.provider === "string" ? req.body.provider : "";
  const provider = normalizeProvider(rawProvider);
  if (!["none", "libretranslate", "deepl"].includes(provider)) {
    return res.status(400).json({ ok: false, error: "provider is invalid" });
  }

  const creatorId = await resolveCreatorId();
  const existing = await prisma.creatorAiSettings.findUnique({
    where: { creatorId },
    select: {
      id: true,
      libretranslateApiKeyEnc: true,
      deeplApiUrl: true,
      deeplApiKeyEnc: true,
      priorityOrderJson: true,
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
  const creatorLangRaw = typeof req.body?.creatorLang === "string" ? req.body.creatorLang : undefined;
  const creatorLang =
    creatorLangRaw !== undefined ? normalizeTranslationLanguage(creatorLangRaw) : null;

  if (provider === "libretranslate" && !libretranslateUrl) {
    return res.status(400).json({ ok: false, error: "LIBRETRANSLATE_URL is required" });
  }

  if (provider === "deepl") {
    if (deeplApiKeyRaw && isPlaceholderKey(deeplApiKeyRaw)) {
      return res.status(400).json({ ok: false, error: "DEEPL_API_KEY is invalid" });
    }
    const existingKeyValid = existing?.deeplApiKeyEnc
      ? decryptSecretSafe(existing.deeplApiKeyEnc).ok
      : false;
    if (!deeplApiKeyRaw && !existingKeyValid) {
      return res.status(400).json({ ok: false, error: "DEEPL_API_KEY is required" });
    }
  }

  if (creatorLangRaw !== undefined && !creatorLang) {
    return res.status(400).json({ ok: false, error: "creatorLang is invalid" });
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
    if (libretranslateApiKeyRaw) {
      if (!hasSecretKeyEnv() && process.env.NODE_ENV === "production") {
        return res.status(400).json({ ok: false, error: "APP_SECRET_KEYS is required to store LibreTranslate key" });
      }
      try {
        updateData.libretranslateApiKeyEnc = encryptSecret(libretranslateApiKeyRaw);
        createData.libretranslateApiKeyEnc = updateData.libretranslateApiKeyEnc as string | null;
      } catch (err) {
        if (isCryptoConfigError(err)) {
          return res.status(400).json({ ok: false, error: err.message });
        }
        throw err;
      }
    }
  }

  if (deeplApiKeyRaw !== undefined) {
    if (deeplApiKeyRaw) {
      if (!hasSecretKeyEnv() && process.env.NODE_ENV === "production") {
        return res.status(400).json({ ok: false, error: "APP_SECRET_KEYS is required to store DeepL key" });
      }
      try {
        updateData.deeplApiKeyEnc = encryptSecret(deeplApiKeyRaw);
        createData.deeplApiKeyEnc = updateData.deeplApiKeyEnc as string | null;
      } catch (err) {
        if (isCryptoConfigError(err)) {
          return res.status(400).json({ ok: false, error: err.message });
        }
        throw err;
      }
    }
  }

  if (creatorLangRaw !== undefined) {
    const nextPriority = mergeCreatorLangPriority(existing?.priorityOrderJson, creatorLang ?? DEFAULT_CREATOR_LANG);
    updateData.priorityOrderJson = nextPriority;
    createData.priorityOrderJson = nextPriority;
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
        priorityOrderJson: true,
      },
    });

    const payload = buildTranslatePayload(settings);
    return res.status(200).json({ ok: true, data: payload, settings: payload });
  } catch (err) {
    console.error("Error saving translate settings", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
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

function hasSecretKeyEnv(): boolean {
  return Boolean(
    (typeof process.env.APP_SECRET_KEYS === "string" && process.env.APP_SECRET_KEYS.trim()) ||
      (typeof process.env.APP_SECRET_KEY === "string" && process.env.APP_SECRET_KEY.trim())
  );
}

function normalizeProvider(raw?: string | null): TranslateProvider {
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (normalized === "libre") return "libretranslate";
  if (normalized === "deepl") return "deepl";
  if (normalized === "libretranslate") return "libretranslate";
  return "none";
}

function buildKeyStatus(payload?: string | null): KeyStatus {
  if (!payload) return { saved: false, invalid: false };
  const decrypted = decryptSecretSafe(payload);
  if (decrypted.ok) return { saved: true, invalid: false };
  return { saved: false, invalid: true };
}

function buildTranslatePayload(
  settings: {
    translateProvider?: string | null;
    libretranslateUrl?: string | null;
    deeplApiUrl?: string | null;
    libretranslateApiKeyEnc?: string | null;
    deeplApiKeyEnc?: string | null;
    priorityOrderJson?: Prisma.JsonValue | null;
  } | null
): TranslateSettingsPayload {
  if (!settings) {
    return {
      provider: "none",
      libretranslateUrl: null,
      deeplApiUrl: null,
      libretranslateApiKey: { saved: false, invalid: false },
      deeplApiKey: { saved: false, invalid: false },
      creatorLang: DEFAULT_CREATOR_LANG,
    };
  }

  return {
    provider: normalizeProvider(settings.translateProvider),
    libretranslateUrl: normalizeUrl(settings.libretranslateUrl),
    deeplApiUrl: normalizeDeepLApiUrl(settings.deeplApiUrl),
    libretranslateApiKey: buildKeyStatus(settings.libretranslateApiKeyEnc),
    deeplApiKey: buildKeyStatus(settings.deeplApiKeyEnc),
    creatorLang: resolveCreatorLangFromPriority(settings.priorityOrderJson),
  };
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

const DEFAULT_CREATOR_LANG: TranslationLanguage = "es";

function resolveCreatorLangFromPriority(raw?: unknown): TranslationLanguage {
  if (!raw || typeof raw !== "object") return DEFAULT_CREATOR_LANG;
  const record = raw as Record<string, unknown>;
  const translation = record.translation;
  if (translation && typeof translation === "object" && !Array.isArray(translation)) {
    const nested = (translation as Record<string, unknown>).creatorLang;
    const normalized = normalizeTranslationLanguage(nested);
    if (normalized) return normalized;
  }
  const normalized = normalizeTranslationLanguage(record.creatorLang);
  return normalized ?? DEFAULT_CREATOR_LANG;
}

function mergeCreatorLangPriority(
  raw: unknown,
  creatorLang: TranslationLanguage
): Prisma.InputJsonValue {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const translation =
    base.translation && typeof base.translation === "object" && !Array.isArray(base.translation)
      ? (base.translation as Record<string, unknown>)
      : {};
  return {
    ...base,
    translation: {
      ...translation,
      creatorLang,
    },
  } as Prisma.InputJsonValue;
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
