import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma, type CreatorAiSettings } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { AI_TURN_MODES, type AiTurnMode } from "../../../lib/aiTemplateTypes";
import { normalizeAiBaseTone, normalizeAiTurnMode } from "../../../lib/aiSettings";
import { decryptSecretSafe, encryptSecret } from "../../../lib/crypto/secrets";
import {
  createDefaultCreatorPlatforms,
  creatorPlatformsToJsonValue,
  normalizeCreatorPlatforms,
} from "../../../lib/creatorPlatforms";
import { DEFAULT_VOICE_TRANSCRIPTION_SETTINGS } from "../../../lib/voiceTranscriptionSettings";
import { normalizeTranslationLanguage, type TranslationLanguage } from "../../../lib/language";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const creatorId = await resolveCreatorId();

    let settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
    });

    if (!settings) {
      settings = await prisma.creatorAiSettings.create({
        data: {
          creatorId,
          platforms: createDefaultCreatorPlatforms(),
          voiceTranscriptionMode: DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.mode,
          voiceTranscriptionMinSeconds: DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.minSeconds,
          voiceTranscriptionDailyBudgetUsd: DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.dailyBudgetUsd,
          voiceTranscriptionExtractIntentTags: DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.extractIntentTags,
          voiceTranscriptionSuggestReply: DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.suggestReply,
        },
      });
    }

    const data = buildSettingsPayload(settings);

    return res.status(200).json({ ok: true, data, settings: data.settings });
  } catch (err) {
    console.error("Error loading creator AI settings", err);
    if (err instanceof Error && err.message === "Creator not found") {
      return res.status(404).json({ error: "Creator not found" });
    }
    return sendServerError(res, "Error loading AI settings");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendBadRequest(res, "Payload must be an object");
  }

  const {
    tone,
    spicinessLevel,
    formalityLevel,
    emojiUsage,
    priorityOrderJson,
    forbiddenTopics,
    forbiddenPromises,
    rulesManifest,
    allowSuggestReplies,
    allowSuggestExtras,
    allowSuggestRenewals,
    allowAutoLowPriority,
    voiceTranscriptionMode,
    voiceTranscriptionMinSeconds,
    voiceTranscriptionDailyBudgetUsd,
    voiceTranscriptionDailyBudgetMinutes,
    voiceTranscriptionExtractIntentTags,
    voiceTranscriptionSuggestReply,
    voiceIntentTagsEnabled,
    creditsAvailable,
    hardLimitPerDay,
    turnMode,
    cortexProvider,
    cortexBaseUrl,
    cortexModel,
    cortexApiKey,
    platforms,
  } = body as Record<string, unknown>;

  const updateData: Prisma.CreatorAiSettingsUncheckedUpdateInput = {};
  const createData: Partial<Prisma.CreatorAiSettingsUncheckedCreateInput> = {};

  if (tone !== undefined) {
    if (typeof tone !== "string") return sendBadRequest(res, "tone must be a string");
    const normalizedTone = normalizeAiBaseTone(tone);
    updateData.tone = normalizedTone as any;
    createData.tone = normalizedTone as any;
  }
  if (spicinessLevel !== undefined) {
    const normalized = coerceInteger(spicinessLevel);
    if (normalized === null) return sendBadRequest(res, "spicinessLevel must be a number");
    updateData.spicinessLevel = normalized;
    createData.spicinessLevel = normalized;
  }
  if (formalityLevel !== undefined) {
    const normalized = coerceInteger(formalityLevel);
    if (normalized === null) return sendBadRequest(res, "formalityLevel must be a number");
    updateData.formalityLevel = normalized;
    createData.formalityLevel = normalized;
  }
  if (emojiUsage !== undefined) {
    const normalized = coerceInteger(emojiUsage);
    if (normalized === null) return sendBadRequest(res, "emojiUsage must be a number");
    updateData.emojiUsage = normalized;
    createData.emojiUsage = normalized;
  }
  if (priorityOrderJson !== undefined) {
    if (priorityOrderJson !== null && typeof priorityOrderJson !== "object") {
      return sendBadRequest(res, "priorityOrderJson must be JSON");
    }
    const normalizedPriority =
      priorityOrderJson === null ? Prisma.JsonNull : (priorityOrderJson as Prisma.InputJsonValue);
    updateData.priorityOrderJson = normalizedPriority;
    createData.priorityOrderJson = normalizedPriority;
  }
  if (forbiddenTopics !== undefined) {
    if (typeof forbiddenTopics !== "string") return sendBadRequest(res, "forbiddenTopics must be a string");
    updateData.forbiddenTopics = forbiddenTopics;
    createData.forbiddenTopics = forbiddenTopics;
  }
  if (forbiddenPromises !== undefined) {
    if (typeof forbiddenPromises !== "string") return sendBadRequest(res, "forbiddenPromises must be a string");
    updateData.forbiddenPromises = forbiddenPromises;
    createData.forbiddenPromises = forbiddenPromises;
  }
  if (rulesManifest !== undefined) {
    if (typeof rulesManifest !== "string") return sendBadRequest(res, "rulesManifest must be a string");
    updateData.rulesManifest = rulesManifest;
    createData.rulesManifest = rulesManifest;
  }
  if (allowSuggestReplies !== undefined) {
    if (typeof allowSuggestReplies !== "boolean") return sendBadRequest(res, "allowSuggestReplies must be a boolean");
    updateData.allowSuggestReplies = allowSuggestReplies;
    createData.allowSuggestReplies = allowSuggestReplies;
  }
  if (allowSuggestExtras !== undefined) {
    if (typeof allowSuggestExtras !== "boolean") return sendBadRequest(res, "allowSuggestExtras must be a boolean");
    updateData.allowSuggestExtras = allowSuggestExtras;
    createData.allowSuggestExtras = allowSuggestExtras;
  }
  if (allowSuggestRenewals !== undefined) {
    if (typeof allowSuggestRenewals !== "boolean") return sendBadRequest(res, "allowSuggestRenewals must be a boolean");
    updateData.allowSuggestRenewals = allowSuggestRenewals;
    createData.allowSuggestRenewals = allowSuggestRenewals;
  }
  if (allowAutoLowPriority !== undefined) {
    if (typeof allowAutoLowPriority !== "boolean") return sendBadRequest(res, "allowAutoLowPriority must be a boolean");
    updateData.allowAutoLowPriority = allowAutoLowPriority;
    createData.allowAutoLowPriority = allowAutoLowPriority;
  }
  if (voiceTranscriptionMode !== undefined) {
    if (typeof voiceTranscriptionMode !== "string") {
      return sendBadRequest(res, "voiceTranscriptionMode must be a string");
    }
    updateData.voiceTranscriptionMode = voiceTranscriptionMode.toUpperCase();
    createData.voiceTranscriptionMode = voiceTranscriptionMode.toUpperCase();
  }
  if (voiceTranscriptionMinSeconds !== undefined) {
    if (!Number.isFinite(Number(voiceTranscriptionMinSeconds))) {
      return sendBadRequest(res, "voiceTranscriptionMinSeconds must be a number");
    }
    const normalized = Math.max(0, Math.round(Number(voiceTranscriptionMinSeconds)));
    updateData.voiceTranscriptionMinSeconds = normalized;
    createData.voiceTranscriptionMinSeconds = normalized;
  }
  if (voiceTranscriptionDailyBudgetUsd !== undefined) {
    if (!Number.isFinite(Number(voiceTranscriptionDailyBudgetUsd))) {
      return sendBadRequest(res, "voiceTranscriptionDailyBudgetUsd must be a number");
    }
    const normalized = Math.max(0, Number(voiceTranscriptionDailyBudgetUsd));
    const rounded = Math.round(normalized * 100) / 100;
    updateData.voiceTranscriptionDailyBudgetUsd = rounded;
    createData.voiceTranscriptionDailyBudgetUsd = rounded;
  } else if (voiceTranscriptionDailyBudgetMinutes !== undefined) {
    if (!Number.isFinite(Number(voiceTranscriptionDailyBudgetMinutes))) {
      return sendBadRequest(res, "voiceTranscriptionDailyBudgetMinutes must be a number");
    }
    const normalized = Math.max(0, Number(voiceTranscriptionDailyBudgetMinutes));
    const converted = Math.round(normalized * 0.006 * 100) / 100;
    updateData.voiceTranscriptionDailyBudgetUsd = converted;
    createData.voiceTranscriptionDailyBudgetUsd = converted;
  }
  if (voiceTranscriptionExtractIntentTags !== undefined) {
    if (typeof voiceTranscriptionExtractIntentTags !== "boolean") {
      return sendBadRequest(res, "voiceTranscriptionExtractIntentTags must be a boolean");
    }
    updateData.voiceTranscriptionExtractIntentTags = voiceTranscriptionExtractIntentTags;
    createData.voiceTranscriptionExtractIntentTags = voiceTranscriptionExtractIntentTags;
  } else if (voiceIntentTagsEnabled !== undefined) {
    if (typeof voiceIntentTagsEnabled !== "boolean") {
      return sendBadRequest(res, "voiceIntentTagsEnabled must be a boolean");
    }
    updateData.voiceTranscriptionExtractIntentTags = voiceIntentTagsEnabled;
    createData.voiceTranscriptionExtractIntentTags = voiceIntentTagsEnabled;
  }
  if (voiceTranscriptionSuggestReply !== undefined) {
    if (typeof voiceTranscriptionSuggestReply !== "boolean") {
      return sendBadRequest(res, "voiceTranscriptionSuggestReply must be a boolean");
    }
    updateData.voiceTranscriptionSuggestReply = voiceTranscriptionSuggestReply;
    createData.voiceTranscriptionSuggestReply = voiceTranscriptionSuggestReply;
  }
  if (creditsAvailable !== undefined) {
    const normalized = coerceInteger(creditsAvailable);
    if (normalized === null) return sendBadRequest(res, "creditsAvailable must be a number");
    updateData.creditsAvailable = normalized;
    createData.creditsAvailable = normalized;
  }
  if (hardLimitPerDay !== undefined) {
    if (hardLimitPerDay === null) {
      updateData.hardLimitPerDay = null;
      createData.hardLimitPerDay = null;
    } else {
      const normalized = coerceInteger(hardLimitPerDay);
      if (normalized === null) return sendBadRequest(res, "hardLimitPerDay must be a number or null");
      updateData.hardLimitPerDay = normalized;
      createData.hardLimitPerDay = normalized;
    }
  }
  if (turnMode !== undefined) {
    const validModes = AI_TURN_MODES as readonly string[];
    const normalizedMode = normalizeAiTurnMode(typeof turnMode === "string" ? turnMode : null);
    if (turnMode !== null && !validModes.includes(normalizedMode)) {
      return sendBadRequest(res, "turnMode must be a valid AI turn mode");
    }
    updateData.turnMode = (normalizedMode as any) ?? "auto";
    createData.turnMode = (normalizedMode as any) ?? "auto";
  }
  const cortexProviderNormalized =
    cortexProvider !== undefined ? normalizeCortexProvider(cortexProvider) : null;
  if (cortexProvider !== undefined && !cortexProviderNormalized) {
    return sendBadRequest(res, "cortexProvider must be 'ollama' or 'openai'");
  }
  if (cortexProviderNormalized) {
    updateData.cortexProvider = cortexProviderNormalized;
    createData.cortexProvider = cortexProviderNormalized;
  }
  if (cortexBaseUrl !== undefined) {
    if (typeof cortexBaseUrl !== "string") return sendBadRequest(res, "cortexBaseUrl must be a string");
    const normalized = cortexBaseUrl.trim();
    updateData.cortexBaseUrl = normalized ? normalized : null;
    createData.cortexBaseUrl = updateData.cortexBaseUrl;
  }
  if (cortexModel !== undefined) {
    if (typeof cortexModel !== "string") return sendBadRequest(res, "cortexModel must be a string");
    const normalized = cortexModel.trim();
    updateData.cortexModel = normalized ? normalized : null;
    createData.cortexModel = updateData.cortexModel;
  }
  if (cortexApiKey !== undefined) {
    if (typeof cortexApiKey !== "string") return sendBadRequest(res, "cortexApiKey must be a string");
    const trimmed = cortexApiKey.trim();
    if (trimmed) {
      if (!process.env.APP_SECRET_KEY?.trim() && process.env.NODE_ENV === "production") {
        return sendBadRequest(res, "APP_SECRET_KEY is required to store cortexApiKey");
      }
      updateData.cortexApiKeyEnc = encryptSecret(trimmed);
      createData.cortexApiKeyEnc = updateData.cortexApiKeyEnc as string | null;
    }
  }
  if (platforms !== undefined) {
    const normalizedPlatforms = normalizeCreatorPlatforms(platforms);
    updateData.platforms = creatorPlatformsToJsonValue(normalizedPlatforms) as Prisma.InputJsonValue;
    createData.platforms = creatorPlatformsToJsonValue(normalizedPlatforms) as Prisma.InputJsonValue;
  }

  try {
    const creatorId = await resolveCreatorId();
    if (cortexProviderNormalized === "ollama") {
      if (typeof cortexBaseUrl !== "string" || !cortexBaseUrl.trim()) {
        return sendBadRequest(res, "cortexBaseUrl is required for ollama");
      }
      if (typeof cortexModel !== "string" || !cortexModel.trim()) {
        return sendBadRequest(res, "cortexModel is required for ollama");
      }
    }
    if (cortexProviderNormalized === "openai") {
      const existing = await prisma.creatorAiSettings.findUnique({
        where: { creatorId },
        select: { cortexApiKeyEnc: true },
      });
      const incomingKey = typeof cortexApiKey === "string" ? cortexApiKey.trim() : "";
      const existingKeyValid = existing?.cortexApiKeyEnc
        ? decryptSecretSafe(existing.cortexApiKeyEnc).ok
        : false;
      if (!incomingKey && !existingKeyValid) {
        return sendBadRequest(res, "cortexApiKey is required for openai");
      }
    }
    if (createData.voiceTranscriptionMode === undefined) {
      createData.voiceTranscriptionMode = DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.mode;
    }
    if (createData.voiceTranscriptionMinSeconds === undefined) {
      createData.voiceTranscriptionMinSeconds = DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.minSeconds;
    }
    if (createData.voiceTranscriptionDailyBudgetUsd === undefined) {
      createData.voiceTranscriptionDailyBudgetUsd = DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.dailyBudgetUsd;
    }
    if (createData.voiceTranscriptionExtractIntentTags === undefined) {
      createData.voiceTranscriptionExtractIntentTags = DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.extractIntentTags;
    }
    if (createData.voiceTranscriptionSuggestReply === undefined) {
      createData.voiceTranscriptionSuggestReply = DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.suggestReply;
    }

    const settings = await prisma.creatorAiSettings.upsert({
      where: { creatorId },
      update: updateData,
      create: { creatorId, platforms: createDefaultCreatorPlatforms(), ...createData },
    });

    const data = buildSettingsPayload(settings);

    return res.status(200).json({ ok: true, data, settings: data.settings });
  } catch (err) {
    console.error("Error saving creator AI settings", err);
    if (err instanceof Error && err.message === "Creator not found") {
      return res.status(404).json({ error: "Creator not found" });
    }
    return sendServerError(res, "Error saving AI settings");
  }
}

function coerceInteger(value: unknown): number | null {
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  return parsed;
}

function normalizeCortexProvider(value: unknown): "ollama" | "openai" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "ollama") return "ollama";
  if (normalized === "openai") return "openai";
  return null;
}

type KeyStatus = { saved: boolean; invalid: boolean };

function buildKeyStatus(payload?: string | null): KeyStatus {
  if (!payload) return { saved: false, invalid: false };
  const decrypted = decryptSecretSafe(payload);
  if (decrypted.ok) return { saved: true, invalid: false };
  return { saved: false, invalid: true };
}

function normalizeOptionalString(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeTranslateProvider(raw?: string | null): "deepl" | "libretranslate" | "none" {
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (normalized === "deepl") return "deepl";
  if (normalized === "libre" || normalized === "libretranslate") return "libretranslate";
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

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function buildSettingsPayload(settings: CreatorAiSettings) {
  const {
    cortexApiKeyEnc: _cortexApiKeyEnc,
    libretranslateApiKeyEnc: _libretranslateApiKeyEnc,
    deeplApiKeyEnc: _deeplApiKeyEnc,
    ...rest
  } = settings as any;

  const platforms = normalizeCreatorPlatforms((settings as any).platforms);

  return {
    ai: {
      provider: normalizeCortexProvider((settings as any).cortexProvider),
      baseUrl: normalizeOptionalString((settings as any).cortexBaseUrl),
      model: normalizeOptionalString((settings as any).cortexModel),
      apiKey: buildKeyStatus((settings as any).cortexApiKeyEnc),
    },
    translation: {
      provider: normalizeTranslateProvider((settings as any).translateProvider),
      creatorLanguage: resolveCreatorLangFromPriority((settings as any).priorityOrderJson),
      deepl: {
        apiKey: buildKeyStatus((settings as any).deeplApiKeyEnc),
        apiUrl: normalizeDeepLApiUrl((settings as any).deeplApiUrl),
      },
      libretranslate: {
        url: normalizeUrl((settings as any).libretranslateUrl),
        apiKey: buildKeyStatus((settings as any).libretranslateApiKeyEnc),
      },
    },
    settings: {
      ...rest,
      platforms,
    },
    meta: {
      updatedAt: toIso((settings as any).updatedAt),
    },
  };
}

async function resolveCreatorId(): Promise<string> {
  if (process.env.CREATOR_ID) {
    return process.env.CREATOR_ID;
  }

  const defaultCreator = await prisma.creator.findUnique({
    where: { id: "creator-1" },
    select: { id: true },
  });
  if (defaultCreator) {
    return defaultCreator.id;
  }

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("Creator not found");
  }

  return creator.id;
}
