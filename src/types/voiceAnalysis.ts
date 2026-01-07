export type VoiceAnalysisIntent =
  | "extra"
  | "purchase"
  | "question"
  | "complaint"
  | "logistics"
  | "flirt"
  | "boundaries"
  | "other";

export type VoiceAnalysisUrgency = "low" | "medium" | "high";

export type VoiceAnalysisSuggestion = {
  label: string;
  text: string;
};

export type VoiceAnalysis = {
  intent: VoiceAnalysisIntent;
  confidence: number;
  urgency: VoiceAnalysisUrgency;
  tags: string[];
  summary: string;
  suggestions: VoiceAnalysisSuggestion[];
  followUpQuestion?: string;
  updatedAt?: string;
};

export type VoiceTranslation = {
  text: string;
  targetLang?: string;
  sourceLang?: string | null;
  updatedAt?: string;
};

export function safeParseVoiceAnalysis(raw?: string | null): VoiceAnalysis | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const slice = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(slice) as VoiceAnalysis;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.intent !== "string" || typeof parsed.summary !== "string") return null;
    if (!Array.isArray(parsed.suggestions)) return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

export function safeParseVoiceTranslation(raw?: string | null): VoiceTranslation | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const slice = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(slice) as { translation?: VoiceTranslation };
    if (!parsed || typeof parsed !== "object") return null;
    const translation = (parsed as { translation?: VoiceTranslation }).translation;
    if (!translation || typeof translation !== "object") return null;
    if (typeof translation.text !== "string" || !translation.text.trim()) return null;
    return {
      text: translation.text,
      targetLang: typeof translation.targetLang === "string" ? translation.targetLang : undefined,
      sourceLang:
        typeof translation.sourceLang === "string" || translation.sourceLang === null
          ? translation.sourceLang
          : undefined,
      updatedAt: typeof translation.updatedAt === "string" ? translation.updatedAt : undefined,
    };
  } catch (_err) {
    return null;
  }
}

export function mergeVoiceInsightsJson(
  raw: string | null | undefined,
  update: { analysis?: VoiceAnalysis | null; translation?: VoiceTranslation | null }
): string {
  let base: Record<string, unknown> = {};
  if (raw && typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          base = parsed as Record<string, unknown>;
        }
      } catch (_err) {
        base = {};
      }
    }
  }

  if (update.analysis) {
    base = { ...base, ...update.analysis };
  }
  if (update.translation) {
    base = { ...base, translation: update.translation };
  }

  return JSON.stringify(base);
}

export function stringifyVoiceAnalysis(analysis: VoiceAnalysis): string {
  return JSON.stringify(analysis);
}
