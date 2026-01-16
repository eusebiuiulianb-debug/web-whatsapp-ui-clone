import type { TypingPayload } from "./events";

export type TypingIndicatorState = {
  isTyping: boolean;
  draftText?: string;
  ts: number;
};

type Listener = () => void;

const TYPING_HIDE_MS = 7000;
const MAX_DRAFT_LEN = 240;

const store = {
  entries: new Map<string, TypingIndicatorState>(),
  listeners: new Set<Listener>(),
  cleanupTimer: null as ReturnType<typeof setInterval> | null,
};

function normalizeDraftText(value: string) {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, MAX_DRAFT_LEN);
}

function notify() {
  store.listeners.forEach((listener) => listener());
}

function cleanupStale(now = Date.now()) {
  const staleKeys: string[] = [];
  store.entries.forEach((entry, key) => {
    if (now - entry.ts > TYPING_HIDE_MS) {
      staleKeys.push(key);
    }
  });
  if (staleKeys.length === 0) return;
  staleKeys.forEach((key) => {
    store.entries.delete(key);
  });
  notify();
}

function startCleanupLoop() {
  if (typeof window === "undefined" || store.cleanupTimer) return;
  store.cleanupTimer = setInterval(() => cleanupStale(), 1000);
}

function stopCleanupLoop() {
  if (!store.cleanupTimer) return;
  clearInterval(store.cleanupTimer);
  store.cleanupTimer = null;
}

export function subscribeTypingIndicators(listener: Listener) {
  store.listeners.add(listener);
  startCleanupLoop();
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      stopCleanupLoop();
    }
  };
}

export function getTypingIndicator(conversationId: string) {
  if (!conversationId) return null;
  const entry = store.entries.get(conversationId);
  if (!entry) return null;
  if (Date.now() - entry.ts > TYPING_HIDE_MS) {
    store.entries.delete(conversationId);
    notify();
    return null;
  }
  return entry;
}

export function getTypingByConversationId() {
  cleanupStale();
  const snapshot: Record<string, TypingIndicatorState> = {};
  store.entries.forEach((entry, key) => {
    snapshot[key] = entry;
  });
  return snapshot;
}

export function updateTypingIndicator(detail: TypingPayload) {
  if (!detail || detail.senderRole !== "fan") return;
  const conversationId =
    typeof detail.conversationId === "string" && detail.conversationId.trim()
      ? detail.conversationId.trim()
      : typeof detail.fanId === "string"
      ? detail.fanId.trim()
      : "";
  if (!conversationId) return;
  const ts = typeof detail.ts === "number" ? detail.ts : Date.now();
  const normalizedDraftText =
    typeof detail.draftText === "string" ? normalizeDraftText(detail.draftText) : undefined;
  if (!detail.isTyping || (normalizedDraftText !== undefined && normalizedDraftText.length === 0)) {
    if (store.entries.delete(conversationId)) {
      notify();
    }
    return;
  }
  const existing = store.entries.get(conversationId);
  const nextDraftText =
    normalizedDraftText !== undefined ? normalizedDraftText : existing?.draftText;
  const nextEntry: TypingIndicatorState = {
    isTyping: true,
    ts,
    ...(nextDraftText ? { draftText: nextDraftText } : {}),
  };
  store.entries.set(conversationId, nextEntry);
  notify();
}

export function clearTypingIndicator(conversationId: string) {
  if (!conversationId) return;
  if (store.entries.delete(conversationId)) {
    notify();
  }
}
