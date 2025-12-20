import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { normalizePreferredLanguage } from "../../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../lib/dbSchemaGuard";
import { maybeDecrypt } from "../../../server/crypto/maybeDecrypt";
import { translateText } from "../../../server/ai/translateText";

type TranslateResponse =
  | { ok: true; translatedText: string | null; reason?: string }
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

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId.trim() : "";
  const targetLanguage = normalizePreferredLanguage(req.body?.targetLanguage);

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
