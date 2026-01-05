import { useEffect, useRef } from "react";
import {
  CREATOR_DATA_CHANGED_EVENT,
  EXTRAS_UPDATED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  PURCHASE_CREATED_EVENT,
  PURCHASE_SEEN_EVENT,
} from "../constants/events";
import type {
  CreatorDataChangedPayload,
  ExtrasUpdatedPayload,
  FanMessageSentPayload,
  PurchaseCreatedPayload,
  PurchaseSeenPayload,
} from "../lib/events";
import { initCreatorRealtimeBus } from "../lib/creatorRealtimeBus";
import { createPurchaseEventDedupe } from "../lib/purchaseEventDedupe";

type CreatorRealtimeHandlers = {
  onFanMessageSent?: (payload: FanMessageSentPayload) => void;
  onPurchaseCreated?: (payload: PurchaseCreatedPayload) => void;
  onPurchaseSeen?: (payload: PurchaseSeenPayload) => void;
  onCreatorDataChanged?: (payload: CreatorDataChangedPayload) => void;
  onExtrasUpdated?: (payload: ExtrasUpdatedPayload) => void;
};

export function useCreatorRealtime(handlers: CreatorRealtimeHandlers, options?: { enabled?: boolean }) {
  const handlersRef = useRef(handlers);
  const purchaseDedupeRef = useRef(createPurchaseEventDedupe());

  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof window === "undefined" || options?.enabled === false) return;
    initCreatorRealtimeBus();

    const handleFanMessageSent = (event: Event) => {
      const detail = (event as CustomEvent).detail as FanMessageSentPayload | undefined;
      if (!detail) return;
      handlersRef.current.onFanMessageSent?.(detail);
    };

    const handlePurchaseCreated = (event: Event) => {
      const detail = (event as CustomEvent).detail as PurchaseCreatedPayload | undefined;
      if (!detail) return;
      if (!purchaseDedupeRef.current.shouldProcess(detail)) return;
      handlersRef.current.onPurchaseCreated?.(detail);
    };

    const handlePurchaseSeen = (event: Event) => {
      const detail = (event as CustomEvent).detail as PurchaseSeenPayload | undefined;
      if (!detail) return;
      handlersRef.current.onPurchaseSeen?.(detail);
    };

    const handleCreatorDataChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail as CreatorDataChangedPayload | undefined;
      if (!detail) return;
      handlersRef.current.onCreatorDataChanged?.(detail);
    };

    const handleExtrasUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as ExtrasUpdatedPayload | undefined;
      if (!detail) return;
      handlersRef.current.onExtrasUpdated?.(detail);
    };

    window.addEventListener(FAN_MESSAGE_SENT_EVENT, handleFanMessageSent as EventListener);
    window.addEventListener(PURCHASE_CREATED_EVENT, handlePurchaseCreated as EventListener);
    window.addEventListener(PURCHASE_SEEN_EVENT, handlePurchaseSeen as EventListener);
    window.addEventListener(CREATOR_DATA_CHANGED_EVENT, handleCreatorDataChanged as EventListener);
    window.addEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated as EventListener);

    return () => {
      window.removeEventListener(FAN_MESSAGE_SENT_EVENT, handleFanMessageSent as EventListener);
      window.removeEventListener(PURCHASE_CREATED_EVENT, handlePurchaseCreated as EventListener);
      window.removeEventListener(PURCHASE_SEEN_EVENT, handlePurchaseSeen as EventListener);
      window.removeEventListener(CREATOR_DATA_CHANGED_EVENT, handleCreatorDataChanged as EventListener);
      window.removeEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated as EventListener);
    };
  }, [options?.enabled]);
}
