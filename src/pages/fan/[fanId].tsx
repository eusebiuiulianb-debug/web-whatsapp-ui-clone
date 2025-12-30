import Head from "next/head";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ChatComposerBar } from "../../components/ChatComposerBar";
import MessageBalloon from "../../components/MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import {
  ContentType,
  ContentVisibility,
  getContentTypeLabel,
  getContentVisibilityLabel,
} from "../../types/content";
import { AccessSummary } from "../../lib/access";
import type { IncludedContent } from "../../lib/fanContent";
import { useIsomorphicLayoutEffect } from "../../hooks/useIsomorphicLayoutEffect";
import { getFanDisplayName } from "../../utils/fanDisplayName";
import { isVisibleToFan } from "../../lib/messageAudience";
import { inferPreferredLanguage, LANGUAGE_LABELS, normalizePreferredLanguage, type SupportedLanguage } from "../../lib/language";
import { parseReactionsRaw, useReactions } from "../../lib/emoji/reactions";
import { getStickerById } from "../../lib/emoji/stickers";
import { buildFanChatProps } from "../../lib/fanChatProps";
import {
  appendExtraEvent,
  appendExtraSupportMessage,
  createExtraEventId,
  useExtraSupportMessages,
} from "../../lib/localExtras";
import { buildStickerTokenFromItem, getStickerByToken, type StickerItem } from "../../lib/stickers";

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
  type?: "TEXT" | "CONTENT" | "STICKER" | "SYSTEM";
  kind?: "system";
  subtype?: "extra_support";
  amount?: number;
  currency?: string;
  fanName?: string | null;
  ts?: number;
  meta?: {
    eventId?: string;
    originClientId?: string;
  };
  createdAt?: string | null;
  stickerId?: string | null;
  contentItem?: ApiContentItem | null;
  status?: "sending" | "failed" | "sent";
};

export type FanChatPageProps = {
  includedContent: IncludedContent[];
  initialAccessSummary: AccessSummary;
  fanIdOverride?: string;
  inviteOverride?: boolean;
  showComposer?: boolean;
};

type PackSummary = {
  id: string;
  name: string;
  price: string;
  description: string;
};

export function FanChatPage({
  includedContent,
  initialAccessSummary,
  fanIdOverride,
  inviteOverride,
  showComposer,
}: FanChatPageProps) {
  const router = useRouter();
  const fanId = useMemo(() => {
    if (fanIdOverride) return fanIdOverride;
    return typeof router.query.fanId === "string" ? router.query.fanId : undefined;
  }, [fanIdOverride, router.query.fanId]);
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
  const extraSupportMessages = useExtraSupportMessages(fanId || "");
  const handledSystemIdsRef = useRef<Set<string>>(new Set());

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
  const [giftView, setGiftView] = useState<"list" | "details">("list");
  const [selectedGiftPack, setSelectedGiftPack] = useState<PackSummary | null>(null);

  useEffect(() => {
    setAccessSummary(initialAccessSummary || null);
  }, [initialAccessSummary]);

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

  useEffect(() => {
    handledSystemIdsRef.current = new Set();
  }, [fanId]);

  useEffect(() => {
    if (!fanId || extraSupportMessages.length === 0) return;
    const handled = handledSystemIdsRef.current;
    const existingIds = new Set(messages.map((msg) => msg.id).filter(Boolean) as string[]);
    const existingEventIds = new Set(
      messages
        .map((msg) => {
          if (msg.kind !== "system" || msg.subtype !== "extra_support") return null;
          return msg.meta?.eventId || msg.id || null;
        })
        .filter(Boolean) as string[]
    );
    const incoming = extraSupportMessages
      .filter((notice) => notice.fanId === fanId)
      .filter((notice) => {
        const eventId = notice.meta?.eventId || notice.id;
        if (!eventId) return false;
        if (handled.has(eventId) || existingEventIds.has(eventId)) return false;
        if (notice.id && existingIds.has(notice.id)) return false;
        return true;
      })
      .map((notice) => ({
        id: notice.id,
        fanId,
        from: "fan" as const,
        audience: "FAN" as const,
        text: null,
        status: "sent" as const,
        type: "SYSTEM" as const,
        kind: "system" as const,
        subtype: notice.subtype,
        amount: notice.amount,
        currency: notice.currency,
        fanName: notice.fanName ?? null,
        ts: notice.ts,
        meta: notice.meta,
        createdAt: notice.createdAt,
      }));
    if (incoming.length === 0) return;
    incoming.forEach((notice) => {
      const eventId = notice.meta?.eventId || notice.id;
      if (eventId) handled.add(eventId);
    });
    setMessages((prev) => reconcileMessages(prev, incoming, sortMessages, fanId));
  }, [extraSupportMessages, fanId, messages, sortMessages]);

  const fetchMessages = useCallback(
    async (targetFanId: string, options?: { showLoading?: boolean; silent?: boolean }) => {
      if (!targetFanId) return;
      const showLoading = options?.showLoading ?? false;
      const silent = options?.silent ?? false;
      try {
        if (showLoading) setLoading(true);
        if (!silent) setError("");
        if (pollAbortRef.current) {
          pollAbortRef.current.abort();
        }
        const controller = new AbortController();
        pollAbortRef.current = controller;
        const params = new URLSearchParams({ fanId: targetFanId, audiences: "FAN,CREATOR" });
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
        if (showLoading) setLoading(false);
      }
    },
    [sortMessages]
  );

  useEffect(() => {
    if (!fanId) return;
    setMessages([]);
    fetchMessages(fanId, { showLoading: true });
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current as any);
      pollIntervalRef.current = null;
    }
    pollIntervalRef.current = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchMessages(fanId, {
        showLoading: false,
        silent: true,
      });
    }, 2500) as any;
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current as any);
      if (pollAbortRef.current) pollAbortRef.current.abort();
    };
  }, [fanId, fetchMessages]);

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
        const res = await fetch(`/api/fans?fanId=${encodeURIComponent(targetFanId)}`);
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
      } catch (_err) {
        setFanProfile({
          name: "Invitado",
          displayName: null,
          creatorLabel: null,
          preferredLanguage: getFallbackLanguage(),
        });
        setFanProfileLoaded(true);
      } finally {
        setAccessLoading(false);
      }
    },
    [getFallbackLanguage]
  );

  useEffect(() => {
    if (!fanId) return;
    fetchAccessInfo(fanId);
  }, [fanId, fetchAccessInfo]);

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
  const shouldShowComposer = showComposer !== false;

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
    setGiftView("list");
    setSelectedGiftPack(null);
    requestAnimationFrame(() => focusComposer());
  }, [focusComposer]);

  const handleTipConfirm = useCallback(() => {
    if (!fanId) return;
    const amountValue = tipAmountPreset ?? parseAmountToNumber(tipAmountCustom);
    if (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > 500) {
      setTipError("Introduce un importe válido.");
      return;
    }
    const createdAt = new Date().toISOString();
    const eventId = createExtraEventId();
    const fanName = getFanDisplayName(fanProfile);
    const fanLabel = fanName && fanName !== "Invitado" ? fanName : undefined;
    appendExtraEvent(fanId, {
      id: eventId,
      kind: "TIP",
      amount: amountValue,
      createdAt,
    });
    appendExtraSupportMessage({
      fanId,
      amount: amountValue,
      currency: "EUR",
      fanName: fanLabel,
      createdAt,
      eventId,
      sourceEventId: eventId,
    });
    closeMoneyModal();
  }, [closeMoneyModal, fanId, fanProfile, tipAmountCustom, tipAmountPreset]);

  const handleGiftConfirm = useCallback(
    (pack: PackSummary) => {
      if (!fanId) return;
      const amountValue = parseAmountToNumber(pack.price);
      const createdAt = new Date().toISOString();
      const eventId = createExtraEventId();
      const fanName = getFanDisplayName(fanProfile);
      const fanLabel = fanName && fanName !== "Invitado" ? fanName : undefined;
      appendExtraEvent(fanId, {
        id: eventId,
        kind: "GIFT",
        amount: amountValue,
        packRef: pack.id,
        packName: pack.name,
        createdAt,
      });
      appendExtraSupportMessage({
        fanId,
        amount: amountValue,
        currency: "EUR",
        fanName: fanLabel,
        createdAt,
        eventId,
        sourceEventId: eventId,
      });
      closeMoneyModal();
    },
    [closeMoneyModal, fanId, fanProfile]
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

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight - el.clientHeight,
      behavior,
    });
  };

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
  }, [fanId]);

  useIsomorphicLayoutEffect(() => {
    if (!isAtBottom) return;
    scrollToBottom("smooth");
  }, [visibleMessages.length, isAtBottom]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible" && fanId) {
        void fetchMessages(fanId, {
          showLoading: false,
          silent: true,
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fanId, fetchMessages]);

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0b141a] text-white">
      <Head>
        <title>{`Chat con ${creatorName} · NOVSY`}</title>
      </Head>

      <header className="flex items-center gap-3 px-4 py-3 bg-[#111b21] border-b border-[rgba(134,150,160,0.15)]">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#2a3942] text-white font-semibold">
          {creatorInitial}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-white font-medium text-sm">{creatorName}</span>
          <span className="text-[#8696a0] text-sm">{headerSubtitle}</span>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-sm text-rose-200 bg-rose-900/30 border-b border-rose-700/50 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            className="rounded-full border border-rose-300/70 px-3 py-1 text-xs font-semibold hover:bg-rose-800/30"
            onClick={() => fanId && fetchMessages(fanId, { showLoading: true })}
          >
            Reintentar
          </button>
        </div>
      )}

      <main className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="px-4 sm:px-6 pt-3 space-y-3 shrink-0">
          {accessLoading && !accessSummary ? (
            <div className="rounded-xl border border-slate-800 bg-[#0f1f26] px-4 py-3 text-sm text-slate-200">
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
        <ChatThread
          containerRef={messagesContainerRef}
          messages={visibleMessages}
          loading={loading}
          error={error}
          reactionsStore={reactionsStore}
          fanId={fanId}
        />

        {isOnboardingVisible && (
          <div className="px-4 pb-3">
            <div className="rounded-xl border border-slate-700 bg-[#162028] px-4 py-3 space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Una cosa rápida</p>
                <p className="text-xs text-slate-300">Así el creador puede dirigirse a ti por tu nombre.</p>
              </div>
              <label className="flex flex-col gap-1 text-sm text-slate-200">
                <span>¿Cómo te llamas?</span>
                <input
                  className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                  value={onboardingName}
                  onChange={(evt) => setOnboardingName(evt.target.value)}
                  placeholder="Tu nombre"
                  disabled={onboardingSaving}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-200">
                <span>Idioma</span>
                <select
                  className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
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
              <label className="flex flex-col gap-1 text-sm text-slate-200">
                <span>Tu primer mensaje</span>
                <textarea
                  className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400 h-20"
                  value={onboardingMessage}
                  onChange={(evt) => setOnboardingMessage(evt.target.value)}
                  placeholder="Ej: Hola, quería preguntarte..."
                  disabled={onboardingSaving}
                />
              </label>
              {onboardingError && <p className="text-xs text-rose-300">{onboardingError}</p>}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-60"
                  onClick={handleOnboardingSkip}
                  disabled={onboardingSaving}
                >
                  Omitir
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-emerald-400/70 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
                  onClick={() => void handleOnboardingEnter()}
                  disabled={onboardingSaving}
                >
                  {onboardingSaving ? "Entrando..." : "Entrar"}
                </button>
              </div>
            </div>
          </div>
        )}
        {!isOnboardingVisible && shouldShowComposer && (
          <div className="shrink-0 border-t border-slate-800/60 bg-gradient-to-b from-slate-950/90 via-slate-950/80 to-slate-950/70 backdrop-blur-xl">
            <div className="px-4 sm:px-6 py-3">
              <div
                className="flex flex-col gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/60 px-3 py-2.5 shadow-[0_-12px_22px_-16px_rgba(0,0,0,0.55)] focus-within:border-emerald-400/70 focus-within:ring-1 focus-within:ring-emerald-400/25"
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
                  showEmoji
                  onEmojiSelect={handleEmojiSelect}
                  showStickers
                  onStickerSelect={handleStickerSelect}
                />
              </div>
              {sendError && <div className="pt-2 text-sm text-rose-300">{sendError}</div>}
            </div>
          </div>
        )}
      </main>
      <BottomSheet open={actionMenuOpen} onClose={closeActionMenu}>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Acciones rápidas</h3>
            <p className="text-xs text-slate-400">Elige una acción para continuar.</p>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={openTipModal}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 hover:bg-slate-800/70"
            >
              <span>Apoyar / Propina</span>
              <span className="text-xs text-slate-400">Simulación</span>
            </button>
            <button
              type="button"
              onClick={openPacksSheet}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 hover:bg-slate-800/70"
            >
              <span>Ver packs</span>
              <span className="text-xs text-slate-400">{availablePacks.length}</span>
            </button>
            <button
              type="button"
              onClick={openGiftModal}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 hover:bg-slate-800/70"
            >
              <span>Regalo</span>
              <span className="text-xs text-slate-400">Simulación</span>
            </button>
          </div>
        </div>
      </BottomSheet>
      <BottomSheet open={contentSheetOpen} onClose={closeContentSheet}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Contenido y packs</h3>
            <p className="text-xs text-slate-400">Todo dentro del chat.</p>
          </div>
          <button
            type="button"
            onClick={closeContentSheet}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/70"
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
                  ? "bg-emerald-500/20 text-emerald-100 border border-emerald-400/70"
                  : "border border-slate-800 text-slate-300 hover:text-slate-100"
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
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
                Todavía no tienes contenido incluido.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {availablePacks.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
                No hay packs públicos todavía.
              </div>
            )}
            {packView === "list" &&
              availablePacks.map((pack) => (
                <div key={pack.id} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{pack.name}</p>
                      <p className="text-xs text-slate-400">{pack.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-amber-300">{normalizePriceLabel(pack.price)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePackRequest(pack)}
                      className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
                    >
                      Pedir
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPack(pack);
                        setPackView("details");
                      }}
                      className="rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70"
                    >
                      Ver pack
                    </button>
                  </div>
                </div>
              ))}
            {packView === "details" && selectedPack && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{selectedPack.name}</p>
                    <p className="text-xs text-slate-400">{selectedPack.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-amber-300">{normalizePriceLabel(selectedPack.price)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePackRequest(selectedPack)}
                    className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
                  >
                    Pedir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPackView("list");
                      setSelectedPack(null);
                    }}
                    className="rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70"
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
            <h3 className="text-base font-semibold text-slate-100">Apoyar / Propina</h3>
            <p className="text-xs text-slate-400">Elige un importe.</p>
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
                    ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
                    : "border-slate-700 text-slate-200 hover:bg-slate-800/70"
                }`}
              >
                {amount} €
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-300">Otro importe</label>
            <input
              type="number"
              min={1}
              max={500}
              inputMode="decimal"
              className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
              placeholder="Otro importe"
              value={tipAmountCustom}
              onChange={(event) => {
                setTipAmountCustom(event.target.value);
                setTipAmountPreset(null);
                setTipError("");
              }}
            />
          </div>
          {tipError && <p className="text-xs text-rose-300">{tipError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeMoneyModal}
              className="rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleTipConfirm}
              className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
            >
              Enviar propina
            </button>
          </div>
        </div>
      </BottomSheet>
      <BottomSheet open={moneyModal === "gift"} onClose={closeMoneyModal}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Regalo</h3>
            <p className="text-xs text-slate-400">Elige qué quieres regalar.</p>
          </div>
          <button
            type="button"
            onClick={closeMoneyModal}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/70"
          >
            Cerrar
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {giftView === "list" && availablePacks.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
              No hay packs disponibles para regalar.
            </div>
          )}
          {giftView === "list" &&
            availablePacks.map((pack) => (
              <div key={`gift-${pack.id}`} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{pack.name}</p>
                    <p className="text-xs text-slate-400">{pack.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-amber-300">{normalizePriceLabel(pack.price)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGiftConfirm(pack)}
                    className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
                  >
                    Regalar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGiftPack(pack);
                      setGiftView("details");
                    }}
                    className="rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70"
                  >
                    Ver pack
                  </button>
                </div>
              </div>
            ))}
          {giftView === "details" && selectedGiftPack && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{selectedGiftPack.name}</p>
                  <p className="text-xs text-slate-400">{selectedGiftPack.description}</p>
                </div>
                <span className="text-sm font-semibold text-amber-300">{normalizePriceLabel(selectedGiftPack.price)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGiftConfirm(selectedGiftPack)}
                  className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
                >
                  Regalar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGiftView("list");
                    setSelectedGiftPack(null);
                  }}
                  className="rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70"
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
  const emoji = getContentEmoji(content?.type);
  const alignItems = message.from === "fan" ? "items-end" : "items-start";
  const mediaUrl = (content?.mediaPath || content?.externalUrl || "").trim();

  const badgeClass = (() => {
    if (visibilityLabel.toLowerCase().includes("vip")) return "border-amber-400/80 text-amber-200";
    if (visibilityLabel.toLowerCase().includes("extra")) return "border-sky-400/70 text-sky-200";
    if (visibilityLabel.toLowerCase().includes("incluido")) return "border-emerald-400/70 text-emerald-200";
    return "border-slate-600 text-slate-200";
  })();

  return (
    <div className={`flex flex-col ${alignItems} w-full h-max`}>
      <div className="flex flex-col min-w-[5%] max-w-[70%] bg-[#202c33] border border-slate-800 p-3 text-white rounded-lg mb-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">{emoji}</span>
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-1">
          <span>{typeLabel}</span>
          {visibilityLabel && <span className="w-1 h-1 rounded-full bg-slate-600" />}
          {visibilityLabel && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${badgeClass}`}>
              {visibilityLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className="mt-2 inline-flex w-fit items-center rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-amber-200 hover:border-amber-400/70 hover:text-amber-100 transition"
          onClick={() => openContentLink(mediaUrl)}
        >
          Ver contenido
        </button>
        <div className="flex justify-end items-center gap-2 text-[hsla(0,0%,100%,0.6)] text-xs mt-2">
          <span>{message.time || ""}</span>
          {message.from === "fan" && message.isLastFromCreator ? (
            <span className="text-[#8edafc] text-[11px]">✔✔ Visto</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getContentEmoji(type?: ContentType) {
  if (type === "VIDEO") return "🎥";
  if (type === "AUDIO") return "🎧";
  if (type === "TEXT") return "📝";
  return "📷";
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
      <div className="rounded-xl border border-slate-800 bg-[#111b21] px-4 py-3 text-sm text-slate-300">
        Todavía no tienes contenido incluido en tu suscripción.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f1f26] px-4 py-4">
      <div className="text-sm font-semibold text-white mb-3">Tu contenido incluido</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const visibilityLabel = getContentVisibilityLabel(item.visibility as ContentVisibility);
          const badgeClass = visibilityLabel.toLowerCase().includes("incluido")
            ? "border-emerald-400/70 text-emerald-200"
            : "border-slate-600 text-slate-200";
          const emoji = getContentEmoji(item.type as ContentType);
          const mediaUrl = (item.mediaPath || item.externalUrl || "").trim();
          return (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800 bg-[#202c33] p-3 text-white flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-lg">{emoji}</span>
                <span className="truncate">{item.title}</span>
              </div>
              {item.description && (
                <p className="text-xs text-slate-300 line-clamp-3">{item.description}</p>
              )}
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <span>{getContentTypeLabel(item.type as ContentType)}</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${badgeClass}`}>
                  {visibilityLabel}
                </span>
              </div>
              <button
                type="button"
                className="mt-1 inline-flex w-fit items-center rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-amber-200 hover:border-amber-400/70 hover:text-amber-100 transition"
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

function resolveSystemMessageText(message: ApiMessage): string {
  if (message.kind === "system" && message.subtype === "extra_support" && Number.isFinite(message.amount)) {
    const amountLabel = formatAmountLabel(message.amount ?? 0);
    return `🎁 Has apoyado con ${amountLabel}`;
  }
  return message.text || "";
}

function SystemMessage({ message }: { message: ApiMessage }) {
  const text = resolveSystemMessageText(message);
  if (!text) return null;
  return (
    <div className="flex justify-center">
      <div className="system-notice rounded-full border border-slate-700/70 bg-slate-900/70 px-3 py-1 text-[11px] text-slate-200">
        {text}
      </div>
    </div>
  );
}

function ChatThread({
  containerRef,
  messages,
  loading,
  error,
  reactionsStore,
  fanId,
}: {
  containerRef: RefObject<HTMLDivElement>;
  messages: ApiMessage[];
  loading: boolean;
  error: string;
  reactionsStore: ReturnType<typeof parseReactionsRaw>;
  fanId?: string;
}) {
  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto">
      <div
        className="px-4 sm:px-6 py-4"
        style={{ backgroundImage: "url('/assets/images/background.jpg')" }}
      >
        <div className="min-h-full flex flex-col justify-end gap-2">
          {loading && <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>}
          {error && !loading && <div className="text-center text-red-400 text-sm mt-2">{error}</div>}
          {!loading && !error && messages.length === 0 && (
            <div className="text-center text-[#aebac1] text-sm mt-2">Aún no hay mensajes.</div>
          )}
          {messages.map((msg, idx) => {
            const messageId = msg.id || `message-${idx}`;
            const isContent = msg.type === "CONTENT" && !!msg.contentItem;
            if (isContent) {
              return <ContentCard key={msg.id} message={msg} />;
            }
            if (msg.kind === "system" || msg.type === "SYSTEM") {
              return <SystemMessage key={messageId} message={msg} />;
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-slate-800 bg-[#0f1720] px-4 pb-6 pt-4">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-700/80" />
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
  if (message.kind === "system" && typeof message.ts === "number" && Number.isFinite(message.ts)) {
    return message.ts;
  }
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
    containerClass += " border-slate-800 bg-[#0f1f26]";
    titleClass += " text-white";
    subtitleClass += " text-slate-300";
  } else if (summary.state === "EXPIRED") {
    containerClass += " border-amber-500/40 bg-[#2a1f1a]";
    titleClass += " text-amber-100";
    subtitleClass += " text-amber-200/80";
  } else {
    containerClass += " border-slate-800 bg-[#111b21]";
    titleClass += " text-white";
    subtitleClass += " text-slate-300";
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
          className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-800/80"
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
