import {
  EXTRAS_UPDATED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  CREATOR_DATA_CHANGED_EVENT,
  PURCHASE_CHANGED_EVENT,
  PURCHASE_CREATED_EVENT,
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
  amountCents: number;
  kind: string;
  title?: string;
  purchaseId?: string;
  createdAt?: string;
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
  emitAppEvent(PURCHASE_CREATED_EVENT, payload);
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
};
