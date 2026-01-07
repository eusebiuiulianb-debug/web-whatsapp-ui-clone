import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { normalizePreferredLanguage } from "../../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../lib/dbSchemaGuard";
import { maybeDecrypt } from "../../../server/crypto/maybeDecrypt";
import { translateText } from "../../../server/ai/translateText";
import { mergeVoiceInsightsJson, type VoiceTranslation } from "../../../types/voiceAnalysis";

type TranslateResponse =
  | {
      ok: true;
      translatedText: string | null;
      reason?: string;
      detectedLanguage?: string | null;
      targetLanguage?: string | null;
    }
  | { ok: false; error: string; errorCode?: string; message?: string; fix?: string[] };

function normalizeMode(raw?: string | null) {
  const lowered = (raw || "").toLowerCase();
  if (lowered === "openai" || lowered === "live") return "live";
  if (lowered === "demo") return "demo";
  return "mock";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TranslateResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const messageId = typeof req.body?.messageId === "string" ? req.body.messageId.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId.trim() : "";
  const targetLanguage =
    normalizePreferredLanguage(req.body?.targetLanguage) ??
    normalizePreferredLanguage(req.body?.targetLang) ??
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

      const preferredLanguage = targetLanguage ?? "es";
      if (preferredLanguage === "es" && message.transcriptLang === "es") {
        return res.status(200).json({ ok: true, translatedText: null, reason: "not_required" });
      }

      const mode = normalizeMode(process.env.AI_MODE ?? "mock");
      const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId, label: "OPENAI_API_KEY" });
      const model = process.env.OPENAI_MODEL;
      if (mode !== "live" || !apiKey || !apiKey.trim() || !model || !model.trim()) {
        return res.status(200).json({ ok: true, translatedText: null, reason: "ai_not_configured" });
      }

      const translatedText = await translateText({
        text: transcriptText,
        targetLanguage: preferredLanguage,
        creatorId,
        fanId: message.fanId,
      });

      if (!translatedText) {
        return res.status(200).json({ ok: true, translatedText: null, reason: "unavailable" });
      }

      const translation: VoiceTranslation = {
        text: translatedText,
        targetLang: preferredLanguage,
        sourceLang: message.transcriptLang ?? null,
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
        detectedLanguage: translation.sourceLang ?? null,
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
      targetLanguage ?? normalizePreferredLanguage(fan.preferredLanguage) ?? "en";
    if (preferredLanguage === "es") {
      return res.status(200).json({ ok: true, translatedText: null, reason: "not_required" });
    }

    const mode = normalizeMode(process.env.AI_MODE ?? "mock");
    const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId: fan.creatorId, label: "OPENAI_API_KEY" });
    const model = process.env.OPENAI_MODEL;
    if (mode !== "live" || !apiKey || !apiKey.trim() || !model || !model.trim()) {
      return res.status(200).json({ ok: true, translatedText: null, reason: "ai_not_configured" });
    }

    const translatedText = await translateText({
      text,
      targetLanguage: preferredLanguage,
      creatorId: fan.creatorId,
      fanId,
    });

    if (!translatedText) {
      return res.status(200).json({ ok: true, translatedText: null, reason: "unavailable" });
    }

    return res.status(200).json({ ok: true, translatedText });
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
