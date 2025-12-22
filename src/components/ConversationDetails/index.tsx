import {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type UIEventHandler,
  type WheelEventHandler,
} from "react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ConversationContext } from "../../context/ConversationContext";
import Avatar from "../Avatar";
import MessageBalloon from "../MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { Message as ApiMessage, Fan } from "../../types/chat";
import { Message as ConversationMessage, ConversationListData } from "../../types/Conversation";
import { getAccessLabel, getAccessState, getAccessSummary } from "../../lib/access";
import { FollowUpTag, getFollowUpTag, getUrgencyLevel } from "../../utils/followUp";
import { PACKS } from "../../config/packs";
import { getRecommendedFan } from "../../utils/recommendedFan";
import { getFanDisplayNameForCreator } from "../../utils/fanDisplayName";
import { ContentItem, getContentTypeLabel, getContentVisibilityLabel } from "../../types/content";
import { getTimeOfDayTag } from "../../utils/contentTags";
import { EXTRAS_UPDATED_EVENT } from "../../constants/events";
import { AiTone, normalizeTone, ACTION_TYPE_FOR_USAGE } from "../../lib/aiQuickExtra";
import { AiTemplateUsage, AiTurnMode } from "../../lib/aiTemplateTypes";
import { normalizeAiTurnMode } from "../../lib/aiSettings";
import { getAccessSnapshot, getChatterProPlan } from "../../lib/chatPlaybook";
import FanManagerDrawer from "../fan/FanManagerDrawer";
import type { FanManagerSummary } from "../../server/manager/managerService";
import { deriveFanManagerState, getDefaultFanTone } from "../../lib/fanManagerState";
import { getManagerPromptTemplate } from "../../lib/managerPrompts";
import { getAutopilotDraft } from "../../lib/managerAutopilot";
import type { ManagerObjective as AutopilotObjective } from "../../lib/managerAutopilot";
import type { FanManagerStateAnalysis } from "../../lib/fanManagerState";
import type { FanTone, ManagerObjective } from "../../types/manager";
import { track } from "../../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { deriveAudience, isVisibleToFan, normalizeFrom } from "../../lib/messageAudience";
import {
  DB_SCHEMA_OUT_OF_SYNC_FIX,
  DB_SCHEMA_OUT_OF_SYNC_MESSAGE,
  isDbSchemaOutOfSyncPayload,
  type DbSchemaOutOfSyncPayload,
} from "../../lib/dbSchemaGuard";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, normalizePreferredLanguage, type SupportedLanguage } from "../../lib/language";
import clsx from "clsx";
import { useRouter } from "next/router";
import { useIsomorphicLayoutEffect } from "../../hooks/useIsomorphicLayoutEffect";

type ManagerQuickIntent = ManagerObjective;
type ManagerSuggestionIntent = "romper_hielo" | "pregunta_simple" | "cierre_suave" | "upsell_mensual_suave";
type ComposerAudienceMode = "CREATOR" | "INTERNAL";
type InlineTab = "templates" | "tools" | "manager";
type InternalPanelTab = "manager" | "internal" | "note";

type ConversationDetailsProps = {
  onBackToBoard?: () => void;
};

const PACK_ESPECIAL_UPSELL_TEXT =
  "Veo que lo que estás pidiendo entra ya en el terreno de mi Pack especial: incluye todo lo de tu suscripción mensual + fotos y escenas extra más intensas. Si quieres subir de nivel, son 49 € y te lo dejo desbloqueado en este chat.";
const PACK_MONTHLY_UPSELL_TEXT =
  'Te propongo subir al siguiente nivel: la suscripción mensual. Incluye fotos, vídeos y guías extra para seguir trabajando en tu relación. Si te interesa, dime "MENSUAL" y te paso el enlace.';

const CONTENT_PACKS = [
  { code: "WELCOME" as const, label: "Pack bienvenida" },
  { code: "MONTHLY" as const, label: "Suscripción mensual" },
  { code: "SPECIAL" as const, label: "Pack especial pareja" },
] as const;
const TRANSLATION_QUICK_CHIPS = [
  { id: "greeting", label: "Saludo corto", text: "Hola, ¿qué tal estás?" },
  { id: "question", label: "Pregunta simple", text: "¿Cómo ha ido tu día?" },
  { id: "closing", label: "Cierre suave", text: "Cuando quieras seguimos, estoy aquí." },
] as const;
const AUDIENCE_STORAGE_KEY = "novsy.creatorMessageAudience";
const TRANSLATION_PREVIEW_KEY_PREFIX = "novsy.creatorTranslationPreview";

const INLINE_TABS_BY_MODE = {
  CREATOR: ["templates", "tools", "manager"],
  INTERNAL: ["manager"],
} as const;

type InlinePanelShellProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  bodyRef?: Ref<HTMLDivElement>;
  bodyClassName?: string;
  onBodyScroll?: UIEventHandler<HTMLDivElement>;
  onBodyWheel?: WheelEventHandler<HTMLDivElement>;
  scrollable?: boolean;
};

function InlinePanelShell({
  title,
  children,
  onClose,
  bodyRef,
  bodyClassName,
  onBodyScroll,
  onBodyWheel,
  scrollable = true,
}: InlinePanelShellProps) {
  return (
    <div className="w-full rounded-2xl border border-slate-700/60 bg-slate-900/80 backdrop-blur-md shadow-[0_10px_35px_rgba(0,0,0,0.35)] ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-2.5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800/80 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          aria-label="Cerrar panel"
        >
          ✕
        </button>
      </div>
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        onWheelCapture={onBodyWheel}
        className={clsx(
          "px-4 py-3 text-[12px] text-slate-200",
          scrollable
            ? "min-h-0 max-h-[360px] overflow-y-auto overscroll-contain space-y-3"
            : "overflow-hidden",
          bodyClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

type ComposerChipsRowProps = {
  children: ReactNode;
};

function ComposerChipsRow({ children }: ComposerChipsRowProps) {
  return (
    <div
      className={clsx(
        "mt-2 flex w-full items-center gap-1.5 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-visible",
        "[-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden"
      )}
    >
      {children}
    </div>
  );
}

type InlinePanelContainerProps = {
  children: ReactNode;
  isOpen: boolean;
  panelId?: string;
};

function InlinePanelContainer({ children, isOpen, panelId }: InlinePanelContainerProps) {
  return (
    <div
      id={panelId}
      className={clsx(
        "transition-all duration-200 ease-out overflow-hidden",
        isOpen
          ? "mt-3 max-h-[520px] opacity-100 translate-y-0 visible"
          : "mt-0 max-h-0 opacity-0 -translate-y-1 invisible pointer-events-none"
      )}
      style={{ willChange: "opacity, transform, max-height" }}
      aria-hidden={!isOpen}
    >
      {children}
    </div>
  );
}

function reconcileMessages(
  existing: ConversationMessage[],
  incoming: ConversationMessage[],
  targetFanId?: string
): ConversationMessage[] {
  const filteredIncoming = targetFanId
    ? incoming.filter((msg) => msg.fanId === targetFanId)
    : incoming;
  const existingKeys = existing.map((msg, idx) => msg.id || `__idx-${idx}`);
  const map = new Map<string, ConversationMessage>();
  existing.forEach((msg, idx) => {
    const key = msg.id || `__idx-${idx}`;
    map.set(key, msg);
  });
  filteredIncoming.forEach((msg, idx) => {
    const key = msg.id || msg.time || `incoming-${idx}`;
    if (map.has(key)) {
      const prev = map.get(key)!;
      map.set(key, { ...prev, ...msg, status: msg.status || "sent" });
    } else {
      existingKeys.push(key);
      map.set(key, { ...msg, status: msg.status || "sent" });
    }
  });
  return existingKeys.map((key) => map.get(key)).filter(Boolean) as ConversationMessage[];
}

function reconcileApiMessages(existing: ApiMessage[], incoming: ApiMessage[], targetFanId?: string): ApiMessage[] {
  const filteredIncoming = targetFanId
    ? incoming.filter((msg) => msg.fanId === targetFanId)
    : incoming;
  const map = new Map<string, ApiMessage>();
  existing.forEach((msg) => map.set(msg.id, msg));
  filteredIncoming.forEach((msg) => {
    const prev = map.get(msg.id);
    map.set(msg.id, prev ? { ...prev, ...msg } : msg);
  });
  return Array.from(map.values()).sort((a, b) => {
    const at = a.id ? String(a.id) : "";
    const bt = b.id ? String(b.id) : "";
    if (at === bt) return 0;
    return at > bt ? 1 : -1;
  });
}

function getReengageTemplate(name: string) {
  const cleanName = name?.trim() || "";
  return `Hola ${cleanName || "allí"}, soy Eusebiu. Hoy termina tu acceso a este espacio privado. Si quieres que sigamos trabajando juntos en tu relación y tu vida sexual, puedo ofrecerte renovar la suscripción o prepararte un pack especial solo para ti. Si te interesa, dime “QUIERO SEGUIR” y lo vemos juntos.`;
}

export default function ConversationDetails({ onBackToBoard }: ConversationDetailsProps) {
  const {
    conversation,
    message: messages,
    setMessage,
    setConversation,
    queueMode,
    todayQueue,
    queueIndex,
    setQueueIndex,
  } = useContext(ConversationContext);
  const {
    contactName,
    image,
    membershipStatus,
    daysLeft,
    lastSeen,
    lastSeenAt,
    id,
    followUpTag: conversationFollowUpTag,
    lastCreatorMessageAt,
  } = conversation;
  const [ messageSend, setMessageSend ] = useState("");
  const [ isSending, setIsSending ] = useState(false);
  const [ composerAudience, setComposerAudience ] = useState<ComposerAudienceMode>("CREATOR");
  const [ showPackSelector, setShowPackSelector ] = useState(false);
  const [ isLoadingMessages, setIsLoadingMessages ] = useState(false);
  const [ messagesError, setMessagesError ] = useState("");
  const [ schemaError, setSchemaError ] = useState<DbSchemaOutOfSyncPayload | null>(null);
  const [ schemaCopyState, setSchemaCopyState ] = useState<"idle" | "copied" | "error">("idle");
  const [ grantLoadingType, setGrantLoadingType ] = useState<"trial" | "monthly" | "special" | null>(null);
  const [ selectedPackType, setSelectedPackType ] = useState<"trial" | "monthly" | "special">("monthly");
  const [ accessGrants, setAccessGrants ] = useState<
    { id: string; fanId: string; type: string; createdAt: string; expiresAt: string }[]
  >([]);
  const [ accessGrantsLoading, setAccessGrantsLoading ] = useState(false);
  const [ openPanel, setOpenPanel ] = useState<"none" | "history" | "extras">("none");
  const [ notesLoading, setNotesLoading ] = useState(false);
  const [ notes, setNotes ] = useState<FanNote[]>([]);
  const [ noteDraft, setNoteDraft ] = useState("");
  const [ notesError, setNotesError ] = useState("");
  const [ historyError, setHistoryError ] = useState("");
  const [ nextActionDraft, setNextActionDraft ] = useState("");
  const [ nextActionDate, setNextActionDate ] = useState("");
  const [ nextActionTime, setNextActionTime ] = useState("");
  const [ recommendedFan, setRecommendedFan ] = useState<ConversationListData | null>(null);
  const [ isEditNameOpen, setIsEditNameOpen ] = useState(false);
  const [ editNameValue, setEditNameValue ] = useState("");
  const [ editNameError, setEditNameError ] = useState<string | null>(null);
  const [ editNameSaving, setEditNameSaving ] = useState(false);
  const [ preferredLanguage, setPreferredLanguage ] = useState<SupportedLanguage | null>(null);
  const [ preferredLanguageSaving, setPreferredLanguageSaving ] = useState(false);
  const [ preferredLanguageError, setPreferredLanguageError ] = useState<string | null>(null);
  const [ internalToast, setInternalToast ] = useState<string | null>(null);
  const [ translationPreviewOpen, setTranslationPreviewOpen ] = useState(false);
  const [ inlinePanel, setInlinePanel ] = useState<InlineTab | null>(null);
  const [ internalPanelTab, setInternalPanelTab ] = useState<InternalPanelTab>("manager");
  const [ lastTabByMode, setLastTabByMode ] = useState<{
    CREATOR: InlineTab | null;
    INTERNAL: InlineTab | null;
  }>({ CREATOR: null, INTERNAL: null });
  const [ lastPanelOpenByMode, setLastPanelOpenByMode ] = useState({ CREATOR: false, INTERNAL: false });
  const [ translationPreviewStatus, setTranslationPreviewStatus ] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const [ translationPreviewText, setTranslationPreviewText ] = useState<string | null>(null);
  const [ translationPreviewNotice, setTranslationPreviewNotice ] = useState<string | null>(null);
  const [ inviteCopyState, setInviteCopyState ] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [ inviteCopyError, setInviteCopyError ] = useState<string | null>(null);
  const [ inviteCopyUrl, setInviteCopyUrl ] = useState<string | null>(null);
  const [ inviteCopyToast, setInviteCopyToast ] = useState("");
  const inviteCopyToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schemaCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSendingRef = useRef(false);
  const internalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationPreviewAbortRef = useRef<AbortController | null>(null);
  const translationPreviewRequestId = useRef(0);
  const translationPreviewKeyRef = useRef<string | null>(null);
  const [ showContentModal, setShowContentModal ] = useState(false);
  const [ contentModalMode, setContentModalMode ] = useState<"packs" | "extras">("packs");
  const [ extraTierFilter, setExtraTierFilter ] = useState<"T0" | "T1" | "T2" | "T3" | "T4" | null>(null);
  const [ contentModalPackFocus, setContentModalPackFocus ] = useState<"WELCOME" | "MONTHLY" | "SPECIAL" | null>(null);
  const [ registerExtrasChecked, setRegisterExtrasChecked ] = useState(false);
  const [ registerExtrasSource, setRegisterExtrasSource ] = useState<string | null>(null);
  const [ transactionPrices, setTransactionPrices ] = useState<Record<string, number>>({});
  type TimeOfDayValue = "DAY" | "NIGHT" | "ANY";
  type ContentWithFlags = ContentItem & {
    pack: "WELCOME" | "MONTHLY" | "SPECIAL";
    hasBeenSentToFan?: boolean;
    isExtra?: boolean;
    extraTier?: "T0" | "T1" | "T2" | "T3" | null;
    timeOfDay?: TimeOfDayValue;
  };
  const [ contentItems, setContentItems ] = useState<ContentWithFlags[]>([]);
  const [ contentLoading, setContentLoading ] = useState(false);
  const [ contentError, setContentError ] = useState("");
  const [ loadingPaymentId, setLoadingPaymentId ] = useState<string | null>(null);
  const [ selectedContentIds, setSelectedContentIds ] = useState<string[]>([]);
  type TimeOfDayFilter = "all" | "day" | "night";
  const [ timeOfDayFilter, setTimeOfDayFilter ] = useState<TimeOfDayFilter>("all");
  const [ timeOfDay, setTimeOfDay ] = useState<TimeOfDayValue>(getCurrentTimeOfDay());
  const [ extraHistory, setExtraHistory ] = useState<
    {
      id: string;
      tier: "T0" | "T1" | "T2" | "T3";
      amount: number;
      sessionTag?: string | null;
      createdAt: string;
      contentItem: { id: string; title: string; type: string; timeOfDay?: TimeOfDayValue; isExtra?: boolean; extraTier?: string | null };
    }[]
  >([]);
  const [ extraHistoryError, setExtraHistoryError ] = useState("");
  const [ isLoadingExtraHistory, setIsLoadingExtraHistory ] = useState(false);
  const [ selectedExtraId, setSelectedExtraId ] = useState<string>("");
  const [ extraAmount, setExtraAmount ] = useState<number | "">("");
  const [ extraError, setExtraError ] = useState<string | null>(null);
  const [ showManualExtraForm, setShowManualExtraForm ] = useState(false);
  const [ isActionsMenuOpen, setIsActionsMenuOpen ] = useState(false);
  const [ isChatBlocked, setIsChatBlocked ] = useState(conversation.isBlocked ?? false);
  const [ isChatArchived, setIsChatArchived ] = useState(conversation.isArchived ?? false);
  const [ isChatActionLoading, setIsChatActionLoading ] = useState(false);
  const router = useRouter();
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const MAX_MESSAGE_HEIGHT = 96;
  const SCROLL_BOTTOM_THRESHOLD = 48;
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  type ManagerChatMessage = {
    id: string;
    role: "creator" | "manager";
    text: string;
    createdAt: string;
    title?: string;
    suggestions?: string[];
  };
  type ManagerSuggestion = {
    id: string;
    label: string;
    message: string;
    intent?: ManagerQuickIntent | string;
  };
  const [ managerChatByFan, setManagerChatByFan ] = useState<Record<string, ManagerChatMessage[]>>({});
  const [ managerChatInput, setManagerChatInput ] = useState("");
  const managerChatListRef = useRef<HTMLDivElement | null>(null);
  const managerChatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const managerPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const managerPanelScrollTopRef = useRef(0);
  const managerPanelStickToBottomRef = useRef(false);
  const internalChatScrollTopRef = useRef(0);
  const internalChatStickToBottomRef = useRef(true);
  const internalChatForceScrollRef = useRef(false);
  const [ internalMessages, setInternalMessages ] = useState<ApiMessage[]>([]);
  const [ internalMessagesError, setInternalMessagesError ] = useState("");
  const [ isLoadingInternalMessages, setIsLoadingInternalMessages ] = useState(false);
  const internalMessagesAbortRef = useRef<AbortController | null>(null);
  const [ managerSuggestions, setManagerSuggestions ] = useState<ManagerSuggestion[]>([]);
  const [ currentObjective, setCurrentObjective ] = useState<ManagerObjective | null>(null);
  const [ managerSummary, setManagerSummary ] = useState<FanManagerSummary | null>(null);
  const [ hasManualManagerObjective, setHasManualManagerObjective ] = useState(false);
  const [ autoPilotEnabled, setAutoPilotEnabled ] = useState(false);
  const [ isAutoPilotLoading, setIsAutoPilotLoading ] = useState(false);
  const [ lastAutopilotObjective, setLastAutopilotObjective ] = useState<AutopilotObjective | null>(null);
  const [ lastAutopilotTone, setLastAutopilotTone ] = useState<FanTone | null>(null);
  const fanManagerAnalysis: FanManagerStateAnalysis = useMemo(
    () => deriveFanManagerState({ fan: conversation, messages }),
    [conversation, messages]
  );
  const [ fanTone, setFanTone ] = useState<FanTone>(() => getDefaultFanTone(fanManagerAnalysis.state));
  const [ hasManualTone, setHasManualTone ] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const fanHeaderRef = useRef<HTMLDivElement | null>(null);
  const { config } = useCreatorConfig();
  const accessSummary = getAccessSummary({
    membershipStatus,
    daysLeft,
    hasAccessHistory: conversation.hasAccessHistory,
    activeGrantTypes: conversation.activeGrantTypes,
  });
  const accessState = conversation.accessState || getAccessState({ membershipStatus, daysLeft });
  const accessLabel = conversation.accessLabel || getAccessLabel({ membershipStatus, daysLeft });
  const packLabel = accessLabel || (selectedPackType ? PACKS[selectedPackType].name : null) || getAccessLabel({ membershipStatus, daysLeft });
  const followUpTag: FollowUpTag =
    conversationFollowUpTag ?? getFollowUpTag(membershipStatus, daysLeft, conversation.activeGrantTypes);
  const normalizedGrants = (conversation.activeGrantTypes ?? []).map((t) => t.toLowerCase());
const EXTRA_PRICES: Record<"T0" | "T1" | "T2" | "T3", number> = {
  T0: 0,
  T1: 9,
  T2: 25,
  T3: 60,
}; // TODO: leer estos precios desde config
const DEFAULT_EXTRA_TIER: "T0" | "T1" | "T2" | "T3" = "T1";
  const [ showQuickSheet, setShowQuickSheet ] = useState(false);
  const [ isDesktop, setIsDesktop ] = useState(false);
  const hasWelcome = normalizedGrants.includes("welcome") || normalizedGrants.includes("trial");
  const hasMonthly = normalizedGrants.includes("monthly");
  const hasSpecial = normalizedGrants.includes("special");
  const isAccessExpired = accessSummary.state === "EXPIRED";
  const canOfferMonthly = hasWelcome && !hasMonthly;
  const canOfferSpecial = hasMonthly && !hasSpecial;
  const isRecommended = (id: string) => Boolean(managerSummary?.recommendedButtons?.includes(id));

  type FanNote = {
    id: string;
    fanId: string;
    creatorId: string;
    content: string;
    createdAt: string;
  };

  function parseNextActionValue(value?: string | null) {
    if (!value) return { text: "", date: "", time: "" };
    const match = value.match(/\(para\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?\)/i);
    const date = match?.[1] ?? "";
    const time = match?.[2] ?? "";
    const text = value.replace(/\(para\s+(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?\)/i, "").trim();
    return { text, date, time };
  }

  function derivePackFromLabel(label?: string | null) {
    const lower = (label || "").toLowerCase();
    if (lower.includes("prueba")) return "trial";
    if (lower.includes("mensual")) return "monthly";
    if (lower.includes("individual")) return "special";
    return null;
  }

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight - el.clientHeight,
      behavior,
    });
  };

  const firstName = (contactName || "").split(" ")[0] || contactName || "";
  const messagesLength = messages?.length ?? 0;

  useEffect(() => {
    const parsed = parseNextActionValue(conversation.nextAction);
    setNextActionDraft(parsed.text);
    setNextActionDate(parsed.date);
    setNextActionTime(parsed.time);
  }, [conversation.id, conversation.nextAction]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewport = () => setIsDesktop(window.innerWidth >= 1024);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    setIsChatBlocked(conversation.isBlocked ?? false);
    setIsChatArchived(conversation.isArchived ?? false);
    resetMessageInputHeight();
  }, [conversation.id, conversation.isBlocked, conversation.isArchived]);

  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      const target = event.target as Node | null;
      if (actionsMenuRef.current && target && !actionsMenuRef.current.contains(target)) {
        setIsActionsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    adjustMessageInputHeight();
  }, [messageSend]);

  useEffect(() => {
    return () => {
      if (inviteCopyToastTimer.current) {
        clearTimeout(inviteCopyToastTimer.current);
      }
    };
  }, []);

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
    setIsAtBottom(true);
    scrollToBottom("auto");
  }, [conversation.id]);

  useIsomorphicLayoutEffect(() => {
    if (!isAtBottom) return;
    if (!messagesLength) return;
    scrollToBottom("smooth");
  }, [messagesLength, isAtBottom]);

  function getPackTypeFromName(name: string) {
    const lower = name.toLowerCase();
    if (lower.includes("bienvenida")) return "trial";
    if (lower.includes("mensual")) return "monthly";
    if (lower.includes("especial")) return "special";
    return null;
  }

  function findPackByType(type: "trial" | "monthly" | "special") {
    return config.packs.find((pack) => getPackTypeFromName(pack.name) === type);
  }

  function computeDaysLeft(expiresAt: string | Date) {
    const now = new Date();
    const exp = new Date(expiresAt);
    const diff = exp.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function mapFansForRecommendation(rawFans: Fan[]): ConversationListData[] {
    return rawFans.map((fan) => ({
      id: fan.id,
      contactName: getFanDisplayNameForCreator(fan),
      displayName: fan.displayName ?? null,
      creatorLabel: fan.creatorLabel ?? null,
      preferredLanguage: normalizePreferredLanguage(fan.preferredLanguage) ?? null,
      lastMessage: fan.preview,
      lastTime: fan.time,
      image: fan.avatar || "/avatar.jpg",
      messageHistory: [],
      membershipStatus: fan.membershipStatus,
      accessState: (fan as any).accessState,
      accessType: (fan as any).accessType,
      accessLabel: (fan as any).accessLabel,
      daysLeft: fan.daysLeft,
      activeGrantTypes: fan.activeGrantTypes ?? [],
      hasAccessHistory: fan.hasAccessHistory ?? false,
      unreadCount: fan.unreadCount,
      isNew: fan.isNew,
      lastSeen: fan.lastSeen,
      lastSeenAt: fan.lastSeenAt ?? null,
      lastCreatorMessageAt: fan.lastCreatorMessageAt,
      followUpTag: getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
      notesCount: fan.notesCount,
      lifetimeValue: fan.lifetimeValue,
      customerTier: fan.customerTier,
      priorityScore: fan.priorityScore,
      nextAction: fan.nextAction,
      lastNoteSnippet: fan.lastNoteSnippet,
      nextActionSnippet: fan.nextActionSnippet,
      lastNoteSummary: fan.lastNoteSummary,
      nextActionSummary: fan.nextActionSummary,
      urgencyLevel: getUrgencyLevel(getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes), fan.daysLeft),
      paidGrantsCount: fan.paidGrantsCount,
      extrasCount: fan.extrasCount ?? 0,
      extrasSpentTotal: fan.extrasSpentTotal ?? 0,
      lastGrantType: (fan as any).lastGrantType ?? null,
      maxExtraTier: fan.maxExtraTier ?? null,
      novsyStatus: fan.novsyStatus ?? null,
      isHighPriority: fan.isHighPriority ?? false,
      highPriorityAt: fan.highPriorityAt ?? null,
      extraLadderStatus: fan.extraLadderStatus ?? null,
      firstUtmSource: (fan as any).firstUtmSource ?? null,
      firstUtmMedium: (fan as any).firstUtmMedium ?? null,
      firstUtmCampaign: (fan as any).firstUtmCampaign ?? null,
      firstUtmContent: (fan as any).firstUtmContent ?? null,
      firstUtmTerm: (fan as any).firstUtmTerm ?? null,
    }));
  }

  function formatLastCreatorMessage(lastMessage?: string | null) {
    if (!lastMessage) return "Nunca";
    const last = new Date(lastMessage);
    const now = new Date();
    const sameDay =
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate();
    if (sameDay) return "Hoy";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      last.getFullYear() === yesterday.getFullYear() &&
      last.getMonth() === yesterday.getMonth() &&
      last.getDate() === yesterday.getDate();
    if (isYesterday) return "Ayer";

    const diffDays = Math.ceil((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;

    return last.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  }

  function formatNoteDate(dateStr: string) {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
  }

  type PackStatus = "active" | "expired" | "never";

  function getPackStatusForType(type: "trial" | "monthly" | "special"): { status: PackStatus; daysLeft?: number } {
    const grantsForType = accessGrants.filter((g) => g.type === type);
    if (!grantsForType.length) return { status: "never" };

    const now = new Date();
    const activeGrant = grantsForType.find((g) => new Date(g.expiresAt) > now);
    if (activeGrant) {
      return { status: "active", daysLeft: computeDaysLeft(activeGrant.expiresAt) };
    }

    return { status: "expired" };
  }

  function buildPackProposalMessage(pack: { name: string; price: string; description: string }) {
    return `Te propongo el ${pack.name} (${pack.price}): ${pack.description} Si te encaja, te envío el enlace de pago: [pega aquí tu enlace].`;
  }

  function mapGrantType(type: string) {
    if (type === "trial") return { label: "Prueba 7 días", amount: 0 };
    if (type === "monthly") return { label: "Suscripción mensual", amount: 25 };
    if (type === "special") return { label: "Pack especial pareja", amount: 49 };
    return { label: type, amount: 0 };
  }

  function formatGrantDate(dateString: string) {
    const d = new Date(dateString);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function mapGrantLevel(type?: string | null): 1 | 2 | 3 | null {
    if (!type) return null;
    const lower = type.toLowerCase();
    if (lower === "special" || lower === "single") return 3;
    if (lower === "monthly") return 2;
    if (lower === "trial" || lower === "welcome") return 1;
    return null;
  }

  function mapLastGrantToPackType(type?: string | null): "trial" | "monthly" | "special" {
    const lower = (type || "").toLowerCase();
    if (lower === "special" || lower === "single") return "special";
    if (lower === "trial" || lower === "welcome") return "trial";
    return "monthly";
  }

  function getCurrentTimeOfDay(): TimeOfDayValue {
    const h = new Date().getHours();
    return h >= 7 && h < 19 ? "DAY" : "NIGHT";
  }

  function getFanMaxPackLevel() {
    const levels = accessGrants
      .map((grant) => mapGrantLevel(grant.type))
      .filter((lvl): lvl is 1 | 2 | 3 => !!lvl);
    if (levels.length === 0) {
      const activeLevels = (conversation.activeGrantTypes ?? [])
        .map((type) => mapGrantLevel(type))
        .filter((lvl): lvl is 1 | 2 | 3 => !!lvl);
      if (activeLevels.length === 0) return null;
      return Math.max(...activeLevels);
    }
    return Math.max(...levels);
  }

  function getGrantStatus(expiresAt?: string | null) {
    if (!expiresAt) return "Sin fecha";
    const now = new Date();
    const exp = new Date(expiresAt);
    return exp > now ? "Activo" : "Caducado";
  }

  function getCustomerTierFromSpend(total: number): "new" | "regular" | "vip" {
    if (total >= 200) return "vip";
    if (total >= 50) return "regular";
    return "new";
  }

  function getQueuePosition() {
    if (!queueMode || !conversation?.id) return { index: -1, size: todayQueue.length };
    const idx = todayQueue.findIndex((f) => f.id === conversation.id);
    return { index: idx, size: todayQueue.length };
  }

  function fillMessage(template: string) {
    setMessageSend(template);
  }
  const focusMainMessageInput = (text: string) => {
    setMessageSend(text);
    requestAnimationFrame(() => {
      adjustMessageInputHeight();
      const input = messageInputRef.current;
      if (input) {
        input.focus();
        const len = text.length;
        input.setSelectionRange(len, len);
        input.scrollIntoView({ block: "nearest" });
      }
    });
  };
  const handleApplyManagerSuggestion = (text: string) => {
    const filled = text.replace("{nombre}", getFirstName(contactName) || contactName || "");
    handleUseManagerReplyAsMainMessage(filled);
  };
  function handleComposerAudienceChange(mode: ComposerAudienceMode) {
    if (mode === composerAudience) return;
    setLastPanelOpenByMode((prev) => ({
      ...prev,
      [composerAudience]: inlinePanel !== null,
    }));
    setComposerAudience(mode);
    setInlinePanel(null);
  }
  const handleSelectFanFromBanner = useCallback(
    (fan: ConversationListData | null) => {
      if (!fan?.id) return;
      void router.push(
        {
          pathname: router.pathname || "/",
          query: { fanId: fan.id },
        },
        undefined,
        { shallow: true }
      );
      setConversation(fan as any);
    },
    [router, setConversation]
  );
  function handleManagerSuggestion(text: string) {
    handleApplyManagerSuggestion(text);
  }

  function handleUseManagerReplyAsMainMessage(text: string) {
    handleComposerAudienceChange("CREATOR");
    focusMainMessageInput(text);
  }

  const handleChangeFanTone = useCallback((tone: FanTone) => {
    setFanTone(tone);
    setHasManualTone(true);
  }, []);

  function formatObjectiveLabel(objective?: ManagerObjective | null) {
    switch (objective) {
      case "bienvenida":
        return "Bienvenida";
      case "romper_hielo":
        return "Romper el hielo";
      case "reactivar_fan_frio":
        return "Reactivar fan frío";
      case "ofrecer_extra":
        return "Ofrecer un extra";
      case "llevar_a_mensual":
        return "Llevar a mensual";
      case "renovacion":
        return "Renovación";
      default:
        return null;
    }
  }

  function formatToneLabel(tone?: FanTone | null) {
    if (tone === "suave") return "Suave";
    if (tone === "picante") return "Picante";
    if (tone === "intimo") return "Íntimo";
    return null;
  }

  const managerPromptTemplate = (() => {
    const objective = currentObjective ?? fanManagerAnalysis.defaultObjective;
    if (!objective || !fanTone) return null;
    return getManagerPromptTemplate({
      tone: fanTone,
      objective,
      fan: conversation,
    });
  })();

  const handleToggleAutoPilot = useCallback(() => {
    setAutoPilotEnabled((prev) => !prev);
  }, []);

  function getFirstName(name?: string | null) {
    if (!name) return "";
    const first = name.trim().split(" ")[0];
    return first;
  }

  function buildFollowUpTrialMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} ¿cómo te han sentado estos días de prueba?\n\n` +
      "Tu período de prueba termina en breve. Si quieres que sigamos trabajando juntos, la suscripción mensual (25 €) incluye chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vais viviendo.\n\n" +
      "¿Quieres que te pase el enlace para entrar ya o prefieres primero contarme cómo te has sentido con estos días de prueba?"
    );
  }

  function buildFollowUpMonthlyMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} vengo a hacer un check rápido contigo.\n\n` +
      "Tu suscripción está a punto de renovarse. Antes de que eso pase, cuéntame en una frase: ¿qué ha sido lo más útil para ti este mes?\n\n" +
      "Si quieres que sigamos, te dejo el enlace de renovación: [pega aquí tu enlace].\n" +
      "Si sientes que hay algo que ajustar (ritmo, enfoque, tipo de contenido), dímelo y lo acomodamos."
    );
  }

  function buildFollowUpExpiredMessage(firstName?: string) {
    const greeting = firstName ? `Hola ${firstName},` : "Hola,";
    return (
      `${greeting} he visto que tu acceso ya ha caducado y quería preguntarte algo antes de dejarlo aquí.\n\n` +
      "En estos días, ¿qué fue lo que más te movió o te ayudó de lo que hemos trabajado juntos?\n\n" +
      "Si notas que aún queda tema pendiente y quieres retomar, puedo proponerte tres opciones sencillas (audio puntual, pack especial o un mes de suscripción) y eliges lo que mejor encaje."
    );
  }

  async function handleQuickGreeting() {
    await handleQuickTemplateClick("welcome");
  }

  function handleWelcomePack() {
    const welcomePackMessage =
      "Te propongo el Pack bienvenida (9 €): primer contacto + 3 audios base personalizados. Si te encaja, te envío el enlace de pago.";
    fillMessage(welcomePackMessage);
    setShowPackSelector(false);
    setOpenPanel("none");
  }

  function handleChoosePack(defaultType?: "trial" | "monthly" | "special") {
    if (defaultType) {
      setSelectedPackType(defaultType);
    }
    setShowPackSelector((prev) => (defaultType ? true : !prev));
    setOpenPanel("none");
  }

  function handleNextInQueue() {
    if (!queueMode) return;
    const currentIdx = queueStatus.index >= 0 ? queueStatus.index : queueIndex;
    const nextIdx = Math.min(currentIdx + 1, todayQueue.length - 1);
    if (nextIdx <= currentIdx || nextIdx < 0 || nextIdx >= todayQueue.length) return;
    const nextFan = todayQueue[nextIdx];
    setQueueIndex(nextIdx);
    if (nextFan) {
      setConversation(nextFan as any);
    }
  }

  function handleSubscriptionLink() {
    const subscriptionLinkMessage =
      "Aquí tienes el enlace para la suscripción mensual (25 €):\n\n" +
      "👉 [pega aquí tu enlace]\n\n" +
      "Incluye: acceso al chat 1:1 conmigo y contenido nuevo cada semana, adaptado a lo que vas viviendo.\n" +
      "Si tienes alguna duda antes de entrar, dímelo y lo aclaramos.";
    fillMessage(subscriptionLinkMessage);
    setShowPackSelector(false);
    setOpenPanel("none");
  }

  const [iaBlocked, setIaBlocked] = useState(false);
  const [iaMessage, setIaMessage] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    creditsAvailable: number;
    hardLimitPerDay: number | null;
    usedToday: number;
    remainingToday: number | null;
    limitReached: boolean;
    turnMode?: AiTurnMode;
  } | null>(null);
  const [aiTone, setAiTone] = useState<AiTone>("cercano");
  const [aiTurnMode, setAiTurnMode] = useState<AiTurnMode>("auto");

  async function fetchAiStatus() {
    try {
      const res = await fetch("/api/creator/ai/status");
      if (!res.ok) throw new Error("status failed");
      const data = await res.json();
      setAiStatus({
        creditsAvailable: data.creditsAvailable ?? 0,
        hardLimitPerDay: data.hardLimitPerDay ?? null,
        usedToday: data.usedToday ?? 0,
        remainingToday: data.remainingToday ?? null,
        limitReached: Boolean(data.limitReached),
        turnMode: data.turnMode as AiTurnMode | undefined,
      });
      setIaBlocked(Boolean(data.limitReached));
      if (typeof data.turnMode === "string") {
        setAiTurnMode(normalizeAiTurnMode(data.turnMode));
      }
    } catch (err) {
      console.error("Error obteniendo estado de IA", err);
    }
  }

  async function fetchAiSettingsTone() {
    try {
      const res = await fetch("/api/creator/ai-settings");
      if (!res.ok) throw new Error("settings failed");
      const data = await res.json();
      const tone = data?.settings?.tone;
      if (typeof tone === "string" && tone.trim().length > 0) {
        setAiTone(normalizeTone(tone));
      }
      const mode = data?.settings?.turnMode;
      if (typeof mode === "string") {
        setAiTurnMode(normalizeAiTurnMode(mode));
      }
    } catch (err) {
      console.error("Error obteniendo ajustes de IA", err);
    }
  }

  function getExtraTier(item?: ContentWithFlags | null): "T0" | "T1" | "T2" | "T3" {
    return (item?.extraTier as "T0" | "T1" | "T2" | "T3") ?? DEFAULT_EXTRA_TIER;
  }

  function getExtraPrice(item?: ContentWithFlags | null): number {
    const tier = getExtraTier(item);
    return EXTRA_PRICES[tier] ?? EXTRA_PRICES.T1;
  }

  async function registerExtraSale({
    fanId,
    extraId,
    amount,
    tier,
    sessionTag,
    source,
  }: {
    fanId: string;
    extraId: string;
    amount: number;
    tier: "T0" | "T1" | "T2" | "T3";
    sessionTag?: string | null;
    source?: string | null;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!fanId || !extraId) return { ok: false, error: "Datos incompletos." };
    try {
      const payload = {
        fanId,
        contentItemId: extraId,
        tier,
        amount,
        sessionTag,
        source,
      };
      const res = await fetch("/api/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, error: errText || "No se pudo registrar el extra." };
      }
      const prevExtrasCount = conversation.extrasCount ?? 0;
      const prevExtrasTotal = conversation.extrasSpentTotal ?? 0;
      const prevLifetime = conversation.lifetimeSpend ?? 0;
      const updatedExtrasCount = prevExtrasCount + 1;
      const updatedExtrasTotal = prevExtrasTotal + amount;
      const updatedLifetime = prevLifetime + amount;
      const updatedTier = getCustomerTierFromSpend(updatedLifetime);
      const updatedHighPriority = conversation.isHighPriority ?? false;
      setConversation({
        ...conversation,
        extrasCount: updatedExtrasCount,
        extrasSpentTotal: updatedExtrasTotal,
        lifetimeSpend: updatedLifetime,
        lifetimeValue: updatedLifetime,
        customerTier: updatedTier,
        isHighPriority: updatedHighPriority,
      });
      await refreshFanData(fanId);
      await fetchExtrasHistory(fanId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(EXTRAS_UPDATED_EVENT, {
            detail: {
              fanId,
              totals: {
                extrasCount: updatedExtrasCount,
                extrasSpentTotal: updatedExtrasTotal,
                lifetimeSpend: updatedLifetime,
                lifetimeValue: updatedLifetime,
                customerTier: updatedTier,
                isHighPriority: updatedHighPriority,
              },
            },
          })
        );
      }
      return { ok: true };
    } catch (_err) {
      return { ok: false, error: "No se pudo registrar el extra." };
    }
  }

  async function logTemplateUsage(suggestedText: string, usage: AiTemplateUsage): Promise<boolean> {
    const actionType = ACTION_TYPE_FOR_USAGE[usage] ?? ACTION_TYPE_FOR_USAGE.extra_quick;
    try {
      const res = await fetch("/api/creator/ai/log-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: id,
          actionType,
          suggestedText,
          outcome: "suggested",
          creditsUsed: 1,
          turnMode: aiTurnMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 429 && data?.code === "AI_HARD_LIMIT_REACHED") {
          setIaMessage("Has alcanzado el límite diario de IA por hoy.");
          setIaBlocked(true);
          fetchAiStatus();
          return false;
        }
        if (res.status === 402 && data?.code === "AI_NO_CREDITS_LEFT") {
          setIaMessage("No te quedan créditos de IA disponibles.");
          setIaBlocked(true);
          fetchAiStatus();
          return false;
        }
        console.error("Error desconocido al registrar IA", data);
        return false;
      } else {
        setIaMessage(null);
        setIaBlocked(false);
        fetchAiStatus();
      }
    } catch (err) {
      console.error("Error al registrar uso de IA", err);
      setIaMessage("No se pudo registrar el uso de IA.");
      return false;
    }

    return true;
  }

  async function handleQuickExtraClick() {
    await handleQuickTemplateClick("extra_quick");
  }

  async function requestSuggestedText(usage: AiTemplateUsage, fallbackUsage?: AiTemplateUsage | null): Promise<string | null> {
    try {
      const res = await fetch("/api/creator/ai/quick-extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: aiTone, fanId: id, usage, fallbackUsage, mode: aiTurnMode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 404 && data?.error === "NO_TEMPLATES_FOR_USAGE") {
          setIaMessage("No hay plantillas activas para este uso.");
          return null;
        }
        console.error("Error obteniendo sugerencia IA", data);
        setIaMessage("No se pudo generar la sugerencia de IA.");
        return null;
      }

      const data = await res.json();
      const suggestedText = typeof data?.suggestedText === "string" ? data.suggestedText : "";
      if (!suggestedText) {
        setIaMessage("No se pudo generar la sugerencia de IA.");
        return null;
      }
      return suggestedText;
    } catch (err) {
      console.error("Error obteniendo sugerencia IA", err);
      setIaMessage("No se pudo generar la sugerencia de IA.");
      return null;
    }
  }

  async function handleQuickTemplateClick(usage: AiTemplateUsage) {
    setIaMessage(null);
    const suggestedText = await requestSuggestedText(usage, plan.suggestedUsage ?? undefined);
    if (!suggestedText) return;
    const enriched =
      usage === "pack_offer" && conversation.extraLadderStatus?.suggestedTier
        ? suggestedText.replace(/Pack especial/gi, `Pack especial ${conversation.extraLadderStatus.suggestedTier}`)
        : suggestedText;
    setMessageSend(enriched);
    await logTemplateUsage(enriched, usage);
    if (usage === "extra_quick") {
      const nextFilter = timeOfDay === "NIGHT" ? "night" : "day";
      setTimeOfDayFilter(nextFilter as TimeOfDayFilter);
      const suggestedTier = (conversation.extraLadderStatus?.suggestedTier as "T0" | "T1" | "T2" | "T3" | "T4" | null) ?? null;
      openContentModal({ mode: "extras", tier: suggestedTier, defaultRegisterExtras: true, registerSource: "offer_flow" });
    }
    if (usage === "pack_offer") {
      openContentModal({ mode: "packs", packFocus: "SPECIAL" });
    }
  }

  function openContentModal(options?: { mode?: "packs" | "extras"; tier?: "T0" | "T1" | "T2" | "T3" | "T4" | null; packFocus?: "WELCOME" | "MONTHLY" | "SPECIAL" | null; defaultRegisterExtras?: boolean; registerSource?: string | null }) {
    const nextMode = options?.mode ?? "packs";
    setContentModalMode(nextMode);
    setExtraTierFilter(options?.tier ?? null);
    setContentModalPackFocus(options?.packFocus ?? null);
    setRegisterExtrasChecked(options?.defaultRegisterExtras ?? false);
    setRegisterExtrasSource(options?.registerSource ?? null);
    setTransactionPrices({});
    setOpenPanel("none");
    setShowPackSelector(false);
    setSelectedContentIds([]);
    fetchContentItems(id);
    if (id) fetchAccessGrants(id);
    setShowContentModal(true);
  }

  function handleOpenExtrasPanel() {
    const nextFilter = timeOfDay === "NIGHT" ? "night" : "day";
    setTimeOfDayFilter(nextFilter as TimeOfDayFilter);
    setIsActionsMenuOpen(false);
    openContentModal({ mode: "extras", tier: null, defaultRegisterExtras: false, registerSource: null });
  }

  function fillMessageFromPackType(type: "trial" | "monthly" | "special") {
    const pack = findPackByType(type);
    if (pack) {
      fillMessage(buildPackProposalMessage(pack));
    }
  }

  type FollowUpTemplate = {
    id: string;
    label: string;
    text: string;
  };

  function getFollowUpTemplates({
    followUpTag,
    daysLeft,
    fanName,
  }: {
    followUpTag: FollowUpTag;
    daysLeft: number | null | undefined;
    fanName: string;
  }): FollowUpTemplate[] {
    const first = getFirstName(fanName);

    if (followUpTag === "trial_soon") {
      return [
        {
          id: "trial-main",
          label: "Seguimiento prueba",
          text: buildFollowUpTrialMessage(first),
        },
      ];
    }

    if (followUpTag === "monthly_soon") {
      return [
        {
          id: "monthly-main",
          label: "Seguimiento suscripción",
          text: buildFollowUpMonthlyMessage(first),
        },
      ];
    }

    if (followUpTag === "expired") {
      return [
        {
          id: "expired-main",
          label: "Seguimiento caducado",
          text: buildFollowUpExpiredMessage(first),
        },
      ];
    }

    return [];
  }

  const fetchAccessGrants = useCallback(async (fanId: string) => {
    try {
      setAccessGrantsLoading(true);
      const res = await fetch(`/api/access/grant?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const grants = Array.isArray(data.activeGrants)
        ? data.activeGrants
        : Array.isArray(data.grants)
        ? data.grants
        : [];
      setAccessGrants(grants);
    } catch (_err) {
      setAccessGrants([]);
    } finally {
      setAccessGrantsLoading(false);
    }
  }, []);

  const fetchFanNotes = useCallback(async (fanId: string) => {
    try {
      setNotesLoading(true);
      setNotesError("");
      const res = await fetch(`/api/fan-notes?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const sorted = Array.isArray(data.notes)
        ? [...data.notes].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        : [];
      setNotes(sorted);
    } catch (_err) {
      setNotes([]);
      setNotesError("Error cargando notas");
    } finally {
      setNotesLoading(false);
    }
  }, []);

  async function fetchHistory(fanId: string) {
    try {
      setHistoryError("");
      const res = await fetch(`/api/fans/history?fanId=${fanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const history = Array.isArray(data.history) ? data.history : [];
      setAccessGrants(history);
    } catch (_err) {
      setHistoryError("Error cargando historial");
    }
  }

  const fetchContentItems = useCallback(async (targetFanId?: string) => {
    try {
      setContentLoading(true);
      setContentError("");
      const url = targetFanId ? `/api/content?fanId=${encodeURIComponent(targetFanId)}` : "/api/content";
      const res = await fetch(url);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const items = Array.isArray(data.items) ? (data.items as ContentWithFlags[]) : [];
      setContentItems(items);
    } catch (_err) {
      setContentError("Error cargando contenidos");
      setContentItems([]);
    } finally {
      setContentLoading(false);
    }
  }, []);

  async function fetchExtrasHistory(fanId: string) {
    try {
      setExtraHistoryError("");
      setIsLoadingExtraHistory(true);
      const res = await fetch(`/api/extras?fanId=${fanId}`);
      if (!res.ok) {
        console.error("Error fetching extras", res.statusText);
        setExtraHistory([]);
        setExtraHistoryError("");
        return;
      }
      const data = await res.json();
      const history = Array.isArray(data.history) ? data.history : [];
      setExtraHistory(history);
    } catch (_err) {
      setExtraHistory([]);
      setExtraHistoryError("");
    } finally {
      setIsLoadingExtraHistory(false);
    }
  }

  const fetchRecommendedFan = useCallback(async (rawFans?: Fan[]) => {
    try {
      const fansData = rawFans
        ? rawFans
        : await (async () => {
            const res = await fetch("/api/fans");
            if (!res.ok) throw new Error("error");
            const data = await res.json();
            const payloadFans = Array.isArray(data.items)
              ? (data.items as Fan[])
              : Array.isArray(data.fans)
              ? (data.fans as Fan[])
              : [];
            return payloadFans;
          })();
      const mapped = mapFansForRecommendation(fansData);
      const rec = getRecommendedFan(mapped);
      setRecommendedFan(rec ?? null);
    } catch (_err) {
      setRecommendedFan(null);
    }
  }, []);

  async function refreshFanData(fanId: string) {
    try {
      const res = await fetch(`/api/fans?fanId=${encodeURIComponent(fanId)}`);
      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) return;
      if (!res.ok || !data?.ok) throw new Error("error");
      const rawFans = Array.isArray(data.items)
        ? (data.items as Fan[])
        : Array.isArray(data.fans)
        ? (data.fans as Fan[])
        : [];
      const targetFan = rawFans.find((fan) => fan.id === fanId);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("fanDataUpdated", { detail: { fans: rawFans } }));
      }

      if (targetFan) {
        const prev = conversation;
        setConversation({
          ...prev,
          id: targetFan.id,
          contactName: getFanDisplayNameForCreator(targetFan),
          displayName: targetFan.displayName ?? prev.displayName ?? null,
          creatorLabel: targetFan.creatorLabel ?? prev.creatorLabel ?? null,
          preferredLanguage: normalizePreferredLanguage(targetFan.preferredLanguage) ?? null,
          membershipStatus: targetFan.membershipStatus,
          daysLeft: targetFan.daysLeft,
          activeGrantTypes: targetFan.activeGrantTypes ?? prev.activeGrantTypes,
          hasAccessHistory: targetFan.hasAccessHistory ?? prev.hasAccessHistory,
          lastSeen: targetFan.lastSeen || prev.lastSeen,
          lastSeenAt: (targetFan as any).lastSeenAt ?? prev.lastSeenAt ?? null,
          lastTime: targetFan.time || prev.lastTime,
          image: targetFan.avatar || prev.image,
          followUpTag: getFollowUpTag(targetFan.membershipStatus, targetFan.daysLeft, targetFan.activeGrantTypes),
          lastCreatorMessageAt: targetFan.lastCreatorMessageAt ?? prev.lastCreatorMessageAt,
          notesCount: targetFan.notesCount ?? prev.notesCount,
          nextAction: targetFan.nextAction ?? prev.nextAction,
          lastGrantType: (targetFan as any).lastGrantType ?? prev.lastGrantType ?? null,
          extrasCount: targetFan.extrasCount ?? prev.extrasCount,
          extrasSpentTotal: targetFan.extrasSpentTotal ?? prev.extrasSpentTotal,
          maxExtraTier: (targetFan as any).maxExtraTier ?? prev.maxExtraTier,
          novsyStatus: (targetFan as any).novsyStatus ?? prev.novsyStatus ?? null,
          isHighPriority: (targetFan as any).isHighPriority ?? prev.isHighPriority ?? false,
          highPriorityAt: (targetFan as any).highPriorityAt ?? prev.highPriorityAt ?? null,
          extraLadderStatus:
            "extraLadderStatus" in targetFan
              ? ((targetFan as any).extraLadderStatus ?? null)
              : prev.extraLadderStatus ?? null,
          extraSessionToday:
            "extraSessionToday" in targetFan
              ? ((targetFan as any).extraSessionToday ?? null)
              : (prev as any).extraSessionToday ?? null,
        });
        await fetchRecommendedFan();
      }
      setSchemaError(null);
    } catch (_err) {
      // silent fail; UI remains with previous data
    }
  }

  const mapApiMessagesToState = useCallback((apiMessages: ApiMessage[]): ConversationMessage[] => {
    return apiMessages.map((msg) => {
      const isContent = msg.type === "CONTENT";
      return {
        id: msg.id,
        fanId: msg.fanId,
        me: msg.from === "creator",
        message: msg.text,
        translatedText: msg.creatorTranslatedText ?? undefined,
        audience: deriveAudience(msg),
        seen: !!msg.isLastFromCreator,
        time: msg.time || "",
        createdAt: (msg as any)?.createdAt ?? undefined,
        status: "sent",
        kind: isContent ? "content" : "text",
        type: msg.type,
        contentItem: msg.contentItem
          ? {
              id: msg.contentItem.id,
              title: msg.contentItem.title,
              type: msg.contentItem.type,
              visibility: msg.contentItem.visibility,
              externalUrl: msg.contentItem.externalUrl,
            }
          : null,
      };
    });
  }, []);

  const messagesAbortRef = useRef<AbortController | null>(null);
  const messagesPollRef = useRef<NodeJS.Timeout | null>(null);

  const handleSchemaOutOfSync = useCallback((payload: any) => {
    if (!isDbSchemaOutOfSyncPayload(payload)) return false;
    const fix = Array.isArray(payload.fix) && payload.fix.length > 0 ? payload.fix : [...DB_SCHEMA_OUT_OF_SYNC_FIX];
    const message =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : DB_SCHEMA_OUT_OF_SYNC_MESSAGE;
    setSchemaError({ errorCode: payload.errorCode, message, fix });
    setSchemaCopyState("idle");
    return true;
  }, []);

  const handleCopySchemaFix = useCallback(async () => {
    if (!schemaError) return;
    const commands = schemaError.fix?.length ? schemaError.fix : DB_SCHEMA_OUT_OF_SYNC_FIX;
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setSchemaCopyState("copied");
    } catch (_err) {
      setSchemaCopyState("error");
    }
    if (schemaCopyTimer.current) {
      clearTimeout(schemaCopyTimer.current);
    }
    schemaCopyTimer.current = setTimeout(() => {
      setSchemaCopyState("idle");
    }, 1600);
  }, [schemaError]);

  const fetchMessages = useCallback(
    async (shouldShowLoading = false) => {
      if (!id) return;
      if (messagesAbortRef.current) {
        messagesAbortRef.current.abort();
      }
      const controller = new AbortController();
      messagesAbortRef.current = controller;
      try {
        if (shouldShowLoading) {
          setIsLoadingMessages(true);
        }
        setMessagesError("");
        const params = new URLSearchParams({ fanId: id, markRead: "1", audiences: "FAN,CREATOR" });
        const res = await fetch(`/api/messages?${params.toString()}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (handleSchemaOutOfSync(data)) return;
        if (!res.ok || !data?.ok) throw new Error(data?.error || "error");
        const source = Array.isArray(data.items)
          ? (data.items as ApiMessage[])
          : Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : [];
        const visible = source.filter((msg) => isVisibleToFan(msg));
        const mapped = mapApiMessagesToState(visible);
        setMessage((prev) => reconcileMessages(prev || [], mapped, id));
        setSchemaError(null);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setMessagesError("Error cargando mensajes");
      } finally {
        if (shouldShowLoading) {
          setIsLoadingMessages(false);
        }
      }
    },
    [handleSchemaOutOfSync, id, mapApiMessagesToState, setMessage]
  );

  const fetchInternalMessages = useCallback(
    async (shouldShowLoading = false) => {
      if (!id) return;
      if (internalMessagesAbortRef.current) {
        internalMessagesAbortRef.current.abort();
      }
      const controller = new AbortController();
      internalMessagesAbortRef.current = controller;
      try {
        if (shouldShowLoading) {
          setIsLoadingInternalMessages(true);
        }
        setInternalMessagesError("");
        const params = new URLSearchParams({ fanId: id, audiences: "INTERNAL" });
        const res = await fetch(`/api/messages?${params.toString()}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (handleSchemaOutOfSync(data)) return;
        if (!res.ok || !data?.ok) throw new Error(data?.error || "error");
        const source = Array.isArray(data.items)
          ? (data.items as ApiMessage[])
          : Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : [];
        const internalOnly = source.filter((msg) => deriveAudience(msg) === "INTERNAL");
        setInternalMessages((prev) => reconcileApiMessages(prev, internalOnly, id));
        setSchemaError(null);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setInternalMessagesError("Error cargando mensajes internos");
      } finally {
        if (shouldShowLoading) {
          setIsLoadingInternalMessages(false);
        }
      }
    },
    [handleSchemaOutOfSync, id]
  );

  useEffect(() => {
    if (!id) return;
    setMessage([]);
    fetchMessages(true);
    return () => {
      if (messagesAbortRef.current) {
        messagesAbortRef.current.abort();
      }
    };
  }, [fetchMessages, id, setMessage]);

  useEffect(() => {
    setSchemaError(null);
    setSchemaCopyState("idle");
    setInternalToast(null);
    if (internalToastTimer.current) {
      clearTimeout(internalToastTimer.current);
    }
  }, [id]);

  useEffect(() => {
    setInternalMessages([]);
    setInternalMessagesError("");
    if (internalMessagesAbortRef.current) {
      internalMessagesAbortRef.current.abort();
    }
  }, [id]);

  useEffect(() => {
    if (!id || composerAudience !== "INTERNAL") return;
    if (inlinePanel !== "manager" || internalPanelTab !== "internal") return;
    fetchInternalMessages(true);
    return () => {
      if (internalMessagesAbortRef.current) {
        internalMessagesAbortRef.current.abort();
      }
    };
  }, [fetchInternalMessages, id, inlinePanel, composerAudience, internalPanelTab]);

  useEffect(() => {
    if (!id) return undefined;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchMessages(false);
    }, 1800);
    messagesPollRef.current = interval as any;
    return () => {
      if (messagesPollRef.current) clearInterval(messagesPollRef.current as any);
      if (messagesAbortRef.current) messagesAbortRef.current.abort();
    };
  }, [fetchMessages, id]);
  useEffect(() => {
    setMessageSend("");
    setShowPackSelector(false);
    setOpenPanel("none");
    setNotes([]);
    setNoteDraft("");
    setNotesError("");
    setNextActionDraft(conversation.nextAction || "");
    const derivedPack = derivePackFromLabel(membershipStatus || accessLabel) || "monthly";
    setSelectedPackType(derivedPack);
  }, [accessLabel, conversation.id, conversation.nextAction, membershipStatus]);

  useEffect(() => {
    const normalized = normalizePreferredLanguage(conversation.preferredLanguage) ?? null;
    setPreferredLanguage(normalized);
    setPreferredLanguageError(null);
  }, [conversation.preferredLanguage, showQuickSheet]);

  useEffect(() => {
    if (!id) return;
    fetchAccessGrants(id);
    fetchRecommendedFan();
  }, [fetchAccessGrants, fetchRecommendedFan, id]);

  useEffect(() => {
    if (id) {
      fetchContentItems(id);
    }
  }, [fetchContentItems, id]);

  useEffect(() => {
    if (!queueMode) return;
    if (!conversation?.id) return;
    const idx = todayQueue.findIndex((f) => f.id === conversation.id);
    // Si el fan actual no está en la cola, mantenemos queueMode activo pero ocultamos el botón de siguiente.
    if (idx >= 0 && idx !== queueIndex) {
      setQueueIndex(idx);
    }
  }, [conversation?.id, queueMode, todayQueue, queueIndex, setQueueIndex]);

useEffect(() => {
  if (!id || composerAudience !== "INTERNAL") return;
  if (inlinePanel !== "manager" || internalPanelTab !== "note") return;
  fetchFanNotes(id);
}, [id, inlinePanel, composerAudience, internalPanelTab, fetchFanNotes]);

useEffect(() => {
  if (!id || openPanel !== "history") return;
  fetchHistory(id);
}, [id, openPanel]);

  useEffect(() => {
    if (!id || openPanel !== "extras") return;
    fetchExtrasHistory(id);
  }, [id, openPanel]);

  useEffect(() => {
    setInviteCopyState("idle");
    setInviteCopyError(null);
    setInviteCopyUrl(null);
  }, [id, showQuickSheet]);

useEffect(() => {
  if (!showContentModal) return;
  if (contentModalMode !== "extras") return;
  if (selectedContentIds.length > 0) return;
  const firstMatch = contentItems.find((item) => {
    const isExtraItem = item.isExtra === true || item.visibility === "EXTRA";
    if (!isExtraItem) return false;
    const matchesTier =
      !extraTierFilter || item.extraTier === extraTierFilter || item.extraTier === null;
    const matchesTime =
      timeOfDayFilter === "all" ||
      item.timeOfDay === "ANY" ||
      (timeOfDayFilter === "day" && item.timeOfDay === "DAY") ||
      (timeOfDayFilter === "night" && item.timeOfDay === "NIGHT");
    return matchesTier && matchesTime;
  });
  if (firstMatch) {
    setSelectedContentIds([firstMatch.id]);
  }
}, [showContentModal, contentModalMode, contentItems, extraTierFilter, timeOfDayFilter, selectedContentIds.length]);

useEffect(() => {
  fetchAiStatus();
  fetchAiSettingsTone();
}, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(AUDIENCE_STORAGE_KEY);
    if (stored === "CREATOR" || stored === "INTERNAL") {
      setComposerAudience(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUDIENCE_STORAGE_KEY, composerAudience);
  }, [composerAudience]);

  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`${TRANSLATION_PREVIEW_KEY_PREFIX}:${id}`);
    setTranslationPreviewOpen(stored === "1");
  }, [id]);

  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    window.localStorage.setItem(
      `${TRANSLATION_PREVIEW_KEY_PREFIX}:${id}`,
      translationPreviewOpen ? "1" : "0"
    );
  }, [id, translationPreviewOpen]);

  useEffect(() => {
    if (composerAudience !== "INTERNAL") return;
    if (!lastPanelOpenByMode.INTERNAL) return;
    if (!lastTabByMode.INTERNAL) return;
    setInlinePanel(lastTabByMode.INTERNAL);
  }, [composerAudience, lastPanelOpenByMode.INTERNAL, lastTabByMode.INTERNAL]);

  useEffect(() => {
    if (!inlinePanel) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setInlinePanel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inlinePanel]);

  useEffect(() => {
    setInlinePanel(null);
    setInternalPanelTab("manager");
  }, [conversation.id]);

  useEffect(() => {
    managerPanelScrollTopRef.current = 0;
    managerPanelStickToBottomRef.current = false;
    internalChatScrollTopRef.current = 0;
    internalChatStickToBottomRef.current = true;
    internalChatForceScrollRef.current = false;
  }, [conversation.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleConversationChanging = () => {
      setInlinePanel(null);
    };
    window.addEventListener("novsy:conversation:changing", handleConversationChanging as EventListener);
    return () => {
      window.removeEventListener("novsy:conversation:changing", handleConversationChanging as EventListener);
    };
  }, []);

  const managerChatMessages = managerChatByFan[id ?? ""] ?? [];
  const internalNotes = internalMessages.filter((message) => deriveAudience(message) === "INTERNAL");
  const hasInternalThreadMessages = internalNotes.length > 0 || managerChatMessages.length > 0;
  const effectiveLanguage = (preferredLanguage ?? "en") as SupportedLanguage;
  const isTranslationPreviewAvailable =
    !!id && !conversation.isManager && composerAudience === "CREATOR" && effectiveLanguage !== "es";
  const hasComposerText = messageSend.trim().length > 0;
  const translateEnabled = translationPreviewOpen && composerAudience === "CREATOR" && !conversation.isManager;
  const isFanMode = composerAudience === "CREATOR";
  const hasAutopilotContext = !!(lastAutopilotObjective && lastAutopilotTone);
  const disableTranslationPreview = () => {
    if (translationPreviewTimer.current) {
      clearTimeout(translationPreviewTimer.current);
    }
    if (translationPreviewAbortRef.current) {
      translationPreviewAbortRef.current.abort();
    }
    translationPreviewKeyRef.current = null;
    setTranslationPreviewStatus("idle");
    setTranslationPreviewText(null);
    setTranslationPreviewNotice(null);
    setTranslationPreviewOpen(false);
  };

  const toggleInlineTab = useCallback(
    (tab: InlineTab) => {
      const allowedTabs = INLINE_TABS_BY_MODE[composerAudience] as readonly InlineTab[];
      if (!allowedTabs.includes(tab)) return;
      setInlinePanel((prev) => {
        const next = prev === tab ? null : tab;
        if (next) {
          setLastTabByMode((prevTabs) => ({
            ...prevTabs,
            [composerAudience]: tab as any,
          }));
        }
        return next;
      });
    },
    [composerAudience]
  );

  const openDockPanel = useCallback(
    (tab: InlineTab, options?: { audience?: ComposerAudienceMode }) => {
      const targetAudience = options?.audience ?? composerAudience;
      const allowedTabs = INLINE_TABS_BY_MODE[targetAudience] as readonly InlineTab[];
      if (!allowedTabs.includes(tab)) return;
      if (targetAudience !== composerAudience) {
        setLastPanelOpenByMode((prev) => ({
          ...prev,
          [composerAudience]: inlinePanel !== null,
        }));
        setComposerAudience(targetAudience);
      }
      setInlinePanel(tab);
      setLastTabByMode((prevTabs) => ({
        ...prevTabs,
        [targetAudience]: tab as any,
      }));
    },
    [composerAudience, inlinePanel]
  );

  const openInternalPanelTab = useCallback(
    (tab: InternalPanelTab, options?: { forceScroll?: boolean }) => {
      if (options?.forceScroll) {
        internalChatForceScrollRef.current = true;
      }
      setInternalPanelTab(tab);
      openDockPanel("manager", { audience: "INTERNAL" });
    },
    [openDockPanel]
  );

  const openInternalThread = useCallback(
    (options?: { forceScroll?: boolean }) => {
      openInternalPanelTab("internal", options);
    },
    [openInternalPanelTab]
  );

  const openAttachContent = (options?: { closeInline?: boolean }) => {
    if (isChatBlocked && !isInternalMode) return;
    openContentModal({ mode: "packs" });
    if (options?.closeInline ?? true) {
      setInlinePanel(null);
    }
  };

  const handleAttachContentClick = () => {
    openAttachContent();
  };

  const renderComposerDock = () => {
    const managerAlert = fanManagerAnalysis.chips.some(
      (chip) => chip.tone === "danger" || chip.tone === "warning"
    );
    const templatesCount: number = TRANSLATION_QUICK_CHIPS.length;
    const allowedTabs = INLINE_TABS_BY_MODE[composerAudience] as readonly InlineTab[];
    const showManagerChip = allowedTabs.includes("manager");
    const showTemplatesChip = isFanMode && allowedTabs.includes("templates");
    const showToolsChip = allowedTabs.includes("tools") && isFanMode;
    const managerChipStatus = managerAlert ? "Riesgo" : "OK";
    const managerChipCount = managerSuggestions.length;
    const managerChipLabel = isFanMode ? (
      <span className="flex items-center gap-1.5">
        <span>Manager</span>
        <span
          className={clsx(
            "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            managerAlert
              ? "border-rose-400/60 bg-rose-500/10 text-rose-200"
              : "border-slate-600 bg-slate-900/70 text-slate-300"
          )}
        >
          {managerChipStatus}
        </span>
        {managerChipCount > 0 && <span className="text-[10px] text-slate-400">· {managerChipCount}</span>}
      </span>
    ) : (
      "Manager IA"
    );

    if (!showManagerChip && !showTemplatesChip && !showToolsChip) {
      return null;
    }

    const chipBase =
      "inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[11px] font-semibold whitespace-nowrap transition-all duration-150 shadow-sm";

    const InlineEmptyState = ({
      icon,
      title,
      subtitle,
    }: {
      icon: string;
      title: string;
      subtitle?: string;
    }) => (
      <div className="flex items-center gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-3 text-xs text-slate-400">
        <span className="text-base">{icon}</span>
        <div>
          <div className="text-[11px] font-semibold text-slate-200">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
        </div>
      </div>
    );

    const inlineActionButtonClass =
      "inline-flex items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60";

    const closeInlinePanel = () => {
      setInlinePanel(null);
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    };

    const handlePanelWheel: WheelEventHandler<HTMLDivElement> = (event) => {
      event.stopPropagation();
    };

    const renderInlineToolsPanel = () => (
      <InlinePanelShell title="Herramientas" onClose={closeInlinePanel}>
        {composerAudience === "CREATOR" && !conversation.isManager ? (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Acciones</div>
            <button
              type="button"
              onClick={() => handleAttachContentClick()}
              disabled={isChatBlocked}
              className={clsx(
                "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                isChatBlocked
                  ? "cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-500"
                  : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-slate-500 hover:bg-slate-900/60"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">📎</span>
                <span>Adjuntar contenido</span>
              </span>
            </button>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Traducción</div>
            <div
              className={clsx(
                "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                translationPreviewOpen
                  ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                  : "border-slate-700 bg-slate-950/40 text-slate-200"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">🌐</span>
                <span>Traducir</span>
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition",
                    translationPreviewOpen
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100"
                      : "border-slate-600 text-slate-400"
                  )}
                >
                  {translationPreviewOpen ? "ON" : "OFF"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (translateEnabled) {
                      disableTranslationPreview();
                    } else {
                      setTranslationPreviewOpen(true);
                    }
                  }}
                  className={clsx(
                    "relative inline-flex h-5 w-10 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                    translationPreviewOpen
                      ? "border-emerald-400/70 bg-emerald-500/20"
                      : "border-slate-600 bg-slate-900/70"
                  )}
                  aria-pressed={translationPreviewOpen}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 rounded-full transition",
                      translationPreviewOpen ? "translate-x-5 bg-emerald-200" : "translate-x-1 bg-slate-400"
                    )}
                  />
                </button>
              </div>
            </div>
            {translationPreviewOpen && (
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Traducción automática</div>
                <div className="flex items-center gap-2 text-[11px] text-slate-200">
                  <span className="text-slate-400">Idioma</span>
                  <select
                    value={languageSelectValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "auto") return;
                      handlePreferredLanguageChange(value as SupportedLanguage);
                    }}
                    disabled={preferredLanguageSaving}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-100 focus:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  >
                    <option value="auto" disabled>
                      Auto (EN por defecto)
                    </option>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                {!isTranslationPreviewAvailable && (
                  <div className="text-[10px] text-slate-500">
                    Selecciona un idioma distinto de ES para activar preview.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <InlineEmptyState
            icon="🛠️"
            title="Sin herramientas disponibles"
            subtitle="Solo disponibles en chats con fans."
          />
        )}
      </InlinePanelShell>
    );

    const renderInternalManagerContent = () => (
      <div
        ref={managerPanelScrollRef}
        onScroll={updateManagerPanelScrollState}
        onWheelCapture={handlePanelWheel}
        className="min-h-0 max-h-[360px] overflow-y-auto overscroll-contain pr-1"
      >
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Insights y control</div>
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/70 p-3">
            <FanManagerDrawer
              managerSuggestions={managerSuggestions}
              onApplySuggestion={handleApplyManagerSuggestion}
              currentObjective={currentObjective}
              suggestedObjective={fanManagerAnalysis.defaultObjective}
              fanManagerState={fanManagerAnalysis.state}
              fanManagerHeadline={fanManagerAnalysis.headline}
              fanManagerChips={fanManagerAnalysis.chips}
              tone={fanTone}
              onChangeTone={handleChangeFanTone}
              statusLine={statusLine}
              lapexSummary={lapexSummary}
              sessionSummary={sessionSummary}
              iaSummary={iaSummary}
              planSummary={planSummary}
              closedSummary={managerShortSummary}
              fanId={conversation.id}
              onManagerSummary={(s) => setManagerSummary(s)}
              onSuggestionClick={handleManagerSuggestion}
              onQuickGreeting={() => handleManagerQuickAction("romper_hielo")}
              onRenew={() => handleManagerQuickAction("reactivar_fan_frio")}
              onQuickExtra={() => handleManagerQuickAction("ofrecer_extra")}
              onPackOffer={() => handleManagerQuickAction("llevar_a_mensual")}
              showRenewAction={showRenewAction}
              quickExtraDisabled={quickExtraDisabled}
              isRecommended={isRecommended}
              isBlocked={isChatBlocked}
              autoPilotEnabled={autoPilotEnabled}
              onToggleAutoPilot={handleToggleAutoPilot}
              isAutoPilotLoading={isAutoPilotLoading}
              hasAutopilotContext={hasAutopilotContext}
              onAutopilotSoften={handleAutopilotSoften}
              onAutopilotMakeBolder={handleAutopilotMakeBolder}
            />
          </div>
        </div>
      </div>
    );

    const renderInternalChatContent = () => (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="text-[11px] text-slate-400">
          Solo tú ves este hilo. No se envía al fan.
        </div>
        <div
          ref={managerChatListRef}
          onScroll={updateInternalChatScrollState}
          onWheelCapture={handlePanelWheel}
          className="flex min-h-0 max-h-[320px] flex-col gap-2 overflow-y-auto overscroll-contain pr-1"
        >
          {isLoadingInternalMessages && (
            <div className="text-[11px] text-slate-500">Cargando mensajes internos...</div>
          )}
          {internalMessagesError && !isLoadingInternalMessages && (
            <div className="text-[11px] text-rose-300">{internalMessagesError}</div>
          )}
          {!hasInternalThreadMessages && !isLoadingInternalMessages && !internalMessagesError && (
            <div className="text-[11px] text-slate-500">
              Aún no hay mensajes internos ni mensajes del Manager IA.
            </div>
          )}
          {internalNotes.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Mensajes internos</div>
              {internalNotes.map((msg) => {
                const origin = normalizeFrom(msg.from);
                const isCreatorNote = origin === "creator";
                const label = isCreatorNote ? "Tú" : "Manager IA";
                const noteText =
                  msg.type === "CONTENT" ? msg.contentItem?.title || "Contenido interno" : msg.text || "";
                return (
                  <div
                    key={msg.id}
                    className={clsx(
                      "flex flex-col max-w-[85%]",
                      isCreatorNote ? "self-end items-end" : "self-start items-start"
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
                    <div
                      className={clsx(
                        "rounded-2xl px-3 py-2 text-xs leading-relaxed",
                        isCreatorNote
                          ? "bg-amber-500/20 text-amber-50"
                          : "bg-slate-800/80 text-slate-100"
                      )}
                    >
                      {isCreatorNote && (
                        <span className="mb-1 inline-flex items-center rounded-full border border-amber-400/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                          INTERNO
                        </span>
                      )}
                      <div>{noteText}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {managerChatMessages.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Manager IA</div>
              {managerChatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    "flex flex-col max-w-[85%]",
                    msg.role === "creator" ? "self-end items-end" : "self-start items-start"
                  )}
                >
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {msg.role === "creator" ? "Tú" : "Manager IA"}
                  </span>
                  {msg.role === "manager" && (msg.suggestions?.length ?? 0) > 0 ? (
                    <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs leading-relaxed text-slate-100 space-y-2">
                      {msg.title && (
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">
                          {msg.title}
                        </div>
                      )}
                      {msg.suggestions?.map((suggestion, idx) => (
                        <div
                          key={`${msg.id}-suggestion-${idx}`}
                          className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                        >
                          <div className="text-[11px] text-slate-100">{suggestion}</div>
                          <button
                            type="button"
                            onClick={() => handleUseManagerReplyAsMainMessage(suggestion)}
                            className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                          >
                            Usar en mensaje
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div
                        className={clsx(
                          "rounded-2xl px-3 py-2 text-xs leading-relaxed",
                          msg.role === "creator"
                            ? "bg-emerald-600/80 text-white"
                            : "bg-slate-800/80 text-slate-100"
                        )}
                      >
                        {msg.text}
                      </div>
                      {msg.role === "manager" && (
                        <button
                          type="button"
                          onClick={() => handleUseManagerReplyAsMainMessage(msg.text)}
                          className="mt-1 inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                        >
                          Usar en mensaje
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-slate-800/70 pt-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              className="flex-1 rounded-2xl bg-slate-900/80 px-3 py-2 text-xs leading-relaxed text-slate-100 placeholder:text-slate-400 resize-none overflow-y-auto max-h-24 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
              placeholder="Preguntarle algo al Manager IA..."
              ref={managerChatInputRef}
              value={managerChatInput}
              onChange={(e) => setManagerChatInput(e.target.value)}
              onKeyDown={handleManagerChatKeyDown}
            />
            <button
              type="button"
              onClick={handleSendManagerChat}
              className="h-8 px-3 rounded-2xl bg-emerald-600 text-[11px] font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!managerChatInput.trim()}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    );

    const renderInternalNoteContent = () => (
      <div
        onWheelCapture={handlePanelWheel}
        className="min-h-0 max-h-[360px] overflow-y-auto overscroll-contain pr-1 space-y-3"
      >
        <div className="text-[11px] text-slate-400">
          Notas CRM (próxima acción). Para mensajes internos del chat usa &quot;Chat interno&quot;.
        </div>
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Próxima acción</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              type="text"
              value={nextActionDraft}
              onChange={(e) => setNextActionDraft(e.target.value)}
              className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
              placeholder="Ej: Proponer pack especial cuando cobre"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:text-amber-300"
              />
              <input
                type="time"
                value={nextActionTime}
                onChange={(e) => setNextActionTime(e.target.value)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:text-amber-300"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
            placeholder="Añade una nota para recordar detalles, límites, miedos, etc."
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={!noteDraft.trim()}
            className="self-start rounded-lg border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500/20"
          >
            Guardar
          </button>
        </div>
        <div className="space-y-2">
          {notesLoading && <div className="text-[11px] text-slate-400">Cargando notas…</div>}
          {notesError && !notesLoading && (
            <div className="text-[11px] text-rose-300">{notesError}</div>
          )}
          {!notesLoading && notes.length === 0 && (
            <div className="text-[11px] text-slate-500">Aún no hay notas para este fan.</div>
          )}
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
              <div className="text-[10px] text-slate-500">{formatNoteDate(note.createdAt)}</div>
              <div className="text-[11px] whitespace-pre-wrap">{note.content}</div>
            </div>
          ))}
        </div>
      </div>
    );

    const renderInlinePanel = (tab: InlineTab | null) => {
      if (!tab) return null;

      if (tab === "manager") {
        if (!isFanMode) {
          return (
            <InlinePanelShell
              title="Panel interno"
              onClose={closeInlinePanel}
              onBodyWheel={handlePanelWheel}
              scrollable={false}
              bodyClassName="px-0 py-0"
            >
              <div className="flex min-h-0 flex-col gap-3 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Panel interno">
                  {[
                    { id: "manager", label: "Manager IA" },
                    { id: "internal", label: "Chat interno" },
                    { id: "note", label: "Nota" },
                  ].map((tabItem) => {
                    const isActive = internalPanelTab === tabItem.id;
                    return (
                      <button
                        key={tabItem.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setInternalPanelTab(tabItem.id as InternalPanelTab)}
                        className={clsx(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                          isActive
                            ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
                            : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500/80"
                        )}
                      >
                        {tabItem.label}
                      </button>
                    );
                  })}
                </div>
                {internalPanelTab === "manager" && renderInternalManagerContent()}
                {internalPanelTab === "internal" && renderInternalChatContent()}
                {internalPanelTab === "note" && renderInternalNoteContent()}
              </div>
            </InlinePanelShell>
          );
        }

        const suggestions = managerSuggestions.slice(0, 3);
        const managerContext = managerStatusLabel;
        return (
          <InlinePanelShell title="Manager IA" onClose={closeInlinePanel}>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Contexto</div>
                <div className="mt-1 text-[11px] text-slate-200">{managerContext}</div>
              </div>
              <div className="space-y-2">
                {suggestions.length > 0 ? (
                  suggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="rounded-xl border border-slate-800/70 bg-slate-900/70 p-3 space-y-2"
                    >
                      <div className="text-[11px] font-semibold text-slate-100">{suggestion.label}</div>
                      <div className="text-[11px] text-slate-300 line-clamp-2">{suggestion.message}</div>
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyManagerSuggestion(suggestion.message);
                          setInlinePanel(null);
                        }}
                        className={inlineActionButtonClass}
                      >
                        Insertar
                      </button>
                    </div>
                  ))
                ) : (
                  <InlineEmptyState icon="✨" title="Sin sugerencias nuevas" subtitle="Vuelve en unos minutos." />
                )}
              </div>
            </div>
          </InlinePanelShell>
        );
      }

      if (tab === "templates") {
        const hasQuickTemplates = TRANSLATION_QUICK_CHIPS.length > 0;
        return (
          <InlinePanelShell title="Plantillas" onClose={closeInlinePanel}>
            <div className="space-y-3">
              {managerPromptTemplate && (
                <div className="rounded-xl border border-slate-800/70 bg-slate-900/70 p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    Plantilla sugerida
                  </div>
                  <p className="text-[11px] text-slate-200 line-clamp-3">{managerPromptTemplate}</p>
                  <button
                    type="button"
                    onClick={() => {
                      focusMainMessageInput(managerPromptTemplate);
                      setInlinePanel(null);
                    }}
                    className={inlineActionButtonClass}
                  >
                    Insertar
                  </button>
                </div>
              )}
              {hasQuickTemplates ? (
                <div className="flex flex-wrap gap-2">
                  {TRANSLATION_QUICK_CHIPS.slice(0, 3).map((chip) => (
                    <div
                      key={chip.id}
                      className="flex min-w-[180px] flex-1 flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2"
                    >
                      <div className="text-[11px] font-semibold text-slate-100">{chip.label}</div>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{chip.text}</p>
                      <button
                        type="button"
                        onClick={() => {
                          focusMainMessageInput(chip.text);
                          setInlinePanel(null);
                        }}
                        className={inlineActionButtonClass}
                      >
                        Insertar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <InlineEmptyState icon="🗂️" title="Sin plantillas disponibles" />
              )}
            </div>
          </InlinePanelShell>
        );
      }

      if (tab === "tools") {
        return renderInlineToolsPanel();
      }

      return null;
    };

    const lastTab = lastTabByMode[composerAudience];
    const panelTab =
      inlinePanel ??
      (lastTab && allowedTabs.includes(lastTab as InlineTab) ? (lastTab as InlineTab) : null);
    const isPanelOpen = inlinePanel !== null;
    const panelContent = renderInlinePanel(panelTab);

    const panelId = "composer-inline-panel";

    const chips = (
      <>
        {showManagerChip && (
          <div
            className={clsx(
              chipBase,
              inlinePanel === "manager"
                ? "border-sky-400/70 bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/30"
                : managerAlert
                ? "border-rose-400/70 bg-rose-500/10 text-rose-100"
                : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500/80"
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (!isFanMode && inlinePanel !== "manager") {
                  setInternalPanelTab("manager");
                }
                toggleInlineTab("manager");
              }}
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
              aria-expanded={inlinePanel === "manager"}
              aria-controls={panelId}
            >
              <span>{managerChipLabel}</span>
            </button>
            {inlinePanel === "manager" && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeInlinePanel();
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 text-[9px] text-slate-400 transition hover:border-slate-500 hover:bg-slate-800/60 hover:text-slate-200"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            )}
          </div>
        )}
        {showTemplatesChip && (
          <div
            className={clsx(
              chipBase,
              inlinePanel === "templates"
                ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/30"
                : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500/80"
            )}
          >
            <button
              type="button"
              onClick={() => toggleInlineTab("templates")}
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
              aria-expanded={inlinePanel === "templates"}
              aria-controls={panelId}
            >
              <span className="flex items-center gap-1.5">
                <span>Plantillas</span>
                {templatesCount > 0 && (
                  <span className="rounded-full border border-slate-600/80 bg-slate-900/60 px-1.5 py-0.5 text-[9px] text-slate-300">
                    {templatesCount}
                  </span>
                )}
              </span>
            </button>
            {inlinePanel === "templates" && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeInlinePanel();
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 text-[9px] text-slate-400 transition hover:border-slate-500 hover:bg-slate-800/60 hover:text-slate-200"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            )}
          </div>
        )}
        {showToolsChip && (
          <div
            className={clsx(
              chipBase,
              inlinePanel === "tools"
                ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30"
                : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500/80"
            )}
          >
            <button
              type="button"
              onClick={() => {
                toggleInlineTab("tools");
              }}
              className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
              aria-expanded={inlinePanel === "tools"}
              aria-controls={panelId}
            >
              <span>Herramientas</span>
            </button>
            {inlinePanel === "tools" && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeInlinePanel();
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 text-[9px] text-slate-400 transition hover:border-slate-500 hover:bg-slate-800/60 hover:text-slate-200"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </>
    );

    return {
      chips: <ComposerChipsRow>{chips}</ComposerChipsRow>,
      panel: (
        <InlinePanelContainer isOpen={isPanelOpen} panelId={panelId}>
          {panelContent}
        </InlinePanelContainer>
      ),
      isPanelOpen,
    };
  };

  useEffect(() => {
    setTranslationPreviewStatus("idle");
    setTranslationPreviewText(null);
    setTranslationPreviewNotice(null);
    translationPreviewKeyRef.current = null;
  }, [id, effectiveLanguage]);

  useEffect(() => {
    setIaMessage(null);
    setIaBlocked(false);
    fetchAiStatus();
    fetchAiSettingsTone();
  }, [conversation.id]);

  useEffect(() => {
    setManagerChatInput("");
  }, [conversation.id]);

  useEffect(() => {
    setHasManualManagerObjective(false);
    setCurrentObjective(null);
    setManagerSuggestions([]);
    setHasManualTone(false);
    setFanTone(getDefaultFanTone(fanManagerAnalysis.state));
    setLastAutopilotObjective(null);
    setLastAutopilotTone(null);
    setIsAutoPilotLoading(false);
  }, [conversation.id, fanManagerAnalysis.state]);

  useEffect(() => {
    if (!isTranslationPreviewAvailable || !translationPreviewOpen) {
      if (translationPreviewTimer.current) {
        clearTimeout(translationPreviewTimer.current);
      }
      if (translationPreviewAbortRef.current) {
        translationPreviewAbortRef.current.abort();
      }
      translationPreviewKeyRef.current = null;
      setTranslationPreviewStatus("idle");
      setTranslationPreviewText(null);
      setTranslationPreviewNotice(null);
      return;
    }

    const trimmed = messageSend.trim();
    if (!trimmed) {
      if (translationPreviewTimer.current) {
        clearTimeout(translationPreviewTimer.current);
      }
      if (translationPreviewAbortRef.current) {
        translationPreviewAbortRef.current.abort();
      }
      translationPreviewKeyRef.current = null;
      setTranslationPreviewStatus("idle");
      setTranslationPreviewText(null);
      setTranslationPreviewNotice(null);
      return;
    }

    const previewKey = `${id || "none"}::${effectiveLanguage}::${trimmed}`;
    if (translationPreviewKeyRef.current === previewKey) return;

    if (translationPreviewTimer.current) {
      clearTimeout(translationPreviewTimer.current);
    }

    translationPreviewTimer.current = setTimeout(async () => {
      translationPreviewRequestId.current += 1;
      const requestId = translationPreviewRequestId.current;
      setTranslationPreviewStatus("loading");
      setTranslationPreviewText(null);
      setTranslationPreviewNotice(null);

      if (translationPreviewAbortRef.current) {
        translationPreviewAbortRef.current.abort();
      }
      const controller = new AbortController();
      translationPreviewAbortRef.current = controller;

      try {
        const res = await fetch("/api/messages/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fanId: id,
            text: trimmed,
            targetLanguage: effectiveLanguage,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (requestId !== translationPreviewRequestId.current) return;

        if (!res.ok || !data?.ok) {
          setTranslationPreviewStatus("error");
          setTranslationPreviewNotice("No se pudo generar la traducción. Se enviará en español.");
          return;
        }

        if (typeof data.translatedText === "string" && data.translatedText.trim()) {
          setTranslationPreviewStatus("ready");
          setTranslationPreviewText(data.translatedText);
          setTranslationPreviewNotice(null);
          translationPreviewKeyRef.current = previewKey;
          return;
        }

        const reason = typeof data.reason === "string" ? data.reason : "";
        if (reason === "ai_not_configured") {
          setTranslationPreviewNotice("Sin traducción (IA no configurada). Se enviará en español.");
        } else if (reason === "empty") {
          setTranslationPreviewNotice(null);
        } else {
          setTranslationPreviewNotice("No se pudo generar la traducción. Se enviará en español.");
        }
        setTranslationPreviewStatus("unavailable");
        translationPreviewKeyRef.current = previewKey;
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setTranslationPreviewStatus("error");
        setTranslationPreviewNotice("No se pudo generar la traducción. Se enviará en español.");
      }
    }, 650);

    return () => {
      if (translationPreviewTimer.current) {
        clearTimeout(translationPreviewTimer.current);
      }
    };
  }, [
    effectiveLanguage,
    id,
    isTranslationPreviewAvailable,
    messageSend,
    translationPreviewOpen,
  ]);

  useEffect(() => {
    if (!hasManualTone) {
      setFanTone(getDefaultFanTone(fanManagerAnalysis.state));
    }
  }, [fanManagerAnalysis.state, hasManualTone]);

  const updateManagerPanelScrollState = useCallback(() => {
    const el = managerPanelScrollRef.current;
    if (!el) return;
    managerPanelScrollTopRef.current = el.scrollTop;
    const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    managerPanelStickToBottomRef.current = distanceToBottom < SCROLL_BOTTOM_THRESHOLD;
  }, [SCROLL_BOTTOM_THRESHOLD]);

  const syncManagerPanelScroll = useCallback(
    (options?: { forceToBottom?: boolean }) => {
      const el = managerPanelScrollRef.current;
      if (!el) return;
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const shouldStick = options?.forceToBottom || managerPanelStickToBottomRef.current;
      if (shouldStick) {
        el.scrollTop = maxScrollTop;
        return;
      }
      el.scrollTop = Math.min(managerPanelScrollTopRef.current, maxScrollTop);
    },
    []
  );

  const updateInternalChatScrollState = useCallback(() => {
    const el = managerChatListRef.current;
    if (!el) return;
    internalChatScrollTopRef.current = el.scrollTop;
    const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    internalChatStickToBottomRef.current = distanceToBottom < SCROLL_BOTTOM_THRESHOLD;
  }, [SCROLL_BOTTOM_THRESHOLD]);

  const syncInternalChatScroll = useCallback(
    (options?: { forceToBottom?: boolean }) => {
      const el = managerChatListRef.current;
      if (!el) return;
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const shouldStick =
        options?.forceToBottom || internalChatForceScrollRef.current || internalChatStickToBottomRef.current;
      if (shouldStick) {
        el.scrollTop = maxScrollTop;
        internalChatForceScrollRef.current = false;
        return;
      }
      el.scrollTop = Math.min(internalChatScrollTopRef.current, maxScrollTop);
    },
    []
  );

  useIsomorphicLayoutEffect(() => {
    if (inlinePanel !== "manager" || isFanMode || internalPanelTab !== "manager") return;
    const frame = requestAnimationFrame(() => {
      syncManagerPanelScroll();
    });
    return () => cancelAnimationFrame(frame);
  }, [inlinePanel, isFanMode, internalPanelTab, conversation.id, syncManagerPanelScroll]);

  useIsomorphicLayoutEffect(() => {
    if (inlinePanel !== "manager" || isFanMode || internalPanelTab !== "internal") return;
    const frame = requestAnimationFrame(() => {
      syncInternalChatScroll();
    });
    return () => cancelAnimationFrame(frame);
  }, [inlinePanel, isFanMode, internalPanelTab, internalMessages.length, managerChatMessages.length, syncInternalChatScroll]);

  const mapQuickIntentToSuggestionIntent = (intent?: ManagerQuickIntent): ManagerSuggestionIntent => {
    switch (intent) {
      case "romper_hielo":
      case "bienvenida":
        return "romper_hielo";
      case "llevar_a_mensual":
      case "renovacion":
        return "upsell_mensual_suave";
      case "reactivar_fan_frio":
      case "ofrecer_extra":
      default:
        return "pregunta_simple";
    }
  };

  const inferSuggestionIntentFromPrompt = (prompt: string): ManagerSuggestionIntent => {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("mensual") || normalized.includes("suscrip") || normalized.includes("renov")) {
      return "upsell_mensual_suave";
    }
    if (normalized.includes("cierre") || normalized.includes("cerrar") || normalized.includes("desped")) {
      return "cierre_suave";
    }
    if (normalized.includes("pregunta") || normalized.includes("preguntar")) {
      return "pregunta_simple";
    }
    return "romper_hielo";
  };

  const buildSimulatedManagerSuggestions = ({
    fanName,
    tone,
    intent,
  }: {
    fanName?: string;
    tone: FanTone;
    intent: ManagerSuggestionIntent;
  }): { title: string; suggestions: string[] } => {
    const nombre = getFirstName(fanName);
    const saludo = nombre ? `Hola ${nombre},` : "Hola,";
    const titles: Record<ManagerSuggestionIntent, string> = {
      romper_hielo: "Romper el hielo",
      pregunta_simple: "Pregunta simple",
      cierre_suave: "Cierre suave",
      upsell_mensual_suave: "Mensual suave",
    };
    const suggestionsByIntent: Record<ManagerSuggestionIntent, Record<FanTone, string[]>> = {
      romper_hielo: {
        suave: [
          `${saludo} ¿cómo estás hoy? Si te apetece, cuéntame en una frase qué buscas y preparo algo sencillo para empezar.`,
          `${saludo} ¿prefieres que te envíe una idea rápida o me cuentas qué te apetece?`,
          "Si te parece, empezamos con algo simple y cercano. Dime qué te apetece y lo preparo.",
        ],
        intimo: [
          `${saludo} qué gusto tenerte aquí. Dime en una frase qué te apetece y preparo algo a tu medida.`,
          `${saludo} si te parece, arrancamos con algo suave y cercano. ¿Qué te gustaría explorar primero?`,
          "Quiero que te sientas cómodo/a. ¿Te mando una idea corta para empezar o prefieres contarme qué buscas?",
        ],
        picante: [
          `${saludo} tengo ganas de darte algo con chispa. ¿Te apetece suave o más atrevido para empezar?`,
          "Dime el mood de hoy y preparo algo con un toque picante.",
          `${saludo} ¿quieres que arranquemos con una idea rápida y más intensa?`,
        ],
      },
      pregunta_simple: {
        suave: [
          "Pregunta rápida: ¿te apetece más un audio corto o una guía práctica?",
          "¿Prefieres algo breve para empezar o algo más completo?",
          "Para acertar mejor, dime qué te apetece hoy y lo preparo.",
        ],
        intimo: [
          "Solo para orientarme: ¿te apetece algo más íntimo o más ligero hoy?",
          "¿Qué te haría sentir más a gusto ahora mismo?",
          "¿Quieres que lo hagamos suave y cercano o prefieres algo más directo?",
        ],
        picante: [
          "Pregunta rápida: ¿te apetece un toque más atrevido hoy?",
          "¿Te va algo sugerente o prefieres algo más intenso?",
          "Dime en una palabra el mood de hoy y preparo algo con chispa.",
        ],
      },
      cierre_suave: {
        suave: [
          "Te dejo por aquí para no saturarte. Cuando te apetezca, seguimos.",
          "Cierro por ahora; si te apetece, me dices y retomo con más.",
          "Lo dejamos aquí y seguimos cuando quieras. Estoy pendiente.",
        ],
        intimo: [
          "Te dejo respirar un poco. Cuando te apetezca, retomamos con calma.",
          "Me quedo por aquí; cuando quieras, seguimos a tu ritmo.",
          "Lo dejamos suave por hoy. Si te apetece, volvemos luego.",
        ],
        picante: [
          "Te dejo con ganas y seguimos cuando quieras 😏",
          "Lo paro aquí para no quemarlo; cuando quieras, subimos un poco el tono.",
          "Cierro por ahora, pero me quedo con ganas. Dime y seguimos.",
        ],
      },
      upsell_mensual_suave: {
        suave: [
          `${saludo} si quieres que te acompañe cada semana, puedo pasarte el mensual y así tienes contenido fijo sin pedirlo cada vez. ¿Te interesa?`,
          "Si te encaja, pasamos a mensual y te preparo algo cada semana. ¿Quieres que te pase el enlace?",
          "Para no ir extra a extra, podemos pasar a mensual y mantener ritmo. ¿Te apetece?",
        ],
        intimo: [
          `${saludo} si te apetece seguir con calma y continuidad, el mensual me deja prepararte algo cada semana para ti. ¿Te paso el enlace?`,
          "Podemos hacerlo más cercano: mensual con contenido fijo y seguimiento, sin presión. ¿Te encaja?",
          "Si te gusta este espacio, el mensual nos permite ir más a tu ritmo y con contenido pensado para ti. ¿Quieres que lo activemos?",
        ],
        picante: [
          `${saludo} si te apetece subir un poco el ritmo, con el mensual puedo prepararte algo más intenso cada semana. ¿Te paso el enlace?`,
          "Podemos pasar a mensual y así te preparo algo con más chispa cada semana. ¿Lo quieres?",
          "Si quieres continuidad, el mensual nos da margen para ponernos más creativos. ¿Te encaja?",
        ],
      },
    };
    const suggestions = suggestionsByIntent[intent]?.[tone] ?? suggestionsByIntent[intent].suave;
    return { title: titles[intent], suggestions: suggestions.slice(0, 3) };
  };

  const buildQuickIntentQuestion = (intent: ManagerQuickIntent, fanName?: string) => {
    const nombre = fanName || "este fan";
    switch (intent) {
      case "romper_hielo":
        return `Dame 2 opciones de mensaje breve y cálido para romper el hielo con ${nombre} sin vender nada todavía. Que suenen naturales.`;
      case "reactivar_fan_frio":
        return `Dame 2 opciones de mensaje para reactivar a ${nombre}, que antes era activo y ahora casi no escribe. Mezcla cercanía y curiosidad por su vida, sin sonar necesitado.`;
      case "ofrecer_extra":
        return `Dame un mensaje para ofrecerle un extra a ${nombre} basándote en lo que le suele gustar. Una sola propuesta clara, con sensación de detalle personalizado.`;
      case "llevar_a_mensual":
        return `Dame un mensaje para invitar a ${nombre} a pasar a suscripción mensual, reforzando 2 o 3 beneficios que una persona como ella suele valorar. Nada agresivo.`;
      case "renovacion":
        return `Redáctame un mensaje conciso para renovar cuanto antes a ${nombre}, insistiendo en que caduca en breve y ofreciendo cerrar ya la renovación.`;
      default:
        return "";
    }
  };

  const buildSuggestionsForObjective = useCallback(
    ({
      objective,
      fanName,
      tone,
      state,
      analysis,
    }: {
      objective: ManagerObjective;
      fanName?: string;
      tone: FanTone;
      state: FanManagerStateAnalysis["state"];
      analysis?: FanManagerStateAnalysis;
    }): ManagerSuggestion[] => {
      const nombre = fanName || "este fan";
      const daysLeft = analysis?.context.daysLeft ?? null;
      const inactivityDays = analysis?.context.inactivityDays ?? null;
      const extrasCount = analysis?.context.extrasCount ?? 0;
      const isVip = analysis?.context.isVip ?? false;
      const inactivityText =
        typeof inactivityDays === "number"
          ? inactivityDays === 0
            ? "hoy"
            : `${inactivityDays} días`
          : "tiempo";
      const renewalText =
        typeof daysLeft === "number"
          ? daysLeft <= 0
            ? "hoy"
            : `en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`
          : "en pocos días";

      const suggestions: Record<ManagerObjective, Record<FanTone, ManagerSuggestion[]>> = {
        bienvenida: {
          suave: [
            {
              id: "bienvenida-suave-1",
              label: "Bienvenida clara",
              message: `Hola ${nombre}, gracias por entrar. Cuéntame en una frase qué necesitas y preparo algo útil sin rodeos.`,
              intent: "romper_hielo",
            },
          ],
          intimo: [
            {
              id: "bienvenida-curioso-1",
              label: "Bienvenida guiada",
              message: `Hola ${nombre}, gracias por suscribirte 🖤 Dime en una frase qué esperas de este chat (ideas, acompañamiento o algo muy concreto) y preparo algo a tu medida.`,
              intent: "romper_hielo",
            },
            {
              id: "bienvenida-curioso-2",
              label: "Explorar intereses",
              message: `${nombre}, para guiarte bien necesito saber qué te mueve más: ¿mejorar algo concreto, probar algo nuevo o simplemente inspiración? Así te mando el primer contenido que encaje contigo.`,
              intent: "romper_hielo",
            },
          ],
          picante: [
            {
              id: "bienvenida-picante-1",
              label: "Bienvenida con chispa",
              message: `Hola ${nombre}, qué gusto tenerte aquí. Dime qué te apetece explorar primero y preparo algo que te pique la curiosidad desde ya.`,
              intent: "romper_hielo",
            },
          ],
        },
        romper_hielo: {
          suave: [
            {
              id: "romper-suave-1",
              label: "Primer paso",
              message: `Hola ${nombre}, veo que acabas de entrar. ¿Prefieres que te envíe una idea sencilla para empezar o contarme qué buscas y lo preparo?`,
              intent: "romper_hielo",
            },
          ],
          intimo: [
            {
              id: "romper-intimo-1",
              label: "Romper el hielo suave",
              message: `Hola ${nombre}, veo que acabas de entrar y no quiero saturarte. ¿Te mando una idea sencilla para empezar o prefieres contarme qué buscas?`,
              intent: "romper_hielo",
            },
            {
              id: "romper-intimo-2",
              label: "Pregunta sencilla",
              message: `${nombre}, cuéntame con una frase qué te gustaría recibir aquí (audio, guía corta, algo puntual) y preparo lo más fácil para que te estrenes.`,
              intent: "romper_hielo",
            },
          ],
          picante: [
            {
              id: "romper-picante-1",
              label: "Romper con guiño",
              message: `${nombre}, acabo de abrirte este espacio y quiero empezar con algo que te motive de verdad. Dime qué te apetece probar primero y lo preparo calentito.`,
              intent: "romper_hielo",
            },
          ],
        },
        reactivar_fan_frio: {
          suave: [
            {
              id: "reactivar-suave-1",
              label: "Retomar contacto",
              message: `Hola ${nombre}, hace ${inactivityText} que no hablamos. Si te apetece, retomamos con algo ligero y útil para ti.`,
              intent: "reactivar_fan_frio",
            },
          ],
          intimo: [
            {
              id: "reactivar-frio-1",
              label: "Reactivar fan frío",
              message: `Hola ${nombre}, hace ${inactivityText} que no hablamos y me pregunto cómo estás. Si te apetece retomamos con algo ligero y útil para ti, sin compromisos.`,
              intent: "reactivar_fan_frio",
            },
            {
              id: "reactivar-frio-2",
              label: "Motivo para volver",
              message: `${nombre}, sé que has estado desconectad@ y quiero darte un motivo sencillo para volver: te preparo un audio corto con una idea práctica para esta semana. ¿Te lo mando?`,
              intent: "reactivar_fan_frio",
            },
          ],
          picante: [
            {
              id: "reactivar-picante-1",
              label: "Recuperar chispa",
              message: `${nombre}, hace ${inactivityText} que no hablamos y me gustaría devolverte las ganas. Te preparo un detalle con un toque más atrevido para que vuelvas con ganas. ¿Te lo envío?`,
              intent: "reactivar_fan_frio",
            },
          ],
        },
        ofrecer_extra: {
          suave: [
            {
              id: "extra-suave-1",
              label: "Extra puntual",
              message: `${nombre}, puedo prepararte un extra concreto esta semana: un audio detallado + una idea práctica. Si te interesa, te paso el enlace y lo ajusto a ti.`,
              intent: "ofrecer_extra",
            },
          ],
          intimo: [
            {
              id: "extra-intimo-1",
              label: "Propuesta de extra",
              message: `${nombre}, se me ha ocurrido un extra muy a tu estilo para esta semana: algo más íntimo y personalizado que lo que suelo subir. Si te interesa, te cuento en detalle y lo adaptamos a lo que te apetezca ahora mismo.`,
              intent: "ofrecer_extra",
            },
          ],
          picante: [
            {
              id: "extra-picante-1",
              label: "Extra con picante",
              message: `${nombre}, tengo un extra más atrevido pensado para ti: algo personalizado y con ese toque que sé que te gusta. Si te apetece, te cuento y te paso el enlace.`,
              intent: "ofrecer_extra",
            },
          ],
        },
        llevar_a_mensual: {
          suave: [
            {
              id: "mensual-suave-1",
              label: "Invitar a mensual",
              message: `${nombre}, podemos pasar a mensual para que tengas contenido fijo cada semana sin pedirlo cada vez. ¿Te encaja que te pase el enlace?`,
              intent: "llevar_a_mensual",
            },
          ],
          intimo: [
            ...(state === "vip_comprador" || isVip || extrasCount >= 2
              ? [
                  {
                    id: "mensual-vip-1",
                    label: "Pasar a mensual",
                    message: `${nombre}, en vez de ir extra a extra podemos pasar a mensual y tener algo preparado cada semana solo para ti. Así no pierdes ritmo y puedo currarme más el contenido. ¿Te encaja probarlo?`,
                    intent: "llevar_a_mensual",
                  },
                  {
                    id: "mensual-vip-2",
                    label: "Mensual sin fricción",
                    message: `${nombre}, como siempre respondes a lo que te propongo, te ofrezco el plan mensual: recibes contenido fijo + seguimiento sin tener que pedir cada vez. ¿Quieres que te pase el enlace?`,
                    intent: "llevar_a_mensual",
                  },
                ]
              : state === "a_punto_de_caducar"
              ? [
                  {
                    id: "mensual-caduca-1",
                    label: "No perder ritmo",
                    message: `${nombre}, tu acceso caduca ${renewalText}. Si te interesa seguir, podemos pasar ya al mensual y aseguramos contenido semanal sin cortes. ¿Te lo dejo listo?`,
                    intent: "llevar_a_mensual",
                  },
                ]
              : [
                  {
                    id: "mensual-general-1",
                    label: "Invitar a mensual",
                    message: `${nombre}, te propongo pasar a mensual: cada semana tendrás algo preparado y no tendrás que estar pendiente de pedirme extras sueltos. ¿Lo probamos?`,
                    intent: "llevar_a_mensual",
                  },
                ]),
          ],
          picante: [
            {
              id: "mensual-picante-1",
              label: "Mensual con chispa",
              message: `${nombre}, si pasamos a mensual puedo prepararte algo especial cada semana, con un toque más intenso que lo que pides suelto. ¿Quieres que te pase el enlace?`,
              intent: "llevar_a_mensual",
            },
          ],
        },
        renovacion: {
          suave: [
            {
              id: "renovacion-suave-1",
              label: "Renovación clara",
              message: `Hola ${nombre}, tu suscripción termina ${renewalText}. Si quieres seguir, te paso el enlace para mantener el acceso y preparo algo útil esta semana.`,
              intent: "renovacion",
            },
          ],
          intimo: [
            {
              id: "renovacion-urgente-1",
              label: "Renovación clara",
              message: `Oye ${nombre}, tu suscripción termina ${renewalText}. Si quieres seguir, te paso ahora el enlace para que mantengas el acceso al chat y esta semana preparo algo especial para ti.`,
              intent: "renovacion",
            },
            {
              id: "renovacion-urgente-2",
              label: "Conservar valor",
              message: `${nombre}, queda muy poco para que se cierre tu acceso (${renewalText}). Te propongo renovarlo ya para no perder lo que tienes y ajustar el contenido a lo que más te ha servido. ¿Te lo activo?`,
              intent: "renovacion",
            },
          ],
          picante: [
            {
              id: "renovacion-picante-1",
              label: "Renovar con gancho",
              message: `${nombre}, tu acceso acaba ${renewalText}. Si seguimos, preparo algo especial y más atrevido para este inicio. ¿Te paso el enlace para dejarlo cerrado ya?`,
              intent: "renovacion",
            },
          ],
        },
      };

      const objectiveSuggestions = suggestions[objective] ?? suggestions.renovacion;
      const toneSuggestions = objectiveSuggestions?.[tone] || objectiveSuggestions?.intimo || [];
      return toneSuggestions.map((sug) => ({
        ...sug,
        message: sug.message.replace("{nombre}", nombre),
      }));
    },
    []
  );

  useEffect(() => {
    if (hasManualManagerObjective) return;
    const objective = fanManagerAnalysis.defaultObjective;
    setCurrentObjective(objective);
    const suggestions = buildSuggestionsForObjective({
      objective,
      fanName: contactName,
      tone: fanTone,
      state: fanManagerAnalysis.state,
      analysis: fanManagerAnalysis,
    });
    setManagerSuggestions(suggestions.slice(0, 3));
  }, [contactName, fanManagerAnalysis, buildSuggestionsForObjective, fanTone, hasManualManagerObjective]);

  useEffect(() => {
    if (!currentObjective) return;
    const suggestions = buildSuggestionsForObjective({
      objective: currentObjective,
      fanName: contactName,
      tone: fanTone,
      state: fanManagerAnalysis.state,
      analysis: fanManagerAnalysis,
    });
    setManagerSuggestions(suggestions.slice(0, 3));
  }, [fanTone, currentObjective, contactName, fanManagerAnalysis, buildSuggestionsForObjective]);

  const askInternalManager = (question: string, intent?: ManagerQuickIntent, toneOverride?: FanTone) => {
    if (!id) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    const fanKey = id;
    const creatorMessage: ManagerChatMessage = {
      id: `${fanKey}-${Date.now()}-creator`,
      role: "creator",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setManagerChatByFan((prev) => {
      const prevMsgs = prev[fanKey] ?? [];
      return { ...prev, [fanKey]: [...prevMsgs, creatorMessage] };
    });
    setManagerChatInput("");
    openInternalThread({ forceScroll: true });

    setTimeout(() => {
      const resolvedIntent = intent
        ? mapQuickIntentToSuggestionIntent(intent)
        : inferSuggestionIntentFromPrompt(trimmed);
      const bundle = buildSimulatedManagerSuggestions({
        fanName: contactName,
        tone: toneOverride ?? fanTone,
        intent: resolvedIntent,
      });
      const managerMessage: ManagerChatMessage = {
        id: `${fanKey}-${Date.now()}-manager`,
        role: "manager",
        text: bundle.suggestions[0] ?? bundle.title,
        title: bundle.title,
        suggestions: bundle.suggestions,
        createdAt: new Date().toISOString(),
      };
      internalChatForceScrollRef.current = true;
      setManagerChatByFan((prev) => {
        const prevMsgs = prev[fanKey] ?? [];
        return { ...prev, [fanKey]: [...prevMsgs, managerMessage] };
      });
    }, 700);
  };

  const handleSendManagerChat = () => {
    askInternalManager(managerChatInput);
  };

  const handleManagerChatKeyDown = (evt: KeyboardEvent<HTMLTextAreaElement>) => {
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      handleSendManagerChat();
    }
  };

  const AUTOPILOT_OBJECTIVES: AutopilotObjective[] = ["reactivar_fan_frio", "ofrecer_extra", "llevar_a_mensual"];
  const isAutopilotObjective = (objective: ManagerQuickIntent): objective is AutopilotObjective =>
    AUTOPILOT_OBJECTIVES.includes(objective as AutopilotObjective);

  const logManagerUsage = async ({
    actionType,
    text,
  }: {
    actionType: string;
    text: string;
  }) => {
    try {
      await fetch("/api/creator/ai/log-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: conversation.id,
          actionType,
          suggestedText: text,
          outcome: "suggested",
          creditsUsed: 1,
        }),
      });
    } catch (err) {
      console.error("Error registrando uso de IA del Manager", err);
    }
  };

  const mapObjectiveToActionType = (objective: ManagerObjective | null): string => {
    switch (objective) {
      case "reactivar_fan_frio":
        return "reactivation_suggestion";
      case "ofrecer_extra":
        return "quick_extra_suggestion";
      case "llevar_a_mensual":
        return "pack_offer_suggestion";
      case "renovacion":
        return "renewal_suggestion";
      case "romper_hielo":
      case "bienvenida":
        return "warmup_suggestion";
      default:
        return "warmup_suggestion";
    }
  };

  const fanSummaryForAutopilot = useMemo(
    () => ({
      name: (contactName || "").trim() || "este fan",
      isVip: !!(conversation.isHighPriority || conversation.customerTier === "vip"),
      extrasCount: typeof conversation.extrasCount === "number" ? conversation.extrasCount : 0,
      daysLeft: typeof conversation.daysLeft === "number" ? conversation.daysLeft : null,
      totalSpent: typeof conversation.extrasSpentTotal === "number" ? conversation.extrasSpentTotal : 0,
    }),
    [
      contactName,
      conversation.customerTier,
      conversation.daysLeft,
      conversation.extrasCount,
      conversation.extrasSpentTotal,
      conversation.isHighPriority,
    ]
  );

  async function triggerAutopilotDraft(objective: AutopilotObjective, toneForDraft: FanTone) {
    setIsAutoPilotLoading(true);
    try {
      const draft = await getAutopilotDraft({
        tone: toneForDraft,
        objective,
        fan: fanSummaryForAutopilot,
      });
      setLastAutopilotObjective(objective);
      setLastAutopilotTone(toneForDraft);
      focusMainMessageInput(draft);
      await logManagerUsage({
        actionType: mapObjectiveToActionType(objective),
        text: draft,
      });
    } catch (err) {
      console.error("Error generando borrador de autopiloto", err);
    } finally {
      setIsAutoPilotLoading(false);
    }
  }

  const handleManagerQuickAction = async (
    intent: ManagerQuickIntent,
    options?: { toneOverride?: FanTone; skipInternalChat?: boolean }
  ) => {
    if (isAutoPilotLoading) return;
    setHasManualManagerObjective(true);
    setCurrentObjective(intent);
    const toneToUse = options?.toneOverride ?? fanTone;
    if (options?.toneOverride) {
      setFanTone(options.toneOverride);
      setHasManualTone(true);
    }
    const newSuggestions = buildSuggestionsForObjective({
      objective: intent,
      fanName: contactName,
      tone: toneToUse,
      state: fanManagerAnalysis.state,
      analysis: fanManagerAnalysis,
    });
    setManagerSuggestions(newSuggestions.slice(0, 3));
    const question = buildQuickIntentQuestion(intent, contactName);
    if (!options?.skipInternalChat) {
      askInternalManager(question, intent, toneToUse);
    }

    if (autoPilotEnabled && isAutopilotObjective(intent)) {
      await triggerAutopilotDraft(intent, toneToUse);
    }
  };

  const handleAutopilotSoften = () => {
    if (!autoPilotEnabled || isAutoPilotLoading || !lastAutopilotObjective) return;
    const toneOverride: FanTone = "suave";
    setFanTone(toneOverride);
    setHasManualTone(true);
    handleManagerQuickAction(lastAutopilotObjective, { toneOverride, skipInternalChat: true });
  };

  const handleAutopilotMakeBolder = () => {
    if (!autoPilotEnabled || isAutoPilotLoading || !lastAutopilotObjective) return;
    const toneOverride: FanTone = "picante";
    setFanTone(toneOverride);
    setHasManualTone(true);
    handleManagerQuickAction(lastAutopilotObjective, { toneOverride, skipInternalChat: true });
  };


  function handleSelectPack(packId: string) {
    const selectedPack = config.packs.find(pack => pack.id === packId);
    if (!selectedPack) return;

    const mappedType =
      selectedPack.name.toLowerCase().includes("bienvenida") ? "trial" :
      selectedPack.name.toLowerCase().includes("mensual") ? "monthly" :
      selectedPack.name.toLowerCase().includes("especial") ? "special" : selectedPackType;

    setSelectedPackType(mappedType as "trial" | "monthly" | "special");
    fillMessage(buildPackProposalMessage(selectedPack));
    setShowPackSelector(true);
    setOpenPanel("none");
  }

  function handleSelectPackChip(event: MouseEvent<HTMLButtonElement>, type: "trial" | "monthly" | "special") {
    event.stopPropagation();
    setSelectedPackType(type);
    setShowPackSelector(true);
    setOpenPanel("none");
    fillMessageFromPackType(type);
  }

  function changeHandler(evt: KeyboardEvent<HTMLTextAreaElement>) {
    const { key } = evt;

    if (key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      if (isSendingRef.current) return;
      if (messageSend.trim()) handleSendMessage();
    }
  }

  const resetMessageInputHeight = () => {
    if (messageInputRef.current) {
      messageInputRef.current.style.height = "auto";
    }
  };

  const adjustMessageInputHeight = () => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_MESSAGE_HEIGHT);
    el.style.height = `${next}px`;
  };

  async function sendMessageText(text: string, audienceMode: ComposerAudienceMode = "CREATOR") {
    if (!id) return;
    const isInternal = audienceMode === "INTERNAL";
    if (isChatBlocked && !isInternal) {
      setMessagesError("Chat bloqueado. Desbloquéalo para escribir.");
      return;
    }
    const trimmedMessage = text.trim();
    if (!trimmedMessage) return;

    const tempId = `temp-${Date.now()}`;
    if (!isInternal) {
      const tempMessage: ConversationMessage = {
        id: tempId,
        fanId: id,
        me: true,
        message: trimmedMessage,
        time: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false }),
        status: "sending",
        kind: "text",
        type: "TEXT",
      };
      setMessage((prev) => {
        if (!id) return prev || [];
        return [...(prev || []), tempMessage];
      });
      scrollToBottom("auto");
    }

    try {
      setMessagesError("");
      const payload: Record<string, unknown> = {
        fanId: id,
        text: trimmedMessage,
        from: "creator",
        type: "TEXT",
      };
      if (isInternal) {
        payload.audience = "INTERNAL";
      }
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) {
        if (!isInternal) {
          setMessage((prev) =>
            (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
          );
        }
        return;
      }
      if (!res.ok || !data?.ok) {
        console.error("Error enviando mensaje");
        setMessagesError(isInternal ? "Error guardando mensaje interno" : "Error enviando mensaje");
        return;
      }
      const apiMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      if (isInternal) {
        const internalOnly = apiMessages.filter((msg) => deriveAudience(msg) === "INTERNAL");
        if (internalOnly.length > 0) {
          setInternalMessages((prev) => reconcileApiMessages(prev, internalOnly, id));
        }
        setInternalToast("Guardado como interno");
        openInternalThread({ forceScroll: true });
        if (internalToastTimer.current) {
          clearTimeout(internalToastTimer.current);
        }
        internalToastTimer.current = setTimeout(() => {
          setInternalToast(null);
        }, 1800);
      } else {
        const mapped = mapApiMessagesToState(apiMessages);
        if (mapped.length > 0) {
          setMessage((prev) => {
            const withoutTemp = (prev || []).filter((m) => m.id !== tempId);
            return reconcileMessages(withoutTemp, mapped, id);
          });
        }
        void track(ANALYTICS_EVENTS.SEND_MESSAGE, { fanId: id });
      }
      setSchemaError(null);
      setMessageSend("");
      resetMessageInputHeight();
    } catch (err) {
      console.error("Error enviando mensaje", err);
      setMessagesError(isInternal ? "Error guardando mensaje interno" : "Error enviando mensaje");
      if (!isInternal) {
        setMessage((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
        );
      }
    }
  }

  async function handleSendMessage() {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSending(true);
    try {
      await sendMessageText(messageSend, composerAudience);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  async function handleCreatePaymentLink(item: ContentWithFlags) {
    if (!id) return;
    if (loadingPaymentId) return;
    setLoadingPaymentId(item.id);
      void track(ANALYTICS_EVENTS.PURCHASE_START, { fanId: id, meta: { contentId: item.id, title: item.title } });
    try {
      const res = await fetch("/api/payments/demo-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: id,
          contentId: item.id,
          price: 29,
          currency: "EUR",
        }),
      });

      if (!res.ok) {
        console.error("Error creando link de pago");
        setLoadingPaymentId(null);
        return;
      }

      const data = await res.json();
      const url = data?.url;
      if (typeof url === "string" && url.trim().length > 0) {
        await sendMessageText(`Te dejo aquí el enlace para este pack: ${url}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPaymentId(null);
    }
  }

  async function handleGrant(type: "trial" | "monthly" | "special") {
    if (!id) return;

    try {
      setGrantLoadingType(type);
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, type }),
      });

      if (!res.ok) {
        console.error("Error actualizando acceso");
        alert("Error actualizando acceso");
        return;
      }

      const data = await res.json();
      if (Array.isArray(data.activeGrants)) {
        setAccessGrants(data.activeGrants);
      } else {
        await fetchAccessGrants(id);
      }
      setSelectedPackType(type);
      setShowPackSelector(true);
      await refreshFanData(id);
    } catch (err) {
      console.error("Error actualizando acceso", err);
      alert("Error actualizando acceso");
    } finally {
      setGrantLoadingType(null);
    }
  }

  function handleOfferPack(level: "monthly" | "special") {
    const text = level === "monthly" ? PACK_MONTHLY_UPSELL_TEXT : PACK_ESPECIAL_UPSELL_TEXT;
    sendMessageText(text);
    setShowContentModal(false);
    setSelectedContentIds([]);
  }

  function buildNextActionPayload() {
    const text = nextActionDraft.trim();
    const date = nextActionDate.trim();
    const time = nextActionTime.trim();
    if (!text && !date && !time) return null;
    if (date) {
      const suffix = time ? ` ${time}` : "";
      return `${text || "Seguimiento"} (para ${date}${suffix})`.trim();
    }
    return text || null;
  }

  async function handleAddNote() {
    if (!id) return;
    const content = noteDraft.trim();
    const nextActionPayload = buildNextActionPayload();
    try {
      // Update next action first
      const resNext = await fetch("/api/fans/next-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId: id, nextAction: nextActionPayload || null }),
      });
      if (!resNext.ok) {
        console.error("Error guardando próxima acción");
        setNotesError("Error guardando próxima acción");
        return;
      }

      if (content) {
        const res = await fetch("/api/fan-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fanId: id, content }),
        });
        if (!res.ok) {
          console.error("Error guardando nota");
          setNotesError("Error guardando nota");
          return;
        }
        const data = await res.json();
        if (data.note) {
          setNotes((prev) => [data.note as FanNote, ...prev]);
          setNoteDraft("");
          setNotesError("");
        }
      }

      await refreshFanData(id);
      // sincroniza contadores y próxima acción en la conversación actual
      setConversation({
        ...conversation,
        notesCount: (conversation.notesCount ?? 0) + (content ? 1 : 0),
        nextAction: nextActionPayload || null,
      });
    } catch (err) {
      console.error("Error guardando nota", err);
      setNotesError("Error guardando nota");
    }
  }

  async function handleAttachContent(item: ContentWithFlags, options?: { keepOpen?: boolean }) {
    if (!id) return;
    const keepOpen = options?.keepOpen ?? false;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fanId: id,
          from: "creator",
          type: "CONTENT",
          contentItemId: item.id,
          text: "",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) return;
      if (!res.ok || !data?.ok) throw new Error("error");
      const apiMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      const mapped = mapApiMessagesToState(apiMessages);
      if (mapped.length > 0) {
        setMessage((prev) => reconcileMessages(prev || [], mapped, id));
      }
      setMessagesError("");
      setSchemaError(null);
      if (!keepOpen) {
        setShowContentModal(false);
      }
    } catch (err) {
      console.error("Error adjuntando contenido", err);
      setMessagesError("Error adjuntando contenido");
      if (!keepOpen) {
        setShowContentModal(false);
      }
    }
  }

  function getPresenceStatus(sourceLastSeenAt?: string | null, fallbackLabel?: string | null) {
    if (sourceLastSeenAt) {
      const last = new Date(sourceLastSeenAt);
      if (!Number.isNaN(last.getTime())) {
        const diffMinutes = (Date.now() - last.getTime()) / 60000;
        if (diffMinutes <= 3) {
          return { label: "En línea ahora", color: "online" as const };
        }
        if (diffMinutes <= 1440) {
          const relative = formatDistanceToNow(last, { addSuffix: true, locale: es });
          return { label: `Última conexión ${relative}`, color: "recent" as const };
        }
        const formatted = format(last, "d MMM, HH:mm", { locale: es });
        return { label: `Última conexión el ${formatted}`, color: "offline" as const };
      }
    }
    if (fallbackLabel) {
      return { label: `Última conexión: ${fallbackLabel}`, color: "offline" as const };
    }
    return { label: "Sin actividad reciente", color: "offline" as const };
  }

  const selectedPackStatus = getPackStatusForType(selectedPackType);
  const effectiveDaysLeft = selectedPackStatus.daysLeft ?? daysLeft;

  const membershipDetails = packLabel
    ? `${packLabel}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : membershipStatus
    ? `${membershipStatus}${effectiveDaysLeft ? ` – ${effectiveDaysLeft} días restantes` : ""}`
    : "";
  const presenceStatus = getPresenceStatus(lastSeenAt, lastSeen);
  const presenceDotClass =
    presenceStatus.color === "online"
      ? "bg-[#25d366]"
      : presenceStatus.color === "recent"
      ? "bg-[#f5c065]"
      : "bg-[#7d8a93]";
  const languageBadgeLabel =
    !conversation.isManager && preferredLanguage ? preferredLanguage.toUpperCase() : null;
  const languageSelectValue = preferredLanguage ?? "auto";
  const isInternalMode = composerAudience === "INTERNAL";
  const sendDisabled = isSending || !(messageSend.trim().length > 0) || (isChatBlocked && !isInternalMode);
  const composerPlaceholder = isChatBlocked && !isInternalMode
    ? "Has bloqueado este chat. Desbloquéalo para volver a escribir."
    : isInternalMode
    ? "Nota interna…"
    : "Mensaje al fan";
  const composerActionLabel = isInternalMode ? "Guardar nota" : "Enviar";
  const managerStatusLabel =
    fanManagerAnalysis.chips.find((chip) => chip.tone === "danger")?.label ||
    (autoPilotEnabled ? "AUTO" : fanManagerAnalysis.chips[0]?.label || "Manual");
  const extrasCountDisplay = conversation.extrasCount ?? 0;
  const extrasSpentDisplay = Math.round(conversation.extrasSpentTotal ?? 0);
  const extrasAmount = conversation.extrasSpentTotal ?? 0;
  const lifetimeAmount = conversation.lifetimeSpend ?? 0;
  const subsAmount = Math.max(0, lifetimeAmount - extrasAmount);
  const sessionToday = conversation.extraSessionToday ?? {
    todayCount: 0,
    todaySpent: 0,
    todayHighestTier: null,
    todayLastPurchaseAt: null,
  };
  const plan = getChatterProPlan({
    ladder: (conversation.extraLadderStatus as any) ?? null,
    sessionToday: (sessionToday as any) ?? null,
    turnMode: aiStatus?.turnMode ?? aiTurnMode ?? "auto",
    hasActivePaidAccess: hasMonthly || hasSpecial,
    accessSnapshot: getAccessSnapshot({
      activeGrantTypes: conversation.activeGrantTypes,
      daysLeft,
      membershipStatus,
      hasAccessHistory: conversation.hasAccessHistory,
      lastGrantType: conversation.lastGrantType,
    }),
    accessState: accessSummary.state,
    lastGrantType: conversation.lastGrantType ?? null,
  });
  const lapexPhaseLabel =
    isAccessExpired ? "Fase R – fan caducado" : conversation.extraLadderStatus?.phaseLabel ?? "Fase 0 – sin extras todavía";
  const lapexExtraNote = isAccessExpired ? " · Sin pack activo (caducado)" : "";
  const lapexSuggested = conversation.extraLadderStatus?.suggestedTier ?? "—";
  const vipAmountToday = Math.round(
    sessionToday.todaySpent ??
      (conversation.extraLadderStatus as any)?.sessionToday?.todaySpent ??
      (conversation.extraLadderStatus as any)?.sessionToday?.totalSpent ??
      0
  );
  const schemaFixCommands = schemaError?.fix?.length ? schemaError.fix : DB_SCHEMA_OUT_OF_SYNC_FIX;
  const schemaCopyLabel =
    schemaCopyState === "copied" ? "Copiado" : schemaCopyState === "error" ? "Error" : "Copiar comandos";

  function formatTier(tier?: "new" | "regular" | "priority" | "vip") {
    if (tier === "priority" || tier === "vip") return "Alta prioridad";
    if (tier === "regular") return "Habitual";
    return "Nuevo";
  }

  const handleViewProfile = () => {
    setShowQuickSheet(true);
  };

  const handleOpenEditName = () => {
    setIsActionsMenuOpen(false);
    setShowQuickSheet(false);
    setEditNameValue(conversation.creatorLabel ?? conversation.displayName ?? "");
    setEditNameError(null);
    setIsEditNameOpen(true);
  };

  const handleSaveEditName = async () => {
    const fanId =
      typeof id === "string" && id.trim()
        ? id
        : typeof router.query.fanId === "string"
        ? router.query.fanId
        : "";
    if (!fanId) {
      console.error("Edit name failed: fanId is missing");
      setEditNameError("No se pudo identificar el fan.");
      return;
    }
    try {
      setEditNameSaving(true);
      setEditNameError(null);
      const patchUrl = `/api/fans/${fanId}`;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[EditName] PATCH ${patchUrl} fanId=${fanId}`);
      }
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorLabel: editNameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) return;
      if (!res.ok) {
        console.error("Error updating fan name", res.status, data?.error);
        setEditNameError(data?.error || "No se pudo guardar el nombre.");
        return;
      }
      const updatedFan = data?.fan;
      if (!updatedFan?.id) {
        console.error("Invalid fan response when updating name", data);
        setEditNameError("Respuesta inválida al guardar el nombre.");
        return;
      }
      await refreshFanData(fanId);
      setSchemaError(null);
      closeEditNameModal();
    } catch (err) {
      console.error("Error updating fan name", err);
      setEditNameError("No se pudo guardar el nombre.");
    } finally {
      setEditNameSaving(false);
    }
  };

  const handlePreferredLanguageChange = async (nextLanguage: SupportedLanguage) => {
    const fanId =
      typeof id === "string" && id.trim()
        ? id
        : typeof router.query.fanId === "string"
        ? router.query.fanId
        : "";
    if (!fanId) {
      setPreferredLanguageError("No se pudo identificar el fan.");
      return;
    }
    if (nextLanguage === preferredLanguage) {
      return;
    }
    const previousLanguage = preferredLanguage;
    try {
      setPreferredLanguage(nextLanguage);
      setPreferredLanguageSaving(true);
      setPreferredLanguageError(null);
      const res = await fetch(`/api/fans/${fanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: nextLanguage }),
      });
      const data = await res.json().catch(() => ({}));
      if (handleSchemaOutOfSync(data)) {
        setPreferredLanguage(previousLanguage ?? null);
        return;
      }
      if (!res.ok) {
        setPreferredLanguageError(data?.error || "No se pudo guardar el idioma.");
        setPreferredLanguage(previousLanguage ?? null);
        return;
      }
      await refreshFanData(fanId);
      setSchemaError(null);
    } catch (_err) {
      setPreferredLanguageError("No se pudo guardar el idioma.");
      setPreferredLanguage(previousLanguage ?? null);
    } finally {
      setPreferredLanguageSaving(false);
    }
  };

  const closeEditNameModal = () => {
    setIsEditNameOpen(false);
    setEditNameError(null);
  };

  const handleOpenNotesFromSheet = () => {
    setShowQuickSheet(false);
    setOpenPanel("none");
    openInternalPanelTab("note");
  };

  const handleOpenHistoryFromSheet = () => {
    setShowQuickSheet(false);
    setOpenPanel("history");
    if (id) fetchHistory(id);
  };
  const handleOpenNotesPanel = () => {
    setOpenPanel("none");
    setIsActionsMenuOpen(false);
    openInternalPanelTab("note");
  };

  const handleOpenHistoryPanel = () => {
    setOpenPanel("history");
    setIsActionsMenuOpen(false);
    if (id) fetchHistory(id);
  };

  const updateConversationState = (patch: Partial<typeof conversation>) => {
    if (!conversation || conversation.id !== id) return;
    setConversation({ ...conversation, ...patch } as any);
  };

  const handleBlockChat = async () => {
    if (!id) return;
    setIsChatActionLoading(true);
    try {
      await fetch(`/api/conversations/${id}/block`, { method: "POST" });
      setIsChatBlocked(true);
      updateConversationState({ isBlocked: true });
      window.dispatchEvent(new Event("fanDataUpdated"));
    } catch (err) {
      console.error("Error blocking chat", err);
    } finally {
      setIsActionsMenuOpen(false);
      setIsChatActionLoading(false);
    }
  };

  const handleUnblockChat = async () => {
    if (!id) return;
    setIsChatActionLoading(true);
    try {
      await fetch(`/api/conversations/${id}/unblock`, { method: "POST" });
      setIsChatBlocked(false);
      updateConversationState({ isBlocked: false });
      window.dispatchEvent(new Event("fanDataUpdated"));
    } catch (err) {
      console.error("Error unblocking chat", err);
    } finally {
      setIsActionsMenuOpen(false);
      setIsChatActionLoading(false);
    }
  };

  const handleArchiveChat = async () => {
    if (!id) return;
    setIsChatActionLoading(true);
    try {
      await fetch(`/api/conversations/${id}/archive`, { method: "POST" });
      setIsChatArchived(true);
      updateConversationState({ isArchived: true });
      window.dispatchEvent(new Event("fanDataUpdated"));
    } catch (err) {
      console.error("Error archiving chat", err);
    } finally {
      setIsActionsMenuOpen(false);
      setIsChatActionLoading(false);
    }
  };

  const handleToggleHighPriority = async () => {
    if (!id) return;
    const nextValue = !conversation.isHighPriority;
    setIsChatActionLoading(true);
    try {
      const res = await fetch(`/api/fans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHighPriority: nextValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Error updating high priority", data?.error || res.statusText);
        return;
      }
      await refreshFanData(id);
    } catch (err) {
      console.error("Error updating high priority", err);
    } finally {
      setIsActionsMenuOpen(false);
      setIsChatActionLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!id) return;
    try {
      setInviteCopyState("loading");
      setInviteCopyError(null);
      const res = await fetch(`/api/fans/${id}/invite`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.inviteUrl) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[invite] generate failed", data?.error || res.statusText);
        }
        setInviteCopyState("error");
        setInviteCopyError("No se pudo generar el enlace.");
        return;
      }
      const inviteUrl = data.inviteUrl as string;
      setInviteCopyUrl(inviteUrl);
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopyState("copied");
      setInviteCopyToast("Invitación copiada");
      if (inviteCopyToastTimer.current) {
        clearTimeout(inviteCopyToastTimer.current);
      }
      inviteCopyToastTimer.current = setTimeout(() => setInviteCopyToast(""), 2000);
      setTimeout(() => setInviteCopyState("idle"), 1500);
    } catch (error) {
      console.error("Error copying invite link", error);
      setInviteCopyState("error");
      setInviteCopyError("No se pudo copiar el enlace.");
    }
  };

  const handleRenewAction = () => {
    const first = getFirstName(contactName) || contactName;
    const text = buildFollowUpExpiredMessage(first);
    fillMessage(text);
    adjustMessageInputHeight();
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  };

  const lifetimeValueDisplay = Math.round(conversation.lifetimeValue ?? 0);
  const notesCountDisplay = conversation.notesCount ?? 0;
  const novsyStatus = conversation.novsyStatus ?? null;
  const queueStatus = getQueuePosition();
  const isInQueue = queueMode && queueStatus.index >= 0;
  const hasNextInQueue = isInQueue && queueStatus.index < (queueStatus.size - 1);
  const statusTags: string[] = [];
  if (conversation.isHighPriority) {
    if (vipAmountToday > 0) statusTags.push(`Alta prioridad · ${vipAmountToday} €`);
    else statusTags.push("Alta prioridad");
  } else {
    statusTags.push(formatTier(conversation.customerTier));
  }
  if (!conversation.isHighPriority) {
    statusTags.push(`${Math.round(lifetimeAmount)} €`);
  }
  if (conversation.nextAction) {
    const shortNext = conversation.nextAction.length > 60 ? `${conversation.nextAction.slice(0, 57)}…` : conversation.nextAction;
    statusTags.push(`Próxima acción: ${shortNext}`);
  }
  const statusLine = statusTags.join(" · ");
  const tierLabels: Record<number, string> = {
    0: "T0 – calentamiento",
    1: "T1 – foto extra básica",
    2: "T2 – pack medio",
    3: "T3 – techo alto",
    4: "T4 – ultra premium",
  };

  function formatLastPurchase(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "hoy";
    if (diffDays === 1) return "hace 1 día";
    return `hace ${diffDays} días`;
  }

  function formatLastPurchaseToday(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return "hace instantes";
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) return "hace 1 min";
    if (diffMinutes < 60) return `hace ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 6) return `hace ${diffHours} h`;
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    if (d.toDateString() === now.toDateString()) return `hoy a las ${hours}:${minutes}`;
    return `${hours}:${minutes}`;
  }

  function getNextExtraTierLabel(status: Fan["extraLadderStatus"]): string | null {
    if (!status || !status.suggestedTier) return null;
    const tier = status.suggestedTier;
    if (tier === "T1") return "Propón un T1 (foto extra básica)";
    if (tier === "T2") return "Propón un T2 (pack medio)";
    if (tier === "T3" || tier === "T4") return "Propón el techo (pack caro)";
    return null;
  }
  const showRenewAction =
    isAccessExpired ||
    followUpTag === "trial_soon" ||
    followUpTag === "monthly_soon" ||
    followUpTag === "expired" ||
    followUpTag === "today";
  const renewButtonLabel = isAccessExpired ? "Reenganche" : "Renovación";

  function getTurnModeLabel(mode: AiTurnMode) {
    if (mode === "push_pack") return "Empujar pack";
    if (mode === "care_new") return "Cuidar nuevos";
    if (mode === "vip_focus") return "Mimar VIP";
    return "Automático (equilibrado)";
  }

  function getUsageLabelForPlan(usage: AiTemplateUsage | null): string | null {
    if (!usage) return null;
    if (usage === "welcome" || usage === "warmup") return "Saludo / calentar";
    if (usage === "extra_quick") return "Extra rápido";
    if (usage === "pack_offer") return "Pack especial";
    if (usage === "renewal") return "Reenganche";
    return usage;
  }

  const lapexSummary =
    conversation.extraLadderStatus && (conversation.extraLadderStatus.totalSpent ?? 0) > 0
      ? `${lapexPhaseLabel}${lapexExtraNote} · Ha gastado ${Math.round(
          conversation.extraLadderStatus.totalSpent ?? 0
        )} € en extras · Último pack ${formatLastPurchase(conversation.extraLadderStatus.lastPurchaseAt) || "—"} · Siguiente sugerencia: ${
          lapexSuggested || "—"
        }`
      : null;

  const sessionSummary =
    sessionToday.todayCount > 0
      ? `Sesión hoy: ${sessionToday.todayCount} extras — ${Math.round(sessionToday.todaySpent ?? 0)} € · Último ${
          formatLastPurchaseToday(sessionToday.todayLastPurchaseAt) || "—"
        }`
      : "Sesión hoy: sin extras todavía";

  const iaSummary = `IA hoy: ${aiStatus ? `${aiStatus.usedToday}/${aiStatus.hardLimitPerDay ?? "∞"}` : "–/–"} · Créditos: ${
    aiStatus ? aiStatus.creditsAvailable : "—"
  } · Modo IA: ${getTurnModeLabel(aiTurnMode)}`;

  const planSummary = plan.summaryLabel
    ? plan.summaryLabel
    : `Plan de hoy: ${plan.focusLabel || "—"}${plan.stepLabel ? ` — ${plan.stepLabel}` : ""}${
        plan.goalLabel ? ` — Objetivo: ${plan.goalLabel}` : ""
      }${
        getUsageLabelForPlan(plan.suggestedUsage)
          ? ` — Siguiente jugada: ${getUsageLabelForPlan(plan.suggestedUsage)}`
          : ""
      }`;

  const managerShortSummary = managerSummary?.priorityReason || fanManagerAnalysis.headline || plan.summaryLabel || statusLine;
  const quickExtraDisabled = iaBlocked || aiStatus?.limitReached;
  const composerDock = renderComposerDock();
  const showHistory = openPanel === "history";
  const showExtraTemplates = openPanel === "extras";
  const getTransactionPriceFor = (item?: ContentWithFlags | null) => {
    if (!item) return 0;
    const custom = transactionPrices[item.id];
    if (custom === undefined || custom === null || Number.isNaN(custom)) {
      return getExtraPrice(item);
    }
    return Math.max(0, custom);
  };
  const selectedExtrasTotal = selectedContentIds.reduce((sum, selectedId) => {
    const item = contentItems.find((c) => c.id === selectedId);
    return sum + getTransactionPriceFor(item);
  }, 0);
  const handleMonthlyOfferFromManager = () => {
    handleSubscriptionLink();
    openContentModal({ mode: "packs", packFocus: "MONTHLY" });
  };

  const filteredItems = contentItems.filter((item) => {
    const tag = getTimeOfDayTag(item.title ?? "");

    if (timeOfDayFilter === "all") return true;
    if (timeOfDayFilter === "day") return tag === "day";
    if (timeOfDayFilter === "night") return tag === "night";

    return true;
  });

  return (
    <div className="flex flex-col w-full h-[100dvh] max-h-[100dvh]">
      {onBackToBoard && (
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-slate-950/95 border-b border-slate-800 backdrop-blur">
          <button
            type="button"
            onClick={onBackToBoard}
            className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            ← Volver
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            <span className="truncate text-sm font-medium text-slate-50">{contactName}</span>
            {languageBadgeLabel && (
              <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                {languageBadgeLabel}
              </span>
            )}
            {(conversation.isHighPriority || (conversation.extrasCount ?? 0) > 0) && (
              <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                {conversation.isHighPriority ? "📌 Alta" : "Extras"}
              </span>
            )}
          </div>
        </header>
      )}
      <div className="flex flex-1 min-h-0 min-w-0">
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          <header ref={fanHeaderRef} className="sticky top-0 z-20 backdrop-blur">
            <div className="max-w-4xl mx-auto w-full bg-slate-950/70 border-b border-slate-800 px-4 py-3 md:px-6 md:py-4 flex flex-col gap-3">
          {/* Piso 1 */}
          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap" ref={actionsMenuRef}>
            <div className="flex items-center gap-3 min-w-0 flex-1 order-1">
              <Avatar width="w-10" height="h-10" image={image} />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-base font-semibold text-slate-50 truncate">{contactName}</h1>
                  {languageBadgeLabel && (
                    <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                      {languageBadgeLabel}
                    </span>
                  )}
                  {conversation.isHighPriority && (
                    <span className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-100 whitespace-nowrap">
                      📌 Alta
                    </span>
                  )}
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${presenceDotClass}`}
                    aria-label={presenceStatus.label}
                    title={presenceStatus.label}
                  />
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {membershipDetails || packLabel || "Suscripción"}
                </p>
              </div>
            </div>
            <div className="order-2 ml-auto sm:order-3 sm:ml-0">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                  aria-label="Más opciones del chat"
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 p-2 text-slate-300 hover:border-amber-300 hover:text-amber-100"
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" className="pointer-events-none">
                    <path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"></path>
                  </svg>
                </button>
                {isActionsMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-700 bg-slate-900/95 shadow-xl z-30">
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition"
                      onClick={handleOpenEditName}
                    >
                      Editar nombre
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition disabled:opacity-60"
                      onClick={handleToggleHighPriority}
                      disabled={isChatActionLoading}
                    >
                      {conversation.isHighPriority ? "Quitar alta prioridad" : "Marcar alta prioridad"}
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition"
                      onClick={handleOpenNotesPanel}
                    >
                      Notas
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition"
                      onClick={handleOpenHistoryPanel}
                    >
                      Historial
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition"
                      onClick={handleOpenExtrasPanel}
                    >
                      Ventas extra
                    </button>
                    <div className="my-1 h-px bg-slate-800" />
                    {!isChatBlocked && (
                      <button
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-sm text-rose-100 hover:bg-rose-500/10 transition disabled:opacity-60"
                        onClick={handleBlockChat}
                        disabled={isChatActionLoading}
                      >
                        Bloquear chat
                      </button>
                    )}
                    {isChatBlocked && (
                      <button
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/10 transition disabled:opacity-60"
                        onClick={handleUnblockChat}
                        disabled={isChatActionLoading}
                      >
                        Desbloquear chat
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition disabled:opacity-60"
                      onClick={handleArchiveChat}
                      disabled={isChatActionLoading}
                    >
                      Archivar chat
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 order-3 w-full sm:order-2 sm:w-auto sm:ml-auto sm:justify-end">
              <button
                type="button"
                onClick={handleViewProfile}
                aria-label="Ver ficha del fan"
                className="inline-flex items-center rounded-full border border-emerald-500/70 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
              >
                Ver ficha
              </button>
            </div>
          </div>

          {/* Piso 2 */}
          <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-amber-200 whitespace-nowrap">
              {packLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-200 whitespace-nowrap">
              {formatTier(conversation.customerTier)}
            </span>
            {conversation.isHighPriority && (
              <span className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-100 whitespace-nowrap">
                🔥 Alta prioridad
              </span>
            )}
            {extrasCountDisplay > 0 && (
              <span className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 whitespace-nowrap">
                Extras
              </span>
            )}
          </div>

          {/* Piso 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 md:gap-x-6 text-xs text-slate-300 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-slate-400">Última conexión:</span>
              <span className="truncate">{presenceStatus.label || "Sin actividad reciente"}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-slate-400">Extras:</span>
              <span className="truncate">
                {extrasCountDisplay} · {extrasSpentDisplay}
              </span>
            </div>
            <div className="md:col-span-2 flex items-start gap-1 min-w-0">
              <span className="text-slate-400">Próxima acción:</span>
              <span className="min-w-0 line-clamp-1 md:line-clamp-2 text-slate-200">
                {conversation.nextAction ? conversation.nextAction : "Sin próxima acción"}
              </span>
            </div>
          </div>
        </div>
      </header>
      {isChatBlocked && (
        <div className="mx-4 mt-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs md:text-sm text-red-200 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
          <span>Chat bloqueado. No puedes enviar mensajes nuevos a este fan.</span>
        </div>
      )}
      {/* Avisos de acceso caducado o a punto de caducar */}
      {isAccessExpired && (
        <div className="mx-4 mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-amber-200">Acceso caducado · sin pack activo</span>
            <span className="text-[11px] text-amber-100/90">
              Puedes enviarle un mensaje de reenganche y decidir después si le das acceso a nuevos contenidos.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20"
              onClick={handleRenewAction}
            >
              Mensaje de reenganche
            </button>
          </div>
        </div>
      )}
      {conversation.membershipStatus === "active" && typeof conversation.daysLeft === "number" && conversation.daysLeft <= 1 && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-100">
          <span className="font-medium text-amber-100">
            Le queda {conversation.daysLeft === 1 ? "1 día" : `${conversation.daysLeft} días`} de acceso. Buen momento para proponer el siguiente paso.
          </span>
        </div>
      )}
      {recommendedFan && recommendedFan.id !== id && (
        <div className="mt-2 mb-3 flex items-center justify-between rounded-xl border border-amber-500/60 bg-slate-900/70 px-3 py-2 text-xs">
          <div className="flex flex-col gap-1 truncate">
            <span className="font-semibold text-amber-300 flex items-center gap-1">
              ⚡ Siguiente recomendado
              {(recommendedFan.customerTier === "priority" || recommendedFan.customerTier === "vip") && (
                <span className="text-[10px] rounded-full bg-amber-500/20 px-2 text-amber-200">🔥 Alta prioridad</span>
              )}
            </span>
            <span className="truncate text-slate-200">
              {recommendedFan.contactName} ·{" "}
              {recommendedFan.customerTier === "priority" || recommendedFan.customerTier === "vip"
                ? "Alta prioridad"
                : recommendedFan.customerTier === "regular"
                ? "Habitual"
                : "Nuevo"}{" "}
              · {Math.round(recommendedFan.lifetimeValue ?? 0)} € · {recommendedFan.notesCount ?? 0} nota
              {(recommendedFan.notesCount ?? 0) === 1 ? "" : "s"}
            </span>
            {recommendedFan.nextAction && (
              <span className="text-[11px] text-slate-400 truncate">Próx.: {recommendedFan.nextAction}</span>
            )}
          </div>
          <button
            type="button"
            className="ml-3 rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/20"
            onClick={() => handleSelectFanFromBanner(recommendedFan)}
          >
            Abrir chat
          </button>
        </div>
      )}
      {showHistory && (
        <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-xs text-slate-100 flex flex-col gap-3 max-h-64">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Historial de compras</span>
            <button
              type="button"
              onClick={() => setOpenPanel("none")}
              className="rounded-full border border-slate-600 bg-slate-800/80 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
            >
              Cerrar
            </button>
          </div>
          {extrasCountDisplay > 0 && (
            <div className="text-[11px] text-slate-400">
              Este fan ha comprado {extrasCountDisplay} extra{extrasCountDisplay !== 1 ? "s" : ""} por un total de {extrasSpentDisplay} € (detalle en la pestaña &quot;Ventas extra&quot;).
            </div>
          )}
          {historyError && <div className="text-[11px] text-rose-300">{historyError}</div>}
          {!historyError && accessGrants.length === 0 && (
            <div className="text-[11px] text-slate-400">Sin historial de compras todavía.</div>
          )}
          <div className="flex-1 overflow-y-auto space-y-2">
            {accessGrants.map((grant) => {
              const mapped = mapGrantType(grant.type);
              const status = getGrantStatus(grant.expiresAt);
              return (
                <div key={grant.id} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
                    <span>{formatGrantDate(grant.createdAt)}</span>
                    <span>·</span>
                    <span>{mapped.label}</span>
                    <span>·</span>
                    <span>{mapped.amount} €</span>
                    <span>·</span>
                    <span className={status === "Activo" ? "text-emerald-300" : "text-slate-400"}>{status}</span>
                  </div>
                  {grant.expiresAt && (
                    <div className="text-[10px] text-slate-400">Vence el {formatGrantDate(grant.expiresAt)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {iaMessage && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {iaMessage} {iaBlocked ? "Mañana se reiniciarán tus créditos diarios." : ""}
        </div>
      )}
      {false && (
        // Desactivado: el nuevo Manager IA cubre las sugerencias de próxima acción.
        (() => {
          const followUpTemplates = getFollowUpTemplates({
            followUpTag,
            daysLeft,
            fanName: firstName,
          });
          if (!followUpTemplates.length) return null;
          return (
            <div className="mb-3 mx-4 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {followUpTag === "trial_soon" &&
                    `Próxima acción · Prueba · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                  {followUpTag === "monthly_soon" &&
                    `Próxima acción · Suscripción · ${effectiveDaysLeft ?? daysLeft ?? ""} días`}
                  {followUpTag === "expired" && "Próxima acción · Acceso caducado"}
                </span>
                {accessGrantsLoading && <span className="text-[10px] text-slate-400">Actualizando...</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {followUpTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => fillMessage(tpl.text)}
                    className="inline-flex items-center rounded-full border border-amber-400/80 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/20 transition"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()
      )}
      <div className="flex flex-col flex-1 min-h-0">
        <div
          ref={messagesContainerRef}
          className="flex flex-col w-full flex-1 overflow-y-auto"
          style={{ backgroundImage: "url('/assets/images/background.jpg')" }}
        >
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-32">
            {schemaError && (
              <div className="mb-4 rounded-xl border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-rose-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">DB fuera de sync</div>
                    <p className="text-xs text-rose-100/80">{schemaError.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySchemaFix}
                    className="rounded-full border border-rose-400/70 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/30 transition"
                  >
                    {schemaCopyLabel}
                  </button>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-rose-100/90">
                  {schemaFixCommands.map((cmd) => (
                    <code key={cmd} className="rounded-md bg-rose-950/50 px-2 py-1 font-mono">
                      {cmd}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {messages.map((messageConversation, index) => {
              if (messageConversation.kind === "content") {
                return (
                  <ContentAttachmentCard
                    key={`content-${messageConversation.contentItem?.id || index}`}
                    message={messageConversation}
                  />
                );
              }

              const { me, message, seen, time } = messageConversation;
              const isInternalMessage = messageConversation.audience === "INTERNAL";
              const translatedText = !me ? messageConversation.translatedText ?? undefined : undefined;
              return (
                <div key={messageConversation.id || index} className="space-y-1">
                  <MessageBalloon
                    me={me}
                    message={message}
                    seen={seen}
                    time={time}
                    status={messageConversation.status}
                    translatedText={translatedText}
                    badge={isInternalMessage ? "INTERNO" : undefined}
                    variant={isInternalMessage ? "internal" : "default"}
                  />
                  {messageConversation.status === "failed" && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-[11px] text-rose-300 hover:text-rose-200 underline"
                        onClick={() => sendMessageText(messageConversation.message)}
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {isLoadingMessages && (
              <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>
            )}
            {messagesError && !isLoadingMessages && (
              <div className="text-center text-red-400 text-sm mt-2">{messagesError}</div>
            )}
          </div>
        </div>
        {process.env.NEXT_PUBLIC_DEBUG_CHAT === "1" && (
          <div className="fixed bottom-2 right-2 text-[11px] text-slate-200 bg-slate-900/80 border border-slate-700 px-2 py-1 rounded">
            fanId={id || "none"} | loading={String(isLoadingMessages)} | msgs={messages.length} | error={messagesError || "none"}
          </div>
        )}
        <div className="flex flex-col bg-[#202c33] w-full h-auto py-3 px-4 text-[#8696a0] gap-3 flex-shrink-0 overflow-visible">
          {showExtraTemplates && (
            <div className="flex flex-col gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3 w-full">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-white">Historial de ventas extra</h3>
                    <p className="text-[11px] text-slate-400">Registra las ventas desde el modal de Extras PPV. Aquí solo ajustes manuales.</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <h3 className="text-sm font-semibold text-white">Historial de ventas extra</h3>
                      <p className="text-[11px] text-slate-400">Registra las ventas desde el modal de Extras PPV. Aquí solo ajustes manuales.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[11px] text-slate-300">
                        <span>Modo</span>
                        <div className="inline-flex rounded-full border border-slate-600 bg-slate-900">
                          {(["DAY", "NIGHT"] as TimeOfDayValue[]).map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setTimeOfDay(val)}
                              className={clsx(
                                "px-2 py-0.5 text-[11px] font-semibold rounded-full",
                                timeOfDay === val
                                  ? "bg-amber-500/20 text-amber-100 border border-amber-400/70"
                                  : "text-slate-200"
                              )}
                            >
                              {val === "DAY" ? "Día" : "Noche"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-slate-600 bg-slate-800/80 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                        onClick={() => setOpenPanel("none")}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Historial de extras</h4>
                  {isLoadingExtraHistory && <span className="text-[11px] text-slate-400">Cargando...</span>}
                </div>
                <div className="text-[11px] text-slate-400">
                  {(conversation.extrasCount ?? 0) > 0 ? (
                    <span>
                      {`Este fan te ha comprado ${conversation.extrasCount} extra${(conversation.extrasCount ?? 0) !== 1 ? "s" : ""} por un total de ${Math.round(conversation.extrasSpentTotal ?? 0)} €.`}
                    </span>
                  ) : (
                    <span>Todavía no has vendido extras a este fan.</span>
                  )}
                </div>
                {extraHistoryError && <div className="text-xs text-rose-300">{extraHistoryError}</div>}
                {!extraHistoryError && extraHistory.length === 0 && (
                  <div className="text-xs text-slate-400">Todavía no hay extras registrados para este fan.</div>
                )}
                {!extraHistoryError && extraHistory.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {extraHistory.map((entry) => {
                      const dateStr = new Date(entry.createdAt).toLocaleDateString("es-ES");
                      const session =
                        entry.sessionTag && entry.sessionTag.includes("_")
                          ? entry.sessionTag.split("_")[0]
                          : entry.contentItem?.timeOfDay ?? "ANY";
                          const tier = entry.tier;
                      return (
                        <div
                          key={entry.id}
                          className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{entry.contentItem?.title || "Extra"}</span>
                            <span className="text-slate-400">{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-300">
                            <span>{session === "DAY" ? "Día" : session === "NIGHT" ? "Noche" : "Cualquiera"}</span>
                            <span>·</span>
                            <span>{`Tier ${tier}`}</span>
                            <span>·</span>
                            <span>{`${entry.amount} €`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Ventas manuales</span>
                    <button
                      type="button"
                      className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                      onClick={() => setShowManualExtraForm((prev) => !prev)}
                    >
                      {showManualExtraForm ? "Cerrar" : "Añadir venta manual"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Uso avanzado: registra ventas que no pasaron por el flujo de Manager IA.
                  </p>
                  {showManualExtraForm && (
                    <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                      <div className="flex flex-col md:flex-row gap-2">
                        <select
                          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                          value={selectedExtraId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedExtraId(val);
                            const item = contentItems.find((c) => c.id === val);
                            const tier = getExtraTier(item);
                            const suggested = EXTRA_PRICES[tier] ?? EXTRA_PRICES.T1;
                            setExtraAmount(suggested);
                          }}
                        >
                          <option value="">Selecciona un extra</option>
                          {contentItems
                            .filter((item) => {
                              const isExtraItem = item.isExtra === true || item.visibility === "EXTRA";
                              const matchesTimeOfDay =
                                !item.timeOfDay || item.timeOfDay === "ANY" || item.timeOfDay === timeOfDay;
                              return isExtraItem && matchesTimeOfDay;
                            })
                            .map((item) => {
                              const tier = getExtraTier(item);
                              const suggested = EXTRA_PRICES[tier] ?? 0;
                              return (
                                <option key={item.id} value={item.id}>
                                  {`${item.title} · ${tier} · ${suggested} €`}
                                </option>
                              );
                            })}
                        </select>
                        <input
                          type="number"
                          className="w-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                          value={extraAmount}
                          onChange={(e) => setExtraAmount(e.target.value === "" ? "" : Number(e.target.value))}
                          placeholder="Importe"
                        />
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                          onClick={async () => {
                            if (!id || !selectedExtraId) {
                              setExtraError("Selecciona fan y extra.");
                              return;
                            }
                            const item = contentItems.find((c) => c.id === selectedExtraId);
                            const tier = getExtraTier(item);
                            if (!item || !tier) {
                              setExtraError("El extra seleccionado no tiene tier asignado.");
                              return;
                            }
                            if (extraAmount === "" || typeof extraAmount !== "number" || Number.isNaN(extraAmount)) {
                              setExtraError("Introduce un importe válido.");
                              return;
                            }
                            const sessionTag = `${timeOfDay}_${new Date().toISOString().slice(0, 10)}`;
                            setExtraError("");
                            const amountNumber = Number(extraAmount);
                            const result = await registerExtraSale({
                              fanId: id,
                              extraId: item.id,
                              amount: amountNumber,
                              tier,
                              sessionTag,
                              source: "manual_panel",
                            });
                            if (!result.ok) {
                              setExtraError(result.error || "No se pudo registrar el extra.");
                              return;
                            }
                            setSelectedExtraId("");
                            setExtraAmount("");
                            setShowManualExtraForm(false);
                          }}
                        >
                          Registrar extra
                        </button>
                      </div>
                      {extraError && <div className="text-[11px] text-rose-300">{extraError}</div>}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Historial de extras</h4>
                  {isLoadingExtraHistory && <span className="text-[11px] text-slate-400">Cargando...</span>}
                </div>
                <div className="text-[11px] text-slate-400">
                  {(conversation.extrasCount ?? 0) > 0 ? (
                    <span>
                      {`Este fan te ha comprado ${conversation.extrasCount} extra${(conversation.extrasCount ?? 0) !== 1 ? "s" : ""} por un total de ${Math.round(conversation.extrasSpentTotal ?? 0)} €.`}
                    </span>
                  ) : (
                    <span>Todavía no has vendido extras a este fan.</span>
                  )}
                </div>
                {extraHistoryError && <div className="text-xs text-rose-300">{extraHistoryError}</div>}
                {!extraHistoryError && extraHistory.length === 0 && (
                  <div className="text-xs text-slate-400">Todavía no hay extras registrados para este fan.</div>
                )}
                {!extraHistoryError && extraHistory.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {extraHistory.map((entry) => {
                      const dateStr = new Date(entry.createdAt).toLocaleDateString("es-ES");
                      const session =
                        entry.sessionTag && entry.sessionTag.includes("_")
                          ? entry.sessionTag.split("_")[0]
                          : entry.contentItem?.timeOfDay ?? "ANY";
                      const tier = entry.tier;
                      return (
                        <div
                          key={entry.id}
                          className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{entry.contentItem?.title || "Extra"}</span>
                            <span className="text-slate-400">{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-300">
                            <span>{session === "DAY" ? "Día" : session === "NIGHT" ? "Noche" : "Cualquiera"}</span>
                            <span>·</span>
                            <span>{`Tier ${tier}`}</span>
                            <span>·</span>
                            <span>{`${entry.amount} €`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
          <div className="sticky bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-3">
              {internalToast && <div className="mb-2 text-[11px] text-emerald-300">{internalToast}</div>}
              {composerDock?.chips}
              <div
                className={clsx(
                  "mt-3 flex items-center gap-2 rounded-2xl border px-3 py-2",
                  isInternalMode
                    ? "bg-amber-500/5 border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]"
                    : "bg-slate-900/90 border-slate-700/80 shadow-sm",
                  isInternalMode
                    ? "focus-within:border-amber-400/80 focus-within:ring-1 focus-within:ring-amber-400/30"
                    : "focus-within:border-emerald-500/80 focus-within:ring-1 focus-within:ring-emerald-500/40",
                  isChatBlocked && !isInternalMode && "opacity-70"
                )}
              >
                {!isInternalMode && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => openAttachContent({ closeInline: false })}
                      className="flex h-9 w-9 items-center justify-center rounded-full transition text-slate-200 hover:bg-slate-800/80"
                      title="Adjuntar contenido"
                      aria-label="Adjuntar contenido"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div
                    className={clsx(
                      "inline-flex items-center rounded-full border p-0.5 shrink-0",
                      isInternalMode
                        ? "border-amber-400/70 bg-amber-500/10"
                        : "border-slate-700 bg-slate-900/70"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleComposerAudienceChange("CREATOR")}
                      className={clsx(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition",
                        composerAudience === "CREATOR"
                          ? "bg-emerald-500/20 text-emerald-100"
                          : "text-slate-300 hover:text-slate-100"
                      )}
                    >
                      Fan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleComposerAudienceChange("INTERNAL")}
                      className={clsx(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition",
                        composerAudience === "INTERNAL"
                          ? "bg-amber-500/20 text-amber-100"
                          : "text-slate-300 hover:text-slate-100"
                      )}
                      title="No se envía al fan. Se guarda en el chat interno."
                    >
                      {isInternalMode ? "🔒 Interno" : "Interno"}
                    </button>
                  </div>
                  {isInternalMode && (
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.2em] text-amber-200/80">
                      INTERNAL
                    </span>
                  )}
                  <textarea
                    ref={messageInputRef}
                    rows={1}
                    className={clsx(
                      "flex-1 min-w-0 bg-transparent resize-none overflow-y-auto max-h-36",
                      "px-1 text-base leading-relaxed text-slate-50",
                      "placeholder:text-slate-300 focus:outline-none",
                      isInternalMode ? "caret-amber-300" : "caret-emerald-400",
                      isChatBlocked && !isInternalMode && "cursor-not-allowed"
                    )}
                    placeholder={composerPlaceholder}
                    onKeyDown={(evt) => changeHandler(evt)}
                    onChange={(evt) => {
                      setMessageSend(evt.target.value);
                    }}
                    value={messageSend}
                    disabled={isChatBlocked && !isInternalMode}
                    style={{ maxHeight: `${MAX_MESSAGE_HEIGHT}px` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sendDisabled}
                  className={clsx(
                    "h-9 px-4 rounded-2xl text-sm font-medium shrink-0",
                    isInternalMode ? "bg-amber-500 text-slate-950 hover:bg-amber-400" : "bg-emerald-600 text-white hover:bg-emerald-500",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "transition-colors"
                  )}
                >
                  {composerActionLabel}
                </button>
              </div>
              {composerDock?.panel}
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
      {showContentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-white">Adjuntar contenido</h3>
                <p className="text-sm text-slate-300">Elige qué quieres enviar a este fan según sus packs.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-700 bg-slate-800/60 p-1">
                  {(["packs", "extras"] as const).map((mode) => {
                    const isActive = contentModalMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={clsx(
                          "px-3 py-1 text-[11px] font-semibold rounded-full transition",
                          isActive
                            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                            : "text-slate-200"
                        )}
                        onClick={() => setContentModalMode(mode)}
                      >
                        {mode === "packs" ? "Packs" : "Extras PPV"}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                onClick={() => {
                  setShowContentModal(false);
                  setContentModalPackFocus(null);
                  setRegisterExtrasChecked(false);
                  setRegisterExtrasSource(null);
                  setRegisterExtrasChecked(false);
                  setRegisterExtrasSource(null);
                  setTransactionPrices({});
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
              </div>
            </div>
            {contentModalMode === "extras" && (
              <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-1">
                  <span>Momento</span>
                  <div className="inline-flex rounded-full border border-slate-600 bg-slate-900">
                    {(["day", "night"] as TimeOfDayFilter[]).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTimeOfDayFilter(val)}
                        className={clsx(
                          "px-2 py-1 rounded-full",
                          timeOfDayFilter === val
                            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                            : "text-slate-200"
                        )}
                      >
                        {val === "day" ? "Día" : "Noche"}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTimeOfDayFilter("all")}
                      className={clsx(
                        "px-2 py-1 rounded-full",
                        timeOfDayFilter === "all"
                          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                          : "text-slate-200"
                      )}
                    >
                      Todos
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-1">
                  <span>Tier</span>
                  <select
                    className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white"
                    value={extraTierFilter ?? ""}
                    onChange={(e) =>
                      setExtraTierFilter(e.target.value === "" ? null : (e.target.value as any))
                    }
                  >
                    <option value="">Todos</option>
                    <option value="T0">T0</option>
                    <option value="T1">T1</option>
                    <option value="T2">T2</option>
                    <option value="T3">T3</option>
                    <option value="T4">T4</option>
                  </select>
                </label>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {contentError && (
                <div className="text-sm text-rose-300">No se ha podido cargar la información de packs.</div>
              )}
              {!contentError && contentModalMode === "packs" && CONTENT_PACKS.map((packMeta) => {
                  const isUnlocked =
                    packMeta.code === "WELCOME"
                      ? hasWelcome
                      : packMeta.code === "MONTHLY"
                      ? hasMonthly || hasSpecial
                      : hasSpecial;
                  const badgeText = isUnlocked
                    ? "Incluido en su pack"
                    : packMeta.code === "SPECIAL" && !hasMonthly
                    ? "Pack superior (requiere suscripción mensual)"
                    : "Pack superior (no incluido)";
                  const badgeClass = isUnlocked
                    ? "border-emerald-400 text-emerald-200 bg-emerald-500/10"
                    : "border-slate-600 text-slate-300";
                  const packItems = contentItems.filter((item) => item.pack === packMeta.code);
                  return (
                    <div
                      key={packMeta.code}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"
                      ref={contentModalPackFocus === packMeta.code ? (el) => {
                        if (el && showContentModal && contentModalMode === "packs") {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      } : undefined}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-white">{packMeta.label}</div>
                        <div className="flex items-center gap-2">
                          <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border", badgeClass)}>
                            {badgeText}
                          </span>
                          {!isUnlocked && packMeta.code === "MONTHLY" && canOfferMonthly && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-amber-200 underline-offset-2 hover:underline"
                              onClick={() => handleOfferPack("monthly")}
                            >
                              Ofrecer suscripción mensual
                            </button>
                          )}
                          {!isUnlocked && packMeta.code === "SPECIAL" && canOfferSpecial && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-amber-200 underline-offset-2 hover:underline"
                              onClick={() => handleOfferPack("special")}
                            >
                              Ofrecer Pack especial
                            </button>
                          )}
                        </div>
                      </div>
                      {contentLoading && packItems.length === 0 && (
                        <div className="text-xs text-slate-400 mt-2">Cargando contenidos…</div>
                      )}
                      <div className="mt-2 flex flex-col gap-2">
                        {packItems.map((item) => {
                          const locked = !isUnlocked;
                          const selected = selectedContentIds.includes(item.id);
                          const typeEmoji =
                            item.type === "IMAGE" ? "🖼️" : item.type === "VIDEO" ? "🎬" : item.type === "AUDIO" ? "🎧" : "📄";
                          return (
                            <label
                              key={item.id}
                              className={clsx(
                                "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                                locked
                                  ? "border-slate-800 bg-slate-900/40 text-slate-500 cursor-not-allowed opacity-60"
                                  : selected
                                  ? "border-amber-400 bg-amber-500/10 text-amber-100"
                                  : "border-slate-800 bg-slate-900/80 text-slate-100 hover:border-amber-400/60"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">{locked ? "🔒" : typeEmoji}</span>
                                <span>{item.title}</span>
                                {item.hasBeenSentToFan && (
                                  <span className="text-[10px] text-emerald-300 border border-emerald-400/60 rounded-full px-2 py-[1px]">
                                    Enviado
                                  </span>
                                )}
                              </div>
                              {!locked && (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {
                                    setSelectedContentIds((prev) =>
                                      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                                    );
                                  }}
                                  className="h-4 w-4 accent-amber-400"
                                />
                              )}
                            </label>
                          );
                        })}
                        {!contentLoading && packItems.length === 0 && (
                          <div className="text-xs text-slate-500">No hay contenidos en este pack.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              {!contentError && contentModalMode === "extras" && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
                  <div className="text-sm font-semibold text-white">Extras PPV</div>
                  <div className="mt-2 flex flex-col gap-2">
                    {contentItems
                      .filter((item) => {
                        const isExtraItem = item.isExtra === true || item.visibility === "EXTRA";
                        if (!isExtraItem) return false;
                        const matchesTier =
                          !extraTierFilter || item.extraTier === extraTierFilter || item.extraTier === null;
                        const matchesTime =
                          timeOfDayFilter === "all" ||
                          item.timeOfDay === "ANY" ||
                          (timeOfDayFilter === "day" && item.timeOfDay === "DAY") ||
                          (timeOfDayFilter === "night" && item.timeOfDay === "NIGHT");
                        return matchesTier && matchesTime;
                      })
                      .map((item) => {
                        const selected = selectedContentIds.includes(item.id);
                        const typeEmoji =
                          item.type === "IMAGE" ? "🖼️" : item.type === "VIDEO" ? "🎬" : item.type === "AUDIO" ? "🎧" : "📄";
                        return (
                          <label
                            key={item.id}
                            className={clsx(
                              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                              selected
                                ? "border-amber-400 bg-amber-500/10 text-amber-100"
                                : "border-slate-800 bg-slate-900/80 text-slate-100 hover:border-amber-400/60"
                            )}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{typeEmoji}</span>
                                <span>{item.title}</span>
                                {item.hasBeenSentToFan && (
                                  <span className="text-[10px] text-emerald-300 border border-emerald-400/60 rounded-full px-2 py-[1px]">
                                    Enviado
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                <span>{item.extraTier ?? "T?"}</span>
                                <span>·</span>
                                <span>
                                  {item.timeOfDay === "DAY" ? "Día" : item.timeOfDay === "NIGHT" ? "Noche" : "Cualquier momento"}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {
                                  setSelectedContentIds((prev) =>
                                    prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                                  );
                                  if (!selected && transactionPrices[item.id] === undefined) {
                                    const defaultPrice = getExtraPrice(item);
                                    setTransactionPrices((prev) => ({ ...prev, [item.id]: defaultPrice }));
                                  }
                                }}
                                className="h-4 w-4 accent-amber-400"
                              />
                              {selected && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-200">
                                  <span>Precio:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={transactionPrices[item.id] ?? getExtraPrice(item)}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      if (Number.isNaN(val) || val < 0) {
                                        setTransactionPrices((prev) => {
                                          const next = { ...prev };
                                          delete next[item.id];
                                          return next;
                                        });
                                      } else {
                                        setTransactionPrices((prev) => ({ ...prev, [item.id]: val }));
                                      }
                                    }}
                                    className="w-20 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-right text-xs text-white"
                                  />
                                  <span>€</span>
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    {!contentLoading &&
                      contentItems.filter((item) => item.isExtra === true || item.visibility === "EXTRA").length === 0 && (
                        <div className="text-xs text-slate-500">No hay extras PPV todavía.</div>
                      )}
                  </div>
                </div>
              )}
            </div>
            {contentModalMode === "extras" && selectedContentIds.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                <label className="flex items-center gap-2 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-400"
                    checked={registerExtrasChecked}
                    onChange={(e) => setRegisterExtrasChecked(e.target.checked)}
                  />
                  <span>Registrar esta venta en &quot;Ventas extra&quot;</span>
                </label>
                <span className="text-[11px] text-slate-400">Total: {Math.round(selectedExtrasTotal)} €</span>
              </div>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                onClick={() => {
                  setShowContentModal(false);
                  setSelectedContentIds([]);
                  setContentModalPackFocus(null);
                  setRegisterExtrasChecked(false);
                  setRegisterExtrasSource(null);
                  setTransactionPrices({});
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={selectedContentIds.length === 0 || !!contentError}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  selectedContentIds.length === 0 || !!contentError
                    ? "border-slate-700 bg-slate-800/60 text-slate-500 cursor-not-allowed"
                    : "border-amber-400 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                )}
                onClick={async () => {
                  if (selectedContentIds.length === 0) return;
                  const chosen = contentItems.filter((item) => selectedContentIds.includes(item.id));
                  if (chosen.length === 0) return;
                  // Enviamos cada contenido como mensaje CONTENT para mantener consistencia con /api/messages.
                  const sentItems: ContentWithFlags[] = [];
                  for (const item of chosen) {
                    // eslint-disable-next-line no-await-in-loop
                    await handleAttachContent(item, { keepOpen: true });
                    sentItems.push(item);
                  }
                  if (contentModalMode === "extras" && registerExtrasChecked && sentItems.length > 0 && id) {
                    const sessionTag = `${timeOfDay}_${new Date().toISOString().slice(0, 10)}`;
                    const failed: string[] = [];
                    for (const item of sentItems) {
                      const tier = getExtraTier(item);
                      const amount = getTransactionPriceFor(item);
                      // eslint-disable-next-line no-await-in-loop
                      const result = await registerExtraSale({
                        fanId: id,
                        extraId: item.id,
                        amount,
                        tier,
                        sessionTag,
                        source: registerExtrasSource ?? "offer_flow",
                      });
                      if (!result.ok) {
                        failed.push(item.title || "Extra");
                      }
                    }
                    if (failed.length > 0) {
                      alert('Contenido enviado, pero no se ha podido registrar la venta. Inténtalo desde "Ventas extra".');
                    }
                  }
                  setShowContentModal(false);
                  setSelectedContentIds([]);
                  setContentModalPackFocus(null);
                  setRegisterExtrasChecked(false);
                  setRegisterExtrasSource(null);
                  setTransactionPrices({});
                }}
              >
                {selectedContentIds.length <= 1
                  ? "Enviar 1 elemento"
                  : `Enviar ${selectedContentIds.length} elementos`}
              </button>
            </div>
          </div>
        </div>
      )}
      {showQuickSheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl bg-slate-900 border border-slate-700 shadow-xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-300">Ficha rápida</h2>
              <button
                type="button"
                onClick={() => setShowQuickSheet(false)}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Avatar width="w-10" height="h-10" image={image} />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-base font-semibold text-slate-50 truncate">{contactName}</div>
                  <button
                    type="button"
                    onClick={handleOpenEditName}
                    className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-100"
                  >
                    ✎ Editar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center rounded-full bg-slate-800/80 text-amber-200 px-2 py-[1px]">
                    {packLabel}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-800/80 text-slate-200 px-2 py-[1px]">
                    {formatTier(conversation.customerTier)}
                  </span>
                  {conversation.isHighPriority && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/20 text-amber-200 px-2 py-[1px]">
                      🔥 Alta prioridad
                    </span>
                  )}
                  {extrasCountDisplay > 0 && (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-100 px-2 py-[1px]">
                      Extras
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Total gastado</span>
                <span className="font-semibold text-slate-50">{Math.round(lifetimeAmount)} €</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Extras</span>
                <span className="font-medium text-slate-50">
                  {extrasCountDisplay} extra{extrasCountDisplay === 1 ? "" : "s"} · {extrasSpentDisplay} €
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Idioma</span>
                <select
                  value={languageSelectValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "auto") return;
                    handlePreferredLanguageChange(value as SupportedLanguage);
                  }}
                  disabled={preferredLanguageSaving}
                  className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-[11px] font-semibold text-slate-100 focus:border-emerald-400"
                >
                  <option value="auto" disabled>
                    Auto (EN por defecto)
                  </option>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang.toUpperCase()} · {LANGUAGE_LABELS[lang]}
                    </option>
                  ))}
                </select>
              </div>
              {preferredLanguageError && <p className="text-xs text-rose-300">{preferredLanguageError}</p>}
              <div className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <span className="text-slate-400 text-xs">Próxima acción</span>
                <span className="text-slate-50 text-sm leading-snug">
                  {conversation.nextAction ? conversation.nextAction : "Sin próxima acción definida"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleOpenNotesFromSheet}
                className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 hover:bg-slate-800"
              >
                Abrir notas
              </button>
              <button
                type="button"
                onClick={handleOpenHistoryFromSheet}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Ver historial
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                disabled={inviteCopyState === "loading"}
                className={clsx(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  inviteCopyState === "loading"
                    ? "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                    : "border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800"
                )}
              >
                {inviteCopyState === "copied"
                  ? "Enlace copiado"
                  : inviteCopyState === "loading"
                  ? "Generando enlace..."
                  : "Copiar enlace de invitación"}
              </button>
              {inviteCopyUrl && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300 break-all">
                  {inviteCopyUrl}
                </div>
              )}
              {inviteCopyToast && <p className="text-xs text-emerald-300">{inviteCopyToast}</p>}
              {inviteCopyError && <p className="text-xs text-rose-300">{inviteCopyError}</p>}
            </div>
          </div>
        </div>
      )}
      {isEditNameOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl bg-slate-900 border border-slate-700 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-200">Editar nombre del fan</h2>
              <button
                type="button"
                onClick={closeEditNameModal}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span>Nombre o alias</span>
              <input
                className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                placeholder="Ej: Ana"
              />
            </label>
            {editNameError && <p className="text-xs text-rose-300">{editNameError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                onClick={closeEditNameModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={editNameSaving}
                className={clsx(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  editNameSaving
                    ? "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                    : "border-emerald-400 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                )}
                onClick={() => void handleSaveEditName()}
              >
                {editNameSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContentAttachmentCard({ message }: { message: ConversationMessage }) {
  const content = message.contentItem;
  const title = content?.title || message.message || "Contenido adjunto";
  const visibilityLabel = content ? getContentVisibilityLabel(content.visibility) : "";
  const typeLabel = content ? getContentTypeLabel(content.type) : "Contenido";
  const emoji = getContentEmoji(content?.type);
  const alignItems = message.me ? "items-end" : "items-start";
  const externalUrl = content?.externalUrl;
  const isInternal = message.audience === "INTERNAL";

  const badgeClass = (() => {
    if (visibilityLabel.toLowerCase().includes("vip")) return "border-amber-400/80 text-amber-200";
    if (visibilityLabel.toLowerCase().includes("extra")) return "border-sky-400/70 text-sky-200";
    if (visibilityLabel.toLowerCase().includes("incluido")) return "border-emerald-400/70 text-emerald-200";
    return "border-slate-600 text-slate-200";
  })();

  function openContent() {
    if (externalUrl) {
      window.open(externalUrl, "_blank");
    } else {
      alert("Demo: aquí se abriría el contenido real");
    }
  }

  return (
    <div className={`flex flex-col ${alignItems} w-full h-max`}>
      <div
        className={clsx(
          "flex flex-col min-w-[5%] max-w-[65%] p-3 text-white rounded-lg mb-3 shadow-sm border",
          isInternal ? "bg-amber-500/10 border-amber-400/50" : "bg-[#202c33] border-slate-800"
        )}
      >
        {isInternal && (
          <span className="mb-2 inline-flex w-fit items-center rounded-full border border-amber-400/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
            INTERNO
          </span>
        )}
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
          onClick={openContent}
        >
          Ver contenido
        </button>
        <div className="flex justify-end items-center gap-2 text-[hsla(0,0%,100%,0.6)] text-xs mt-2">
          <span>{message.time}</span>
          {message.me && message.seen ? <span className="text-[#8edafc] text-[11px]">✔✔ Visto</span> : null}
        </div>
      </div>
    </div>
  );
}

function getContentEmoji(type?: string) {
  if (type === "VIDEO") return "🎥";
  if (type === "AUDIO") return "🎧";
  return "📷";
}

function mapTypeToLabel(type?: string): string {
  if (type === "IMAGE") return "Foto";
  if (type === "VIDEO") return "Vídeo";
  if (type === "AUDIO") return "Audio";
  if (type === "TEXT") return "Texto";
  return type || "";
}

function formatContentDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
