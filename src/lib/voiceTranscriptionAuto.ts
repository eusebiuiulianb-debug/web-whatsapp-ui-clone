import { normalizeVoiceTranscriptionSettings, type VoiceTranscriptionSettings } from "./voiceTranscriptionSettings";
import { VOICE_TRANSCRIPTION_BUDGET_EVENT } from "../constants/events";
import { isSmartTranscriptionTarget } from "./voiceTranscriptionSmartTargets";

export type AutoTranscriptionPayload = {
  messageId: string;
  eventId?: string | null;
  fanId: string;
  from?: "fan" | "creator";
  durationMs?: number | null;
  createdAt?: string | null;
};

type BudgetState = {
  date: string;
  usedUsd: number;
};

const SETTINGS_STORAGE_KEY = "novsy:voiceTranscriptionSettings";
const BUDGET_STORAGE_KEY = "novsy:voiceTranscriptionBudget";
const DEDUPE_STORAGE_KEY = "novsy:voiceTranscriptionAutoDedupe";
const SETTINGS_CACHE_MS = 60_000;
const DEDUPE_TTL_MS = 10 * 60 * 1000;
const USD_PER_MINUTE = 0.006;

let cachedSettings: { value: VoiceTranscriptionSettings; ts: number } | null = null;
let inflightSettings: Promise<VoiceTranscriptionSettings> | null = null;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readJsonStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (_err) {
    return null;
  }
}

function writeJsonStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_err) {
    // ignore
  }
}

function loadBudgetState(): BudgetState {
  const today = getTodayKey();
  const stored = readJsonStorage<BudgetState>(BUDGET_STORAGE_KEY);
  if (!stored || stored.date !== today) {
    return { date: today, usedUsd: 0 };
  }
  return {
    date: today,
    usedUsd: Number.isFinite(stored.usedUsd) ? stored.usedUsd : 0,
  };
}

function saveBudgetState(state: BudgetState) {
  writeJsonStorage(BUDGET_STORAGE_KEY, state);
}

function canSpendBudget(costUsd: number, dailyBudgetUsd: number) {
  if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd <= 0) {
    return { allowed: false, remainingSeconds: 0 };
  }
  const state = loadBudgetState();
  const remaining = Math.max(0, dailyBudgetUsd - state.usedUsd);
  if (costUsd > remaining) {
    return { allowed: false, remainingSeconds: remaining };
  }
  return { allowed: true, remainingSeconds: remaining };
}

function consumeBudget(costUsd: number) {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  const state = loadBudgetState();
  const next = {
    date: state.date,
    usedUsd: state.usedUsd + costUsd,
  };
  saveBudgetState(next);
}

function emitBudgetPaused(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(VOICE_TRANSCRIPTION_BUDGET_EVENT, {
      detail: { message },
    })
  );
}

function shouldAutoTranscribe(settings: VoiceTranscriptionSettings, payload: AutoTranscriptionPayload) {
  if (settings.mode === "MANUAL") return false;
  if (payload.from !== "fan") return false;
  if (settings.mode === "AUTO_SMART" && !isSmartTranscriptionTarget(payload.fanId)) return false;
  const durationSeconds = Math.max(0, Math.round((payload.durationMs ?? 0) / 1000));
  if (durationSeconds <= 0 || durationSeconds < settings.minSeconds) return false;
  return true;
}

function shouldProcessEvent(eventId: string | null | undefined) {
  if (!eventId) return true;
  const now = Date.now();
  const stored = readJsonStorage<Record<string, number>>(DEDUPE_STORAGE_KEY) || {};
  const entries = Object.entries(stored);
  const next: Record<string, number> = {};
  for (let i = 0; i < entries.length; i += 1) {
    const [key, ts] = entries[i];
    if (now - ts <= DEDUPE_TTL_MS) {
      next[key] = ts;
    }
  }
  if (next[eventId]) {
    writeJsonStorage(DEDUPE_STORAGE_KEY, next);
    return false;
  }
  next[eventId] = now;
  writeJsonStorage(DEDUPE_STORAGE_KEY, next);
  return true;
}

async function fetchSettings(): Promise<VoiceTranscriptionSettings> {
  if (cachedSettings && Date.now() - cachedSettings.ts < SETTINGS_CACHE_MS) {
    return cachedSettings.value;
  }
  if (inflightSettings) return inflightSettings;

  inflightSettings = (async () => {
    try {
      const res = await fetch("/api/creator/ai-settings", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const payload = data?.data ?? data;
        const normalized = normalizeVoiceTranscriptionSettings(payload?.settings ?? data?.settings ?? {});
        cachedSettings = { value: normalized, ts: Date.now() };
        writeJsonStorage(SETTINGS_STORAGE_KEY, normalized);
        return normalized;
      }
    } catch (_err) {
      // ignore
    }

    const stored = readJsonStorage<VoiceTranscriptionSettings>(SETTINGS_STORAGE_KEY);
    const fallback = normalizeVoiceTranscriptionSettings(stored ?? {});
    cachedSettings = { value: fallback, ts: Date.now() };
    return fallback;
  })();

  try {
    return await inflightSettings;
  } finally {
    inflightSettings = null;
  }
}

export async function maybeAutoTranscribeVoiceNote(payload: AutoTranscriptionPayload) {
  if (typeof window === "undefined") return { attempted: false, reason: "no_window" } as const;
  if (!payload?.messageId) return { attempted: false, reason: "missing_message" } as const;

  const settings = await fetchSettings();
  if (!shouldAutoTranscribe(settings, payload)) {
    return { attempted: false, reason: "mode_or_duration" } as const;
  }

  const durationSeconds = Math.max(0, Math.round((payload.durationMs ?? 0) / 1000));
  const costUsd = (durationSeconds / 60) * USD_PER_MINUTE;
  const budgetCheck = canSpendBudget(costUsd, settings.dailyBudgetUsd);
  if (!budgetCheck.allowed) {
    emitBudgetPaused("Auto pausado por presupuesto");
    return { attempted: false, reason: "budget" } as const;
  }

  const dedupeId = payload.eventId || payload.messageId;
  if (!shouldProcessEvent(dedupeId)) {
    return { attempted: false, reason: "dedupe" } as const;
  }

  try {
    const res = await fetch(`/api/voice-notes/transcribe/${payload.messageId}`, {
      method: "POST",
      headers: { "x-novsy-viewer": "creator" },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data.started) {
      consumeBudget(costUsd);
      return { attempted: true, started: true } as const;
    }
    if (res.ok && data?.ok && data.status === "DONE") {
      return { attempted: true, started: false } as const;
    }
    return { attempted: false, reason: "transcribe_failed" } as const;
  } catch (_err) {
    return { attempted: false, reason: "transcribe_failed" } as const;
  }
}
