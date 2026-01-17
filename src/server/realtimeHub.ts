import { EventEmitter } from "events";

export type CreatorRealtimeEventType =
  | "MESSAGE_CREATED"
  | "VOICE_CREATED"
  | "voice_note"
  | "voice_note_created"
  | "voice_note_transcript"
  | "voice_note_transcribed"
  | "PURCHASE_CREATED"
  | "PPV_UNLOCKED"
  | "CHAT_UPDATED";

export type CreatorRealtimeEvent = {
  eventId: string;
  type: CreatorRealtimeEventType;
  creatorId: string;
  fanId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type CreatorTypingEvent = {
  creatorId: string;
  conversationId: string;
  fanId: string;
  isTyping: boolean;
  senderRole: "fan" | "creator";
  hasDraft?: boolean;
  draftText?: string;
  ts: number;
};

type RealtimeHubGlobal = typeof globalThis & {
  __novsyCreatorRealtimeHub?: EventEmitter;
};

const globalForHub = globalThis as RealtimeHubGlobal;

const hub =
  globalForHub.__novsyCreatorRealtimeHub ?? new EventEmitter();

if (!globalForHub.__novsyCreatorRealtimeHub) {
  hub.setMaxListeners(200);
  globalForHub.__novsyCreatorRealtimeHub = hub;
}

export function emitCreatorEvent(event: CreatorRealtimeEvent) {
  hub.emit("creator_event", event);
}

export function onCreatorEvent(listener: (event: CreatorRealtimeEvent) => void) {
  hub.on("creator_event", listener);
  return () => hub.off("creator_event", listener);
}

export function emitCreatorTypingEvent(event: CreatorTypingEvent) {
  hub.emit("typing", event);
}

export function onCreatorTypingEvent(listener: (event: CreatorTypingEvent) => void) {
  hub.on("typing", listener);
  return () => hub.off("typing", listener);
}
