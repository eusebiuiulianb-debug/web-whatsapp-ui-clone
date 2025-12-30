import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConversationContext } from "../context/ConversationContext";
import {
  appendExtraSupportMessage,
  clearUnreadExtra,
  markUnreadExtra,
  subscribeAllExtrasEvents,
  type ExtraEventWithMeta,
} from "../lib/localExtras";

type ToastItem = {
  id: string;
  message: string;
};

const MAX_TOASTS = 3;
const TOAST_TTL_MS = 3200;
const EXTRAS_SOUND_KEY = "novsy:extras-sound";
const GIFT_ICON = "\u{1F381}";
const CURRENCY_SYMBOL = "\u20AC";

function formatExtraAmount(amount: number) {
  const rounded = Math.round((amount ?? 0) * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)} ${CURRENCY_SYMBOL}`;
}

function isExtrasSoundEnabled() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(EXTRAS_SOUND_KEY);
  if (stored === "0" || stored === "false" || stored === "off") return false;
  if (stored === "1" || stored === "true" || stored === "on") return true;
  return process.env.NODE_ENV !== "production";
}

function playExtrasSound() {
  if (typeof window === "undefined") return;
  if (!isExtrasSoundEnabled()) return;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 520;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => {
      ctx.close();
    };
  } catch (_err) {
    // ignore audio errors (autoplay restrictions)
  }
}

export default function CreatorExtrasNotifier() {
  const { conversation, queueFans } = useContext(ConversationContext);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());
  const activeFanIdRef = useRef<string | null>(null);
  const fanLabelsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    activeFanIdRef.current = conversation?.isManager ? null : conversation?.id ?? null;
  }, [conversation?.id, conversation?.isManager]);

  useEffect(() => {
    const map = new Map<string, string>();
    if (conversation?.id && conversation?.contactName) {
      map.set(conversation.id, conversation.contactName);
    }
    queueFans.forEach((fan) => {
      if (fan.id && fan.contactName) {
        map.set(fan.id, fan.contactName);
      }
    });
    fanLabelsRef.current = map;
  }, [conversation?.contactName, conversation?.id, queueFans]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const enqueueToast = useCallback(
    (message: string) => {
      const id = `extra-toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message }]);
      if (typeof window !== "undefined") {
        const timeout = window.setTimeout(() => dismissToast(id), TOAST_TTL_MS);
        timeoutsRef.current.set(id, timeout);
      }
    },
    [dismissToast]
  );

  const buildToastMessage = useCallback((event: ExtraEventWithMeta) => {
    const amount = formatExtraAmount(event.amount);
    const fanLabel = fanLabelsRef.current.get(event.fanId) ?? "Un fan";
    return `${GIFT_ICON} Apoyo recibido: ${amount} (${fanLabel})`;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAllExtrasEvents((event) => {
      if (event.kind === "EXTRA") return;
      const activeFanId = activeFanIdRef.current;
      const fanLabel = fanLabelsRef.current.get(event.fanId) ?? "Un fan";
      appendExtraSupportMessage({
        fanId: event.fanId,
        amount: event.amount,
        currency: "EUR",
        fanName: fanLabel,
        createdAt: event.createdAt,
        ts: event.ts,
        eventId: event.id,
        sourceEventId: event.id,
      });
      enqueueToast(buildToastMessage(event));
      playExtrasSound();
      if (activeFanId && event.fanId === activeFanId) {
        clearUnreadExtra(event.fanId);
        return;
      }
      markUnreadExtra(event.fanId);
    });
    return () => {
      unsubscribe();
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, [buildToastMessage, enqueueToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.slice(-MAX_TOASTS).map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-xl border border-emerald-400/50 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-lg"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
