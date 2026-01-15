import { useEffect, useRef } from "react";
import {
  CREATOR_DATA_CHANGED_EVENT,
  EXTRAS_UPDATED_EVENT,
  FAN_MESSAGE_SENT_EVENT,
  PURCHASE_CREATED_EVENT,
  PURCHASE_SEEN_EVENT,
  TYPING_EVENT,
  VOICE_TRANSCRIPT_UPDATED_EVENT,
} from "../constants/events";
import type {
  CreatorDataChangedPayload,
  ExtrasUpdatedPayload,
  FanMessageSentPayload,
  PurchaseCreatedPayload,
  PurchaseSeenPayload,
  TypingPayload,
  VoiceTranscriptPayload,
} from "../lib/events";
import { initCreatorRealtimeBus } from "../lib/creatorRealtimeBus";
import { initCreatorRealtimeStream } from "../lib/creatorRealtimeStream";
import { createPurchaseEventDedupe } from "../lib/purchaseEventDedupe";
import { createEventIdDedupe } from "../lib/realtimeEventDedupe";

type CreatorRealtimeHandlers = {
  onFanMessageSent?: (payload: FanMessageSentPayload) => void;
  onPurchaseCreated?: (payload: PurchaseCreatedPayload) => void;
  onPurchaseSeen?: (payload: PurchaseSeenPayload) => void;
  onCreatorDataChanged?: (payload: CreatorDataChangedPayload) => void;
  onExtrasUpdated?: (payload: ExtrasUpdatedPayload) => void;
  onVoiceTranscriptUpdated?: (payload: VoiceTranscriptPayload) => void;
  onTyping?: (payload: TypingPayload) => void;
};

export function useCreatorRealtime(handlers: CreatorRealtimeHandlers, options?: { enabled?: boolean }) {
  const handlersRef = useRef(handlers);
  const purchaseDedupeRef = useRef(createPurchaseEventDedupe());
  const eventDedupeRef = useRef(createEventIdDedupe());

  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof window === "undefined" || options?.enabled === false) return;
    initCreatorRealtimeBus();
    initCreatorRealtimeStream();

    const handleFanMessageSent = (event: Event) => {
      const detail = (event as CustomEvent).detail as FanMessageSentPayload | undefined;
      if (!detail) return;
      if (detail.eventId && !eventDedupeRef.current.shouldProcess(detail.eventId)) return;
      handlersRef.current.onFanMessageSent?.(detail);
    };

    const handlePurchaseCreated = (event: Event) => {
      const detail = (event as CustomEvent).detail as PurchaseCreatedPayload | undefined;
      if (!detail) return;
      const eventId =
        typeof detail.eventId === "string" && detail.eventId.trim().length > 0
          ? detail.eventId
          : detail.purchaseId ?? null;
      if (eventId && !eventDedupeRef.current.shouldProcess(eventId)) return;
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

    const handleVoiceTranscriptUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as VoiceTranscriptPayload | undefined;
      if (!detail) return;
      if (detail.eventId && !eventDedupeRef.current.shouldProcess(detail.eventId)) return;
      handlersRef.current.onVoiceTranscriptUpdated?.(detail);
    };

    const handleTyping = (event: Event) => {
      const detail = (event as CustomEvent).detail as TypingPayload | undefined;
      if (!detail) return;
      handlersRef.current.onTyping?.(detail);
    };

    window.addEventListener(FAN_MESSAGE_SENT_EVENT, handleFanMessageSent as EventListener);
    window.addEventListener(PURCHASE_CREATED_EVENT, handlePurchaseCreated as EventListener);
    window.addEventListener(PURCHASE_SEEN_EVENT, handlePurchaseSeen as EventListener);
    window.addEventListener(CREATOR_DATA_CHANGED_EVENT, handleCreatorDataChanged as EventListener);
    window.addEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated as EventListener);
    window.addEventListener(VOICE_TRANSCRIPT_UPDATED_EVENT, handleVoiceTranscriptUpdated as EventListener);
    window.addEventListener(TYPING_EVENT, handleTyping as EventListener);

    return () => {
      window.removeEventListener(FAN_MESSAGE_SENT_EVENT, handleFanMessageSent as EventListener);
      window.removeEventListener(PURCHASE_CREATED_EVENT, handlePurchaseCreated as EventListener);
      window.removeEventListener(PURCHASE_SEEN_EVENT, handlePurchaseSeen as EventListener);
      window.removeEventListener(CREATOR_DATA_CHANGED_EVENT, handleCreatorDataChanged as EventListener);
      window.removeEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated as EventListener);
      window.removeEventListener(VOICE_TRANSCRIPT_UPDATED_EVENT, handleVoiceTranscriptUpdated as EventListener);
      window.removeEventListener(TYPING_EVENT, handleTyping as EventListener);
    };
  }, [options?.enabled]);
}
