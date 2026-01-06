export type VoiceTranscriptionMode = "MANUAL" | "AUTO_SMART" | "AUTO_ALWAYS";

export type VoiceTranscriptionSettings = {
  mode: VoiceTranscriptionMode;
  minSeconds: number;
  dailyBudgetUsd: number;
  extractIntentTags: boolean;
  suggestReply: boolean;
};

export const VOICE_TRANSCRIPTION_MODES: VoiceTranscriptionMode[] = ["MANUAL", "AUTO_SMART", "AUTO_ALWAYS"];

export const DEFAULT_VOICE_TRANSCRIPTION_SETTINGS: VoiceTranscriptionSettings = {
  mode: "MANUAL",
  minSeconds: 8,
  dailyBudgetUsd: 0.5,
  extractIntentTags: false,
  suggestReply: false,
};

export function normalizeVoiceTranscriptionMode(value: unknown): VoiceTranscriptionMode {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (raw === "AUTO_ALWAYS" || raw === "AUTO_ALL" || raw === "AUTO") return "AUTO_ALWAYS";
  if (raw === "AUTO_SMART" || raw === "AUTO_INCOMING" || raw === "INCOMING" || raw === "SMART") return "AUTO_SMART";
  if (raw === "MANUAL" || raw === "OFF" || raw === "DISABLED") return "MANUAL";
  return DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.mode;
}

export function normalizeVoiceTranscriptionSettings(raw: any): VoiceTranscriptionSettings {
  const mode = normalizeVoiceTranscriptionMode(raw?.voiceTranscriptionMode ?? raw?.mode);
  const minSecondsRaw = Number(raw?.voiceTranscriptionMinSeconds ?? raw?.minSeconds);
  const budgetRaw = Number(raw?.voiceTranscriptionDailyBudgetUsd ?? raw?.dailyBudgetUsd);
  const legacyBudgetMinutes = Number(raw?.voiceTranscriptionDailyBudgetMinutes ?? raw?.dailyBudgetMinutes);
  const minSeconds =
    Number.isFinite(minSecondsRaw) && minSecondsRaw > 0
      ? Math.round(minSecondsRaw)
      : DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.minSeconds;
  const legacyBudgetUsd = Number.isFinite(legacyBudgetMinutes) && legacyBudgetMinutes >= 0
    ? legacyBudgetMinutes * 0.006
    : NaN;
  const budgetValue = Number.isFinite(budgetRaw) ? budgetRaw : legacyBudgetUsd;
  const dailyBudgetUsd =
    Number.isFinite(budgetValue) && budgetValue >= 0
      ? Math.round(budgetValue * 100) / 100
      : DEFAULT_VOICE_TRANSCRIPTION_SETTINGS.dailyBudgetUsd;
  const extractIntentTags = Boolean(raw?.voiceTranscriptionExtractIntentTags ?? raw?.voiceIntentTagsEnabled ?? raw?.extractIntentTags);
  const suggestReply = Boolean(raw?.voiceTranscriptionSuggestReply ?? raw?.suggestReply);
  return { mode, minSeconds, dailyBudgetUsd, extractIntentTags, suggestReply };
}
