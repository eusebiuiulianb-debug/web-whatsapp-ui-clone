import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { normalizeTranslationLanguage } from "../../../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";
import { dedupeGet, dedupeSet, hashText, rateLimitOrThrow } from "../../../../lib/ai/guardrails";
import { getEffectiveTranslateConfig, translateText } from "../../../../lib/ai/translateProvider";

const SUPPORTED_SOURCE_KINDS = new Set(["text", "voice_transcript"] as const);
const DEDUPE_TTL_SEC = 30 * 60;

type SourceKind = "text" | "voice_transcript";

type TranslateResponse =
  | {
      id: string;
      translatedText: string;
      targetLang: string;
      sourceKind: SourceKind;
      detectedSourceLang?: string | null;
      createdAt: string;
    }
  | { error: string; code?: string; errorCode?: string; message?: string; fix?: string[]; retryAfterSec?: number };

const normalizeDetectedSourceLang = (value?: string | null) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "UN";
  const upper = trimmed.toUpperCase();
  if (upper === "AUTO" || upper === "UN") return "UN";
  return upper;
};

function resolveViewerRole(req: NextApiRequest): "creator" | "fan" {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

function normalizeSourceKind(raw?: string | null): SourceKind {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "voice_transcript") return "voice_transcript";
  return "text";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TranslateResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const messageId = typeof req.body?.messageId === "string" ? req.body.messageId.trim() : "";
  const rawText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const targetLangRaw = typeof req.body?.targetLang === "string" ? req.body.targetLang.trim() : "";
  const targetLang = normalizeTranslationLanguage(targetLangRaw);
  const hasTargetLang = targetLangRaw.length > 0;
  const sourceKind = normalizeSourceKind(typeof req.body?.sourceKind === "string" ? req.body.sourceKind : undefined);

  if (hasTargetLang && !targetLang) {
    return res.status(400).json({ error: "targetLang is required" });
  }

  if (!SUPPORTED_SOURCE_KINDS.has(sourceKind)) {
    return res.status(400).json({ error: "sourceKind is invalid" });
  }

  try {
    if (!messageId) {
      if (!rawText) {
        return res.status(400).json({ error: "text is required" });
      }
      const creatorId = await resolveCreatorId();
      const translateConfig = await getEffectiveTranslateConfig(creatorId);
      const resolvedTargetLang = targetLang ?? translateConfig.creatorLang ?? "es";
      const sourceHash = hashText(rawText);
      const dedupeKey = `ai:translate:${creatorId}:selection:${resolvedTargetLang}:${sourceHash}`;
      const deduped = await dedupeGet<TranslateResponse>(dedupeKey);
      if (deduped && "translatedText" in deduped) {
        res.setHeader("x-cache", "dedupe");
        return res.status(200).json(deduped);
      }
      if (!translateConfig.configured) {
        return res.status(501).json({ error: "TRANSLATE_NOT_CONFIGURED", code: "TRANSLATE_NOT_CONFIGURED" });
      }
      const rateLimit = await rateLimitOrThrow({ creatorId, action: "translate" });
      if (typeof rateLimit.remaining === "number") {
        res.setHeader("x-ratelimit-remaining", String(rateLimit.remaining));
      }
      const result = await translateText({
        text: rawText,
        targetLang: resolvedTargetLang,
        creatorId,
        fanId: null,
        configOverride: translateConfig,
      });
      const translatedText = result.translatedText;
      const detectedSourceLang = normalizeDetectedSourceLang(result.detectedSourceLang);
      const payload: TranslateResponse = {
        id: `selection-${Date.now()}`,
        translatedText,
        targetLang: resolvedTargetLang,
        sourceKind: "text",
        detectedSourceLang,
        createdAt: new Date().toISOString(),
      };
      res.setHeader("x-cache", "miss");
      await dedupeSet(dedupeKey, payload, DEDUPE_TTL_SEC);
      return res.status(200).json(payload);
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        fanId: true,
        text: true,
        transcriptText: true,
        transcriptLang: true,
        fan: { select: { creatorId: true, preferredLanguage: true } },
      },
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const creatorId = await resolveCreatorId();
    if (message.fan.creatorId !== creatorId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const sourceText =
      sourceKind === "voice_transcript"
        ? typeof message.transcriptText === "string"
          ? message.transcriptText.trim()
          : ""
        : typeof message.text === "string"
        ? message.text.trim()
        : "";

    if (!sourceText) {
      return res.status(400).json({ error: "source text is required" });
    }

    const sourceHash = hashText(sourceText);

    const translateConfig = await getEffectiveTranslateConfig(creatorId);
    const resolvedTargetLang = targetLang ?? translateConfig.creatorLang ?? "es";

    const existing = await prisma.messageTranslation.findUnique({
      where: {
        messageId_targetLang_sourceKind_sourceHash: {
          messageId,
          targetLang: resolvedTargetLang,
          sourceKind,
          sourceHash,
        },
      },
    });

    if (existing) {
      res.setHeader("x-cache", "db");
      return res.status(200).json({
        id: existing.id,
        translatedText: existing.translatedText,
        targetLang: existing.targetLang,
        sourceKind: existing.sourceKind as SourceKind,
        detectedSourceLang: normalizeDetectedSourceLang(existing.detectedSourceLang),
        createdAt: existing.createdAt.toISOString(),
      });
    }

    const dedupeKey = `ai:translate:${creatorId}:${messageId}:${resolvedTargetLang}:${sourceKind}:${sourceHash}`;
    const deduped = await dedupeGet<TranslateResponse>(dedupeKey);
    if (deduped && "translatedText" in deduped) {
      res.setHeader("x-cache", "dedupe");
      return res.status(200).json(deduped);
    }

    if (!translateConfig.configured) {
      return res.status(501).json({ error: "TRANSLATE_NOT_CONFIGURED", code: "TRANSLATE_NOT_CONFIGURED" });
    }

    const rateLimit = await rateLimitOrThrow({ creatorId, action: "translate" });
    if (typeof rateLimit.remaining === "number") {
      res.setHeader("x-ratelimit-remaining", String(rateLimit.remaining));
    }

    const result = await translateText({
      text: sourceText,
      targetLang: resolvedTargetLang,
      creatorId,
      fanId: message.fanId,
      configOverride: translateConfig,
    });
    const translatedText = result.translatedText;
    const detectedSourceLang = normalizeDetectedSourceLang(result.detectedSourceLang);

    try {
      const created = await prisma.messageTranslation.create({
        data: {
          messageId,
          targetLang: resolvedTargetLang,
          sourceKind,
          sourceHash,
          translatedText,
          detectedSourceLang,
          createdByCreatorId: creatorId,
        },
      });

      const payload = {
        id: created.id,
        translatedText: created.translatedText,
        targetLang: created.targetLang,
        sourceKind: created.sourceKind as SourceKind,
        detectedSourceLang: normalizeDetectedSourceLang(created.detectedSourceLang),
        createdAt: created.createdAt.toISOString(),
      };
      res.setHeader("x-cache", "miss");
      await dedupeSet(dedupeKey, payload, DEDUPE_TTL_SEC);
      return res.status(200).json(payload);
    } catch (createErr) {
      if (isUniqueConstraintError(createErr)) {
        const deduped = await prisma.messageTranslation.findUnique({
          where: {
            messageId_targetLang_sourceKind_sourceHash: {
              messageId,
              targetLang: resolvedTargetLang,
              sourceKind,
              sourceHash,
            },
          },
        });
        if (deduped) {
          res.setHeader("x-cache", "db");
          return res.status(200).json({
            id: deduped.id,
            translatedText: deduped.translatedText,
            targetLang: deduped.targetLang,
            sourceKind: deduped.sourceKind as SourceKind,
            detectedSourceLang: normalizeDetectedSourceLang(deduped.detectedSourceLang),
            createdAt: deduped.createdAt.toISOString(),
          });
        }
      }
      throw createErr;
    }
  } catch (err) {
    if (isTranslateNotConfiguredError(err)) {
      return res.status(501).json({ error: "TRANSLATE_NOT_CONFIGURED", code: "TRANSLATE_NOT_CONFIGURED" });
    }
    if (isTranslateProviderError(err) && err.code === "NETWORK_ERROR") {
      return res.status(502).json({
        error: "NETWORK_ERROR",
        code: "NETWORK_ERROR",
        message: err.message,
      });
    }
    if (isRateLimitError(err)) {
      const retryAfterSec = err.retryAfterSec ?? 60;
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: "RATE_LIMITED", retryAfterSec });
    }
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ error: payload.errorCode, ...payload });
    }
    console.error("api/creator/messages/translate error", err);
    return res.status(500).json({ error: "translation_failed" });
  }
}

function isUniqueConstraintError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  return "code" in err && (err as { code?: string }).code === "P2002";
}

function isTranslateNotConfiguredError(err: unknown): err is { code?: string } {
  if (!err || typeof err !== "object") return false;
  return "code" in err && (err as { code?: string }).code === "TRANSLATE_NOT_CONFIGURED";
}

function isTranslateProviderError(err: unknown): err is { code?: string; message?: string } {
  if (!err || typeof err !== "object") return false;
  return "code" in err && typeof (err as { code?: string }).code === "string";
}

function isRateLimitError(err: unknown): err is { status?: number; retryAfterSec?: number } {
  if (!err || typeof err !== "object") return false;
  return "status" in err && (err as { status?: number }).status === 429;
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("No creator found");
  }

  return creator.id;
}
