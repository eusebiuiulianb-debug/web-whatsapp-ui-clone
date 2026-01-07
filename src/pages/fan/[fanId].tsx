import Head from "next/head";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChatComposerBar } from "../../components/ChatComposerBar";
import MessageBalloon from "../../components/MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import {
  ContentType,
  ContentVisibility,
  getContentTypeLabel,
  getContentVisibilityLabel,
} from "../../types/content";
import { getAccessSummary, type AccessSummary } from "../../lib/access";
import type { IncludedContent } from "../../lib/fanContent";
import { useIsomorphicLayoutEffect } from "../../hooks/useIsomorphicLayoutEffect";
import { getFanDisplayName } from "../../utils/fanDisplayName";
import { isVisibleToFan } from "../../lib/messageAudience";
import { inferPreferredLanguage, LANGUAGE_LABELS, normalizePreferredLanguage, type SupportedLanguage } from "../../lib/language";
import { parseReactionsRaw, useReactions } from "../../lib/emoji/reactions";
import { getStickerById } from "../../lib/emoji/stickers";
import { buildFanChatProps } from "../../lib/fanChatProps";
import { generateClientTxnId } from "../../lib/clientTxn";
import { getPreferredAudioStream } from "../../lib/getPreferredAudioStream";
import { emitPurchaseCreated } from "../../lib/events";
import { recordDevRequest } from "../../lib/devRequestStats";
import { buildStickerTokenFromItem, getStickerByToken, type StickerItem } from "../../lib/stickers";
import { IconGlyph, type IconName } from "../../components/ui/IconGlyph";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import clsx from "clsx";

type ApiContentItem = {
  id: string;
  title: string;
  type: ContentType;
  visibility: ContentVisibility;
  externalUrl?: string | null;
  mediaPath?: string | null;
  description?: string | null;
  isPreview?: boolean | null;
};

type ApiMessage = {
  id: string;
  fanId: string;
  from: "creator" | "fan";
  audience?: "FAN" | "CREATOR" | "INTERNAL" | null;
  text: string | null;
  deliveredText?: string | null;
  creatorTranslatedText?: string | null;
  time?: string | null;
  isLastFromCreator?: boolean | null;
  type?: "TEXT" | "CONTENT" | "STICKER" | "SYSTEM" | "AUDIO";
  stickerId?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  audioMime?: string | null;
  audioSizeBytes?: number | null;
  transcriptText?: string | null;
  transcriptStatus?: "OFF" | "PENDING" | "DONE" | "FAILED" | null;
  transcriptError?: string | null;
  transcribedAt?: string | null;
  transcriptLang?: string | null;
  intentJson?: {
    intent?: string;
    tags?: string[];
    needsReply?: boolean;
    replyDraft?: string;
  } | null;
  contentItem?: ApiContentItem | null;
  status?: "sending" | "failed" | "sent";
};

export type FanChatPageProps = {
  includedContent: IncludedContent[];
  initialAccessSummary: AccessSummary;
  fanIdOverride?: string;
  inviteOverride?: boolean;
  forceAccessRefresh?: boolean;
};

type PackSummary = {
  id: string;
  name: string;
  price: string;
  description: string;
};

type VoiceUploadPayload = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  clientTxnId: string;
};

const VOICE_MAX_DURATION_MS = 120_000;
const VOICE_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const VOICE_MIN_SIZE_BYTES = 2 * 1024;
const VOICE_MIME_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
];

export function FanChatPage({
  includedContent,
  initialAccessSummary,
  fanIdOverride,
  inviteOverride,
  forceAccessRefresh,
}: FanChatPageProps) {
  const router = useRouter();
  const fanId = useMemo(() => {
    if (fanIdOverride) return fanIdOverride;
    return typeof router.query.fanId === "string" ? router.query.fanId : undefined;
  }, [fanIdOverride, router.query.fanId]);
  const routeFanId = typeof router.query.fanId === "string" ? router.query.fanId : undefined;
  const inviteFlag = useMemo(() => {
    if (typeof inviteOverride === "boolean") return inviteOverride;
    return router.query.invite === "1";
  }, [inviteOverride, router.query.invite]);
  const { config } = useCreatorConfig();
  const creatorName = config.creatorName || "Tu creador";
  const creatorInitial = creatorName.trim().charAt(0).toUpperCase() || "C";
  const availablePacks = useMemo<PackSummary[]>(
    () =>
      Array.isArray(config.packs)
        ? config.packs.map((pack) => ({
            id: pack.id,
            name: pack.name,
            price: pack.price,
            description: pack.description,
          }))
        : [],
    [config.packs]
  );
  const reactionsRaw = useReactions(fanId || "");
  const reactionsStore = useMemo(() => parseReactionsRaw(reactionsRaw), [reactionsRaw]);

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [accessSummary, setAccessSummary] = useState<AccessSummary | null>(initialAccessSummary || null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [included, setIncluded] = useState<IncludedContent[]>(includedContent || []);
  const [fanProfile, setFanProfile] = useState<{
    name?: string | null;
    displayName?: string | null;
    creatorLabel?: string | null;
    preferredLanguage?: SupportedLanguage | null;
  }>({});
  const [fanProfileLoaded, setFanProfileLoaded] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const [onboardingError, setOnboardingError] = useState("");
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingLanguage, setOnboardingLanguage] = useState<SupportedLanguage>("en");
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const draftAppliedRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [contentSheetOpen, setContentSheetOpen] = useState(false);
  const [contentSheetTab, setContentSheetTab] = useState<"content" | "packs">("content");
  const [packView, setPackView] = useState<"list" | "details">("list");
  const [selectedPack, setSelectedPack] = useState<PackSummary | null>(null);
  const [moneyModal, setMoneyModal] = useState<null | "tip" | "gift">(null);
  const [tipAmountPreset, setTipAmountPreset] = useState<number | null>(null);
  const [tipAmountCustom, setTipAmountCustom] = useState("");
  const [tipError, setTipError] = useState("");
  const [giftError, setGiftError] = useState("");
  const [giftView, setGiftView] = useState<"list" | "details">("list");
  const [selectedGiftPack, setSelectedGiftPack] = useState<PackSummary | null>(null);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const supportSubmitRef = useRef(false);
  const supportTxnRef = useRef<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordingMs, setVoiceRecordingMs] = useState(0);
  const [isVoiceUploading, setIsVoiceUploading] = useState(false);
  const [voiceUploadError, setVoiceUploadError] = useState("");
  const [voiceRetryPayload, setVoiceRetryPayload] = useState<VoiceUploadPayload | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStartRef = useRef<number | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceCancelRef = useRef(false);
  const voiceObjectUrlsRef = useRef<Map<string, string>>(new Map());
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null);

  const sortMessages = useCallback((list: ApiMessage[]) => {
    const withKeys = list.map((msg, idx) => ({
      msg,
      idx,
      key: getMessageSortKey(msg, idx),
    }));
    withKeys.sort((a, b) => a.key - b.key || a.idx - b.idx);
    return withKeys.map((entry) => entry.msg);
  }, []);

  const visibleMessages = useMemo(() => {
    // TODO: Expand visibility rules beyond Message.audience (tiers/segments).
    return messages.filter((message) => isVisibleToFan(message));
  }, [messages]);

  const fetchMessages = useCallback(
    async (targetFanId: string, options?: { showLoading?: boolean; silent?: boolean }) => {
      if (!targetFanId) return;
      const showLoading = options?.showLoading ?? false;
      const silent = options?.silent ?? false;
      let controller: AbortController | null = null;
      try {
        if (showLoading) setLoading(true);
        if (!silent) setError("");
        if (pollAbortRef.current) {
          pollAbortRef.current.abort();
        }
        controller = new AbortController();
        pollAbortRef.current = controller;
        const params = new URLSearchParams({ fanId: targetFanId, audiences: "FAN,CREATOR" });
        recordDevRequest("messages");
        const res = await fetch(`/api/messages?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "No se pudieron cargar mensajes");
        }
        const apiMessages = Array.isArray(data.items)
          ? (data.items as ApiMessage[])
          : Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : [];
        setMessages((prev) => reconcileMessages(prev, apiMessages, sortMessages, targetFanId));
        setError("");
      } catch (_err) {
        if ((_err as any)?.name === "AbortError") return;
        if (!silent) setError("No se pudieron cargar mensajes");
      } finally {
        if (controller && pollAbortRef.current === controller) {
          pollAbortRef.current = null;
        }
        if (showLoading) setLoading(false);
      }
    },
    [sortMessages]
  );

  useEffect(() => {
    const clearPoll = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current as any);
        pollIntervalRef.current = null;
      }
    };
    const canPoll = () => {
      if (!fanId) return false;
      if (!fanIdOverride && !router.isReady) return false;
      if (typeof document !== "undefined" && document.hidden) return false;
      if (fanIdOverride) return fanIdOverride === fanId;
      if (routeFanId) return routeFanId === fanId;
      return true;
    };
    const startPolling = () => {
      clearPoll();
      if (!canPoll()) return;
      if (!fanId) return;
      pollIntervalRef.current = setInterval(() => {
        if (!canPoll()) return;
        if (!fanId) return;
        if (pollAbortRef.current) return;
        void fetchMessages(fanId, {
          showLoading: false,
          silent: true,
        });
      }, 2500) as any;
    };
    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.hidden) {
        clearPoll();
        return;
      }
      if (!canPoll()) return;
      if (!fanId) return;
      if (!pollAbortRef.current) {
        void fetchMessages(fanId, { showLoading: false, silent: true });
      }
      startPolling();
    };
    const cleanup = () => {
      clearPoll();
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
        pollAbortRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };

    if (!canPoll()) {
      cleanup();
      return cleanup;
    }

    const activeFanId = fanId;
    if (!activeFanId) {
      cleanup();
      return cleanup;
    }

    setMessages([]);
    fetchMessages(activeFanId, { showLoading: true });
    startPolling();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    return cleanup;
  }, [fanId, fanIdOverride, fetchMessages, routeFanId, router.isReady]);

  useEffect(() => {
    if (!router.isReady || draftAppliedRef.current) return;
    const rawDraft = router.query.draft;
    if (typeof rawDraft === "undefined") return;
    const draftValue = Array.isArray(rawDraft) ? rawDraft[0] : rawDraft;
    if (typeof draftValue !== "string") return;
    const decodedDraft = safeDecodeQueryParam(draftValue);
    if (decodedDraft.trim()) {
      setDraft(decodedDraft);
      draftAppliedRef.current = true;
      requestAnimationFrame(() => {
        const input = composerInputRef.current;
        if (!input) return;
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      });
    }
    const nextQuery = { ...router.query };
    delete nextQuery.draft;
    void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [router]);

  const getFallbackLanguage = useCallback((): SupportedLanguage => {
    if (typeof navigator === "undefined") return "en";
    return inferPreferredLanguage(navigator.language);
  }, []);

  const fetchAccessInfo = useCallback(
    async (targetFanId: string) => {
      try {
        setAccessLoading(true);
        const res = await fetch(`/api/fans?fanId=${encodeURIComponent(targetFanId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("error");
        const data = await res.json();
        const fans = Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.fans)
          ? data.fans
          : [];
        const target = fans.find((fan: any) => fan.id === targetFanId);
        const normalizedLanguage = normalizePreferredLanguage(target?.preferredLanguage) ?? getFallbackLanguage();
        setFanProfile({
          name: target?.name ?? "Invitado",
          displayName: target?.displayName ?? null,
          creatorLabel: target?.creatorLabel ?? null,
          preferredLanguage: normalizedLanguage,
        });
        setOnboardingLanguage(normalizedLanguage);
        setFanProfileLoaded(true);
        const hasHistory =
          typeof target?.hasAccessHistory === "boolean"
            ? target.hasAccessHistory
            : (target?.paidGrantsCount ?? 0) > 0;
        const fallbackHasActiveAccess =
          Array.isArray(target?.activeGrantTypes) &&
          target.activeGrantTypes.length > 0 &&
          (target?.daysLeft ?? 0) > 0;
        const hasActiveAccess =
          typeof target?.hasActiveAccess === "boolean" ? target.hasActiveAccess : fallbackHasActiveAccess;
        const accessTypeLabel =
          typeof target?.accessType === "string" && target.accessType.trim().length > 0
            ? target.accessType
            : target?.membershipStatus ?? null;
        const effectiveMembershipStatus = hasActiveAccess
          ? (accessTypeLabel || "active")
          : hasHistory
          ? "expired"
          : "none";
        const summary = getAccessSummary({
          membershipStatus: effectiveMembershipStatus,
          daysLeft: target?.daysLeft,
          hasAccessHistory: hasHistory,
          activeGrantTypes: Array.isArray(target?.activeGrantTypes) ? target.activeGrantTypes : undefined,
        });
        setAccessSummary(summary);
      } catch (_err) {
        setFanProfile({
          name: "Invitado",
          displayName: null,
          creatorLabel: null,
          preferredLanguage: getFallbackLanguage(),
        });
        setFanProfileLoaded(true);
        setAccessSummary(
          getAccessSummary({
            membershipStatus: null,
            daysLeft: 0,
            hasAccessHistory: false,
          })
        );
      } finally {
        setAccessLoading(false);
      }
    },
    [getFallbackLanguage]
  );

  useEffect(() => {
    if (!fanId) return;
    fetchAccessInfo(fanId);
    if (!forceAccessRefresh) return;
    const timer = window.setTimeout(() => {
      fetchAccessInfo(fanId);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fanId, fetchAccessInfo, forceAccessRefresh]);

  useEffect(() => {
    setFanProfile({});
    setFanProfileLoaded(false);
    setOnboardingDismissed(false);
    setOnboardingName("");
    setOnboardingMessage("");
    setOnboardingError("");
    setOnboardingSaving(false);
    setOnboardingLanguage(getFallbackLanguage());
  }, [fanId, getFallbackLanguage]);

  const sendFanMessage = useCallback(
    async (text: string) => {
      if (!fanId) return false;
      const trimmed = text.trim();
      if (!trimmed) return false;

      try {
        setSending(true);
        setSendError("");
        const tempId = `temp-${Date.now()}`;
        const temp: ApiMessage = {
          id: tempId,
          fanId,
          from: "fan",
          text: trimmed,
          time: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false }),
          status: "sending",
        };
        setMessages((prev) => reconcileMessages(prev, [temp], sortMessages, fanId));
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fanId, from: "fan", type: "TEXT", text: trimmed }),
        });
        if (!res.ok) throw new Error("error");
        const data = await res.json();
        const newMessages: ApiMessage[] = Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : data.message
          ? [data.message as ApiMessage]
          : [];
        if (newMessages.length) {
          setMessages((prev) => {
            const withoutTemp = (prev || []).filter((m) => m.id !== tempId);
            return reconcileMessages(withoutTemp, newMessages, sortMessages, fanId);
          });
        }
        return true;
      } catch (_err) {
        setSendError("Error enviando mensaje");
        setMessages((prev) =>
          (prev || []).map((m) => (m.status === "sending" ? { ...m, status: "failed" as const } : m))
        );
        return false;
      } finally {
        setSending(false);
      }
    },
    [fanId, sortMessages]
  );

  const focusComposer = useCallback(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, []);

  const shouldPromptForName = inviteFlag
    ? !fanProfile.displayName
    : getFanDisplayName(fanProfile) === "Invitado";
  const isOnboardingVisible =
    fanProfileLoaded &&
    !onboardingDismissed &&
    !loading &&
    visibleMessages.length === 0 &&
    shouldPromptForName;
  const isComposerDisabled = sending || isOnboardingVisible || onboardingSaving;

  const handleSendMessage = useCallback(async () => {
    if (isOnboardingVisible) return;
    const ok = await sendFanMessage(draft);
    if (ok) {
      setDraft("");
      requestAnimationFrame(() => focusComposer());
    }
  }, [draft, focusComposer, isOnboardingVisible, sendFanMessage]);

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      void handleSendMessage();
    },
    [handleSendMessage]
  );

  const insertIntoDraft = useCallback((snippet: string) => {
    const input = composerInputRef.current;
    if (!input) {
      setDraft((prev) => `${prev}${snippet}`);
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    setDraft((prev) => `${prev.slice(0, start)}${snippet}${prev.slice(end)}`);
    requestAnimationFrame(() => {
      const nextPos = start + snippet.length;
      input.focus();
      input.setSelectionRange(nextPos, nextPos);
    });
  }, []);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      if (isComposerDisabled) return;
      insertIntoDraft(emoji);
    },
    [insertIntoDraft, isComposerDisabled]
  );

  const handleStickerSelect = useCallback(
    (sticker: StickerItem) => {
      if (isComposerDisabled) return;
      const token = buildStickerTokenFromItem(sticker);
      void sendFanMessage(token);
    },
    [isComposerDisabled, sendFanMessage]
  );

  const openContentSheet = useCallback((tab: "content" | "packs") => {
    setContentSheetTab(tab);
    setContentSheetOpen(true);
    setPackView("list");
    setSelectedPack(null);
  }, []);

  const closeContentSheet = useCallback(() => {
    setContentSheetOpen(false);
    setPackView("list");
    setSelectedPack(null);
    requestAnimationFrame(() => focusComposer());
  }, [focusComposer]);

  const closeActionMenu = useCallback(() => {
    setActionMenuOpen(false);
    requestAnimationFrame(() => focusComposer());
  }, [focusComposer]);

  const openTipModal = useCallback(() => {
    setActionMenuOpen(false);
    setTipError("");
    setTipAmountPreset(null);
    setTipAmountCustom("");
    setMoneyModal("tip");
  }, []);

  const openGiftModal = useCallback(() => {
    setActionMenuOpen(false);
    setGiftError("");
    setGiftView("list");
    setSelectedGiftPack(null);
    setMoneyModal("gift");
  }, []);

  const openPacksSheet = useCallback(() => {
    setActionMenuOpen(false);
    openContentSheet("packs");
  }, [openContentSheet]);

  const closeMoneyModal = useCallback(() => {
    setMoneyModal(null);
    setTipAmountPreset(null);
    setTipAmountCustom("");
    setTipError("");
    setGiftError("");
    setGiftView("list");
    setSelectedGiftPack(null);
    requestAnimationFrame(() => focusComposer());
  }, [focusComposer]);

  const createSupportPurchase = useCallback(
    async (payload: { kind: "TIP" | "GIFT"; amount: number; packId?: string; packName?: string; clientTxnId?: string }) => {
      if (!fanId) return { ok: false, error: "Missing fanId" };
      try {
        const res = await fetch(`/api/fans/${fanId}/support`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { ok: false, error: "No se pudo registrar el pago." };
        }
        return { ok: true, purchase: data?.purchase, reused: data?.reused === true };
      } catch (err) {
        console.error("Error recording support purchase", err);
        return { ok: false, error: "No se pudo registrar el pago." };
      }
    },
    [fanId]
  );

  const appendSystemMessage = useCallback(
    (text: string) => {
      if (!fanId) return;
      const temp: ApiMessage = {
        id: `local-${Date.now()}`,
        fanId,
        from: "fan",
        text,
        time: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false }),
        status: "sent",
        type: "SYSTEM",
        audience: "FAN",
      };
      setMessages((prev) => reconcileMessages(prev, [temp], sortMessages, fanId));
    },
    [fanId, sortMessages]
  );

  const handleTipConfirm = useCallback(async () => {
    if (!fanId) return;
    if (supportSubmitting || supportSubmitRef.current) return;
    const amountValue = tipAmountPreset ?? parseAmountToNumber(tipAmountCustom);
    if (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > 500) {
      setTipError("Introduce un importe válido.");
      return;
    }
    const txnId = supportTxnRef.current ?? generateClientTxnId();
    supportTxnRef.current = txnId;
    setSupportSubmitting(true);
    supportSubmitRef.current = true;
    try {
      const result = await createSupportPurchase({
        kind: "TIP",
        amount: amountValue,
        clientTxnId: txnId,
      });
      if (!result.ok) {
        setTipError(result.error ?? "No se pudo registrar la propina.");
        return;
      }
      if (!result.reused) {
        emitPurchaseCreated({
          fanId,
          fanName: fanProfile.displayName ?? fanProfile.name ?? undefined,
          amountCents: Math.round((result.purchase?.amount ?? amountValue) * 100),
          kind: result.purchase?.kind ?? "TIP",
          title: "Propina",
          purchaseId: result.purchase?.id,
          createdAt: result.purchase?.createdAt,
          clientTxnId: txnId,
        });
        const amountLabel = formatAmountLabel(amountValue);
        appendSystemMessage(`🎁 Has apoyado con ${amountLabel}`);
      }
      closeMoneyModal();
    } finally {
      setSupportSubmitting(false);
      supportSubmitRef.current = false;
      supportTxnRef.current = null;
    }
  }, [
    appendSystemMessage,
    closeMoneyModal,
    createSupportPurchase,
    fanId,
    fanProfile.displayName,
    fanProfile.name,
    supportSubmitRef,
    supportTxnRef,
    tipAmountCustom,
    tipAmountPreset,
    supportSubmitting,
  ]);

  const handleGiftConfirm = useCallback(
    async (pack: PackSummary) => {
      if (!fanId) return;
      if (supportSubmitting || supportSubmitRef.current) return;
      const amountValue = parseAmountToNumber(pack.price);
      if (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > 500) {
        setGiftError("Introduce un importe válido.");
        return;
      }
      const txnId = supportTxnRef.current ?? generateClientTxnId();
      supportTxnRef.current = txnId;
      setSupportSubmitting(true);
      supportSubmitRef.current = true;
      try {
        const result = await createSupportPurchase({
          kind: "GIFT",
          amount: amountValue,
          packId: pack.id,
          packName: pack.name,
          clientTxnId: txnId,
        });
        if (!result.ok) {
          setGiftError(result.error ?? "No se pudo registrar el regalo.");
          return;
        }
        if (!result.reused) {
          emitPurchaseCreated({
            fanId,
            fanName: fanProfile.displayName ?? fanProfile.name ?? undefined,
            amountCents: Math.round((result.purchase?.amount ?? amountValue) * 100),
            kind: result.purchase?.kind ?? "GIFT",
            title: pack.name,
            purchaseId: result.purchase?.id,
            createdAt: result.purchase?.createdAt,
            clientTxnId: txnId,
          });
        }
        await fetchAccessInfo(fanId);
        if (!result.reused) {
          const priceLabel = normalizePriceLabel(pack.price);
          appendSystemMessage(`🎁 Has regalado ${pack.name} (${priceLabel})`);
        }
        closeMoneyModal();
      } finally {
        setSupportSubmitting(false);
        supportSubmitRef.current = false;
        supportTxnRef.current = null;
      }
    },
    [
      appendSystemMessage,
      closeMoneyModal,
      createSupportPurchase,
      fanId,
      fanProfile.displayName,
      fanProfile.name,
      fetchAccessInfo,
      supportSubmitRef,
      supportTxnRef,
      supportSubmitting,
    ]
  );

  const handlePackRequest = useCallback(
    (pack: PackSummary) => {
      const draftText = buildPackDraft(pack);
      setDraft(draftText);
      closeContentSheet();
      requestAnimationFrame(() => focusComposer());
    },
    [closeContentSheet, focusComposer]
  );

  const sendDisabled = isComposerDisabled || draft.trim().length === 0;
  const voiceRecordingLabel = formatAudioTime(Math.max(0, Math.floor(voiceRecordingMs / 1000)));

  const handleOnboardingSkip = () => {
    setOnboardingDismissed(true);
    setOnboardingError("");
  };

  const handleOnboardingEnter = async () => {
    if (!fanId) return;
    setOnboardingSaving(true);
    setOnboardingError("");
    try {
      const name = onboardingName.trim();
      const firstMessage = onboardingMessage.trim();
      const updates: Record<string, unknown> = {};
      if (name) {
        updates.displayName = name;
      }
      if (onboardingLanguage) {
        updates.preferredLanguage = onboardingLanguage;
      }
      if (inviteFlag) {
        updates.inviteUsedAt = true;
      }
      if (Object.keys(updates).length > 0) {
        const res = await fetch(`/api/fans/${fanId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[invite] patch failed", data?.error || res.statusText);
          }
          throw new Error(data?.error || "patch_failed");
        }
        if (data?.fan) {
          setFanProfile({
            name: data.fan.name ?? fanProfile.name ?? "Invitado",
            displayName: data.fan.displayName ?? (name ? name : fanProfile.displayName ?? null),
            creatorLabel: data.fan.creatorLabel ?? null,
          });
        }
      }
      if (firstMessage) {
        await sendFanMessage(firstMessage);
      }
      setOnboardingDismissed(true);
      setOnboardingName("");
      setOnboardingMessage("");
    } catch (_err) {
      setOnboardingError("No se pudo completar el registro.");
      setOnboardingDismissed(true);
    } finally {
      setOnboardingSaving(false);
    }
  };

  const headerSubtitle = useMemo(
    () => `Chat privado con ${creatorName}`,
    [creatorName]
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight - el.clientHeight,
      behavior,
    });
  }, []);

  const clearVoiceTimer = useCallback(() => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }, []);

  const stopVoiceStream = useCallback(() => {
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
  }, []);

  const previewVoiceBlob = useCallback((blob: Blob) => {
    if (typeof Audio === "undefined") return;
    if (voicePreviewRef.current) {
      voicePreviewRef.current.pause();
      voicePreviewRef.current = null;
    }
    const previewUrl = URL.createObjectURL(blob);
    const audio = new Audio(previewUrl);
    audio.preload = "metadata";
    voicePreviewRef.current = audio;
    const cleanup = () => {
      if (voicePreviewRef.current === audio) {
        voicePreviewRef.current = null;
      }
      URL.revokeObjectURL(previewUrl);
    };
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        console.warn("[voice-note] preview playback failed", err);
        cleanup();
      });
    }
  }, []);

  const resetVoiceRecording = useCallback(() => {
    clearVoiceTimer();
    stopVoiceStream();
    voiceChunksRef.current = [];
    voiceStartRef.current = null;
    voiceRecorderRef.current = null;
    voiceCancelRef.current = false;
    setVoiceRecordingMs(0);
    setIsVoiceRecording(false);
  }, [clearVoiceTimer, stopVoiceStream]);

  const resolveVoiceMimeType = useCallback(() => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
    for (let i = 0; i < VOICE_MIME_PREFERENCES.length; i += 1) {
      const candidate = VOICE_MIME_PREFERENCES[i];
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return "";
  }, []);

  const uploadVoiceNote = useCallback(
    async (payload: VoiceUploadPayload) => {
      if (!fanId) return;
      const { blob, durationMs, mimeType, clientTxnId } = payload;
      const tempId = `temp-audio-${Date.now()}`;
      const localUrl = URL.createObjectURL(blob);
      voiceObjectUrlsRef.current.set(tempId, localUrl);
      const timeLabel = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const tempMessage: ApiMessage = {
        id: tempId,
        fanId,
        from: "fan",
        text: "",
        time: timeLabel,
        status: "sending",
        type: "AUDIO",
        audioUrl: localUrl,
        audioDurationMs: durationMs,
        audioMime: mimeType,
        audioSizeBytes: blob.size,
      };
      setMessages((prev) => reconcileMessages(prev, [tempMessage], sortMessages, fanId));
      scrollToBottom("auto");
      setVoiceUploadError("");
      setVoiceRetryPayload(null);
      setIsVoiceUploading(true);
      try {
        const form = new FormData();
        const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
        form.append("file", blob, `voice_${Date.now()}.${extension}`);
        form.append("durationMs", String(durationMs));
        form.append("from", "fan");
        form.append("clientTxnId", clientTxnId);
        form.append("mime", mimeType);
        form.append("fanId", fanId);
        const res = await fetch(`/api/chats/${fanId}/voice-notes`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          const errorMessage =
            typeof data?.error === "string" && data.error.trim().length > 0
              ? data.error
              : res.ok
              ? "No se pudo subir la nota de voz."
              : `Error ${res.status}`;
          throw new Error(errorMessage);
        }
        const reused = Boolean(data?.reused);
        const newMessages: ApiMessage[] = Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : data.message
          ? [data.message as ApiMessage]
          : [];
        if (newMessages.length > 0) {
          setMessages((prev) => {
            const withoutTemp = (prev || []).filter((msg) => msg.id !== tempId);
            if (reused) {
              const existingIds = new Set(withoutTemp.map((msg) => msg.id));
              const fresh = newMessages.filter((msg) => !existingIds.has(msg.id));
              if (fresh.length === 0) return withoutTemp;
              return reconcileMessages(withoutTemp, fresh, sortMessages, fanId);
            }
            return reconcileMessages(withoutTemp, newMessages, sortMessages, fanId);
          });
        } else {
          setMessages((prev) => (prev || []).filter((msg) => msg.id !== tempId));
        }
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0 ? err.message : "No se pudo subir la nota de voz.";
        setVoiceUploadError(message);
        setVoiceRetryPayload(payload);
        setMessages((prev) => (prev || []).filter((msg) => msg.id !== tempId));
      } finally {
        const url = voiceObjectUrlsRef.current.get(tempId);
        if (url) {
          URL.revokeObjectURL(url);
          voiceObjectUrlsRef.current.delete(tempId);
        }
        setIsVoiceUploading(false);
      }
    },
    [fanId, scrollToBottom, sortMessages]
  );

  const startVoiceRecording = useCallback(async () => {
    if (isVoiceRecording || isVoiceUploading) return;
    if (!fanId || isComposerDisabled) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceUploadError("No se detecta micro en este navegador.");
      return;
    }
    try {
      const { stream, label, deviceId, isMonitor } = await getPreferredAudioStream();
      console.info("voice capture device:", label, deviceId ?? "");
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        setVoiceUploadError("No se detectó audio.");
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (isMonitor || audioTracks.some((track) => track.label.toLowerCase().includes("monitor"))) {
        setVoiceUploadError("Entrada de micro incorrecta (Monitor). Cambia a MicrophoneFX en ajustes.");
        setVoiceRetryPayload(null);
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      audioTracks.forEach((track) => {
        if (!track.enabled) track.enabled = true;
      });
      if (!audioTracks.some((track) => track.enabled)) {
        setVoiceUploadError("No se detectó audio.");
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      voiceStreamRef.current = stream;
      const mimeType = resolveVoiceMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceCancelRef.current = false;
      voiceStartRef.current = Date.now();
      setVoiceRecordingMs(0);
      setIsVoiceRecording(true);
      setVoiceUploadError("");
      setVoiceRetryPayload(null);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setVoiceUploadError("Error al grabar la nota de voz.");
        resetVoiceRecording();
      };
      recorder.onstop = () => {
        const startedAt = voiceStartRef.current ?? Date.now();
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        const chunks = voiceChunksRef.current;
        clearVoiceTimer();
        stopVoiceStream();
        voiceRecorderRef.current = null;
        voiceStartRef.current = null;
        setIsVoiceRecording(false);
        setVoiceRecordingMs(0);
        if (voiceCancelRef.current) {
          voiceCancelRef.current = false;
          voiceChunksRef.current = [];
          return;
        }
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        voiceChunksRef.current = [];
        console.info("[voice-note] recorded", {
          blobType: blob.type,
          blobSize: blob.size,
          durationMs: elapsedMs,
        });
        if (!blob.size) {
          setVoiceUploadError("No se pudo grabar la nota de voz.");
          return;
        }
        if (blob.size < VOICE_MIN_SIZE_BYTES) {
          setVoiceUploadError("No se detectó audio.");
          return;
        }
        if (blob.size > VOICE_MAX_SIZE_BYTES) {
          setVoiceUploadError("La nota de voz supera los 20 MB.");
          return;
        }
        if (elapsedMs > VOICE_MAX_DURATION_MS) {
          setVoiceUploadError("La nota de voz supera los 120 s.");
          return;
        }
        if (elapsedMs < 800) {
          setVoiceUploadError("La nota de voz es demasiado corta.");
          return;
        }
        previewVoiceBlob(blob);
        const clientTxnId = generateClientTxnId();
        void uploadVoiceNote({
          blob,
          durationMs: elapsedMs,
          mimeType: blob.type || mimeType || "audio/webm",
          clientTxnId,
        });
      };
      recorder.start();
      voiceTimerRef.current = setInterval(() => {
        if (!voiceStartRef.current) return;
        setVoiceRecordingMs(Date.now() - voiceStartRef.current);
      }, 250);
    } catch (_err) {
      setVoiceUploadError("Permiso del micro denegado.");
      resetVoiceRecording();
    }
  }, [
    fanId,
    isComposerDisabled,
    isVoiceRecording,
    isVoiceUploading,
    resolveVoiceMimeType,
    resetVoiceRecording,
    uploadVoiceNote,
    previewVoiceBlob,
    clearVoiceTimer,
    stopVoiceStream,
  ]);

  const stopVoiceRecording = useCallback(() => {
    if (!isVoiceRecording) return;
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      resetVoiceRecording();
      return;
    }
    recorder.stop();
  }, [isVoiceRecording, resetVoiceRecording]);

  const cancelVoiceRecording = useCallback(() => {
    if (!isVoiceRecording) return;
    voiceCancelRef.current = true;
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      resetVoiceRecording();
    }
  }, [isVoiceRecording, resetVoiceRecording]);

  const retryVoiceUpload = useCallback(() => {
    if (!voiceRetryPayload || isVoiceUploading) return;
    setVoiceUploadError("");
    const payload = voiceRetryPayload;
    setVoiceRetryPayload(null);
    void uploadVoiceNote(payload);
  }, [isVoiceUploading, uploadVoiceNote, voiceRetryPayload]);

  const clearVoiceRetry = useCallback(() => {
    setVoiceRetryPayload(null);
    setVoiceUploadError("");
  }, []);

  useEffect(() => {
    const objectUrls = voiceObjectUrlsRef.current;
    return () => {
      clearVoiceTimer();
      stopVoiceStream();
      if (voicePreviewRef.current) {
        voicePreviewRef.current.pause();
        voicePreviewRef.current = null;
      }
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [clearVoiceTimer, stopVoiceStream]);

  useEffect(() => {
    setVoiceUploadError("");
    setVoiceRetryPayload(null);
    resetVoiceRecording();
  }, [fanId, resetVoiceRecording]);

  useIsomorphicLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 80;
      const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      setIsAtBottom(distanceToBottom < threshold);
    };
    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useIsomorphicLayoutEffect(() => {
    scrollToBottom("auto");
  }, [fanId, scrollToBottom]);

  useIsomorphicLayoutEffect(() => {
    if (!isAtBottom) return;
    scrollToBottom("smooth");
  }, [visibleMessages.length, isAtBottom, scrollToBottom]);

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>{`Chat con ${creatorName} · NOVSY`}</title>
      </Head>

      <header className="flex items-center gap-3 px-4 py-3 bg-[color:var(--surface-1)] border-b border-[color:var(--border)]">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[color:var(--surface-2)] text-[color:var(--text)] font-semibold">
          {creatorInitial}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[color:var(--text)] font-medium text-sm">{creatorName}</span>
          <span className="ui-muted text-sm">{headerSubtitle}</span>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-sm text-[color:var(--danger)] bg-[color:rgba(244,63,94,0.12)] border-b border-[color:rgba(244,63,94,0.5)] flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            className="rounded-full border border-[color:rgba(244,63,94,0.7)] px-3 py-1 text-xs font-semibold hover:bg-[color:rgba(244,63,94,0.12)]"
            onClick={() => fanId && fetchMessages(fanId, { showLoading: true })}
          >
            Reintentar
          </button>
        </div>
      )}

      <main className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="px-4 sm:px-6 pt-3 space-y-3 shrink-0">
          {accessLoading && !accessSummary ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)]">
              Cargando acceso...
            </div>
          ) : accessSummary ? (
            <AccessBanner
              summary={accessSummary}
              contentCount={included?.length ?? 0}
              onOpenContent={() => openContentSheet("content")}
            />
          ) : null}
        </div>
        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto">
          <div
            className="px-4 sm:px-6 py-4"
            style={{ backgroundImage: "var(--chat-pattern)" }}
          >
            <div className="min-h-full flex flex-col justify-end gap-2">
              {loading && <div className="text-center ui-muted text-sm mt-2">Cargando mensajes...</div>}
              {error && !loading && <div className="text-center text-[color:var(--danger)] text-sm mt-2">{error}</div>}
              {!loading && !error && visibleMessages.length === 0 && (
                <div className="text-center ui-muted text-sm mt-2">Aún no hay mensajes.</div>
              )}
              {visibleMessages.map((msg, idx) => {
                const messageId = msg.id || `message-${idx}`;
                const isContent = msg.type === "CONTENT" && !!msg.contentItem;
                if (isContent) {
                  return <ContentCard key={msg.id} message={msg} />;
                }
                if (msg.type === "SYSTEM") {
                  return <SystemMessage key={messageId} text={msg.text || ""} />;
                }
                if (msg.type === "AUDIO") {
                  return <AudioMessage key={messageId} message={msg} />;
                }
                const tokenSticker =
                  msg.type !== "STICKER" ? getStickerByToken(msg.text ?? "") : null;
                const isSticker = msg.type === "STICKER" || Boolean(tokenSticker);
                const sticker = msg.type === "STICKER" ? getStickerById(msg.stickerId ?? null) : null;
                const stickerSrc = msg.type === "STICKER" ? sticker?.file ?? null : tokenSticker?.src ?? null;
                const stickerAlt = msg.type === "STICKER" ? sticker?.label || "Sticker" : tokenSticker?.label ?? null;
                const displayText =
                  isSticker
                    ? ""
                    : msg.from === "creator"
                    ? (msg.deliveredText ?? msg.text ?? "")
                    : msg.text ?? "";
                const messageReactions = reactionsStore[messageId] ?? [];
                return (
                  <MessageBalloon
                    key={messageId}
                    me={msg.from === "fan"}
                    message={displayText}
                    messageId={messageId}
                    seen={!!msg.isLastFromCreator}
                    time={msg.time || undefined}
                    status={msg.status}
                    stickerSrc={isSticker ? stickerSrc : null}
                    stickerAlt={isSticker ? stickerAlt : null}
                    enableReactions
                    reactionActor="fan"
                    reactionFanId={fanId || undefined}
                    reactions={messageReactions}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {isOnboardingVisible && (
          <div className="px-4 pb-3">
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[color:var(--text)]">Una cosa rápida</p>
                <p className="text-xs text-[color:var(--muted)]">Así el creador puede dirigirse a ti por tu nombre.</p>
              </div>
              <label className="flex flex-col gap-1 text-sm text-[color:var(--text)]">
                <span>¿Cómo te llamas?</span>
                <input
                  className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--brand)]"
                  value={onboardingName}
                  onChange={(evt) => setOnboardingName(evt.target.value)}
                  placeholder="Tu nombre"
                  disabled={onboardingSaving}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-[color:var(--text)]">
                <span>Idioma</span>
                <select
                  className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--brand)]"
                  value={onboardingLanguage}
                  onChange={(evt) => {
                    const next = normalizePreferredLanguage(evt.target.value) ?? "en";
                    setOnboardingLanguage(next);
                  }}
                  disabled={onboardingSaving}
                >
                  {(["es", "en", "ro"] as const).map((lang) => (
                    <option key={lang} value={lang}>
                      {LANGUAGE_LABELS[lang]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-[color:var(--text)]">
                <span>Tu primer mensaje</span>
                <textarea
                  className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--brand)] h-20"
                  value={onboardingMessage}
                  onChange={(evt) => setOnboardingMessage(evt.target.value)}
                  placeholder="Ej: Hola, quería preguntarte..."
                  disabled={onboardingSaving}
                />
              </label>
              {onboardingError && <p className="text-xs text-[color:var(--danger)]">{onboardingError}</p>}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                  onClick={handleOnboardingSkip}
                  disabled={onboardingSaving}
                >
                  Omitir
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:var(--brand-strong)]/15 px-3 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--brand-strong)]/25 disabled:opacity-60"
                  onClick={() => void handleOnboardingEnter()}
                  disabled={onboardingSaving}
                >
                  {onboardingSaving ? "Entrando..." : "Entrar"}
                </button>
              </div>
            </div>
          </div>
        )}
        {!isOnboardingVisible && (
          <div className="shrink-0 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-0)] backdrop-blur-xl">
            <div className="px-4 sm:px-6 py-3">
              {(isVoiceRecording || isVoiceUploading) && (
                <div className="mb-2 rounded-xl border border-[color:rgba(34,197,94,0.4)] bg-[color:rgba(34,197,94,0.08)] px-3 py-2 text-[11px] text-[color:var(--text)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <span>🎤</span>
                      <span>{isVoiceUploading ? "Subiendo nota de voz..." : `Grabando ${voiceRecordingLabel}`}</span>
                    </div>
                    {isVoiceRecording && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          className="rounded-full border border-[color:rgba(34,197,94,0.6)] bg-[color:rgba(34,197,94,0.16)] px-3 py-1 text-[10px] font-semibold hover:bg-[color:rgba(34,197,94,0.24)]"
                        >
                          Stop
                        </button>
                        <button
                          type="button"
                          onClick={cancelVoiceRecording}
                          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[10px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {voiceUploadError && (
                <div className="mb-2 rounded-xl border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.1)] px-3 py-2 text-[11px] text-[color:var(--text)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{voiceUploadError}</span>
                    {voiceRetryPayload ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={retryVoiceUpload}
                          className="rounded-full border border-[color:rgba(244,63,94,0.5)] bg-[color:rgba(244,63,94,0.12)] px-3 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.2)]"
                        >
                          Reintentar
                        </button>
                        <button
                          type="button"
                          onClick={clearVoiceRetry}
                          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[10px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                        >
                          Descartar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              <div
                className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2.5 shadow-[0_-12px_22px_-16px_rgba(0,0,0,0.55)] focus-within:border-[color:rgba(var(--brand-rgb),0.45)] focus-within:ring-1 focus-within:ring-[color:var(--ring)]"
              >
                <ChatComposerBar
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  onSend={handleSendMessage}
                  sendDisabled={sendDisabled}
                  placeholder="Escribe un mensaje..."
                  actionLabel="Enviar"
                  audience="CREATOR"
                  onAudienceChange={() => {}}
                  canAttach={!isComposerDisabled}
                  onAttach={() => setActionMenuOpen(true)}
                  inputRef={composerInputRef}
                  maxHeight={140}
                  isChatBlocked={false}
                  isInternalPanelOpen={false}
                  showAudienceToggle={false}
                  showAttach
                  showVoice
                  onVoiceStart={startVoiceRecording}
                  voiceDisabled={isComposerDisabled || isVoiceRecording || isVoiceUploading}
                  isVoiceRecording={isVoiceRecording}
                  showEmoji
                  onEmojiSelect={handleEmojiSelect}
                  showStickers
                  onStickerSelect={handleStickerSelect}
                />
              </div>
              {sendError && <div className="pt-2 text-sm text-[color:var(--danger)]">{sendError}</div>}
            </div>
          </div>
        )}
      </main>
      <BottomSheet open={actionMenuOpen} onClose={closeActionMenu}>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">Acciones rápidas</h3>
            <p className="text-xs text-[color:var(--muted)]">Elige una acción para continuar.</p>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={openTipModal}
              className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              <span>Apoyar / Propina</span>
              <span className="text-xs text-[color:var(--muted)]">Simulación</span>
            </button>
            <button
              type="button"
              onClick={openPacksSheet}
              className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              <span>Ver packs</span>
              <span className="text-xs text-[color:var(--muted)]">{availablePacks.length}</span>
            </button>
            <button
              type="button"
              onClick={openGiftModal}
              className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              <span>Regalo</span>
              <span className="text-xs text-[color:var(--muted)]">Simulación</span>
            </button>
          </div>
        </div>
      </BottomSheet>
      <BottomSheet open={contentSheetOpen} onClose={closeContentSheet}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">Contenido y packs</h3>
            <p className="text-xs text-[color:var(--muted)]">Todo dentro del chat.</p>
          </div>
          <button
            type="button"
            onClick={closeContentSheet}
            className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
          >
            Cerrar
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {(["content", "packs"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setContentSheetTab(tab);
                if (tab === "packs") {
                  setPackView("list");
                  setSelectedPack(null);
                }
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                contentSheetTab === tab
                  ? "bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] border border-[color:rgba(var(--brand-rgb),0.45)]"
                  : "border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
              }`}
            >
              {tab === "content" ? "Contenido" : "Packs"}
            </button>
          ))}
        </div>
        {contentSheetTab === "content" ? (
          <div className="mt-4">
            {included?.length ? (
              <IncludedContentSection items={included} />
            ) : (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4 text-sm text-[color:var(--muted)]">
                Todavía no tienes contenido incluido.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {availablePacks.length === 0 && (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4 text-sm text-[color:var(--muted)]">
                No hay packs públicos todavía.
              </div>
            )}
            {packView === "list" &&
              availablePacks.map((pack) => (
                <div key={pack.id} className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--text)]">{pack.name}</p>
                      <p className="text-xs text-[color:var(--muted)]">{pack.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-[color:var(--warning)]">{normalizePriceLabel(pack.price)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePackRequest(pack)}
                      className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)]"
                    >
                      Pedir
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPack(pack);
                        setPackView("details");
                      }}
                      className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                    >
                      Ver pack
                    </button>
                  </div>
                </div>
              ))}
            {packView === "details" && selectedPack && (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--text)]">{selectedPack.name}</p>
                    <p className="text-xs text-[color:var(--muted)]">{selectedPack.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-[color:var(--warning)]">{normalizePriceLabel(selectedPack.price)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePackRequest(selectedPack)}
                    className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)]"
                  >
                    Pedir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPackView("list");
                      setSelectedPack(null);
                    }}
                    className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
      <BottomSheet open={moneyModal === "tip"} onClose={closeMoneyModal}>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">Apoyar / Propina</h3>
            <p className="text-xs text-[color:var(--muted)]">Elige un importe.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[3, 5, 10, 20].map((amount) => (
              <button
                key={amount}
                type="button"
              onClick={() => {
                setTipAmountPreset(amount);
                setTipAmountCustom("");
                setTipError("");
              }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold border ${
                  tipAmountPreset === amount
                    ? "border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                }`}
              >
                {amount} €
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-[color:var(--muted)]">Otro importe</label>
            <input
              type="number"
              min={1}
              max={500}
              inputMode="decimal"
              className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--brand)]"
              placeholder="Otro importe"
              value={tipAmountCustom}
              onChange={(event) => {
                setTipAmountCustom(event.target.value);
                setTipAmountPreset(null);
                setTipError("");
              }}
            />
          </div>
          {tipError && <p className="text-xs text-[color:var(--danger)]">{tipError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeMoneyModal}
              className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleTipConfirm}
              disabled={supportSubmitting}
              className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
            >
              {supportSubmitting ? "Procesando..." : "Enviar propina"}
            </button>
          </div>
        </div>
      </BottomSheet>
      <BottomSheet open={moneyModal === "gift"} onClose={closeMoneyModal}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">Regalo</h3>
            <p className="text-xs text-[color:var(--muted)]">Elige qué quieres regalar.</p>
            {giftError && <p className="mt-1 text-xs text-[color:var(--danger)]">{giftError}</p>}
          </div>
          <button
            type="button"
            onClick={closeMoneyModal}
            className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
          >
            Cerrar
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {giftView === "list" && availablePacks.length === 0 && (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4 text-sm text-[color:var(--muted)]">
              No hay packs disponibles para regalar.
            </div>
          )}
          {giftView === "list" &&
            availablePacks.map((pack) => (
              <div key={`gift-${pack.id}`} className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--text)]">{pack.name}</p>
                    <p className="text-xs text-[color:var(--muted)]">{pack.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-[color:var(--warning)]">{normalizePriceLabel(pack.price)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGiftConfirm(pack)}
                    disabled={supportSubmitting}
                    className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
                  >
                    {supportSubmitting ? "Procesando..." : "Regalar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGiftPack(pack);
                      setGiftView("details");
                    }}
                    className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  >
                    Ver pack
                  </button>
                </div>
              </div>
            ))}
          {giftView === "details" && selectedGiftPack && (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--text)]">{selectedGiftPack.name}</p>
                  <p className="text-xs text-[color:var(--muted)]">{selectedGiftPack.description}</p>
                </div>
                <span className="text-sm font-semibold text-[color:var(--warning)]">{normalizePriceLabel(selectedGiftPack.price)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGiftConfirm(selectedGiftPack)}
                  disabled={supportSubmitting}
                  className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
                >
                  {supportSubmitting ? "Procesando..." : "Regalar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGiftView("list");
                    setSelectedGiftPack(null);
                  }}
                  className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function ContentCard({ message }: { message: ApiMessage }) {
  const content = message.contentItem;
  const title = content?.title || "Contenido adjunto";
  const visibilityLabel = content ? getContentVisibilityLabel(content.visibility) : "";
  const typeLabel = content ? getContentTypeLabel(content.type) : "Contenido";
  const iconName = getContentIconName(content?.type);
  const alignItems = message.from === "fan" ? "items-end" : "items-start";
  const mediaUrl = (content?.mediaPath || content?.externalUrl || "").trim();

  const visibilityTone = visibilityLabel ? getVisibilityBadgeTone(visibilityLabel) : "muted";

  return (
    <div className={`flex flex-col ${alignItems} w-full h-max`}>
      <div className="flex flex-col min-w-[5%] max-w-[70%] bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] p-3 text-[color:var(--text)] rounded-lg mb-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <IconGlyph name={iconName} className="h-4 w-4 text-[color:var(--text)]" />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--muted)] mt-1">
          <span>{typeLabel}</span>
          {visibilityLabel && <span className="w-1 h-1 rounded-full bg-[color:var(--muted)]" />}
          {visibilityLabel && (
            <Badge tone={visibilityTone} size="sm">
              {visibilityLabel}
            </Badge>
          )}
        </div>
        <button
          type="button"
          className="mt-2 inline-flex w-fit items-center rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--warning)] hover:border-[color:rgba(245,158,11,0.7)] hover:text-[color:var(--text)] transition"
          onClick={() => openContentLink(mediaUrl)}
        >
          Ver contenido
        </button>
        <div className="flex justify-end items-center gap-2 ui-muted text-xs mt-2">
          <span>{message.time || ""}</span>
          {message.from === "fan" && message.isLastFromCreator ? (
            <span className="inline-flex items-center gap-1 text-[color:var(--brand)] text-[11px]">
              <span className="inline-flex -space-x-1">
                <IconGlyph name="check" className="h-3 w-3" />
                <IconGlyph name="check" className="h-3 w-3" />
              </span>
              <span>Visto</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AudioMessage({ message }: { message: ApiMessage }) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ isPlaying, setIsPlaying ] = useState(false);
  const [ currentTime, setCurrentTime ] = useState(0);
  const [ audioError, setAudioError ] = useState(false);
  const [ reloadToken, setReloadToken ] = useState(0);
  const [ transcriptOpen, setTranscriptOpen ] = useState(false);
  const isMe = message.from === "fan";
  const resolvedAudioSrc = resolveAudioUrl(message.audioUrl, router.basePath);
  const audioSrc =
    resolvedAudioSrc && reloadToken
      ? `${resolvedAudioSrc}${resolvedAudioSrc.includes("?") ? "&" : "?"}t=${reloadToken}`
      : resolvedAudioSrc;
  const totalSeconds = Math.max(0, Math.round((message.audioDurationMs ?? 0) / 1000));
  const totalLabel = formatAudioTime(totalSeconds);
  const currentLabel = formatAudioTime(Math.round(currentTime));
  const progress = totalSeconds > 0 ? Math.min(100, (currentTime / totalSeconds) * 100) : 0;
  const bubbleClass = isMe
    ? "bg-[color:var(--brand-weak)] text-[color:var(--text)] border border-[color:rgba(var(--brand-rgb),0.28)]"
    : "bg-[color:var(--surface-2)] text-[color:var(--text)] border border-[color:var(--border)]";
  const isSending = message.status === "sending";
  const transcriptText = typeof message.transcriptText === "string" ? message.transcriptText.trim() : "";
  const transcriptError = typeof message.transcriptError === "string" ? message.transcriptError.trim() : "";
  const resolvedStatus = message.transcriptStatus ?? (transcriptText ? "DONE" : "OFF");
  const showTranscriptSection =
    resolvedStatus === "PENDING" || resolvedStatus === "FAILED" || Boolean(transcriptText);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    setAudioError(false);
  }, [resolvedAudioSrc]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !audioSrc || isSending || audioError) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (_err) {
      setIsPlaying(false);
    }
  };

  const retryDownload = () => {
    setAudioError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setReloadToken(Date.now());
  };

  return (
    <div className={isMe ? "flex justify-end" : "flex justify-start"}>
      <div className="max-w-[75%]">
        <p className={`mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)] ${isMe ? "text-right" : ""}`}>
          <span>{isMe ? "Tú" : "Fan"} • {message.time || ""}</span>
        </p>
        <div className={`rounded-2xl px-4 py-3 ${bubbleClass}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={isSending || !audioSrc || audioError}
              className={
                isSending || !audioSrc || audioError
                  ? "flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                  : "flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:border-[color:var(--border-a)]"
              }
              aria-label={isPlaying ? "Pausar" : "Reproducir"}
            >
              {isPlaying ? "II" : "▶"}
            </button>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 w-full rounded-full bg-[color:var(--surface-1)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[color:var(--brand)] transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[color:var(--muted)]">
                <span>{isSending ? "Subiendo..." : currentLabel}</span>
                <span>{totalLabel}</span>
              </div>
            </div>
          </div>
          {audioSrc ? (
            <audio
              ref={audioRef}
              src={audioSrc}
              preload="metadata"
              controls
              className="sr-only"
              onError={() => {
                setAudioError(true);
                setIsPlaying(false);
              }}
            />
          ) : (
            <div className="mt-2 text-[11px] text-[color:var(--muted)]">Audio no disponible.</div>
          )}
          {audioError && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[color:var(--danger)]">
              <span>No se pudo reproducir el audio.</span>
              <button
                type="button"
                className="rounded-full border border-[color:rgba(244,63,94,0.7)] px-2 py-0.5 text-[10px] font-semibold hover:bg-[color:rgba(244,63,94,0.12)]"
                onClick={retryDownload}
              >
                Reintentar descarga
              </button>
            </div>
          )}
          {showTranscriptSection && (
            <div className="mt-3 border-t border-[color:var(--surface-border)] pt-2 text-xs text-[color:var(--muted)]">
              {resolvedStatus === "PENDING" && <span>Transcribiendo…</span>}
              {resolvedStatus === "FAILED" && (
                <div className="flex flex-col gap-1">
                  <span>No disponible</span>
                  {transcriptError && (
                    <span className="text-[10px] text-[color:var(--muted)]">
                      {transcriptError.length > 120 ? `${transcriptError.slice(0, 120)}…` : transcriptError}
                    </span>
                  )}
                </div>
              )}
              {resolvedStatus === "DONE" && transcriptText && (
                <div className="space-y-2">
                  <p
                    className={clsx(
                      "whitespace-pre-wrap text-[color:var(--text)]",
                      transcriptOpen ? "" : "line-clamp-2"
                    )}
                  >
                    {transcriptText}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    onClick={() => setTranscriptOpen((prev) => !prev)}
                  >
                    {transcriptOpen ? "Ocultar texto" : "Ver texto"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getContentIconName(type?: ContentType): IconName {
  if (type === "VIDEO") return "video";
  if (type === "AUDIO") return "audio";
  if (type === "TEXT") return "note";
  return "image";
}

function getVisibilityBadgeTone(label: string): BadgeTone {
  const value = label.toLowerCase();
  if (value.includes("vip")) return "warn";
  if (value.includes("extra")) return "accent";
  if (value.includes("incluido")) return "accent";
  return "muted";
}

function formatAudioTime(totalSeconds: number) {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolveAudioUrl(rawUrl: string | null | undefined, basePath?: string) {
  if (!rawUrl) return null;
  let resolved = rawUrl;
  if (resolved.startsWith("/uploads/voice-notes/")) {
    resolved = `/api/voice-notes/${resolved.slice("/uploads/voice-notes/".length)}`;
  }
  if (!basePath || basePath === "/" || !resolved.startsWith("/")) return resolved;
  if (resolved.startsWith(basePath)) return resolved;
  return `${basePath}${resolved}`;
}

function safeDecodeQueryParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
}

function IncludedContentSection({ items }: { items: IncludedContent[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--muted)]">
        Todavía no tienes contenido incluido en tu suscripción.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4">
      <div className="text-sm font-semibold text-[color:var(--text)] mb-3">Tu contenido incluido</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const visibilityLabel = getContentVisibilityLabel(item.visibility as ContentVisibility);
          const visibilityTone = getVisibilityBadgeTone(visibilityLabel);
          const iconName = getContentIconName(item.type as ContentType);
          const mediaUrl = (item.mediaPath || item.externalUrl || "").trim();
          return (
            <div
              key={item.id}
              className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 text-[color:var(--text)] flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <IconGlyph name={iconName} className="h-4 w-4 text-[color:var(--text)]" />
                <span className="truncate">{item.title}</span>
              </div>
              {item.description && (
                <p className="text-xs text-[color:var(--muted)] line-clamp-3">{item.description}</p>
              )}
              <div className="flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
                <span>{getContentTypeLabel(item.type as ContentType)}</span>
                <span className="w-1 h-1 rounded-full bg-[color:var(--muted)]" />
                <Badge tone={visibilityTone} size="sm">
                  {visibilityLabel}
                </Badge>
              </div>
              <button
                type="button"
                className="mt-1 inline-flex w-fit items-center rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--warning)] hover:border-[color:rgba(245,158,11,0.7)] hover:text-[color:var(--text)] transition"
                onClick={() => openContentLink(mediaUrl)}
              >
                Ver contenido
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function openContentLink(mediaUrl?: string) {
  const url = (mediaUrl || "").trim();
  if (url) {
    window.open(url, "_blank");
  } else {
    alert("Contenido no disponible todavía");
  }
}

function SystemMessage({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex justify-center">
      <div className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] text-[color:var(--text)]">
        {text}
      </div>
    </div>
  );
}

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[color:var(--surface-overlay)]" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pb-6 pt-4">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80" />
        {children}
      </div>
    </div>
  );
}

function normalizePriceLabel(value: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "0 €";
  if (/[€$£]/.test(trimmed)) return trimmed;
  return `${trimmed} €`;
}

function parseAmountToNumber(value: string) {
  const raw = (value || "").toString().trim();
  if (!raw) return 0;
  const normalized = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatAmountLabel(amount: number) {
  if (!Number.isFinite(amount)) return "0 €";
  const hasDecimals = Math.round(amount * 100) % 100 !== 0;
  const label = hasDecimals ? amount.toFixed(2) : amount.toFixed(0);
  return `${label} €`;
}

function buildPackDraft(pack: PackSummary) {
  const priceLabel = normalizePriceLabel(pack.price);
  return `Hola, me interesa el pack «${pack.name}» (${priceLabel}). ¿Cómo empezamos?\n\nRef pack: ${pack.id}`;
}

function getMessageSortKey(message: ApiMessage, fallbackIndex: number) {
  const raw = message.id || "";
  const parts = raw.split("-");
  const lastPart = parts[parts.length - 1];
  const timestamp = Number(lastPart);
  if (Number.isFinite(timestamp)) return timestamp;
  return fallbackIndex;
}

function reconcileMessages(
  existing: ApiMessage[],
  incoming: ApiMessage[],
  sorter: (list: ApiMessage[]) => ApiMessage[],
  targetFanId?: string
): ApiMessage[] {
  const filteredIncoming = targetFanId
    ? incoming.filter((msg) => msg.fanId === targetFanId)
    : incoming;
  if (!filteredIncoming.length) return sorter(existing);
  const map = new Map<string, ApiMessage>();
  const orderedKeys: string[] = [];
  const push = (msg: ApiMessage, fallbackIdx: number) => {
    const key = msg.id || msg.time || `incoming-${fallbackIdx}`;
    if (!map.has(key)) {
      orderedKeys.push(key);
    }
    const prev = map.get(key);
    map.set(key, { ...(prev || {}), ...msg, status: msg.status || prev?.status || "sent" });
  };
  existing.forEach((msg, idx) => push(msg, idx));
  filteredIncoming.forEach((msg, idx) => push(msg, idx + existing.length));
  const merged = orderedKeys.map((k) => map.get(k)).filter(Boolean) as ApiMessage[];
  return sorter(merged);
}

function AccessBanner({
  summary,
  contentCount = 0,
  onOpenContent,
}: {
  summary: AccessSummary;
  contentCount?: number;
  onOpenContent?: () => void;
}) {
  let containerClass = "rounded-xl border px-4 py-3";
  let titleClass = "text-sm font-semibold";
  let subtitleClass = "text-xs mt-1";

  if (summary.state === "ACTIVE") {
    containerClass += " border-[color:var(--surface-border)] bg-[color:var(--surface-1)]";
    titleClass += " text-[color:var(--text)]";
    subtitleClass += " text-[color:var(--muted)]";
  } else if (summary.state === "EXPIRED") {
    containerClass += " border-[color:var(--badge-warn-bd)] bg-[color:var(--badge-warn-bg)]";
    titleClass += " text-[color:var(--text)]";
    subtitleClass += " text-[color:var(--warning)]/80";
  } else {
    containerClass += " border-[color:var(--surface-border)] bg-[color:var(--surface-1)]";
    titleClass += " text-[color:var(--text)]";
    subtitleClass += " text-[color:var(--muted)]";
  }

  return (
    <div className={`${containerClass} flex items-start justify-between gap-3`}>
      <div>
        <div className={titleClass}>{summary.primaryLabel}</div>
        {summary.secondaryLabel && <div className={subtitleClass}>{summary.secondaryLabel}</div>}
      </div>
      {onOpenContent && contentCount > 0 && (
        <button
          type="button"
          onClick={onOpenContent}
          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          Contenido ({contentCount})
        </button>
      )}
    </div>
  );
}

export default FanChatPage;

export const getServerSideProps: GetServerSideProps<FanChatPageProps> = async (context) => {
  const fanId = typeof context.params?.fanId === "string" ? context.params.fanId : "";
  const props = await buildFanChatProps(fanId);

  return {
    props,
  };
};
