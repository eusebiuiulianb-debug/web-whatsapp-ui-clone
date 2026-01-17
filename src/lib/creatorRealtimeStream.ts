import {
  CREATOR_DATA_CHANGED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  PURCHASE_CREATED_EVENT,
  TYPING_EVENT,
  VOICE_TRANSCRIPT_UPDATED_EVENT,
} from "../constants/events";
import type { FanMessageSentPayload, PurchaseCreatedPayload, TypingPayload, VoiceTranscriptPayload } from "./events";
import { emitCreatorEvent as emitCreatorBusEvent } from "./creatorRealtimeBus";
import { createEventIdDedupe } from "./realtimeEventDedupe";
import { maybeAutoTranscribeVoiceNote } from "./voiceTranscriptionAuto";
import { isFanDraftPreviewEnabled, normalizeFanDraftText } from "./fanDraftPreview";

type CreatorRealtimeEventType =
  | "MESSAGE_CREATED"
  | "VOICE_CREATED"
  | "voice_note"
  | "voice_note_created"
  | "voice_note_transcript"
  | "voice_note_transcribed"
  | "PURCHASE_CREATED"
  | "PPV_UNLOCKED"
  | "CHAT_UPDATED";

type CreatorRealtimeEvent = {
  eventId: string;
  type: CreatorRealtimeEventType;
  fanId?: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

type BroadcastPayload = {
  originId: string;
  event: CreatorRealtimeEvent;
};

const CHANNEL_NAME = "novsy_creator_realtime";
const LOCK_KEY = "novsy_creator_realtime_owner";
const OWNER_TTL_MS = 12_000;
const OWNER_PING_MS = 4_000;
const FAN_DRAFT_PREVIEW_ENABLED = isFanDraftPreviewEnabled();

const eventDedupe = createEventIdDedupe({ ttlMs: 10 * 60 * 1000, maxEntries: 400 });

let initialized = false;
let channel: BroadcastChannel | null = null;
let eventSource: EventSource | null = null;
let isOwner = false;
let lockTimer: number | null = null;

const originId = (() => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
})();

function parseLock(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { tabId?: string; ts?: number };
    if (!parsed?.tabId || typeof parsed.ts !== "number") return null;
    return { tabId: parsed.tabId, ts: parsed.ts };
  } catch (_err) {
    return null;
  }
}

function writeLock(tabId: string) {
  const payload = { tabId, ts: Date.now() };
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(payload));
  } catch (_err) {
    // ignore storage failures
  }
}

function clearLock(tabId: string) {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    const parsed = parseLock(raw);
    if (parsed?.tabId === tabId) {
      localStorage.removeItem(LOCK_KEY);
    }
  } catch (_err) {
    // ignore
  }
}

function shouldOwnLock() {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    const lock = parseLock(raw);
    const now = Date.now();
    if (!lock) return true;
    if (lock.tabId === originId) return true;
    return now - lock.ts > OWNER_TTL_MS;
  } catch (_err) {
    return true;
  }
}

function dispatchLocal(eventName: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function normalizeTypingPayload(raw: unknown): TypingPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as {
    conversationId?: unknown;
    fanId?: unknown;
    isTyping?: unknown;
    senderRole?: unknown;
    hasDraft?: unknown;
    draftText?: unknown;
    ts?: unknown;
  };
  const conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
  const fanId = typeof payload.fanId === "string" ? payload.fanId.trim() : "";
  const isTyping = typeof payload.isTyping === "boolean" ? payload.isTyping : null;
  const senderRole =
    payload.senderRole === "fan" || payload.senderRole === "creator" ? payload.senderRole : null;
  const hasDraft = typeof payload.hasDraft === "boolean" ? payload.hasDraft : undefined;
  const draftText =
    FAN_DRAFT_PREVIEW_ENABLED && typeof payload.draftText === "string"
      ? normalizeFanDraftText(payload.draftText)
      : undefined;
  const ts = typeof payload.ts === "number" ? payload.ts : Date.now();
  if (!conversationId || !fanId || isTyping === null || !senderRole) return null;
  return { conversationId, fanId, isTyping, senderRole, hasDraft, draftText, ts };
}

function normalizeMessageKind(type?: string | null) {
  const upper = typeof type === "string" ? type.toUpperCase() : "";
  if (upper === "AUDIO" || upper === "VOICE") return "audio";
  if (upper === "CONTENT") return "content";
  if (upper === "STICKER") return "sticker";
  return "text";
}

function handleMessageEvent(event: CreatorRealtimeEvent) {
  const payload = event.payload ?? {};
  const message = (payload as { message?: Record<string, unknown> }).message ?? null;
  const durationMs =
    typeof (payload as { durationMs?: number }).durationMs === "number"
      ? (payload as { durationMs?: number }).durationMs
      : typeof (message as { audioDurationMs?: number } | null)?.audioDurationMs === "number"
      ? (message as { audioDurationMs?: number }).audioDurationMs
      : undefined;
  const fanId =
    (typeof event.fanId === "string" && event.fanId.trim().length > 0 ? event.fanId : "") ||
    (typeof message?.fanId === "string" ? message.fanId : "");
  if (!fanId) return;
  const audience = typeof message?.audience === "string" ? message.audience.toUpperCase() : "";
  if (audience === "INTERNAL") return;
  const kind = normalizeMessageKind(typeof message?.type === "string" ? message.type : null);
  const detail: FanMessageSentPayload = {
    fanId,
    sentAt: typeof event.createdAt === "string" ? event.createdAt : new Date().toISOString(),
    text: typeof message?.text === "string" ? message.text : "",
    kind,
    from: message?.from === "fan" ? "fan" : "creator",
    eventId: event.eventId,
    durationMs,
    message: message ?? undefined,
  };
  dispatchLocal(FAN_MESSAGE_SENT_EVENT, detail);
}

function handlePurchaseEvent(event: CreatorRealtimeEvent) {
  const payload = event.payload ?? {};
  const fanId =
    (typeof event.fanId === "string" && event.fanId.trim().length > 0 ? event.fanId : "") ||
    (typeof (payload as { fanId?: string }).fanId === "string" ? (payload as { fanId?: string }).fanId ?? "" : "");
  if (!fanId) return;
  const detail: PurchaseCreatedPayload = {
    fanId,
    amountCents: typeof (payload as { amountCents?: number }).amountCents === "number" ? (payload as { amountCents?: number }).amountCents ?? 0 : 0,
    kind: typeof (payload as { kind?: string }).kind === "string" ? (payload as { kind?: string }).kind ?? "EXTRA" : "EXTRA",
    title: typeof (payload as { title?: string }).title === "string" ? (payload as { title?: string }).title ?? undefined : undefined,
    purchaseId: typeof (payload as { purchaseId?: string }).purchaseId === "string" ? (payload as { purchaseId?: string }).purchaseId ?? undefined : undefined,
    createdAt: typeof (payload as { createdAt?: string }).createdAt === "string" ? (payload as { createdAt?: string }).createdAt ?? undefined : undefined,
    fanName: typeof (payload as { fanName?: string }).fanName === "string" ? (payload as { fanName?: string }).fanName ?? undefined : undefined,
    eventId: event.eventId,
    clientTxnId: typeof (payload as { clientTxnId?: string }).clientTxnId === "string" ? (payload as { clientTxnId?: string }).clientTxnId ?? undefined : undefined,
  };
  dispatchLocal(PURCHASE_CREATED_EVENT, detail);
}

function handleChatUpdated(event: CreatorRealtimeEvent) {
  const payload = event.payload ?? {};
  const payloadFanId =
    typeof (payload as { fanId?: unknown }).fanId === "string"
      ? ((payload as { fanId?: string }).fanId ?? "")
      : "";
  const fanId =
    (typeof event.fanId === "string" ? event.fanId : "") ||
    (payloadFanId.trim() ? payloadFanId.trim() : undefined);
  const adultConfirmedAt =
    typeof (payload as { adultConfirmedAt?: unknown }).adultConfirmedAt === "string"
      ? ((payload as { adultConfirmedAt?: string }).adultConfirmedAt ?? null)
      : null;
  const adultConfirmVersion =
    typeof (payload as { adultConfirmVersion?: unknown }).adultConfirmVersion === "string"
      ? ((payload as { adultConfirmVersion?: string }).adultConfirmVersion ?? null)
      : null;
  const isAdultConfirmed =
    typeof (payload as { isAdultConfirmed?: unknown }).isAdultConfirmed === "boolean"
      ? ((payload as { isAdultConfirmed?: boolean }).isAdultConfirmed ?? false)
      : undefined;
  dispatchLocal(CREATOR_DATA_CHANGED_EVENT, {
    reason: "chat_updated",
    fanId,
    adultConfirmedAt,
    adultConfirmVersion,
    isAdultConfirmed,
  });
}

function handleVoiceTranscriptEvent(event: CreatorRealtimeEvent) {
  const payload = event.payload ?? {};
  const fanId =
    (typeof event.fanId === "string" && event.fanId.trim().length > 0 ? event.fanId : "") ||
    (typeof (payload as { fanId?: string }).fanId === "string" ? (payload as { fanId?: string }).fanId ?? "" : "") ||
    (typeof (payload as { chatId?: string }).chatId === "string" ? (payload as { chatId?: string }).chatId ?? "" : "");
  const messageId =
    typeof (payload as { messageId?: string }).messageId === "string"
      ? (payload as { messageId?: string }).messageId ?? ""
      : "";
  if (!fanId || !messageId) return;
  const rawStatus =
    typeof (payload as { transcriptStatus?: string }).transcriptStatus === "string"
      ? (payload as { transcriptStatus?: string }).transcriptStatus ?? undefined
      : undefined;
  const normalizedStatus =
    rawStatus === "OFF" || rawStatus === "PENDING" || rawStatus === "DONE" || rawStatus === "FAILED"
      ? rawStatus
      : undefined;
  const detail: VoiceTranscriptPayload = {
    fanId,
    messageId,
    transcriptText:
      typeof (payload as { transcriptText?: string | null }).transcriptText === "string"
        ? (payload as { transcriptText?: string | null }).transcriptText ?? ""
        : null,
    transcriptStatus: normalizedStatus,
    transcriptError:
      typeof (payload as { transcriptError?: string | null }).transcriptError === "string"
        ? (payload as { transcriptError?: string | null }).transcriptError ?? null
        : null,
    transcribedAt:
      typeof (payload as { transcribedAt?: string }).transcribedAt === "string"
        ? (payload as { transcribedAt?: string }).transcribedAt ?? undefined
        : undefined,
    transcriptLang:
      typeof (payload as { transcriptLang?: string | null }).transcriptLang === "string"
        ? (payload as { transcriptLang?: string | null }).transcriptLang ?? null
        : null,
    intentJson: (payload as { intentJson?: unknown }).intentJson,
    eventId: event.eventId,
  };
  dispatchLocal(VOICE_TRANSCRIPT_UPDATED_EVENT, detail);
}

function handleTypingEvent(detail: TypingPayload) {
  emitCreatorBusEvent(TYPING_EVENT, detail);
}

function extractVoiceNoteAutoPayload(event: CreatorRealtimeEvent) {
  if (event.type !== "voice_note_created" && event.type !== "voice_note") return null;
  const payload = event.payload ?? {};
  const message = (payload as { message?: Record<string, unknown> }).message ?? null;
  const messageId =
    typeof (payload as { messageId?: string }).messageId === "string"
      ? (payload as { messageId?: string }).messageId ?? ""
      : typeof (message as { id?: string } | null)?.id === "string"
      ? (message as { id?: string }).id ?? ""
      : "";
  const fanId =
    (typeof event.fanId === "string" && event.fanId.trim().length > 0 ? event.fanId : "") ||
    (typeof (payload as { fanId?: string }).fanId === "string" ? (payload as { fanId?: string }).fanId ?? "" : "") ||
    (typeof (payload as { chatId?: string }).chatId === "string" ? (payload as { chatId?: string }).chatId ?? "" : "") ||
    (typeof (message as { fanId?: string } | null)?.fanId === "string" ? (message as { fanId?: string }).fanId ?? "" : "");
  if (!messageId || !fanId) return null;
  const from =
    (typeof (payload as { from?: string }).from === "string" ? (payload as { from?: string }).from : "") ||
    (typeof (message as { from?: string } | null)?.from === "string" ? (message as { from?: string }).from ?? "" : "");
  const durationMs =
    typeof (payload as { durationMs?: number }).durationMs === "number"
      ? (payload as { durationMs?: number }).durationMs
      : typeof (message as { audioDurationMs?: number } | null)?.audioDurationMs === "number"
      ? (message as { audioDurationMs?: number }).audioDurationMs
      : null;
  return {
    messageId,
    fanId,
    from: (from === "fan" ? "fan" : "creator") as "fan" | "creator",
    durationMs,
    eventId: event.eventId,
    createdAt: typeof event.createdAt === "string" ? event.createdAt : null,
  };
}

function dispatchCreatorRealtimeEvent(event: CreatorRealtimeEvent) {
  if (!eventDedupe.shouldProcess(event.eventId)) return;
  if (
    event.type === "MESSAGE_CREATED" ||
    event.type === "VOICE_CREATED" ||
    event.type === "voice_note" ||
    event.type === "voice_note_created" ||
    event.type === "PPV_UNLOCKED"
  ) {
    handleMessageEvent(event);
    return;
  }
  if (event.type === "PURCHASE_CREATED") {
    handlePurchaseEvent(event);
    return;
  }
  if (event.type === "voice_note_transcript" || event.type === "voice_note_transcribed") {
    handleVoiceTranscriptEvent(event);
    return;
  }
  if (event.type === "CHAT_UPDATED") {
    handleChatUpdated(event);
  }
}

function broadcastEvent(event: CreatorRealtimeEvent) {
  if (!channel) return;
  const payload: BroadcastPayload = { originId, event };
  try {
    channel.postMessage(payload);
  } catch (_err) {
    // ignore channel errors
  }
}

function handleIncomingEvent(event: CreatorRealtimeEvent, shouldBroadcast: boolean) {
  if (shouldBroadcast) {
    const autoPayload = extractVoiceNoteAutoPayload(event);
    if (autoPayload) {
      void maybeAutoTranscribeVoiceNote(autoPayload);
    }
  }
  dispatchCreatorRealtimeEvent(event);
  if (shouldBroadcast) {
    broadcastEvent(event);
  }
}

function connectEventSource() {
  if (eventSource) return;
  eventSource = new EventSource("/api/creator/realtime/stream");
  eventSource.addEventListener("creator_event", (evt) => {
    const data = (evt as MessageEvent).data;
    if (typeof data !== "string") return;
    try {
      const parsed = JSON.parse(data) as CreatorRealtimeEvent;
      if (!parsed?.eventId || !parsed?.type) return;
      handleIncomingEvent(parsed, true);
    } catch (_err) {
      // ignore parse errors
    }
  });
  eventSource.addEventListener("typing", (evt) => {
    const data = (evt as MessageEvent).data;
    if (typeof data !== "string") return;
    try {
      const parsed = JSON.parse(data) as unknown;
      const detail = normalizeTypingPayload(parsed);
      if (!detail) return;
      handleTypingEvent(detail);
    } catch (_err) {
      // ignore parse errors
    }
  });
  eventSource.onerror = () => {
    // EventSource reconnects automatically; nothing else needed.
  };
}

function disconnectEventSource() {
  if (!eventSource) return;
  eventSource.close();
  eventSource = null;
}

function refreshOwnership() {
  if (!shouldOwnLock()) {
    if (isOwner) {
      isOwner = false;
      disconnectEventSource();
    }
    return;
  }
  writeLock(originId);
  if (!isOwner) {
    isOwner = true;
    connectEventSource();
  }
}

function startLockLoop() {
  if (lockTimer) return;
  refreshOwnership();
  lockTimer = window.setInterval(refreshOwnership, OWNER_PING_MS);
  window.addEventListener("storage", (event) => {
    if (event.key !== LOCK_KEY) return;
    refreshOwnership();
  });
  window.addEventListener("beforeunload", () => {
    if (isOwner) {
      clearLock(originId);
    }
  });
}

function startBroadcastChannel() {
  if (!("BroadcastChannel" in window)) return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event) => {
    const data = event.data as BroadcastPayload | null;
    if (!data || data.originId === originId) return;
    if (!data.event?.eventId || !data.event?.type) return;
    handleIncomingEvent(data.event, false);
  });
}

export function initCreatorRealtimeStream() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  startBroadcastChannel();
  startLockLoop();
}
