import { runAiCompletion } from "./aiAdapter";
import { maybeDecrypt } from "../crypto/maybeDecrypt";
import { TRANSLATION_LANGUAGE_NAMES, type TranslationLanguage } from "../../lib/language";

type TranslateParams = {
  text: string;
  targetLanguage: TranslationLanguage;
  creatorId?: string;
  fanId?: string | null;
};

export async function translateText({ text, targetLanguage, creatorId, fanId }: TranslateParams): Promise<string | null> {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return null;

  const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId, label: "OPENAI_API_KEY" });
  const aiMode = process.env.AI_MODE ?? "mock";
  const languageLabel = TRANSLATION_LANGUAGE_NAMES[targetLanguage] ?? targetLanguage.toUpperCase();

  try {
    const result = await runAiCompletion({
      messages: [
        {
          role: "system",
          content: `You are a translation engine. Translate the user's text to ${languageLabel} (${targetLanguage}). Respond with only the translation, no quotes or extra text.`,
        },
        { role: "user", content: trimmed },
      ],
      apiKey,
      aiMode,
      model: process.env.OPENAI_MODEL,
      temperature: 0.2,
      creatorId,
      fanId: fanId ?? null,
      route: "/api/messages/translate",
      fallbackMessage: "",
    });

    if (result.usedFallback || result.needsConfig) return null;
    const output = typeof result.text === "string" ? result.text.trim() : "";
    if (!output) return null;
    return output;
  } catch (err) {
    console.warn("translation_failed", {
      creatorId: creatorId ?? null,
      fanId: fanId ?? null,
      error: err instanceof Error ? err.message : "unknown_error",
    });
    return null;
  }
}
