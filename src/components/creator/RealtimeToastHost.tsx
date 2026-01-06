import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConversationContext } from "../../context/ConversationContext";
import { useCreatorRealtime } from "../../hooks/useCreatorRealtime";
import { VOICE_TRANSCRIPTION_BUDGET_EVENT } from "../../constants/events";
import type { FanMessageSentPayload, PurchaseCreatedPayload, VoiceTranscriptPayload } from "../../lib/events";
import { getFanIdFromQuery, openFanChat } from "../../lib/navigation/openCreatorChat";
import { resolvePurchaseEventId } from "../../lib/purchaseEventDedupe";
import { formatPurchaseUI } from "../../lib/purchaseUi";
import { recordUnseenPurchase, setPendingPurchaseNotice } from "../../lib/unseenPurchases";
import { clearUnseenVoiceNote, recordUnseenVoiceNote } from "../../lib/unseenVoiceNotes";
import { setPendingManagerTranscript } from "../../lib/pendingManagerTranscript";
import { getFanDisplayNameForCreator } from "../../utils/fanDisplayName";

type RealtimeToast = {
  id: string;
  fanId?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  createdAt: string;
  variant: "purchase" | "voice" | "transcript" | "notice";
  amountCents?: number;
  kind?: string;
  fanName?: string;
  purchaseId?: string;
  eventId?: string;
  durationMs?: number;
  from?: "fan" | "creator";
  transcriptText?: string | null;
  messageId?: string;
};

const MAX_TOASTS = 3;
const SEEN_TTL_MS = 60 * 1000;
const DESKTOP_TOAST_MS = 11000;

function normalizeKindLabel(raw?: string): string | null {
  const value = (raw || "").toUpperCase();
  if (!value) return null;
  if (value.includes("TIP") || value.includes("SUPPORT")) return "Apoyo";
  if (value.includes("GIFT")) return "Regalo";
  if (value.includes("EXTRA")) return "Extra";
  if (value.includes("SUB") || value.includes("PACK")) return "Pack";
  return "Cobro";
}

function formatRelativeTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "hace un momento";
  }
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

function formatVoiceDuration(durationMs?: number) {
  if (!Number.isFinite(durationMs) || (durationMs ?? 0) <= 0) return "";
  const totalSeconds = Math.max(0, Math.round((durationMs ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function RealtimeToastHost() {
  const router = useRouter();
  const { conversation, queueFans } = useContext(ConversationContext);
  const [toasts, setToasts] = useState<RealtimeToast[]>([]);
  const [toastIndex, setToastIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const toastTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seenToastRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      Object.keys(timers).forEach((key) => {
        clearTimeout(timers[key]);
      });
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const timers = toastTimersRef.current;
    Object.keys(timers).forEach((key) => {
      clearTimeout(timers[key]);
      delete timers[key];
    });
  }, [isMobile]);

  useEffect(() => {
    if (toasts.length === 0) {
      setToastIndex(0);
      return;
    }
    if (toastIndex >= toasts.length) {
      setToastIndex(0);
    }
  }, [toastIndex, toasts.length]);

  const activeChatFanId = useMemo(() => {
    const isFanRoute = router.pathname === "/fan/[fanId]";
    if (isFanRoute) {
      return typeof router.query.fanId === "string" ? router.query.fanId : null;
    }
    const isBoardRoute = router.pathname === "/" || router.pathname === "/creator";
    if (!isBoardRoute) return null;
    const queryFanId = getFanIdFromQuery(router.query);
    if (queryFanId) return queryFanId;
    if (conversation?.id && !conversation.isManager) return conversation.id;
    return null;
  }, [conversation?.id, conversation?.isManager, router.pathname, router.query]);

  const isBoardVisible = useCallback(() => {
    if (typeof document === "undefined") return false;
    const board = document.querySelector('[data-creator-board="true"]') as HTMLElement | null;
    if (!board) return false;
    return board.offsetParent !== null;
  }, []);

  const resolveFanName = useCallback(
    (fanId: string, fallback?: string) => {
      const trimmed = typeof fallback === "string" ? fallback.trim() : "";
      if (trimmed) return trimmed;
      if (conversation?.id === fanId) {
        const name = (conversation.contactName || "").trim();
        if (name) return name;
      }
      const match = queueFans.find((fan) => fan.id === fanId);
      if (match) return getFanDisplayNameForCreator(match);
      return "Fan";
    },
    [conversation?.contactName, conversation?.id, queueFans]
  );

  const pruneSeen = useCallback(() => {
    const now = Date.now();
    const toDelete: string[] = [];
    seenToastRef.current.forEach((ts, id) => {
      if (now - ts > SEEN_TTL_MS) {
        toDelete.push(id);
      }
    });
    for (let i = 0; i < toDelete.length; i += 1) {
      seenToastRef.current.delete(toDelete[i]);
    }
  }, []);

  const hasSeen = useCallback(
    (id: string) => {
      pruneSeen();
      return seenToastRef.current.has(id);
    },
    [pruneSeen]
  );

  const markSeen = useCallback(
    (id: string) => {
      seenToastRef.current.set(id, Date.now());
      pruneSeen();
    },
    [pruneSeen]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = toastTimersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete toastTimersRef.current[id];
    }
  }, []);

  const enqueueToast = useCallback(
    (toast: RealtimeToast) => {
      setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));
      const timer = toastTimersRef.current[toast.id];
      if (timer) clearTimeout(timer);
      if (!isMobile) {
        toastTimersRef.current[toast.id] = setTimeout(() => dismissToast(toast.id), DESKTOP_TOAST_MS);
      }
      setToastIndex(0);
    },
    [dismissToast, isMobile]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleBudgetPaused = (event: Event) => {
      const detail = (event as CustomEvent).detail as { message?: string } | undefined;
      const message =
        typeof detail?.message === "string" && detail.message.trim().length > 0
          ? detail.message.trim()
          : "Auto pausado por presupuesto";
      const toastId = "voice-budget-paused";
      if (hasSeen(toastId)) return;
      markSeen(toastId);
      enqueueToast({
        id: toastId,
        fanId: "",
        title: message,
        createdAt: new Date().toISOString(),
        icon: "\u26A0\uFE0F",
        variant: "notice",
      });
    };
    window.addEventListener(VOICE_TRANSCRIPTION_BUDGET_EVENT, handleBudgetPaused as EventListener);
    return () => {
      window.removeEventListener(VOICE_TRANSCRIPTION_BUDGET_EVENT, handleBudgetPaused as EventListener);
    };
  }, [enqueueToast, hasSeen, markSeen]);

  const openToastChat = useCallback(
    (toast: RealtimeToast) => {
      if (!toast?.fanId) return;
      if (toast.variant === "purchase") {
        setPendingPurchaseNotice({
          fanId: toast.fanId,
          fanName: toast.fanName,
          amountCents: toast.amountCents,
          kind: toast.kind,
          purchaseId: toast.purchaseId,
          eventId: toast.eventId,
          createdAt: toast.createdAt,
        });
      } else {
        clearUnseenVoiceNote(toast.fanId);
      }
      if (router.pathname === "/fan/[fanId]") {
        void router.push(`/fan/${toast.fanId}`);
        return;
      }
      const targetPath = router.pathname === "/" ? "/" : "/creator";
      openFanChat(router, toast.fanId, { shallow: true, scroll: false, pathname: targetPath });
    },
    [router]
  );

  const handleCopyTranscript = useCallback(async (toast: RealtimeToast) => {
    if (!toast?.transcriptText) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(toast.transcriptText);
    } catch (_err) {
      // ignore clipboard failures
    }
  }, []);

  const handleUseTranscript = useCallback(
    (toast: RealtimeToast) => {
      if (!toast?.fanId || !toast.transcriptText) return;
      setPendingManagerTranscript({
        fanId: toast.fanId,
        transcript: toast.transcriptText,
        createdAt: toast.createdAt,
        messageId: toast.messageId,
      });
      openToastChat(toast);
      dismissToast(toast.id);
    },
    [dismissToast, openToastChat]
  );

  const handlePurchaseCreated = useCallback(
    (detail: PurchaseCreatedPayload) => {
      const fanId = typeof detail?.fanId === "string" ? detail.fanId.trim() : "";
      if (!fanId) return;
      if (activeChatFanId && fanId === activeChatFanId) return;
      if (isBoardVisible()) return;
      const toastId =
        resolvePurchaseEventId(detail) ?? (detail?.purchaseId ? String(detail.purchaseId) : `${fanId}-${Date.now()}`);
      if (!toastId || hasSeen(toastId)) return;
      markSeen(toastId);
      const fanName = resolveFanName(fanId, detail?.fanName);
      const ui = formatPurchaseUI({
        kind: detail?.kind,
        amountCents: detail?.amountCents,
        fanName,
        viewer: "creator",
      });
      const title = fanName ? `Has recibido ${ui.amountLabel} de ${fanName}` : `Has recibido ${ui.amountLabel}`;
      const createdAt = typeof detail?.createdAt === "string" ? detail.createdAt : new Date().toISOString();
      const kindLabel = normalizeKindLabel(detail?.kind);
      const relative = formatRelativeTime(createdAt);
      const subtitle = kindLabel ? `${kindLabel} - ${relative}` : relative;
      recordUnseenPurchase({
        fanId,
        fanName: fanName || undefined,
        amountCents: typeof detail?.amountCents === "number" ? detail.amountCents : 0,
        kind: detail?.kind,
        title: detail?.title,
        purchaseId: typeof detail?.purchaseId === "string" ? detail.purchaseId : undefined,
        eventId: typeof detail?.eventId === "string" ? detail.eventId : undefined,
        createdAt,
      });
      enqueueToast({
        id: toastId,
        fanId,
        title,
        subtitle,
        icon: ui.icon,
        createdAt,
        variant: "purchase",
        amountCents: typeof detail?.amountCents === "number" ? detail.amountCents : undefined,
        kind: detail?.kind,
        fanName,
        purchaseId: typeof detail?.purchaseId === "string" ? detail.purchaseId : undefined,
        eventId: typeof detail?.eventId === "string" ? detail.eventId : undefined,
      });
    },
    [activeChatFanId, enqueueToast, hasSeen, isBoardVisible, markSeen, resolveFanName]
  );

  const handleVoiceNote = useCallback(
    (detail: FanMessageSentPayload) => {
      if (!detail || detail.kind !== "audio") return;
      if (detail.from !== "fan") return;
      const fanId = typeof detail?.fanId === "string" ? detail.fanId.trim() : "";
      if (!fanId) return;
      if (activeChatFanId && fanId === activeChatFanId) return;
      const toastId =
        typeof detail.eventId === "string" && detail.eventId.trim().length > 0
          ? detail.eventId
          : `${fanId}-${detail.sentAt ?? Date.now()}`;
      if (!toastId || hasSeen(toastId)) return;
      markSeen(toastId);
      const fanName = resolveFanName(fanId);
      const durationMs =
        typeof detail.durationMs === "number"
          ? detail.durationMs
          : typeof (detail.message as { audioDurationMs?: number } | undefined)?.audioDurationMs === "number"
          ? (detail.message as { audioDurationMs?: number }).audioDurationMs
          : undefined;
      const durationLabel = formatVoiceDuration(durationMs);
      const createdAt = typeof detail.sentAt === "string" ? detail.sentAt : new Date().toISOString();
      recordUnseenVoiceNote({
        fanId,
        fanName,
        durationMs: typeof durationMs === "number" ? durationMs : 0,
        from: detail.from,
        eventId: toastId,
        createdAt,
      });
      const baseLabel = `Nota de voz de ${fanName}`;
      const title = durationLabel ? `${baseLabel} (${durationLabel})` : baseLabel;
      enqueueToast({
        id: toastId,
        fanId,
        title,
        subtitle: formatRelativeTime(createdAt),
        icon: "\uD83C\uDF99",
        createdAt,
        variant: "voice",
        fanName,
        durationMs,
        from: detail.from,
        eventId: toastId,
      });
    },
    [activeChatFanId, enqueueToast, hasSeen, markSeen, resolveFanName]
  );

  const handleVoiceTranscriptUpdated = useCallback(
    (detail: VoiceTranscriptPayload) => {
      const fanId = typeof detail?.fanId === "string" ? detail.fanId.trim() : "";
      if (!fanId) return;
      if (detail?.transcriptStatus !== "DONE") return;
      if (activeChatFanId && fanId === activeChatFanId) return;
      const transcriptText =
        typeof detail?.transcriptText === "string" ? detail.transcriptText.trim() : "";
      const toastId =
        typeof detail?.eventId === "string" && detail.eventId.trim().length > 0
          ? detail.eventId
          : `voice-transcript-${detail?.messageId ?? fanId}`;
      if (!toastId || hasSeen(toastId)) return;
      markSeen(toastId);
      const fanName = resolveFanName(fanId);
      const createdAt =
        typeof detail?.transcribedAt === "string" ? detail.transcribedAt : new Date().toISOString();
      const title = fanName ? `Transcripción lista de ${fanName}` : "Transcripción lista";
      enqueueToast({
        id: toastId,
        fanId,
        title,
        subtitle: formatRelativeTime(createdAt),
        icon: "\uD83D\uDCDD",
        createdAt,
        variant: "transcript",
        fanName,
        eventId: toastId,
        transcriptText: transcriptText || null,
        messageId: typeof detail?.messageId === "string" ? detail.messageId : undefined,
      });
    },
    [activeChatFanId, enqueueToast, hasSeen, markSeen, resolveFanName]
  );

  useCreatorRealtime({
    onPurchaseCreated: handlePurchaseCreated,
    onFanMessageSent: handleVoiceNote,
    onVoiceTranscriptUpdated: handleVoiceTranscriptUpdated,
  });

  const activeToast = toasts[toastIndex] ?? toasts[0];
  if (!activeToast) return null;

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-3 z-[90] flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2">
        <div
          onClick={() => {
            openToastChat(activeToast);
            dismissToast(activeToast.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openToastChat(activeToast);
              dismissToast(activeToast.id);
            }
          }}
          role="button"
          tabIndex={0}
          className={clsx(
            "flex w-full items-start gap-3 rounded-2xl border border-[color:var(--surface-border)]",
            "bg-[color:var(--surface-1)] px-4 py-3 text-left shadow-lg transition",
            "hover:border-[color:var(--surface-border-hover)]"
          )}
        >
          <span className="text-lg leading-none">{activeToast.icon || "$"}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-semibold text-[color:var(--text)]">{activeToast.title}</span>
            {activeToast.subtitle && <span className="text-xs text-[color:var(--muted)]">{activeToast.subtitle}</span>}
            {activeToast.variant === "transcript" && activeToast.transcriptText && (
              <span className="mt-1 flex flex-wrap gap-2 text-[11px]">
                <button
                  type="button"
                  className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCopyTranscript(activeToast);
                  }}
                >
                  Copiar
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleUseTranscript(activeToast);
                  }}
                >
                  Usar en Manager
                </button>
              </span>
            )}
          </span>
          <span className="flex flex-col items-end gap-1">
            <button
              type="button"
              className="rounded-full p-1 text-[color:var(--muted)] hover:text-[color:var(--text)]"
              onClick={(event) => {
                event.stopPropagation();
                dismissToast(activeToast.id);
              }}
              aria-label="Cerrar"
            >
              x
            </button>
            {toasts.length > 1 && (
              <button
                type="button"
                className="text-[11px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                onClick={(event) => {
                  event.stopPropagation();
                  setToastIndex((prev) => (toasts.length > 0 ? (prev + 1) % toasts.length : 0));
                }}
              >
                Ver siguiente
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
