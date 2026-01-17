import {
  EXTRAS_UPDATED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  CREATOR_DATA_CHANGED_EVENT,
  PURCHASE_CHANGED_EVENT,
  PURCHASE_CREATED_EVENT,
  PURCHASE_SEEN_EVENT,
  VOICE_TRANSCRIPT_UPDATED_EVENT,
  VOICE_TRANSCRIPTION_BUDGET_EVENT,
  TYPING_EVENT,
} from "../constants/events";
import { emitCreatorEvent } from "./creatorRealtimeBus";
import { resolvePurchaseEventId } from "./purchaseEventDedupe";

export type FanMessageSentPayload = {
  fanId: string;
  sentAt: string;
  text?: string;
  kind?: string;
  actionKey?: string | null;
  from?: "fan" | "creator";
  eventId?: string;
  durationMs?: number;
  message?: unknown;
};

export type PurchaseChangedPayload = {
  fanId?: string;
  purchaseId?: string;
  kind?: string;
  amount?: number;
  createdAt?: string;
};

export type PurchaseCreatedPayload = {
  fanId: string;
  fanName?: string;
  amountCents: number;
  kind: string;
  title?: string;
  purchaseId?: string;
  createdAt?: string;
  eventId?: string;
  clientTxnId?: string;
};

export type PurchaseSeenPayload = {
  fanId: string;
  purchaseIds?: string[];
};

export type CreatorDataChangedPayload = {
  reason: string;
  fanId?: string;
  adultConfirmedAt?: string | null;
  adultConfirmVersion?: string | null;
  isAdultConfirmed?: boolean;
};

export type ExtrasUpdatedPayload = {
  fanId?: string;
  totals?: Record<string, unknown>;
};

export type VoiceTranscriptPayload = {
  fanId: string;
  messageId: string;
  transcriptText?: string | null;
  transcriptStatus?: "OFF" | "PENDING" | "DONE" | "FAILED";
  transcriptError?: string | null;
  transcribedAt?: string;
  transcriptLang?: string | null;
  intentJson?: unknown;
  eventId?: string;
};

export type TypingPayload = {
  conversationId: string;
  fanId: string;
  isTyping: boolean;
  senderRole: "fan" | "creator";
  hasDraft?: boolean;
  draftText?: string;
  ts: number;
};

export function emitFanMessageSent(payload: FanMessageSentPayload) {
  emitCreatorEvent(FAN_MESSAGE_SENT_EVENT, payload);
}

export function emitPurchaseChanged(payload: PurchaseChangedPayload) {
  emitCreatorEvent(PURCHASE_CHANGED_EVENT, payload);
}

export function emitPurchaseCreated(payload: PurchaseCreatedPayload) {
  const resolvedId =
    typeof payload.purchaseId === "string" && payload.purchaseId.trim().length > 0
      ? payload.purchaseId
      : `purchase-${payload.fanId}-${payload.createdAt ?? Date.now()}`;
  const resolvedCreatedAt =
    typeof payload.createdAt === "string" && payload.createdAt.trim().length > 0
      ? payload.createdAt
      : new Date().toISOString();
  const eventId = resolvePurchaseEventId({
    ...payload,
    purchaseId: resolvedId,
    createdAt: resolvedCreatedAt,
  });
  emitCreatorEvent(PURCHASE_CREATED_EVENT, {
    ...payload,
    purchaseId: resolvedId,
    createdAt: resolvedCreatedAt,
    eventId,
  });
}

export function emitPurchaseSeen(payload: PurchaseSeenPayload) {
  emitCreatorEvent(PURCHASE_SEEN_EVENT, payload);
}

export function emitCreatorDataChanged(payload: CreatorDataChangedPayload) {
  emitCreatorEvent(CREATOR_DATA_CHANGED_EVENT, payload);
}

export function emitExtrasUpdated(payload: ExtrasUpdatedPayload) {
  emitCreatorEvent(EXTRAS_UPDATED_EVENT, payload);
}

export {
  EXTRAS_UPDATED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  CREATOR_DATA_CHANGED_EVENT,
  PURCHASE_CHANGED_EVENT,
  PURCHASE_CREATED_EVENT,
  PURCHASE_SEEN_EVENT,
  VOICE_TRANSCRIPT_UPDATED_EVENT,
  VOICE_TRANSCRIPTION_BUDGET_EVENT,
  TYPING_EVENT,
};
