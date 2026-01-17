import Head from "next/head";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChatComposerBar } from "../../components/ChatComposerBar";
import MessageBalloon, { splitOffer, type OfferMeta } from "../../components/MessageBalloon";
import { EmojiPicker } from "../../components/EmojiPicker";
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
import { getStickerById } from "../../lib/emoji/stickers";
import { buildFanChatProps } from "../../lib/fanChatProps";
import { generateClientTxnId } from "../../lib/clientTxn";
import { emitPurchaseCreated } from "../../lib/events";
import { recordDevRequest } from "../../lib/devRequestStats";
import {
  FAN_DRAFT_PREVIEW_THROTTLE_MS,
  isFanDraftPreviewEnabled,
  normalizeFanDraftText,
} from "../../lib/fanDraftPreview";
import { buildStickerTokenFromItem, getStickerByToken, type StickerItem } from "../../lib/stickers";
import { useVoiceRecorder } from "../../lib/useVoiceRecorder";
import { readEmojiRecents, recordEmojiRecent } from "../../lib/emoji/recents";
import { IconGlyph, type IconName } from "../../components/ui/IconGlyph";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { applyOptimisticReaction, getMineEmoji, type ReactionSummaryEntry } from "../../lib/messageReactions";
import { useEmojiFavorites } from "../../hooks/useEmojiFavorites";
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
  originalText?: string | null;
  originalLang?: string | null;
  deliveredText?: string | null;
  deliveredLang?: string | null;
  creatorTranslatedText?: string | null;
  creatorLang?: string | null;
  time?: string | null;
  isLastFromCreator?: boolean | null;
  type?: "TEXT" | "CONTENT" | "STICKER" | "SYSTEM" | "AUDIO" | "VOICE";
  stickerId?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  audioMime?: string | null;
  audioSizeBytes?: number | null;
  contentItem?: ApiContentItem | null;
  reactionsSummary?: ReactionSummaryEntry[];
  status?: "sending" | "failed" | "sent";
};

export type FanChatPageProps = {
  includedContent: IncludedContent[];
  initialAccessSummary: AccessSummary;
  adultConfirmedAt?: string | null;
  adultConfirmVersion?: string | null;
  adultGatePolicy?: "STRICT" | "LEAD_CAPTURE";
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

type PackStatus = "LOCKED" | "UNLOCKED" | "ACTIVE";
type AdultGatePolicy = "STRICT" | "LEAD_CAPTURE";

type VoiceUploadPayload = {
  blob: Blob;
  base64: string;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
};

const VOICE_MAX_DURATION_MS = 120_000;
const VOICE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const VOICE_MIN_SIZE_BYTES = 2 * 1024;
const VOICE_MIME_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
];
const TYPING_START_THROTTLE_MS = 800;
const TYPING_DRAFT_THROTTLE_MS = FAN_DRAFT_PREVIEW_THROTTLE_MS;
const TYPING_STOP_IDLE_MS = 1200;
const TYPING_HIDE_MS = 7000;
const FAN_DRAFT_PREVIEW_ENABLED = isFanDraftPreviewEnabled();
const WALLET_TOPUP_PRESETS = [1000, 2500, 5000];

const PACK_TYPE_TOKENS: Record<"trial" | "monthly" | "special", string[]> = {
  trial: ["trial", "welcome", "bienvenida", "prueba"],
  monthly: ["monthly", "mensual"],
  special: ["special", "especial", "pareja"],
};

function resolvePackTypeFromLabel(id: string, name: string): "trial" | "monthly" | "special" | null {
  const haystack = `${id} ${name}`.toLowerCase();
  if (PACK_TYPE_TOKENS.monthly.some((token) => haystack.includes(token))) return "monthly";
  if (PACK_TYPE_TOKENS.special.some((token) => haystack.includes(token))) return "special";
  if (PACK_TYPE_TOKENS.trial.some((token) => haystack.includes(token))) return "trial";
  return null;
}

function normalizeAdultGatePolicy(value?: string | null): AdultGatePolicy {
  if (typeof value === "string" && value.trim().toUpperCase() === "LEAD_CAPTURE") {
    return "LEAD_CAPTURE";
  }
  return "STRICT";
}

export function FanChatPage({
  includedContent,
  initialAccessSummary,
  adultConfirmedAt: initialAdultConfirmedAt,
  adultConfirmVersion: initialAdultConfirmVersion,
  adultGatePolicy,
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
  const creatorFirstName = creatorName.trim().split(" ")[0] || creatorName;
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
  const availablePackIds = useMemo(() => new Set(availablePacks.map((pack) => pack.id)), [availablePacks]);

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [accessSummary, setAccessSummary] = useState<AccessSummary | null>(initialAccessSummary || null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState("EUR");
  const [walletEnabled, setWalletEnabled] = useState<boolean | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletTopupOpen, setWalletTopupOpen] = useState(false);
  const [walletTopupLoading, setWalletTopupLoading] = useState(false);
  const [walletTopupError, setWalletTopupError] = useState("");
  const [walletTopupAmount, setWalletTopupAmount] = useState<number | null>(null);
  const [walletTopupCustom, setWalletTopupCustom] = useState("");
  const walletTopupTxnRef = useRef<string | null>(null);
  const walletTopupAmountRef = useRef<number | null>(null);
  const [included, setIncluded] = useState<IncludedContent[]>(includedContent || []);
  const [fanProfile, setFanProfile] = useState<{
    name?: string | null;
    displayName?: string | null;
    creatorLabel?: string | null;
    preferredLanguage?: SupportedLanguage | null;
  }>({});
  const [adultConfirmedAt, setAdultConfirmedAt] = useState<string | null>(
    typeof initialAdultConfirmedAt === "string" ? initialAdultConfirmedAt : null
  );
  const [, setAdultConfirmVersion] = useState<string | null>(
    typeof initialAdultConfirmVersion === "string" ? initialAdultConfirmVersion : null
  );
  const [adultStatusLoaded, setAdultStatusLoaded] = useState(
    typeof initialAdultConfirmedAt !== "undefined" || typeof initialAdultConfirmVersion !== "undefined"
  );
  const [adultConfirming, setAdultConfirming] = useState(false);
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
  const reactionInFlightRef = useRef<Set<string>>(new Set());
  const [creatorTyping, setCreatorTyping] = useState<{ isTyping: boolean; ts: number }>({
    isTyping: false,
    ts: 0,
  });
  const typingStateRef = useRef<{ isTyping: boolean; lastStartAt: number }>({
    isTyping: false,
    lastStartAt: 0,
  });
  const typingStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const draftSendTimerRef = useRef<NodeJS.Timeout | null>(null);
  const draftSendStateRef = useRef<{ lastSentAt: number; lastSentText: string; pendingText: string }>({
    lastSentAt: 0,
    lastSentText: "",
    pendingText: "",
  });
  const lastCreatorMessageIdRef = useRef<string | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [contentSheetOpen, setContentSheetOpen] = useState(false);
  const [contentSheetTab, setContentSheetTab] = useState<"content" | "packs">("content");
  const [packStatusById, setPackStatusById] = useState<Record<string, PackStatus>>({});
  const [packPurchase, setPackPurchase] = useState<PackSummary | null>(null);
  const [packPurchasingIds, setPackPurchasingIds] = useState<Set<string>>(() => new Set());
  const packPurchasingIdsRef = useRef<Set<string>>(new Set());
  const packTxnByIdRef = useRef<Record<string, string>>({});
  const packAccessFetchedRef = useRef(false);
  const [packAccessLoading, setPackAccessLoading] = useState(false);
  const [moneyModal, setMoneyModal] = useState<null | "tip" | "gift">(null);
  const [tipAmountPreset, setTipAmountPreset] = useState<number | null>(null);
  const [tipAmountCustom, setTipAmountCustom] = useState("");
  const [tipError, setTipError] = useState("");
  const [giftError, setGiftError] = useState("");
  const [giftView, setGiftView] = useState<"list" | "details">("list");
  const [selectedGiftPack, setSelectedGiftPack] = useState<PackSummary | null>(null);
  const [unlockedOfferIds, setUnlockedOfferIds] = useState<Set<string>>(() => new Set());
  const [unlockingOfferIds, setUnlockingOfferIds] = useState<Set<string>>(() => new Set());
  const unlockingOfferIdsRef = useRef<Set<string>>(new Set());
  const purchaseTxnByOfferIdRef = useRef<Record<string, string>>({});
  const [unlockOffer, setUnlockOffer] = useState<OfferMeta | null>(null);
  const [fanToast, setFanToast] = useState("");
  const fanToastTimerRef = useRef<number | null>(null);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const supportSubmitRef = useRef(false);
  const supportTxnRef = useRef<string | null>(null);
  const [isVoiceUploading, setIsVoiceUploading] = useState(false);
  const [voiceUploadError, setVoiceUploadError] = useState("");
  const [voiceRetryPayload, setVoiceRetryPayload] = useState<VoiceUploadPayload | null>(null);
  const {
    isRecording: isVoiceRecording,
    recordingMs: voiceRecordingMs,
    start: startVoiceRecorder,
    stop: stopVoiceRecorder,
    cancel: cancelVoiceRecorder,
    reset: resetVoiceRecorder,
  } = useVoiceRecorder({ mimePreferences: VOICE_MIME_PREFERENCES });
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

  const shouldPromptForName = inviteFlag
    ? !fanProfile.displayName
    : getFanDisplayName(fanProfile) === "Invitado";
  const isOnboardingVisible =
    fanProfileLoaded &&
    !onboardingDismissed &&
    !loading &&
    visibleMessages.length === 0 &&
    shouldPromptForName;
  const resolvedAdultGatePolicy = normalizeAdultGatePolicy(adultGatePolicy);
  const isAdultGateActive = adultStatusLoaded && !adultConfirmedAt;
  const isAdultGateStrict = isAdultGateActive && resolvedAdultGatePolicy === "STRICT";
  const isAdultGateLeadCapture = isAdultGateActive && resolvedAdultGatePolicy === "LEAD_CAPTURE";
  const isAdultGatePurchaseBlocked = isAdultGateLeadCapture;
  const isComposerDisabled = sending || isOnboardingVisible || onboardingSaving || isAdultGateStrict;

  const showFanToast = useCallback((message: string) => {
    setFanToast(message);
    if (fanToastTimerRef.current) {
      window.clearTimeout(fanToastTimerRef.current);
    }
    fanToastTimerRef.current = window.setTimeout(() => setFanToast(""), 2200);
  }, []);

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

  const handleReactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!messageId) return;
      if (reactionInFlightRef.current.has(messageId)) return;
      reactionInFlightRef.current.add(messageId);
      let previousSummary: ReactionSummaryEntry[] | null = null;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          previousSummary = Array.isArray(msg.reactionsSummary) ? msg.reactionsSummary : [];
          return { ...msg, reactionsSummary: applyOptimisticReaction(previousSummary, emoji) };
        })
      );
      try {
        const res = await fetch("/api/messages/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, emoji }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !Array.isArray(data.reactionsSummary)) {
          throw new Error("No se pudo reaccionar");
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, reactionsSummary: data.reactionsSummary } : msg
          )
        );
      } catch (_err) {
        if (previousSummary) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, reactionsSummary: previousSummary ?? [] } : msg
            )
          );
        }
      } finally {
        reactionInFlightRef.current.delete(messageId);
      }
    },
    []
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

  const updateUnlockedOfferIdsFromPackStatus = useCallback(
    (nextStatusById: Record<string, PackStatus>) => {
      if (!availablePacks.length || Object.keys(nextStatusById).length === 0) return;
      setUnlockedOfferIds((prev) => {
        const next = new Set(prev);
        availablePacks.forEach((pack) => {
          const status = nextStatusById[pack.id];
          if (status === "UNLOCKED" || status === "ACTIVE") {
            next.add(pack.id);
          } else if (status === "LOCKED") {
            next.delete(pack.id);
          }
        });
        return next;
      });
    },
    [availablePacks]
  );

  const updateUnlockedOfferIdsFromPackList = useCallback(
    (unlockedPacks: string[]) => {
      if (!availablePacks.length) return;
      const unlockedSet = new Set(unlockedPacks);
      setUnlockedOfferIds((prev) => {
        const next = new Set(prev);
        availablePacks.forEach((pack) => {
          if (unlockedSet.has(pack.id)) {
            next.add(pack.id);
          } else {
            next.delete(pack.id);
          }
        });
        return next;
      });
    },
    [availablePacks]
  );

  const applyWalletSnapshot = useCallback(
    (snapshot: { enabled?: unknown; currency?: unknown; balanceCents?: unknown } | null | undefined) => {
      if (!snapshot || typeof snapshot !== "object") return;
      const enabledRaw = (snapshot as { enabled?: unknown }).enabled;
      const enabled = typeof enabledRaw === "boolean" ? enabledRaw : null;
      if (enabled !== null) {
        setWalletEnabled(enabled);
        if (!enabled) {
          setWalletBalanceCents(null);
          return;
        }
      }
      const currency =
        typeof snapshot.currency === "string" && snapshot.currency.trim()
          ? snapshot.currency.trim().toUpperCase()
          : null;
      const balanceRaw = snapshot.balanceCents;
      const balance =
        typeof balanceRaw === "number" && Number.isFinite(balanceRaw) ? Math.max(0, Math.round(balanceRaw)) : null;
      if (currency) setWalletCurrency(currency);
      if (balance !== null) {
        setWalletBalanceCents(balance);
        if (enabled === null) {
          setWalletEnabled(true);
        }
      }
    },
    []
  );

  const applyWalletPayload = useCallback(
    (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const wallet = (payload as { wallet?: unknown }).wallet;
      applyWalletSnapshot(wallet as { enabled?: unknown; currency?: unknown; balanceCents?: unknown } | null | undefined);
    },
    [applyWalletSnapshot]
  );

  const fetchWallet = useCallback(
    async (targetFanId: string) => {
      if (!targetFanId) return;
      setWalletLoading(true);
      try {
        const res = await fetch(`/api/fans/${encodeURIComponent(targetFanId)}/wallet`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "wallet_error");
        }
        const enabled =
          typeof (data as { enabled?: unknown }).enabled === "boolean"
            ? (data as { enabled?: boolean }).enabled ?? null
            : null;
        if (enabled === false) {
          setWalletEnabled(false);
          setWalletBalanceCents(null);
          return;
        }
        if (enabled === true) {
          setWalletEnabled(true);
          applyWalletSnapshot({
            enabled: true,
            currency: (data as { currency?: unknown }).currency,
            balanceCents: (data as { balanceCents?: unknown }).balanceCents,
          });
          return;
        }
        applyWalletPayload(data);
      } catch (_err) {
        // Silent failure; wallet can retry on next interaction.
      } finally {
        setWalletLoading(false);
      }
    },
    [applyWalletPayload, applyWalletSnapshot]
  );

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
        const confirmedAtValue =
          typeof target?.adultConfirmedAt === "string"
            ? target.adultConfirmedAt
            : target?.adultConfirmedAt instanceof Date
            ? target.adultConfirmedAt.toISOString()
            : null;
        setAdultConfirmedAt(confirmedAtValue);
        setAdultConfirmVersion(typeof target?.adultConfirmVersion === "string" ? target.adultConfirmVersion : null);
        setAdultStatusLoaded(true);
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
      setAdultConfirmedAt(null);
      setAdultConfirmVersion(null);
      setAdultStatusLoaded(true);
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

  const refreshAccessAndContent = useCallback(async (targetFanId: string) => {
    try {
      const res = await fetch(`/api/fans/${encodeURIComponent(targetFanId)}/access`, { cache: "no-store" });
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const summary = data?.accessSummary ?? null;
      if (summary) {
        setAccessSummary(summary as AccessSummary);
      }
      const items = Array.isArray(data?.includedContent) ? (data.includedContent as IncludedContent[]) : null;
      if (items) {
        setIncluded(items);
      }
      const nextPackStatus =
        data?.packStatusById && typeof data.packStatusById === "object"
          ? (data.packStatusById as Record<string, PackStatus>)
          : null;
      if (nextPackStatus && Object.keys(nextPackStatus).length > 0) {
        setPackStatusById(nextPackStatus);
        packAccessFetchedRef.current = true;
      }
      if (Array.isArray(data?.unlockedPacks)) {
        updateUnlockedOfferIdsFromPackList(data.unlockedPacks as string[]);
      }
      return { ok: true, includedCount: items ? items.length : 0 };
    } catch (_err) {
      return { ok: false, includedCount: 0 };
    }
  }, [updateUnlockedOfferIdsFromPackList]);

  const refreshPackAccess = useCallback(async () => {
    if (!fanId || packAccessLoading) return;
    setPackAccessLoading(true);
    try {
      const result = await refreshAccessAndContent(fanId);
      if (result.ok) {
        packAccessFetchedRef.current = true;
      }
    } finally {
      setPackAccessLoading(false);
    }
  }, [fanId, packAccessLoading, refreshAccessAndContent]);

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
    if (!fanId) return;
    void fetchWallet(fanId);
  }, [fanId, fetchWallet]);

  useEffect(() => {
    if (walletEnabled !== false) return;
    setWalletTopupOpen(false);
    setWalletTopupLoading(false);
    setWalletTopupError("");
    setWalletTopupAmount(null);
    setWalletTopupCustom("");
    walletTopupTxnRef.current = null;
    walletTopupAmountRef.current = null;
  }, [walletEnabled]);

  useEffect(() => {
    if (!contentSheetOpen || contentSheetTab !== "packs") return;
    if (packAccessFetchedRef.current) return;
    void refreshPackAccess();
  }, [contentSheetOpen, contentSheetTab, refreshPackAccess]);

  useEffect(() => {
    setFanProfile({});
    setFanProfileLoaded(false);
    setAdultConfirmedAt(typeof initialAdultConfirmedAt === "string" ? initialAdultConfirmedAt : null);
    setAdultConfirmVersion(typeof initialAdultConfirmVersion === "string" ? initialAdultConfirmVersion : null);
    setAdultStatusLoaded(
      typeof initialAdultConfirmedAt !== "undefined" || typeof initialAdultConfirmVersion !== "undefined"
    );
    setAdultConfirming(false);
    setOnboardingDismissed(false);
    setOnboardingName("");
    setOnboardingMessage("");
    setOnboardingError("");
    setOnboardingSaving(false);
    setOnboardingLanguage(getFallbackLanguage());
    setUnlockedOfferIds(new Set());
    const resetUnlocking = new Set<string>();
    unlockingOfferIdsRef.current = resetUnlocking;
    setUnlockingOfferIds(resetUnlocking);
    setUnlockOffer(null);
    setFanToast("");
    if (fanToastTimerRef.current) {
      window.clearTimeout(fanToastTimerRef.current);
      fanToastTimerRef.current = null;
    }
    purchaseTxnByOfferIdRef.current = {};
    packTxnByIdRef.current = {};
    packPurchasingIdsRef.current = new Set();
    setPackPurchasingIds(new Set());
    setPackPurchase(null);
    setPackStatusById({});
    setPackAccessLoading(false);
    packAccessFetchedRef.current = false;
    setWalletBalanceCents(null);
    setWalletCurrency("EUR");
    setWalletEnabled(null);
    setWalletLoading(false);
    setWalletTopupOpen(false);
    setWalletTopupLoading(false);
    setWalletTopupError("");
    setWalletTopupAmount(null);
    setWalletTopupCustom("");
    walletTopupTxnRef.current = null;
    walletTopupAmountRef.current = null;
  }, [fanId, getFallbackLanguage, initialAdultConfirmedAt, initialAdultConfirmVersion]);

  useEffect(() => {
    if (Object.keys(packStatusById).length === 0) return;
    updateUnlockedOfferIdsFromPackStatus(packStatusById);
  }, [packStatusById, updateUnlockedOfferIdsFromPackStatus]);

  useEffect(() => {
    if (!messages.length) return;
    setUnlockedOfferIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      messages.forEach((msg) => {
        const rawText = typeof msg.text === "string" ? msg.text : "";
        if (!rawText) return;
        const { textVisible, offerMeta } = splitOffer(rawText);
        if (offerMeta?.kind !== "ppv") return;
        if (!textVisible.trim()) return;
        if (!next.has(offerMeta.id)) {
          next.add(offerMeta.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [messages]);

  const markOfferUnlocked = useCallback((offerId: string) => {
    if (!offerId) return;
    setUnlockedOfferIds((prev) => {
      if (prev.has(offerId)) return prev;
      const next = new Set(prev);
      next.add(offerId);
      return next;
    });
  }, []);

  useEffect(() => {
    setCreatorTyping({ isTyping: false, ts: 0 });
    lastCreatorMessageIdRef.current = null;
    if (!fanId || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/realtime/stream?fanId=${encodeURIComponent(fanId)}`);
    const handleTyping = (event: Event) => {
      const data = (event as MessageEvent).data;
      if (typeof data !== "string") return;
      try {
        const parsed = JSON.parse(data) as {
          conversationId?: unknown;
          fanId?: unknown;
          isTyping?: unknown;
          senderRole?: unknown;
          ts?: unknown;
        };
        const conversationId =
          typeof parsed.conversationId === "string" ? parsed.conversationId.trim() : "";
        const targetFanId = typeof parsed.fanId === "string" ? parsed.fanId.trim() : "";
        const isTyping = typeof parsed.isTyping === "boolean" ? parsed.isTyping : null;
        const senderRole =
          parsed.senderRole === "creator" || parsed.senderRole === "fan" ? parsed.senderRole : null;
        if (!conversationId && !targetFanId) return;
        if (conversationId !== fanId && targetFanId !== fanId) return;
        if (senderRole !== "creator" || isTyping === null) return;
        const ts = typeof parsed.ts === "number" ? parsed.ts : Date.now();
        setCreatorTyping({ isTyping, ts });
      } catch (_err) {
        // ignore parse errors
      }
    };
    const handlePpv = (event: Event) => {
      const data = (event as MessageEvent).data;
      if (typeof data !== "string") return;
      try {
        const parsed = JSON.parse(data) as { message?: ApiMessage };
        const rawMessage = parsed?.message;
        if (!rawMessage || rawMessage.fanId !== fanId) return;
        setMessages((prev) => reconcileMessages(prev, [rawMessage], sortMessages, fanId));
        const rawText = typeof rawMessage.text === "string" ? rawMessage.text : "";
        const { textVisible, offerMeta } = splitOffer(rawText);
        if (offerMeta?.kind === "ppv" && textVisible.trim()) {
          markOfferUnlocked(offerMeta.id);
        }
      } catch (_err) {
        // ignore parse errors
      }
    };
    source.addEventListener("typing", handleTyping as EventListener);
    source.addEventListener("ppv", handlePpv as EventListener);
    source.onerror = () => {
      // EventSource reconnects automatically.
    };
    return () => {
      source.removeEventListener("typing", handleTyping as EventListener);
      source.removeEventListener("ppv", handlePpv as EventListener);
      source.close();
    };
  }, [fanId, markOfferUnlocked, sortMessages]);

  useEffect(() => {
    if (!creatorTyping.isTyping) return;
    const now = Date.now();
    const waitMs = Math.max(0, TYPING_HIDE_MS - (now - creatorTyping.ts));
    const timer = window.setTimeout(() => {
      setCreatorTyping((prev) => (prev.isTyping ? { ...prev, isTyping: false } : prev));
    }, waitMs);
    return () => window.clearTimeout(timer);
  }, [creatorTyping.isTyping, creatorTyping.ts]);

  useEffect(() => {
    const latestCreatorMessage = [...messages]
      .reverse()
      .find((msg) => msg.from === "creator");
    const latestId = latestCreatorMessage?.id ?? null;
    if (!latestId || latestId === lastCreatorMessageIdRef.current) return;
    lastCreatorMessageIdRef.current = latestId;
    setCreatorTyping((prev) => (prev.isTyping ? { ...prev, isTyping: false } : prev));
  }, [messages]);

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
        if (isAdultGateLeadCapture) {
          showFanToast("Mensaje enviado. Confirma 18+ para ver respuestas.");
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
    [fanId, isAdultGateLeadCapture, showFanToast, sortMessages]
  );

  const sendTypingSignal = useCallback(
    (isTyping: boolean, draftText?: string) => {
      if (!fanId) return;
      const payload = {
        conversationId: fanId,
        isTyping,
        senderRole: "fan",
        ...(draftText !== undefined ? { draftText } : {}),
      };
      void fetch("/api/realtime/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [fanId]
  );

  const flushDraftPreview = useCallback(() => {
    if (!FAN_DRAFT_PREVIEW_ENABLED) return;
    const pending = draftSendStateRef.current.pendingText;
    if (!pending) return;
    const now = Date.now();
    typingStateRef.current.isTyping = true;
    typingStateRef.current.lastStartAt = now;
    if (pending === draftSendStateRef.current.lastSentText) {
      draftSendStateRef.current.lastSentAt = now;
      return;
    }
    draftSendStateRef.current.lastSentAt = now;
    draftSendStateRef.current.lastSentText = pending;
    sendTypingSignal(true, pending);
  }, [sendTypingSignal]);

  const stopTyping = useCallback(() => {
    const shouldSendClear =
      typingStateRef.current.isTyping ||
      draftSendStateRef.current.pendingText.length > 0 ||
      draftSendStateRef.current.lastSentText.length > 0;
    typingStateRef.current.isTyping = false;
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (draftSendTimerRef.current) {
      clearTimeout(draftSendTimerRef.current);
      draftSendTimerRef.current = null;
    }
    draftSendStateRef.current = { lastSentAt: 0, lastSentText: "", pendingText: "" };
    if (shouldSendClear) {
      sendTypingSignal(false, "");
    }
  }, [sendTypingSignal]);

  const scheduleTypingStop = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }
    typingStopTimerRef.current = setTimeout(() => {
      typingStopTimerRef.current = null;
      stopTyping();
    }, TYPING_STOP_IDLE_MS);
  }, [stopTyping]);

  const scheduleDraftPreview = useCallback(
    (normalizedDraft: string) => {
      if (!FAN_DRAFT_PREVIEW_ENABLED) return;
      if (!normalizedDraft) return;
      draftSendStateRef.current.pendingText = normalizedDraft;
      const now = Date.now();
      const elapsed = now - draftSendStateRef.current.lastSentAt;
      if (elapsed >= TYPING_DRAFT_THROTTLE_MS) {
        if (draftSendTimerRef.current) {
          clearTimeout(draftSendTimerRef.current);
          draftSendTimerRef.current = null;
        }
        flushDraftPreview();
        return;
      }
      if (!draftSendTimerRef.current) {
        draftSendTimerRef.current = setTimeout(() => {
          draftSendTimerRef.current = null;
          flushDraftPreview();
        }, TYPING_DRAFT_THROTTLE_MS - elapsed);
      }
    },
    [flushDraftPreview]
  );

  const handleTypingStart = useCallback(() => {
    if (FAN_DRAFT_PREVIEW_ENABLED) return;
    const now = Date.now();
    const current = typingStateRef.current;
    if (!current.isTyping || now - current.lastStartAt >= TYPING_START_THROTTLE_MS) {
      current.isTyping = true;
      current.lastStartAt = now;
      sendTypingSignal(true);
    }
  }, [sendTypingSignal]);

  useEffect(() => {
    typingStateRef.current = { isTyping: false, lastStartAt: 0 };
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (draftSendTimerRef.current) {
      clearTimeout(draftSendTimerRef.current);
      draftSendTimerRef.current = null;
    }
    draftSendStateRef.current = { lastSentAt: 0, lastSentText: "", pendingText: "" };
    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (draftSendTimerRef.current) {
        clearTimeout(draftSendTimerRef.current);
        draftSendTimerRef.current = null;
      }
    };
  }, [fanId]);

  const focusComposer = useCallback(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, []);

  const handleComposerChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextDraft = event.target.value;
      setDraft(nextDraft);
      if (isComposerDisabled) return;
      const normalizedDraft = normalizeFanDraftText(nextDraft);
      if (!normalizedDraft) {
        stopTyping();
        return;
      }
      if (FAN_DRAFT_PREVIEW_ENABLED) {
        scheduleDraftPreview(normalizedDraft);
      } else {
        handleTypingStart();
      }
      scheduleTypingStop();
    },
    [handleTypingStart, isComposerDisabled, scheduleDraftPreview, scheduleTypingStop, stopTyping]
  );

  const handleComposerBlur = useCallback(() => {
    stopTyping();
  }, [stopTyping]);

  const handleSendMessage = useCallback(async () => {
    if (isOnboardingVisible || isAdultGateActive) return;
    stopTyping();
    const ok = await sendFanMessage(draft);
    if (ok) {
      setDraft("");
      requestAnimationFrame(() => focusComposer());
    }
  }, [draft, focusComposer, isAdultGateActive, isOnboardingVisible, sendFanMessage, stopTyping]);

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
      if (isComposerDisabled || isAdultGateActive) return;
      insertIntoDraft(emoji);
    },
    [insertIntoDraft, isAdultGateActive, isComposerDisabled]
  );

  const handleStickerSelect = useCallback(
    (sticker: StickerItem) => {
      if (isComposerDisabled || isAdultGateActive) return;
      const token = buildStickerTokenFromItem(sticker);
      void sendFanMessage(token);
    },
    [isAdultGateActive, isComposerDisabled, sendFanMessage]
  );

  const openContentSheet = useCallback(
    (tab: "content" | "packs") => {
      if (isAdultGateActive) return;
      setContentSheetTab(tab);
      setContentSheetOpen(true);
    },
    [isAdultGateActive]
  );

  const closeContentSheet = useCallback(() => {
    setContentSheetOpen(false);
    requestAnimationFrame(() => focusComposer());
  }, [focusComposer]);

  const closeActionMenu = useCallback(() => {
    setActionMenuOpen(false);
    requestAnimationFrame(() => focusComposer());
  }, [focusComposer]);

  const handleOpenActionMenu = useCallback(() => {
    if (isAdultGateActive) return;
    setActionMenuOpen(true);
  }, [isAdultGateActive]);

  const openWalletTopup = useCallback(() => {
    if (isAdultGateActive) return;
    setWalletTopupError("");
    setWalletTopupAmount(null);
    setWalletTopupCustom("");
    setWalletTopupOpen(true);
  }, [isAdultGateActive]);

  const closeWalletTopup = useCallback(() => {
    if (walletTopupLoading) return;
    setWalletTopupOpen(false);
    setWalletTopupError("");
    setWalletTopupAmount(null);
    setWalletTopupCustom("");
    walletTopupTxnRef.current = null;
    walletTopupAmountRef.current = null;
  }, [walletTopupLoading]);

  const handleWalletTopup = useCallback(
    async (amountCents: number) => {
      if (!fanId || walletTopupLoading || walletEnabled === false) return;
      if (!Number.isFinite(amountCents) || amountCents <= 0) return;
      setWalletTopupLoading(true);
      setWalletTopupError("");
      setWalletTopupAmount(amountCents);
      setWalletTopupCustom("");
      const existingKey = walletTopupTxnRef.current;
      const existingAmount = walletTopupAmountRef.current;
      const idempotencyKey =
        existingKey && existingAmount === amountCents
          ? existingKey
          : `topup:${generateClientTxnId()}`;
      walletTopupTxnRef.current = idempotencyKey;
      walletTopupAmountRef.current = amountCents;
      try {
        const res = await fetch(`/api/fans/${encodeURIComponent(fanId)}/wallet/topup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountCents, idempotencyKey }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data?.error === "WALLET_DISABLED") {
            setWalletEnabled(false);
          }
          setWalletTopupError(data?.error || "No se pudo recargar.");
          return;
        }
        applyWalletPayload(data);
        if (!data?.wallet) {
          void fetchWallet(fanId);
        }
        showFanToast("Saldo actualizado.");
        setWalletTopupOpen(false);
        walletTopupTxnRef.current = null;
        walletTopupAmountRef.current = null;
      } catch (_err) {
        setWalletTopupError("No se pudo recargar.");
      } finally {
        setWalletTopupLoading(false);
        setWalletTopupAmount(null);
      }
    },
    [applyWalletPayload, fanId, fetchWallet, showFanToast, walletEnabled, walletTopupLoading]
  );

  const handleWalletTopupCustom = useCallback(() => {
    if (walletTopupLoading || walletEnabled === false) return;
    const amountValue = parseAmountToNumber(walletTopupCustom);
    const amountCents = Math.round(amountValue * 100);
    if (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > 500) {
      setWalletTopupError("Introduce un importe válido.");
      return;
    }
    void handleWalletTopup(amountCents);
  }, [handleWalletTopup, walletEnabled, walletTopupCustom, walletTopupLoading]);

  useEffect(() => {
    if (!isAdultGateActive) return;
    stopTyping();
    setActionMenuOpen(false);
    setUnlockOffer(null);
    setPackPurchase(null);
    setMoneyModal(null);
    setContentSheetOpen(false);
    setWalletTopupOpen(false);
    setWalletTopupLoading(false);
    setWalletTopupError("");
    setWalletTopupAmount(null);
    setWalletTopupCustom("");
    walletTopupTxnRef.current = null;
    walletTopupAmountRef.current = null;
  }, [isAdultGateActive, stopTyping]);

  const handleAdultConfirm = useCallback(async () => {
    if (!fanId || adultConfirming) return;
    setAdultConfirming(true);
    try {
      const res = await fetch(`/api/fans/${encodeURIComponent(fanId)}/confirm-adult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showFanToast(data?.error || "No se pudo confirmar la edad.");
        return;
      }
      const confirmedAt =
        typeof data?.adultConfirmedAt === "string" ? data.adultConfirmedAt : new Date().toISOString();
      setAdultConfirmedAt(confirmedAt);
      setAdultConfirmVersion(typeof data?.adultConfirmVersion === "string" ? data.adultConfirmVersion : "v1");
      setAdultStatusLoaded(true);
      showFanToast("Confirmado. Puedes continuar.");
    } catch (_err) {
      showFanToast("No se pudo confirmar la edad.");
    } finally {
      setAdultConfirming(false);
    }
  }, [adultConfirming, fanId, showFanToast]);

  const handleAdultExit = useCallback(() => {
    void router.replace("/");
  }, [router]);

  const openTipModal = useCallback(() => {
    if (isAdultGateActive) return;
    setActionMenuOpen(false);
    setTipError("");
    setTipAmountPreset(null);
    setTipAmountCustom("");
    setMoneyModal("tip");
  }, [isAdultGateActive]);

  const openGiftModal = useCallback(() => {
    if (isAdultGateActive) return;
    setActionMenuOpen(false);
    setGiftError("");
    setGiftView("list");
    setSelectedGiftPack(null);
    setMoneyModal("gift");
  }, [isAdultGateActive]);

  const openPacksSheet = useCallback(() => {
    if (isAdultGateStrict) return;
    setActionMenuOpen(false);
    openContentSheet("packs");
  }, [isAdultGateStrict, openContentSheet]);

  const setPackPurchasing = useCallback((packId: string, isPurchasing: boolean) => {
    if (!packId) return;
    const next = new Set(packPurchasingIdsRef.current);
    const has = next.has(packId);
    if (isPurchasing === has) return;
    if (isPurchasing) {
      next.add(packId);
    } else {
      next.delete(packId);
    }
    packPurchasingIdsRef.current = next;
    setPackPurchasingIds(next);
  }, []);

  const isPackPurchasing = useCallback((packId: string) => {
    if (!packId) return false;
    return packPurchasingIdsRef.current.has(packId);
  }, []);

  const setOfferUnlocking = useCallback((offerId: string, isUnlocking: boolean) => {
    if (!offerId) return;
    const next = new Set(unlockingOfferIdsRef.current);
    const has = next.has(offerId);
    if (isUnlocking === has) return;
    if (isUnlocking) {
      next.add(offerId);
    } else {
      next.delete(offerId);
    }
    unlockingOfferIdsRef.current = next;
    setUnlockingOfferIds(next);
  }, []);

  const isOfferUnlocking = useCallback((offerId: string) => {
    if (!offerId) return false;
    return unlockingOfferIdsRef.current.has(offerId);
  }, []);

  const resolvePackFromOffer = useCallback(
    (offer: OfferMeta): PackSummary | null => {
      const match = availablePacks.find((pack) => pack.id === offer.id);
      if (match) return match;
      if (!offer?.id) return null;
      return {
        id: offer.id,
        name: offer.title,
        price: offer.price,
        description: "",
      };
    },
    [availablePacks]
  );

  const handleOfferClick = useCallback(
    (offer: OfferMeta, status: "locked" | "unlocked") => {
      if (isAdultGateStrict) return;
      if (!offer?.id) return;
      const isPackOffer =
        offer.kind === "pack" || (offer.kind !== "offer" && offer.kind !== "ppv" && availablePackIds.has(offer.id));
      if (status === "unlocked") {
        if (offer.kind === "ppv") return;
        openContentSheet("content");
        return;
      }
      if (isPackOffer) {
        if (isPackPurchasing(offer.id)) return;
        const pack = resolvePackFromOffer(offer);
        if (!pack) return;
        setPackPurchase(pack);
        return;
      }
      if (isOfferUnlocking(offer.id)) return;
      setUnlockOffer(offer);
    },
    [availablePackIds, isAdultGateStrict, isOfferUnlocking, isPackPurchasing, openContentSheet, resolvePackFromOffer]
  );

  const closeUnlockSheet = useCallback(() => {
    const offerId = unlockOffer?.id;
    if (offerId && isOfferUnlocking(offerId)) return;
    setUnlockOffer(null);
  }, [isOfferUnlocking, unlockOffer]);

  const closePackPurchaseSheet = useCallback(() => {
    const packId = packPurchase?.id;
    if (packId && isPackPurchasing(packId)) return;
    setPackPurchase(null);
  }, [isPackPurchasing, packPurchase]);

  const getOfferClientTxnId = useCallback((offerId: string) => {
    const key = offerId.trim();
    if (!key) return generateClientTxnId();
    const existing = purchaseTxnByOfferIdRef.current[key];
    if (existing) return existing;
    const normalized = key.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const base = normalized ? `offer:${normalized}` : `offer:${generateClientTxnId()}`;
    const clientTxnId = base.slice(0, 120);
    purchaseTxnByOfferIdRef.current[key] = clientTxnId;
    return clientTxnId;
  }, []);

  const getPackClientTxnId = useCallback((packId: string) => {
    const key = packId.trim();
    if (!key) return generateClientTxnId();
    const existing = packTxnByIdRef.current[key];
    if (existing) return existing;
    const normalized = key.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const base = normalized ? `pack:${normalized}` : `pack:${generateClientTxnId()}`;
    const clientTxnId = base.slice(0, 120);
    packTxnByIdRef.current[key] = clientTxnId;
    return clientTxnId;
  }, []);

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

  const createOfferPurchase = useCallback(
    async (offer: OfferMeta) => {
      if (!fanId) return { ok: false, error: "Missing fanId" };
      const offerId = offer.id?.trim() ?? "";
      if (!offerId) return { ok: false, error: "Missing offerId" };
      const clientTxnId = getOfferClientTxnId(offerId);
      try {
        const res = await fetch(`/api/fans/${fanId}/purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "OFFER",
            offerId,
            clientTxnId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        applyWalletPayload(data);
        if (!res.ok) {
          const errorCode = typeof data?.error === "string" ? data.error : "";
          const errorMessage =
            errorCode === "INSUFFICIENT_BALANCE"
              ? "Saldo insuficiente."
              : errorCode === "ADULT_NOT_CONFIRMED"
              ? "Confirma 18+ para comprar."
              : data?.error || "No se pudo desbloquear.";
          return { ok: false, error: errorMessage, errorCode, requiredCents: data?.requiredCents };
        }
        return {
          ok: true,
          purchaseId: data?.purchaseId,
          accessGranted: data?.accessGranted === true,
          reused: data?.reused === true,
          accessSummary: data?.accessSummary,
          packStatusById: data?.packStatusById,
          unlockedPacks: data?.unlockedPacks,
          includedContentCount: data?.includedContentCount,
        };
      } catch (err) {
        console.error("Error creating offer purchase", err);
        return { ok: false, error: "No se pudo desbloquear." };
      }
    },
    [applyWalletPayload, fanId, getOfferClientTxnId]
  );

  const createPpvPurchase = useCallback(
    async (offer: OfferMeta) => {
      if (!fanId) return { ok: false, error: "Missing fanId" };
      const offerId = offer.id?.trim() ?? "";
      if (!offerId) return { ok: false, error: "Missing ppvId" };
      try {
        const res = await fetch(`/api/ppv/${encodeURIComponent(offerId)}/purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        applyWalletPayload(data);
        if (!res.ok || !data?.ok) {
          const errorCode = typeof data?.error === "string" ? data.error : "";
          const errorMessage =
            errorCode === "INSUFFICIENT_BALANCE"
              ? "Saldo insuficiente."
              : errorCode === "ADULT_NOT_CONFIRMED"
              ? "Confirma 18+ para comprar."
              : data?.error || "No se pudo desbloquear.";
          return { ok: false, error: errorMessage, errorCode, requiredCents: data?.requiredCents, message: data?.message };
        }
        return {
          ok: true,
          purchaseId: data?.purchaseId,
          reused: data?.reused === true,
          message: data?.message,
        };
      } catch (err) {
        console.error("Error creating ppv purchase", err);
        return { ok: false, error: "No se pudo desbloquear." };
      }
    },
    [applyWalletPayload, fanId]
  );

  const createPackPurchase = useCallback(
    async (pack: PackSummary) => {
      if (!fanId) return { ok: false, error: "Missing fanId" };
      const packId = pack.id?.trim() ?? "";
      if (!packId) return { ok: false, error: "Missing packId" };
      const clientTxnId = getPackClientTxnId(packId);
      try {
        const res = await fetch(`/api/fans/${fanId}/purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "PACK",
            packId,
            clientTxnId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        applyWalletPayload(data);
        if (!res.ok) {
          const errorCode = typeof data?.error === "string" ? data.error : "";
          const errorMessage =
            errorCode === "INSUFFICIENT_BALANCE"
              ? "Saldo insuficiente."
              : errorCode === "ADULT_NOT_CONFIRMED"
              ? "Confirma 18+ para comprar."
              : data?.error || "No se pudo completar la compra.";
          return { ok: false, error: errorMessage, errorCode, requiredCents: data?.requiredCents };
        }
        return {
          ok: true,
          purchaseId: data?.purchaseId,
          accessGranted: data?.accessGranted === true,
          reused: data?.reused === true,
          accessSummary: data?.accessSummary,
          packStatusById: data?.packStatusById,
          unlockedPacks: data?.unlockedPacks,
          includedContentCount: data?.includedContentCount,
        };
      } catch (err) {
        console.error("Error creating pack purchase", err);
        return { ok: false, error: "No se pudo completar la compra." };
      }
    },
    [applyWalletPayload, fanId, getPackClientTxnId]
  );

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
    if (isAdultGateActive) return;
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
    isAdultGateActive,
    supportSubmitRef,
    supportTxnRef,
    tipAmountCustom,
    tipAmountPreset,
    supportSubmitting,
  ]);

  const handleGiftConfirm = useCallback(
    async (pack: PackSummary) => {
      if (!fanId) return;
      if (isAdultGateActive) return;
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
      isAdultGateActive,
      supportSubmitRef,
      supportTxnRef,
      supportSubmitting,
    ]
  );

  const walletBalanceLabel = useMemo(() => {
    if (walletBalanceCents === null) return "—";
    return formatCurrencyCents(walletBalanceCents, walletCurrency);
  }, [walletBalanceCents, walletCurrency]);
  const walletStatusLabel =
    walletEnabled === false
      ? "—"
      : walletLoading && walletBalanceCents === null
      ? "..."
      : walletBalanceLabel;
  const unlockRequiredCents = useMemo(() => {
    if (!unlockOffer?.price) return 0;
    const amount = parseAmountToNumber(unlockOffer.price);
    return Math.max(0, Math.round(amount * 100));
  }, [unlockOffer?.price]);
  const packRequiredCents = useMemo(() => {
    if (!packPurchase?.price) return 0;
    const amount = parseAmountToNumber(packPurchase.price);
    return Math.max(0, Math.round(amount * 100));
  }, [packPurchase?.price]);
  const unlockNeedsTopup =
    walletEnabled === true &&
    unlockRequiredCents > 0 &&
    walletBalanceCents !== null &&
    walletBalanceCents < unlockRequiredCents;
  const isPpvUnlock = unlockOffer?.kind === "ppv";
  const packNeedsTopup =
    walletEnabled === true &&
    packRequiredCents > 0 &&
    walletBalanceCents !== null &&
    walletBalanceCents < packRequiredCents;

  const handleUnlockConfirm = useCallback(async () => {
    if (!fanId || !unlockOffer) return;
    if (isAdultGateStrict) return;
    const offerId = unlockOffer.id;
    if (!offerId || isOfferUnlocking(offerId)) return;
    const isPpvUnlock = unlockOffer.kind === "ppv";
    if (isAdultGatePurchaseBlocked) {
      showFanToast(isPpvUnlock ? "Confirma 18+ para comprar este extra." : "Confirma 18+ para desbloquear este pack.");
      return;
    }
    if (unlockNeedsTopup && walletEnabled === true) {
      openWalletTopup();
      showFanToast("Saldo insuficiente.");
      return;
    }
    setOfferUnlocking(offerId, true);
    try {
      const result = isPpvUnlock ? await createPpvPurchase(unlockOffer) : await createOfferPurchase(unlockOffer);
      if (!result.ok) {
        if (result.errorCode === "INSUFFICIENT_BALANCE") {
          openWalletTopup();
        }
        showFanToast(result.error ?? "No se pudo desbloquear.");
        return;
      }
      if (isPpvUnlock) {
        if ("message" in result && result.message && fanId) {
          setMessages((prev) => reconcileMessages(prev, [result.message], sortMessages, fanId));
        }
      } else {
        if ("accessSummary" in result && result.accessSummary) {
          setAccessSummary(result.accessSummary as AccessSummary);
        }
        if ("packStatusById" in result && result.packStatusById && typeof result.packStatusById === "object") {
          setPackStatusById(result.packStatusById as Record<string, PackStatus>);
        }
        if ("unlockedPacks" in result && Array.isArray(result.unlockedPacks)) {
          updateUnlockedOfferIdsFromPackList(result.unlockedPacks as string[]);
        }
      }
      markOfferUnlocked(offerId);
      setUnlockOffer(null);
      if (isPpvUnlock) {
        showFanToast("Extra desbloqueado.");
      } else {
        const refresh = await refreshAccessAndContent(fanId);
        if (!refresh.ok) {
          await fetchAccessInfo(fanId);
        }
        openContentSheet("content");
      }
    } finally {
      setOfferUnlocking(offerId, false);
    }
  }, [
    createOfferPurchase,
    createPpvPurchase,
    fanId,
    fetchAccessInfo,
    isOfferUnlocking,
    isAdultGateStrict,
    isAdultGatePurchaseBlocked,
    markOfferUnlocked,
    openContentSheet,
    openWalletTopup,
    setMessages,
    sortMessages,
    refreshAccessAndContent,
    setOfferUnlocking,
    showFanToast,
    updateUnlockedOfferIdsFromPackList,
    unlockOffer,
    unlockNeedsTopup,
    walletEnabled,
  ]);

  const resolvePackStatus = useCallback(
    (pack: PackSummary): PackStatus => {
      const stored = packStatusById[pack.id];
      if (stored) return stored;
      const packType = resolvePackTypeFromLabel(pack.id, pack.name);
      if (!packType || !accessSummary) return "LOCKED";
      if (packType === "monthly" && accessSummary.hasActiveMonthly) return "ACTIVE";
      if (packType === "special" && accessSummary.hasActiveSpecial) return "ACTIVE";
      if (packType === "trial" && accessSummary.hasActiveTrial) return "ACTIVE";
      if (accessSummary.state === "EXPIRED") {
        const label = (accessSummary.primaryLabel || "").toLowerCase();
        if (packType === "monthly" && label.includes("mensual")) return "UNLOCKED";
        if (packType === "special" && label.includes("especial")) return "UNLOCKED";
        if (packType === "trial" && label.includes("prueba")) return "UNLOCKED";
      }
      return "LOCKED";
    },
    [accessSummary, packStatusById]
  );

  const handlePackPurchaseConfirm = useCallback(async () => {
    if (!fanId || !packPurchase) return;
    if (isAdultGateStrict) return;
    const packId = packPurchase.id;
    if (!packId || isPackPurchasing(packId)) return;
    if (isAdultGatePurchaseBlocked) {
      showFanToast("Confirma 18+ para comprar este pack.");
      return;
    }
    if (packNeedsTopup && walletEnabled === true) {
      openWalletTopup();
      showFanToast("Saldo insuficiente.");
      return;
    }
    setPackPurchasing(packId, true);
    try {
      const result = await createPackPurchase(packPurchase);
      if (!result.ok) {
        if (result.errorCode === "INSUFFICIENT_BALANCE") {
          openWalletTopup();
        }
        showFanToast(result.error ?? "No se pudo completar la compra.");
        return;
      }
      if (result.accessSummary) {
        setAccessSummary(result.accessSummary as AccessSummary);
      }
      if (result.packStatusById && typeof result.packStatusById === "object") {
        setPackStatusById(result.packStatusById as Record<string, PackStatus>);
      }
      if (Array.isArray(result.unlockedPacks)) {
        updateUnlockedOfferIdsFromPackList(result.unlockedPacks as string[]);
      }
      markOfferUnlocked(packId);
      const refresh = await refreshAccessAndContent(fanId);
      if (!refresh.ok) {
        await fetchAccessInfo(fanId);
      }
      setPackPurchase(null);
      showFanToast("Pack desbloqueado.");
      openContentSheet("content");
    } finally {
      setPackPurchasing(packId, false);
    }
  }, [
    createPackPurchase,
    fanId,
    fetchAccessInfo,
    isPackPurchasing,
    isAdultGateStrict,
    isAdultGatePurchaseBlocked,
    markOfferUnlocked,
    openContentSheet,
    openWalletTopup,
    packPurchase,
    packNeedsTopup,
    refreshAccessAndContent,
    setPackPurchasing,
    showFanToast,
    updateUnlockedOfferIdsFromPackList,
    walletEnabled,
  ]);

  const unlockSubmitting = Boolean(unlockOffer?.id && unlockingOfferIds.has(unlockOffer.id));
  const packPurchaseSubmitting = Boolean(packPurchase?.id && packPurchasingIds.has(packPurchase.id));
  const unlockConfirmDisabled = unlockSubmitting || isAdultGatePurchaseBlocked;
  const packConfirmDisabled = packPurchaseSubmitting || isAdultGatePurchaseBlocked;
  const sendDisabled = isComposerDisabled || draft.trim().length === 0;
  const voiceRecordingLabel = formatAudioTime(Math.max(0, Math.floor(voiceRecordingMs / 1000)));

  const handleOnboardingSkip = () => {
    setOnboardingDismissed(true);
    setOnboardingError("");
  };

  const handleOnboardingEnter = async () => {
    if (!fanId || isAdultGateActive) return;
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

  const uploadVoiceNote = useCallback(
    async (payload: VoiceUploadPayload) => {
      if (!fanId) return;
      const { blob, base64, durationMs, mimeType, sizeBytes } = payload;
      const tempId = `temp-voice-${Date.now()}`;
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
        type: "VOICE",
        audioUrl: localUrl,
        audioDurationMs: durationMs,
        audioMime: mimeType,
        audioSizeBytes: sizeBytes,
      };
      setMessages((prev) => reconcileMessages(prev, [tempMessage], sortMessages, fanId));
      scrollToBottom("auto");
      setVoiceUploadError("");
      setVoiceRetryPayload(null);
      setIsVoiceUploading(true);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fanId,
            from: "fan",
            type: "VOICE",
            audioBase64: base64,
            mimeType,
            durationMs,
          }),
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
        const newMessages: ApiMessage[] = Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : data.message
          ? [data.message as ApiMessage]
          : [];
        if (newMessages.length > 0) {
          setMessages((prev) => {
            const withoutTemp = (prev || []).filter((msg) => msg.id !== tempId);
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
    try {
      setVoiceUploadError("");
      setVoiceRetryPayload(null);
      await startVoiceRecorder();
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0 ? err.message : "Permiso del micro denegado.";
      setVoiceUploadError(message);
      resetVoiceRecorder();
    }
  }, [
    fanId,
    isComposerDisabled,
    isVoiceRecording,
    isVoiceUploading,
    resetVoiceRecorder,
    startVoiceRecorder,
  ]);

  const stopVoiceRecording = useCallback(async () => {
    if (!isVoiceRecording) return;
    try {
      const result = await stopVoiceRecorder();
      if (!result) return;
      console.info("[voice-note] recorded", {
        blobType: result.blob.type,
        blobSize: result.sizeBytes,
        durationMs: result.durationMs,
      });
      if (!result.sizeBytes) {
        setVoiceUploadError("No se pudo grabar la nota de voz.");
        return;
      }
      if (result.sizeBytes < VOICE_MIN_SIZE_BYTES) {
        setVoiceUploadError("No se detectó audio.");
        return;
      }
      if (result.sizeBytes > VOICE_MAX_SIZE_BYTES) {
        setVoiceUploadError("La nota de voz supera los 10 MB.");
        return;
      }
      if (result.durationMs > VOICE_MAX_DURATION_MS) {
        setVoiceUploadError("La nota de voz supera los 120 s.");
        return;
      }
      if (result.durationMs < 800) {
        setVoiceUploadError("La nota de voz es demasiado corta.");
        return;
      }
      previewVoiceBlob(result.blob);
      void uploadVoiceNote({
        blob: result.blob,
        base64: result.base64,
        durationMs: result.durationMs,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : "Error al grabar la nota de voz.";
      setVoiceUploadError(message);
      resetVoiceRecorder();
    }
  }, [isVoiceRecording, previewVoiceBlob, resetVoiceRecorder, stopVoiceRecorder, uploadVoiceNote]);

  const cancelVoiceRecording = useCallback(() => {
    if (!isVoiceRecording) return;
    cancelVoiceRecorder();
  }, [cancelVoiceRecorder, isVoiceRecording]);

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
      resetVoiceRecorder();
      if (voicePreviewRef.current) {
        voicePreviewRef.current.pause();
        voicePreviewRef.current = null;
      }
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [resetVoiceRecorder]);

  useEffect(() => {
    setVoiceUploadError("");
    setVoiceRetryPayload(null);
    resetVoiceRecorder();
  }, [fanId, resetVoiceRecorder]);

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

      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-[color:var(--surface-1)] border-b border-[color:var(--border)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[color:var(--surface-2)] text-[color:var(--text)] font-semibold">
            {creatorInitial}
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[color:var(--text)] font-medium text-sm truncate">{creatorName}</span>
            <span className="ui-muted text-sm truncate">{headerSubtitle}</span>
          </div>
        </div>
        {walletEnabled === true ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
              Saldo: {walletStatusLabel}
            </span>
            <button
              type="button"
              onClick={openWalletTopup}
              disabled={walletLoading || isAdultGateActive}
              className="rounded-full border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] disabled:opacity-60"
            >
              Recargar
            </button>
          </div>
        ) : null}
      </header>
      {fanToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="pointer-events-auto rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs text-[color:var(--text)] shadow-[0_12px_30px_-20px_rgba(0,0,0,0.5)]">
            {fanToast}
          </div>
        </div>
      )}

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
              onOpenContent={!isAdultGateActive ? () => openContentSheet("content") : undefined}
            />
          ) : null}
        </div>
        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto">
          <div
            className="px-4 sm:px-6 py-4"
            style={{ backgroundImage: "var(--chat-pattern)" }}
          >
            <div className="min-h-full flex flex-col justify-end gap-2">
              {isAdultGateLeadCapture ? (
                <div className="min-h-full flex items-center justify-center py-6">
                  <div className="w-full max-w-md rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-5 py-4 text-center">
                    <h3 className="text-sm font-semibold text-[color:var(--text)]">Confirmación 18+</h3>
                    <p className="mt-2 text-xs text-[color:var(--muted)]">
                      Puedes enviar un mensaje, pero para ver el chat debes confirmar 18+.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleAdultExit}
                        className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Salir
                      </button>
                      <button
                        type="button"
                        onClick={handleAdultConfirm}
                        disabled={adultConfirming}
                        className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
                      >
                        {adultConfirming ? "Confirmando..." : "Confirmar 18+"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                    if (msg.type === "AUDIO" || msg.type === "VOICE") {
                      return (
                        <AudioMessage
                          key={messageId}
                          message={msg}
                          onReact={(emoji) => {
                            if (!msg.id) return;
                            handleReactToMessage(msg.id, emoji);
                          }}
                        />
                      );
                    }
                    const tokenSticker =
                      msg.type !== "STICKER" ? getStickerByToken(msg.text ?? "") : null;
                    const isSticker = msg.type === "STICKER" || Boolean(tokenSticker);
                    const sticker = msg.type === "STICKER" ? getStickerById(msg.stickerId ?? null) : null;
                    const stickerSrc = msg.type === "STICKER" ? sticker?.file ?? null : tokenSticker?.src ?? null;
                    const stickerAlt = msg.type === "STICKER" ? sticker?.label || "Sticker" : tokenSticker?.label ?? null;
                    const baseText = msg.originalText ?? msg.text ?? "";
                    const deliveredText = msg.deliveredText ?? "";
                    const displayText =
                      isSticker
                        ? ""
                        : msg.from === "creator"
                        ? (deliveredText.trim() ? deliveredText : baseText)
                        : baseText;
                    return (
                      <div key={messageId} className="space-y-1">
                        <MessageBalloon
                          me={msg.from === "fan"}
                          message={displayText}
                          messageId={msg.id}
                          seen={!!msg.isLastFromCreator}
                          time={msg.time || undefined}
                          status={msg.status}
                          viewerRole="fan"
                          unlockedOfferIds={unlockedOfferIds}
                          unlockingOfferIds={unlockingOfferIds}
                          onOfferClick={handleOfferClick}
                          stickerSrc={isSticker ? stickerSrc : null}
                          stickerAlt={isSticker ? stickerAlt : null}
                          enableReactions
                          reactionsSummary={msg.reactionsSummary ?? []}
                          onReact={(emoji) => {
                            if (!msg.id) return;
                            handleReactToMessage(msg.id, emoji);
                          }}
                        />
                      </div>
                    );
                  })}
                </>
              )}
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
              {creatorTyping.isTyping && (
                <div className="mb-2 flex">
                  <div className="inline-flex items-center gap-1.5 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-[11px] text-[color:var(--muted)] shadow-[0_1px_0_rgba(0,0,0,0.12)]">
                    <span className="sr-only">{`${creatorFirstName} está escribiendo`}</span>
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--muted)]"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--muted)]"
                      style={{ animationDelay: "140ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--muted)]"
                      style={{ animationDelay: "280ms" }}
                    />
                  </div>
                </div>
              )}
              <div
                className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2.5 shadow-[0_-12px_22px_-16px_rgba(0,0,0,0.55)] focus-within:border-[color:rgba(var(--brand-rgb),0.45)] focus-within:ring-1 focus-within:ring-[color:var(--ring)]"
              >
                <ChatComposerBar
                  value={draft}
                  onChange={handleComposerChange}
                  onKeyDown={handleComposerKeyDown}
                  onBlur={handleComposerBlur}
                  onSend={handleSendMessage}
                  sendDisabled={sendDisabled}
                  placeholder="Escribe un mensaje..."
                  actionLabel="Enviar"
                  audience="CREATOR"
                  onAudienceChange={() => {}}
                  canAttach={!isComposerDisabled && !isAdultGateActive}
                  onAttach={handleOpenActionMenu}
                  inputRef={composerInputRef}
                  maxHeight={140}
                  isChatBlocked={isAdultGateStrict}
                  isInternalPanelOpen={false}
                  showAudienceToggle={false}
                  showAttach
                  showVoice
                  onVoiceStart={startVoiceRecording}
                  voiceDisabled={isAdultGateActive || isComposerDisabled || isVoiceRecording || isVoiceUploading}
                  isVoiceRecording={isVoiceRecording}
                  showEmoji
                  onEmojiSelect={handleEmojiSelect}
                  showStickers={!isAdultGateActive}
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
      <BottomSheet open={Boolean(unlockOffer)} onClose={closeUnlockSheet}>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">
              {unlockOffer?.title
                ? `${isPpvUnlock ? "Extra (PPV)" : "Pack"}: ${unlockOffer.title}`
                : isPpvUnlock
                ? "Extra (PPV)"
                : "Pack"}
            </h3>
            <p className="text-xs text-[color:var(--muted)]">
              {isPpvUnlock ? "Texto bloqueado hasta compra." : "Desbloquea contenido del pack."}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[color:var(--text)]">{unlockOffer?.title}</div>
              <div className="text-xs text-[color:var(--muted)]">{isPpvUnlock ? "Precio del extra" : "Precio del pack"}</div>
            </div>
            <span className="text-sm font-semibold text-[color:var(--warning)]">
              {unlockOffer?.price ? normalizePriceLabel(unlockOffer.price) : ""}
            </span>
          </div>
          {walletEnabled === true ? (
            <>
              <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                <span>Saldo: {walletStatusLabel}</span>
                {unlockNeedsTopup ? (
                  <button
                    type="button"
                    onClick={openWalletTopup}
                    className="rounded-full border border-[color:rgba(var(--brand-rgb),0.4)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                  >
                    Recargar
                  </button>
                ) : null}
              </div>
              {unlockNeedsTopup && (
                <div className="text-[11px] text-[color:var(--danger)]">
                  {isPpvUnlock ? "Saldo insuficiente para comprar este extra." : "Saldo insuficiente para desbloquear este pack."}
                </div>
              )}
            </>
          ) : null}
          {isAdultGatePurchaseBlocked && (
            <div className="text-[11px] text-[color:var(--warning)]">
              {isPpvUnlock ? "Confirma 18+ para comprar este extra." : "Confirma 18+ para desbloquear este pack."}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeUnlockSheet}
              disabled={unlockSubmitting}
              className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleUnlockConfirm}
              disabled={unlockConfirmDisabled}
              className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
            >
              {unlockSubmitting ? "Comprando..." : isPpvUnlock ? "Comprar extra" : "Comprar pack"}
            </button>
          </div>
        </div>
      </BottomSheet>
      <BottomSheet open={Boolean(packPurchase)} onClose={closePackPurchaseSheet}>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">
              {packPurchase?.name ? `Pack: ${packPurchase.name}` : "Pack"}
            </h3>
            <p className="text-xs text-[color:var(--muted)]">Desbloquea contenido del pack.</p>
          </div>
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[color:var(--text)]">{packPurchase?.name}</div>
                {packPurchase?.description ? (
                  <div className="text-xs text-[color:var(--muted)]">{packPurchase.description}</div>
                ) : null}
              </div>
              <span className="text-sm font-semibold text-[color:var(--warning)]">
                {packPurchase?.price ? normalizePriceLabel(packPurchase.price) : ""}
              </span>
            </div>
            <div className="text-[11px] text-[color:var(--muted)]">Desbloquea contenido del pack dentro del chat.</div>
          </div>
          {walletEnabled === true ? (
            <>
              <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                <span>Saldo: {walletStatusLabel}</span>
                {packNeedsTopup ? (
                  <button
                    type="button"
                    onClick={openWalletTopup}
                    className="rounded-full border border-[color:rgba(var(--brand-rgb),0.4)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                  >
                    Recargar
                  </button>
                ) : null}
              </div>
              {packNeedsTopup && (
                <div className="text-[11px] text-[color:var(--danger)]">Saldo insuficiente para comprar el pack.</div>
              )}
            </>
          ) : null}
          {isAdultGatePurchaseBlocked && (
            <div className="text-[11px] text-[color:var(--warning)]">Confirma 18+ para comprar este pack.</div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closePackPurchaseSheet}
              disabled={packPurchaseSubmitting}
              className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePackPurchaseConfirm}
              disabled={packConfirmDisabled}
              className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
            >
              {packPurchaseSubmitting ? "Comprando..." : "Comprar pack"}
            </button>
          </div>
        </div>
      </BottomSheet>
      <BottomSheet open={walletTopupOpen} onClose={closeWalletTopup}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">Recargar saldo</h3>
            <p className="text-xs text-[color:var(--muted)]">Recarga simulada para continuar comprando.</p>
          </div>
          <button
            type="button"
            onClick={closeWalletTopup}
            disabled={walletTopupLoading}
            className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
          >
            Cerrar
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs text-[color:var(--muted)]">
            <span>Saldo actual</span>
            <span className="font-semibold text-[color:var(--text)]">{walletStatusLabel}</span>
          </div>
          {walletTopupError && <p className="text-xs text-[color:var(--danger)]">{walletTopupError}</p>}
          <div className="flex flex-wrap gap-2">
            {WALLET_TOPUP_PRESETS.map((amountCents) => {
              const isLoading = walletTopupLoading && walletTopupAmount === amountCents;
              return (
                <button
                  key={`topup-${amountCents}`}
                  type="button"
                  onClick={() => handleWalletTopup(amountCents)}
                  disabled={walletTopupLoading}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                    walletTopupLoading
                      ? "border-[color:var(--surface-border)] text-[color:var(--muted)]"
                      : "border-[color:rgba(var(--brand-rgb),0.45)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                  }`}
                >
                  {isLoading ? "Recargando..." : formatCurrencyCents(amountCents, walletCurrency)}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-[color:var(--muted)]">Otro importe</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={500}
                inputMode="decimal"
                className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--brand)]"
                placeholder="Ej: 15"
                value={walletTopupCustom}
                onChange={(event) => {
                  setWalletTopupCustom(event.target.value);
                  setWalletTopupError("");
                }}
                disabled={walletTopupLoading}
              />
              <button
                type="button"
                onClick={handleWalletTopupCustom}
                disabled={walletTopupLoading}
                className="shrink-0 rounded-full border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] disabled:opacity-60"
              >
                Recargar
              </button>
            </div>
          </div>
          <p className="text-[11px] text-[color:var(--muted)]">Esta recarga es solo para la demo.</p>
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
            {packAccessLoading && (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs text-[color:var(--muted)]">
                Actualizando packs...
              </div>
            )}
            {availablePacks.length === 0 && (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4 text-sm text-[color:var(--muted)]">
                No hay packs públicos todavía.
              </div>
            )}
            {availablePacks.map((pack) => {
              const status = resolvePackStatus(pack);
              const isLocked = status === "LOCKED";
              const isActive = status === "ACTIVE";
              const isPurchasing = isPackPurchasing(pack.id);
              const purchaseBlocked = isAdultGatePurchaseBlocked && isLocked;
              const statusLabel =
                status === "ACTIVE" ? "Activo" : status === "UNLOCKED" ? "Desbloqueado" : "Bloqueado";
              const statusClass =
                status === "LOCKED"
                  ? "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.12)] text-[color:var(--warning)]"
                  : "border-[color:rgba(34,197,94,0.6)] bg-[color:rgba(34,197,94,0.14)] text-[color:rgb(22,163,74)]";
              const ctaLabel = isPurchasing
                ? "Comprando..."
                : purchaseBlocked
                ? "Confirma 18+ para comprar"
                : isLocked
                ? "Comprar pack"
                : isActive
                ? "Activo"
                : "Ver contenido";
              const ctaDisabled = isPurchasing || isActive || purchaseBlocked;
              return (
                <div
                  key={pack.id}
                  className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[color:var(--text)]">{pack.name}</p>
                      <p className="text-xs text-[color:var(--muted)]">{pack.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-[color:var(--warning)]">
                      {normalizePriceLabel(pack.price)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (ctaDisabled) return;
                          if (isLocked) {
                            setPackPurchase(pack);
                          } else {
                            openContentSheet("content");
                          }
                        }}
                        disabled={ctaDisabled}
                        title={purchaseBlocked ? "Confirma 18+ para comprar este pack." : undefined}
                        className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                          ctaDisabled
                            ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                            : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)]"
                        }`}
                      >
                        {ctaLabel}
                      </button>
                      {purchaseBlocked && (
                        <div className="text-[10px] text-[color:var(--warning)]">Confirma 18+ para comprar/desbloquear.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
      <BottomSheet open={isAdultGateStrict} onClose={() => {}} dismissible={false}>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">Confirmación 18+</h3>
            <p className="text-xs text-[color:var(--muted)]">
              Este espacio es solo para mayores de 18. Confirma para continuar.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleAdultExit}
              className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              Salir
            </button>
            <button
              type="button"
              onClick={handleAdultConfirm}
              disabled={adultConfirming}
              className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
            >
              {adultConfirming ? "Confirmando..." : "Tengo 18+"}
            </button>
          </div>
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

function AudioMessage({ message, onReact }: { message: ApiMessage; onReact?: (emoji: string) => void }) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ isPlaying, setIsPlaying ] = useState(false);
  const [ currentTime, setCurrentTime ] = useState(0);
  const [ audioError, setAudioError ] = useState(false);
  const [ reloadToken, setReloadToken ] = useState(0);
  const { favorites } = useEmojiFavorites();
  const [ reactionRecents, setReactionRecents ] = useState<string[]>([]);
  const [ isReactionBarOpen, setIsReactionBarOpen ] = useState(false);
  const [ isReactionPickerOpen, setIsReactionPickerOpen ] = useState(false);
  const [ isHovered, setIsHovered ] = useState(false);
  const reactionBarRef = useRef<HTMLDivElement | null>(null);
  const reactionPickerAnchorRef = useRef<HTMLButtonElement | null>(null);
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
  const reactionAlign = isMe ? "right-0" : "left-0";
  const reactionsSummary = message.reactionsSummary ?? [];
  const actorReaction = getMineEmoji(reactionsSummary);
  const canShowReactions = Boolean(onReact && message.id && !isSending);
  const reactionChoices = useMemo(() => {
    const deduped = favorites.concat(reactionRecents.filter((emoji) => !favorites.includes(emoji)));
    return deduped.slice(0, 6);
  }, [favorites, reactionRecents]);

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
    if (!canShowReactions) return;
    if (!isReactionBarOpen && !isReactionPickerOpen) return;
    setReactionRecents(readEmojiRecents());
  }, [canShowReactions, isReactionBarOpen, isReactionPickerOpen]);

  useEffect(() => {
    if (!canShowReactions) return;
    if (!isReactionBarOpen && !isReactionPickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const element = target as Element;
      if (reactionBarRef.current?.contains(target)) return;
      if (reactionPickerAnchorRef.current?.contains(target)) return;
      if (element.closest?.("[data-emoji-picker=\"true\"]")) return;
      setIsReactionBarOpen(false);
      setIsReactionPickerOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [canShowReactions, isReactionBarOpen, isReactionPickerOpen]);

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

  const handleSelectReaction = (emoji: string) => {
    if (!canShowReactions || !onReact) return;
    setReactionRecents((prev) => recordEmojiRecent(emoji, prev));
    onReact(emoji);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const handleClearReaction = () => {
    if (!canShowReactions || !onReact || !actorReaction) return;
    onReact(actorReaction);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const retryDownload = () => {
    setAudioError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setReloadToken(Date.now());
  };

  return (
    <div
      className={isMe ? "flex justify-end" : "flex justify-start"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="max-w-[75%]">
        <p className={`mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)] ${isMe ? "text-right" : ""}`}>
          <span>{isMe ? "Tú" : "Fan"} • {message.time || ""}</span>
        </p>
        <div className="relative">
          {canShowReactions && (
            <button
              type="button"
              onClick={() => {
                setIsReactionBarOpen((prev) => !prev);
                setIsReactionPickerOpen(false);
              }}
              className={clsx(
                "absolute -top-3 flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-0)] text-xs text-[color:var(--text)] shadow transition",
                reactionAlign,
                isHovered || isReactionBarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
              aria-label="Reaccionar"
            >
              <IconGlyph name="smile" className="h-3.5 w-3.5" />
            </button>
          )}
          {canShowReactions && isReactionBarOpen && (
            <div
              ref={reactionBarRef}
              className={clsx(
                "absolute z-20 -top-12 flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 shadow-xl",
                reactionAlign
              )}
            >
              {reactionChoices.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectReaction(emoji)}
                  className={clsx(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-sm",
                    actorReaction === emoji
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  )}
                >
                  {emoji}
                </button>
              ))}
              {actorReaction && (
                <button
                  type="button"
                  onClick={handleClearReaction}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  aria-label="Quitar reacción"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsReactionPickerOpen((prev) => !prev)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[12px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                aria-label="Más reacciones"
                ref={reactionPickerAnchorRef}
              >
                +
              </button>
            </div>
          )}
          {canShowReactions && (
            <EmojiPicker
              isOpen={isReactionPickerOpen}
              anchorRef={reactionPickerAnchorRef}
              onClose={() => setIsReactionPickerOpen(false)}
              onSelect={handleSelectReaction}
              mode="reaction"
            />
          )}
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
          </div>
        </div>
        {reactionsSummary.length > 0 && (
          <div className={clsx("mt-1 flex flex-wrap gap-1", isMe ? "justify-end" : "justify-start")}>
            {reactionsSummary.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                onClick={() => handleSelectReaction(entry.emoji)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                  actorReaction === entry.emoji
                    ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                )}
                aria-label={`Reacción ${entry.emoji}`}
              >
                <span>{entry.emoji}</span>
                <span className="text-[10px] text-[color:var(--muted)]">{entry.count}</span>
              </button>
            ))}
          </div>
        )}
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
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[color:var(--surface-overlay)]"
        onClick={dismissible ? onClose : undefined}
      />
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

function formatCurrencyCents(cents: number, currency = "EUR") {
  const safeCents = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  const amount = safeCents / 100;
  const hasDecimals = safeCents % 100 !== 0;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    const fixed = hasDecimals ? amount.toFixed(2) : Math.round(amount).toString();
    return `${fixed} ${currency}`;
  }
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
