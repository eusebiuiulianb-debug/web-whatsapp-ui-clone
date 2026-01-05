import {
  EXTRAS_UPDATED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  CREATOR_DATA_CHANGED_EVENT,
  PURCHASE_CHANGED_EVENT,
  PURCHASE_CREATED_EVENT,
  PURCHASE_SEEN_EVENT,
} from "../constants/events";
import { emitAppEvent } from "./crossTabEvents";

export type FanMessageSentPayload = {
  fanId: string;
  sentAt: string;
  text?: string;
  kind?: string;
  actionKey?: string | null;
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
};

export type PurchaseSeenPayload = {
  fanId: string;
  purchaseIds?: string[];
};

export type CreatorDataChangedPayload = {
  reason: string;
  fanId?: string;
};

export type ExtrasUpdatedPayload = {
  fanId?: string;
  totals?: Record<string, unknown>;
};

export function emitFanMessageSent(payload: FanMessageSentPayload) {
  emitAppEvent(FAN_MESSAGE_SENT_EVENT, payload);
}

export function emitPurchaseChanged(payload: PurchaseChangedPayload) {
  emitAppEvent(PURCHASE_CHANGED_EVENT, payload);
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
  const resolvedEventId =
    typeof payload.eventId === "string" && payload.eventId.trim().length > 0
      ? payload.eventId
      : resolvedId;
  emitAppEvent(PURCHASE_CREATED_EVENT, {
    ...payload,
    purchaseId: resolvedId,
    createdAt: resolvedCreatedAt,
    eventId: resolvedEventId,
  });
}

export function emitPurchaseSeen(payload: PurchaseSeenPayload) {
  emitAppEvent(PURCHASE_SEEN_EVENT, payload);
}

export function emitCreatorDataChanged(payload: CreatorDataChangedPayload) {
  emitAppEvent(CREATOR_DATA_CHANGED_EVENT, payload);
}

export function emitExtrasUpdated(payload: ExtrasUpdatedPayload) {
  emitAppEvent(EXTRAS_UPDATED_EVENT, payload);
}

export {
  EXTRAS_UPDATED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  CREATOR_DATA_CHANGED_EVENT,
  PURCHASE_CHANGED_EVENT,
  PURCHASE_CREATED_EVENT,
  PURCHASE_SEEN_EVENT,
};
