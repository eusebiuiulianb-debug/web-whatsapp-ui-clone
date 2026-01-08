import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { normalizeTranslationLanguage } from "../../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../lib/dbSchemaGuard";
import { getEffectiveTranslateConfig, translateText } from "../../../lib/ai/translateProvider";
import { mergeVoiceInsightsJson, type VoiceTranslation } from "../../../types/voiceAnalysis";

type TranslateResponse =
  | {
      ok: true;
      translatedText: string | null;
      reason?: string;
      detectedSourceLang?: string | null;
      targetLang?: string | null;
      detectedLanguage?: string | null;
      targetLanguage?: string | null;
    }
  | { ok: false; error: string; code?: string; errorCode?: string; message?: string; fix?: string[] };

const normalizeDetectedSourceLang = (value?: string | null) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "UN";
  const upper = trimmed.toUpperCase();
  if (upper === "AUTO" || upper === "UN") return "UN";
  return upper;
};

const logTranslateError = (context: string, err: unknown) => {
  const message = err instanceof Error ? err.message : "translation_failed";
  const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : undefined;
  const detail = err && typeof err === "object" && "detail" in err ? (err as { detail?: string }).detail : undefined;
  console.error(context, { status, message, detail });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<TranslateResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const messageId = typeof req.body?.messageId === "string" ? req.body.messageId.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId.trim() : "";
  const targetLanguage =
    normalizeTranslationLanguage(req.body?.targetLanguage) ??
    normalizeTranslationLanguage(req.body?.targetLang) ??
    null;

  if (messageId) {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          fanId: true,
          from: true,
          type: true,
          transcriptText: true,
          transcriptLang: true,
          voiceAnalysisJson: true,
          fan: { select: { creatorId: true } },
        },
      });

      if (!message) {
        return res.status(404).json({ ok: false, error: "Message not found" });
      }

      const fromValue = typeof message.from === "string" ? message.from.toLowerCase() : "";
      if (message.type !== "VOICE" || fromValue !== "fan") {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }

      const creatorId = await resolveCreatorId();
      if (message.fan.creatorId !== creatorId) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }

      const transcriptText = typeof message.transcriptText === "string" ? message.transcriptText.trim() : "";
      if (!transcriptText) {
        return res.status(409).json({ ok: false, error: "Transcript required" });
      }

      const translateConfig = await getEffectiveTranslateConfig(creatorId);
      if (!translateConfig.configured) {
        return res.status(501).json({ ok: false, error: "TRANSLATE_NOT_CONFIGURED", code: "TRANSLATE_NOT_CONFIGURED" });
      }

      const preferredLanguage = targetLanguage ?? translateConfig.creatorLang ?? "es";

      let translatedText = "";
      let detectedSourceLang: string | null = null;
      try {
        const result = await translateText({
          text: transcriptText,
          targetLang: preferredLanguage,
          creatorId,
          fanId: message.fanId,
          configOverride: translateConfig,
        });
        translatedText = result.translatedText;
        detectedSourceLang = normalizeDetectedSourceLang(result.detectedSourceLang);
      } catch (err) {
        logTranslateError("api/messages/translate voice error", err);
        return res.status(502).json({ ok: false, error: "translation_failed" });
      }

      if (!translatedText) {
        return res.status(200).json({
          ok: true,
          translatedText: null,
          reason: "unavailable",
          detectedSourceLang: "UN",
          targetLang: preferredLanguage,
          detectedLanguage: "UN",
          targetLanguage: preferredLanguage,
        });
      }

      const translation: VoiceTranslation = {
        text: translatedText,
        targetLang: preferredLanguage,
        sourceLang: detectedSourceLang,
        updatedAt: new Date().toISOString(),
      };

      const merged = mergeVoiceInsightsJson(message.voiceAnalysisJson, { translation });
      await prisma.message.update({
        where: { id: message.id },
        data: { voiceAnalysisJson: merged },
      });

      return res.status(200).json({
        ok: true,
        translatedText,
        detectedSourceLang,
        targetLang: translation.targetLang ?? null,
        detectedLanguage: detectedSourceLang,
        targetLanguage: translation.targetLang ?? null,
      });
    } catch (err) {
      if (isDbSchemaOutOfSyncError(err)) {
        const payload = getDbSchemaOutOfSyncPayload();
        return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
      }
      console.error("api/messages/translate voice error", err);
      return res.status(500).json({ ok: false, error: "translation_failed" });
    }
  }

  if (!fanId) {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  if (!text) {
    return res.status(200).json({ ok: true, translatedText: null, reason: "empty" });
  }

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { creatorId: true, preferredLanguage: true },
    });

    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const preferredLanguage =
      targetLanguage ?? normalizeTranslationLanguage(fan.preferredLanguage) ?? "en";
    if (preferredLanguage === "es") {
      return res.status(200).json({
        ok: true,
        translatedText: null,
        reason: "not_required",
        detectedSourceLang: "UN",
        targetLang: preferredLanguage,
        detectedLanguage: "UN",
        targetLanguage: preferredLanguage,
      });
    }

    const translateConfig = await getEffectiveTranslateConfig(fan.creatorId);
    if (!translateConfig.configured) {
      return res.status(501).json({ ok: false, error: "TRANSLATE_NOT_CONFIGURED", code: "TRANSLATE_NOT_CONFIGURED" });
    }

    let translatedText = "";
    let detectedSourceLang: string | null = null;
    try {
      const result = await translateText({
        text,
        targetLang: preferredLanguage,
        creatorId: fan.creatorId,
        fanId,
        configOverride: translateConfig,
      });
      translatedText = result.translatedText;
      detectedSourceLang = normalizeDetectedSourceLang(result.detectedSourceLang);
    } catch (err) {
      logTranslateError("api/messages/translate error", err);
      return res.status(502).json({ ok: false, error: "translation_failed" });
    }

    if (!translatedText) {
      return res.status(200).json({
        ok: true,
        translatedText: null,
        reason: "unavailable",
        detectedSourceLang: "UN",
        targetLang: preferredLanguage,
        detectedLanguage: "UN",
        targetLanguage: preferredLanguage,
      });
    }

    return res.status(200).json({
      ok: true,
      translatedText,
      detectedSourceLang,
      targetLang: preferredLanguage,
      detectedLanguage: detectedSourceLang,
      targetLanguage: preferredLanguage,
    });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/messages/translate error", err);
    return res.status(500).json({ ok: false, error: "translation_failed" });
  }
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
