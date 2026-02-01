import ConversationList from "../ConversationList";
import React, { Component, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import CreatorHeader from "../CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import CreatorSettingsPanel from "../CreatorSettingsPanel";
import { Fan } from "../../types/chat";
import { ConversationListData } from "../../types/Conversation";
import { ExtrasSummary } from "../../types/extras";
import clsx from "clsx";
import { getFollowUpTag, getUrgencyLevel, shouldFollowUpToday, isExpiredAccess } from "../../utils/followUp";
import { getFanDisplayNameForCreator } from "../../utils/fanDisplayName";
import { PACKS } from "../../config/packs";
import { ConversationContext, QueueFilter } from "../../context/ConversationContext";
import { HIGH_PRIORITY_LIMIT } from "../../config/customers";
import { normalizePreferredLanguage } from "../../lib/language";
import { getFanIdFromQuery, openFanChat } from "../../lib/navigation/openCreatorChat";
import {
  clearUnseenPurchase,
  getUnseenPurchases,
  recordUnseenPurchase,
  setPendingPurchaseNotice,
  type PurchaseNotice,
} from "../../lib/unseenPurchases";
import {
  clearUnseenVoiceNote,
  getUnseenVoiceNotes,
  recordUnseenVoiceNote,
  type VoiceNoteNotice,
} from "../../lib/unseenVoiceNotes";
import { setSmartTranscriptionTargets } from "../../lib/voiceTranscriptionSmartTargets";
import type {
  CreatorDataChangedPayload,
  FanMessageSentPayload,
  PurchaseCreatedPayload,
  TypingPayload,
  VoiceTranscriptPayload,
} from "../../lib/events";
import { formatPurchaseUI } from "../../lib/purchaseUi";
import { publishChatEvent, subscribeChatEvents } from "../../lib/chatEvents";
import { useCreatorRealtime } from "../../hooks/useCreatorRealtime";
import { clearTypingIndicator, updateTypingIndicator } from "../../lib/typingIndicatorStore";
import { DevRequestCounters } from "../DevRequestCounters";
import { recordDevRequest } from "../../lib/devRequestStats";
import { IconGlyph } from "../ui/IconGlyph";
import { computeAgencyPriorityScore } from "../../lib/agency/priorityScore";
import type { AgencyIntensity, AgencyStage } from "../../lib/agency/types";
import { DB_SCHEMA_OUT_OF_SYNC_CODE } from "../../lib/dbSchemaGuard";
import { AI_ENABLED } from "../../lib/features";
import { notifyCreatorStatusUpdated } from "../../lib/creatorStatusEvents";

class SideBarBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("SideBar crash", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm text-[color:var(--text)] bg-[color:rgba(244,63,94,0.12)] border border-[color:rgba(244,63,94,0.6)] rounded-lg space-y-2">
          <div className="font-semibold">Algo falló al cargar la barra lateral.</div>
          <button
            type="button"
            className="rounded-md bg-[color:rgba(244,63,94,0.2)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.28)]"
            onClick={() => {
              this.setState({ hasError: false });
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children as JSX.Element;
  }
}

type LeftSectionCardProps = {
  children: React.ReactNode;
  className?: string;
};

function LeftSectionCard({ children, className }: LeftSectionCardProps) {
  return (
    <div
      className={clsx(
        "ui-panel p-4 transition",
        "hover:border-[color:var(--surface-border-hover)] hover:ring-1 hover:ring-[color:var(--surface-ring)]",
        className
      )}
    >
      {children}
    </div>
  );
}

type LeftKpiCardTone = "default" | "accent";

type LeftKpiCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: LeftKpiCardTone;
  hint?: React.ReactNode;
  supporting?: React.ReactNode;
  className?: string;
  valueClassName?: string;
};

function LeftKpiCard({
  label,
  value,
  tone = "default",
  hint,
  supporting,
  className,
  valueClassName,
}: LeftKpiCardProps) {
  const toneClass = tone === "accent" ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]";
  return (
    <div className={clsx("ui-card p-3", className)}>
      <div className="text-[10px] ui-muted">{label}</div>
      <div
        className={clsx(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums leading-tight",
          toneClass,
          valueClassName
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-[10px] ui-muted">{hint}</div> : null}
      {supporting ? <div className="mt-1 text-[10px] ui-muted">{supporting}</div> : null}
    </div>
  );
}

type FanData = ConversationListData & { priorityScore?: number };
type AccessRequestPreview = {
  id: string;
  fanId: string;
  fanName?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SPAM";
  message: string;
  conversationId?: string | null;
  createdAt: string;
};

type CreatorAvailability = "AVAILABLE" | "NOT_AVAILABLE" | "VIP_ONLY" | "OFFLINE";
type CreatorResponseSla = "INSTANT" | "LT_24H" | "LT_72H";

const CREATOR_AVAILABILITY_OPTIONS: Array<{ value: CreatorAvailability; label: string }> = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "OFFLINE", label: "No disponible" },
  { value: "VIP_ONLY", label: "Solo VIP" },
];
const CREATOR_SLA_OPTIONS: Array<{ value: CreatorResponseSla; label: string }> = [
  { value: "INSTANT", label: "Responde al momento" },
  { value: "LT_24H", label: "Responde <24h" },
  { value: "LT_72H", label: "Responde <72h" },
];

function normalizeCreatorAvailability(value?: string | null): CreatorAvailability {
  const normalized = (value || "").toUpperCase();
  if (normalized === "VIP_ONLY") return "VIP_ONLY";
  if (normalized === "OFFLINE" || normalized === "NOT_AVAILABLE") return "OFFLINE";
  if (normalized === "ONLINE" || normalized === "AVAILABLE") return "AVAILABLE";
  return "AVAILABLE";
}

function normalizeCreatorResponseSla(value?: string | null): CreatorResponseSla {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "INSTANT";
  if (normalized === "LT_72H" || normalized === "LT_48H") return "LT_72H";
  return "LT_24H";
}

function applyAccessRequestMeta(
  items: ConversationListData[],
  accessRequestsByFanId: Record<string, AccessRequestPreview>
): ConversationListData[] {
  if (!items.length) return items;
  let mutated = false;
  const next = items.map((item) => {
    if (!item?.id) return item;
    const request = accessRequestsByFanId[item.id];
    const nextStatus = request?.status;
    const nextId = request?.id ?? null;
    const prevStatus = item.accessRequestStatus;
    const prevId = item.accessRequestId ?? null;
    if (prevStatus === nextStatus && prevId === nextId) return item;
    mutated = true;
    return { ...item, accessRequestStatus: nextStatus, accessRequestId: nextId };
  });
  return mutated ? next : items;
}

function formatAccessRequestTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildAccessRequestConversations(
  requests: AccessRequestPreview[],
  fanIndex: Map<string, ConversationListData>
): ConversationListData[] {
  if (!requests.length) return [];
  return requests
    .map((request) => {
      if (!request?.fanId) return null;
      const base = fanIndex.get(request.fanId) ?? null;
      const contactName = (request.fanName || base?.contactName || "Fan").trim() || "Fan";
      const lastMessage = request.message?.trim() || base?.lastMessage || "Solicitud de acceso";
      const lastTime = formatAccessRequestTime(request.createdAt) || base?.lastTime || "";
      const image = base?.image ?? "";
      const messageHistory = base?.messageHistory ?? [];
      return {
        ...(base ?? {
          id: request.fanId,
          contactName,
          lastMessage,
          lastTime,
          image,
          messageHistory,
        }),
        id: request.fanId,
        contactName,
        lastMessage,
        lastTime,
        image,
        messageHistory,
        accessRequestStatus: request.status,
        accessRequestId: request.id,
      } as ConversationListData;
    })
    .filter(Boolean) as ConversationListData[];
}
type RecommendationMeta = {
  fan: FanData;
  score: number;
  level: number;
  tag: string;
  tagTone: "amber" | "rose" | "sky" | "emerald";
  reason: string;
  daysLeftLabel: string;
  daysLeftValue: number | null;
  lastActivity: number;
};
type PriorityQueueCounts = {
  total: number;
  expiringCritical: number;
  expiringSoon: number;
  expired: number;
  risk: number;
  highPriority: number;
  followUpToday: number;
  vip: number;
  trialSilent: number;
};
type PriorityQueueResult = {
  queueList: RecommendationMeta[];
  nextRecommended: RecommendationMeta | null;
  counts: PriorityQueueCounts;
};
type QueueSignals = {
  followUpTag: ReturnType<typeof getFollowUpTag>;
  daysLeftValue: number | null;
  isTrial: boolean;
  isMonthly: boolean;
  isExpired: boolean;
  isExpiringCritical: boolean;
  isRisk: boolean;
  isTrialSilent: boolean;
  isFollowUpToday: boolean;
  isHighPriority: boolean;
  hasUnread: boolean;
  extrasSignal: boolean;
  hasNextAction: boolean;
};
type FiltersDraft = {
  listSegment: "all" | "queue";
  followUpMode: "all" | "today" | "expired" | "priority";
  statusFilter: "active" | "archived" | "blocked";
  tierFilter: "all" | "new" | "regular" | "vip";
  showOnlyWithNotes: boolean;
  onlyWithExtras: boolean;
  onlyWithFollowUp: boolean;
  onlyNeedsReply: boolean;
  onlyAtRisk: boolean;
};
const FILTERS_STORAGE_KEY = "novsy:creator:sidebar_filters";
const FILTERS_STORAGE_VERSION = 1;
const INSIGHTS_STORAGE_KEY = "novsy:creator:sidebar-insights-open";
const HEAT_FILTER_VALUES = [ "all", "cold", "warm", "hot" ] as const;
const INTENT_FILTER_VALUES = [
  "all",
  "BUY_NOW",
  "PRICE_ASK",
  "CONTENT_REQUEST",
  "CUSTOM_REQUEST",
  "SUBSCRIBE",
  "CANCEL",
  "OFF_PLATFORM",
  "SUPPORT",
  "OBJECTION",
  "RUDE_OR_HARASS",
  "OTHER",
] as const;

type HeatFilter = (typeof HEAT_FILTER_VALUES)[number];
type IntentFilter = (typeof INTENT_FILTER_VALUES)[number];

const INITIAL_FILTERS_DRAFT: FiltersDraft = {
  listSegment: "all",
  followUpMode: "all",
  statusFilter: "active",
  tierFilter: "all",
  showOnlyWithNotes: false,
  onlyWithExtras: false,
  onlyWithFollowUp: false,
  onlyNeedsReply: false,
  onlyAtRisk: false,
};

const isHeatFilter = (value: unknown): value is HeatFilter =>
  HEAT_FILTER_VALUES.includes(value as HeatFilter);
const isIntentFilter = (value: unknown): value is IntentFilter =>
  INTENT_FILTER_VALUES.includes(value as IntentFilter);
const isListSegment = (value: unknown): value is FiltersDraft["listSegment"] =>
  value === "all" || value === "queue";
const isFollowUpMode = (value: unknown): value is FiltersDraft["followUpMode"] =>
  value === "all" || value === "today" || value === "expired" || value === "priority";
const isStatusFilter = (value: unknown): value is FiltersDraft["statusFilter"] =>
  value === "active" || value === "archived" || value === "blocked";
const isTierFilter = (value: unknown): value is FiltersDraft["tierFilter"] =>
  value === "all" || value === "new" || value === "regular" || value === "vip";

function buildDraftWithFilter(
  base: FiltersDraft,
  filter: FiltersDraft["followUpMode"],
  onlyNotes = false,
  tier: FiltersDraft["tierFilter"] = "all",
  onlyFollowUp = false
): FiltersDraft {
  return {
    ...base,
    listSegment: "all",
    statusFilter: "active",
    followUpMode: filter,
    showOnlyWithNotes: onlyNotes,
    tierFilter: tier,
    onlyWithFollowUp: onlyFollowUp,
  };
}

function buildDraftWithFollowUpMode(
  base: FiltersDraft,
  mode: "today" | "expired" | "priority"
): FiltersDraft {
  const next = base.followUpMode === mode ? "all" : mode;
  return {
    ...base,
    listSegment: "all",
    statusFilter: "active",
    followUpMode: next,
    showOnlyWithNotes: false,
    tierFilter: "all",
    onlyWithFollowUp: false,
  };
}

function buildDraftWithTierFilter(base: FiltersDraft, tier: "new" | "regular"): FiltersDraft {
  const nextTier = base.tierFilter === tier ? "all" : tier;
  return {
    ...base,
    listSegment: "all",
    statusFilter: "active",
    tierFilter: nextTier,
    onlyWithFollowUp: false,
  };
}

function buildDraftWithStatusFilter(
  base: FiltersDraft,
  next: FiltersDraft["statusFilter"]
): FiltersDraft {
  if (next === "active") {
    return {
      ...base,
      listSegment: "all",
      statusFilter: "active",
    };
  }
  return {
    ...base,
    listSegment: "all",
    statusFilter: next,
    followUpMode: "all",
    showOnlyWithNotes: false,
    tierFilter: "all",
    onlyWithFollowUp: false,
    onlyWithExtras: false,
    onlyNeedsReply: false,
    onlyAtRisk: false,
  };
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getAccessKind(fan: FanData): "trial" | "monthly" | "special" | "none" {
  const status = (fan.membershipStatus || "").toLowerCase();
  const activeTypes = (fan.activeGrantTypes ?? []).map((type) => (type || "").toLowerCase());
  const hasTrial =
    activeTypes.some((type) => type.includes("trial") || type.includes("welcome")) ||
    status.includes("trial") ||
    status.includes("prueba");
  if (hasTrial) return "trial";
  const hasMonthly =
    activeTypes.some((type) => type.includes("monthly")) ||
    status.includes("monthly") ||
    status.includes("mensual") ||
    status.includes("suscrip");
  if (hasMonthly) return "monthly";
  const hasSpecial =
    activeTypes.some((type) => type.includes("special")) ||
    status.includes("especial") ||
    status.includes("individual");
  if (hasSpecial) return "special";
  return "none";
}

function isSilentFan(fan: FanData): boolean {
  if ((fan.unreadCount ?? 0) > 0) return false;
  const inactivityDays = daysSince(fan.lastSeenAt ?? null);
  if (inactivityDays === null) return true;
  return inactivityDays >= 3;
}

function hasRiskFlag(fan: FanData): boolean {
  const segment = ((fan.segment || "") as string).toUpperCase();
  if (segment === "EN_RIESGO") return true;
  const risk = (fan.riskLevel || "").toString().toUpperCase();
  return risk !== "" && risk !== "LOW";
}

function getTemperatureBucket(fan: FanData): "COLD" | "WARM" | "HOT" | "" {
  const raw = (fan as any).temperatureBucket ?? (fan as any).heatLabel ?? "";
  const normalized = String(raw).toUpperCase();
  if (normalized === "READY") return "HOT";
  if (normalized === "COLD" || normalized === "WARM" || normalized === "HOT") return normalized;
  return "";
}

function normalizeSuggestedActionKey(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (
    normalized === "BREAK_ICE" ||
    normalized === "BUILD_RAPPORT" ||
    normalized === "OFFER_EXTRA" ||
    normalized === "PUSH_MONTHLY" ||
    normalized === "SEND_PAYMENT_LINK" ||
    normalized === "SUPPORT" ||
    normalized === "SAFETY"
  ) {
    return normalized;
  }
  return null;
}

function getManualNextActionValue(fan: FanData): string {
  const raw = typeof fan.nextAction === "string" ? fan.nextAction.trim() : "";
  return normalizeSuggestedActionKey(raw) ? "" : raw;
}

function hasExtrasSignal(fan: FanData): boolean {
  const extrasSpent = fan.extrasSpentTotal ?? 0;
  const extrasCount = fan.extrasCount ?? 0;
  const sessionCount = fan.extraSessionToday?.todayCount ?? 0;
  const ladderSessionCount = fan.extraLadderStatus?.sessionToday?.todayCount ?? 0;
  return extrasSpent > 0 || extrasCount > 0 || sessionCount > 0 || ladderSessionCount > 0;
}

function normalizeTier(tier?: string | null): "new" | "regular" | "vip" {
  if (!tier) return "new";
  const lower = tier.toLowerCase();
  if (lower === "priority" || lower === "vip") return "vip";
  if (lower === "regular") return "regular";
  return "new";
}

function computePriorityScore(fan: FanData): number {
  const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
  const stage = (fan.agencyStage ?? "NEW") as AgencyStage;
  const objective = fan.agencyObjective ?? "CONNECT";
  const intensity = (fan.agencyIntensity ?? "MEDIUM") as AgencyIntensity;
  const segmentLabel = ((fan.segment || "") as string).toUpperCase();
  const riskValue = (fan.riskLevel || "").toString().toUpperCase();
  const isVip = normalizeTier(fan.customerTier) === "vip" || segmentLabel === "VIP";
  const spent30d = typeof fan.recent30dSpent === "number" ? fan.recent30dSpent : 0;

  return computeAgencyPriorityScore({
    lastIncomingAt: fan.lastMessageAt ?? null,
    lastOutgoingAt: fan.lastCreatorMessageAt ?? null,
    spent7d: 0,
    spent30d,
    stage,
    objective,
    intensity,
    flags: {
      vip: isVip,
      expired: tag === "expired",
      atRisk: segmentLabel === "EN_RIESGO" || (riskValue !== "" && riskValue !== "LOW"),
      isNew: fan.isNew30d ?? false,
    },
  });
}

export default function SideBar() {
  return (
    <SideBarBoundary>
      <SideBarInner />
    </SideBarBoundary>
  );
}

function SideBarInner() {
  const router = useRouter();
  const aiEnabled = AI_ENABLED;
  const queryFan = router.query.fan;
  const queryFanId = router.query.fanId;
  const [ search, setSearch ] = useState("");
  const [ isSettingsOpen, setIsSettingsOpen ] = useState(false);
  const [ fans, setFans ] = useState<ConversationListData[]>([]);
  const [ fansError, setFansError ] = useState("");
  const [ fansErrorCode, setFansErrorCode ] = useState<string | null>(null);
  const [ fansErrorFix, setFansErrorFix ] = useState<string[] | null>(null);
  const [ followUpMode, setFollowUpMode ] = useState<"all" | "today" | "expired" | "priority">("all");
  const [ showOnlyWithNotes, setShowOnlyWithNotes ] = useState(false);
  const [ tierFilter, setTierFilter ] = useState<"all" | "new" | "regular" | "vip">("all");
  const [ onlyWithFollowUp, setOnlyWithFollowUp ] = useState(false);
  const [ onlyWithExtras, setOnlyWithExtras ] = useState(false);
  const [ onlyNeedsReply, setOnlyNeedsReply ] = useState(false);
  const [ onlyAtRisk, setOnlyAtRisk ] = useState(false);
  const [ heatFilter, setHeatFilter ] = useState<HeatFilter>("all");
  const [ intentFilter, setIntentFilter ] = useState<IntentFilter>("all");
  const [ showLegend, setShowLegend ] = useState(false);
  const [ showFiltersPanel, setShowFiltersPanel ] = useState(false);
  const [ showMoreSegments, setShowMoreSegments ] = useState(false);
  const [ showEmptyFilters, setShowEmptyFilters ] = useState(false);
  const [ showSpamRequests, setShowSpamRequests ] = useState(false);
  const [ focusMode, setFocusMode ] = useState(false);
  const [ creatorAvailability, setCreatorAvailability ] = useState<CreatorAvailability>("AVAILABLE");
  const [ creatorResponseSla, setCreatorResponseSla ] = useState<CreatorResponseSla>("LT_24H");
  const [ creatorStatusLoaded, setCreatorStatusLoaded ] = useState(false);
  const [ creatorStatusSaving, setCreatorStatusSaving ] = useState(false);
  const [ creatorStatusError, setCreatorStatusError ] = useState("");
  const [ showPacksPanel, setShowPacksPanel ] = useState(false);
  const [ insightsOpen, setInsightsOpen ] = useState(false);
  const [ listSegment, setListSegment ] = useState<"all" | "queue">("all");
  const [ isLoadingMore, setIsLoadingMore ] = useState(false);
  const openFanFetchRef = useRef<string | null>(null);
  const fansRef = useRef<ConversationListData[]>([]);
  const packsCount = Object.keys(PACKS).length;
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const {
    conversation,
    setConversation,
    activeQueueFilter,
    setActiveQueueFilter,
    setQueueFans,
    queueFans,
    setChatListStatus,
  } = useContext(ConversationContext);
  const [ extrasSummary, setExtrasSummary ] = useState<ExtrasSummary | null>(null);
  const [ extrasSummaryError, setExtrasSummaryError ] = useState<string | null>(null);
  const [ statusFilter, setStatusFilter ] = useState<"active" | "archived" | "blocked">("active");
  const [ filtersDraft, setFiltersDraft ] = useState<FiltersDraft>(INITIAL_FILTERS_DRAFT);
  const [ isNewFanOpen, setIsNewFanOpen ] = useState(false);
  const [ newFanName, setNewFanName ] = useState("");
  const [ newFanNote, setNewFanNote ] = useState("");
  const [ newFanError, setNewFanError ] = useState<string | null>(null);
  const [ newFanSaving, setNewFanSaving ] = useState(false);
  const [ newFanId, setNewFanId ] = useState<string | null>(null);
  const [ newFanInviteUrl, setNewFanInviteUrl ] = useState<string | null>(null);
  const [ newFanInviteState, setNewFanInviteState ] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [ newFanInviteError, setNewFanInviteError ] = useState<string | null>(null);
  const [ openFanToast, setOpenFanToast ] = useState("");
  const openFanToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFanNotFoundRef = useRef<string | null>(null);
  const chatPollIntervalMs = 6000;
  const chatPollDedupeMs = 4000;
  const [ unseenPurchaseByFan, setUnseenPurchaseByFan ] = useState<Record<string, PurchaseNotice>>({});
  const [ unseenVoiceByFan, setUnseenVoiceByFan ] = useState<Record<string, VoiceNoteNotice>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(INSIGHTS_STORAGE_KEY);
    if (stored === null) return;
    setInsightsOpen(stored === "1");
  }, []);

  const toggleInsightsOpen = useCallback(() => {
    setInsightsOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INSIGHTS_STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);


  const mapFans = useCallback((rawFans: Fan[]): ConversationListData[] => {
    return rawFans.map((fan) => ({
      id: fan.id,
      contactName: getFanDisplayNameForCreator(fan),
      displayName: fan.displayName ?? null,
      creatorLabel: fan.creatorLabel ?? null,
      locale: fan.locale ?? null,
      preferredLanguage: normalizePreferredLanguage(fan.preferredLanguage) ?? null,
      lastMessage: fan.preview,
      lastTime: fan.time,
      image: fan.avatar || "/avatar.jpg",
      messageHistory: [],
      membershipStatus: fan.membershipStatus,
      accessState: (fan as any).accessState,
      accessType: (fan as any).accessType,
      accessLabel: (fan as any).accessLabel ?? null,
      daysLeft: fan.daysLeft,
      unreadCount: fan.unreadCount,
      isNew: fan.isNew,
      isNew30d: fan.isNew30d ?? false,
      lastSeen: fan.lastSeen,
      lastSeenAt: fan.lastSeenAt ?? null,
      lastCreatorMessageAt: fan.lastCreatorMessageAt,
      lastActivityAt: fan.lastActivityAt ?? null,
      lastMessageAt: fan.lastMessageAt ?? null,
      activeGrantTypes: fan.activeGrantTypes ?? [],
      hasAccessHistory: fan.hasAccessHistory ?? false,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
      urgencyLevel: getUrgencyLevel(
        fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
        fan.daysLeft
      ),
      notesCount: fan.notesCount ?? 0,
      notePreview: fan.notePreview ?? null,
      profileText: fan.profileText ?? null,
      quickNote: fan.quickNote ?? null,
      followUpOpen: fan.followUpOpen ?? null,
      paidGrantsCount: fan.paidGrantsCount ?? 0,
      lifetimeValue: fan.lifetimeValue ?? fan.lifetimeSpend ?? 0,
      lifetimeSpend: fan.lifetimeSpend ?? fan.lifetimeValue ?? 0,
      totalSpent: fan.totalSpent ?? fan.lifetimeSpend ?? fan.lifetimeValue ?? 0,
      recent30dSpent: typeof fan.recent30dSpent === "number" ? fan.recent30dSpent : undefined,
      extrasCount: fan.extrasCount ?? 0,
      extrasSpentTotal: fan.extrasSpentTotal ?? 0,
      tipsCount: typeof fan.tipsCount === "number" ? fan.tipsCount : undefined,
      tipsSpentTotal: typeof fan.tipsSpentTotal === "number" ? fan.tipsSpentTotal : undefined,
      giftsCount: typeof fan.giftsCount === "number" ? fan.giftsCount : undefined,
      giftsSpentTotal: typeof fan.giftsSpentTotal === "number" ? fan.giftsSpentTotal : undefined,
      maxExtraTier: (fan as any).maxExtraTier ?? null,
      novsyStatus: fan.novsyStatus ?? null,
      isHighPriority: fan.isHighPriority ?? false,
      highPriorityAt: fan.highPriorityAt ?? null,
      adultConfirmedAt: fan.adultConfirmedAt ?? null,
      adultConfirmVersion: fan.adultConfirmVersion ?? null,
      inviteUsedAt: fan.inviteUsedAt ?? null,
      segment: (fan as any).segment ?? null,
      riskLevel: (fan as any).riskLevel ?? "LOW",
      healthScore: (fan as any).healthScore ?? 0,
      temperatureScore: (fan as any).temperatureScore ?? null,
      temperatureBucket: (fan as any).temperatureBucket ?? null,
      heatScore: (fan as any).heatScore ?? null,
      heatLabel: (fan as any).heatLabel ?? null,
      heatUpdatedAt: (fan as any).heatUpdatedAt ?? null,
      heatMeta: (fan as any).heatMeta ?? null,
      lastIntentKey: (fan as any).lastIntentKey ?? null,
      lastIntentConfidence: (fan as any).lastIntentConfidence ?? null,
      lastIntentAt: (fan as any).lastIntentAt ?? null,
      lastInboundAt: (fan as any).lastInboundAt ?? null,
      signalsUpdatedAt: (fan as any).signalsUpdatedAt ?? null,
      customerTier: normalizeTier(fan.customerTier),
      nextAction: fan.nextAction ?? null,
      nextActionAt: fan.nextActionAt ?? null,
      nextActionNote: fan.nextActionNote ?? null,
      needsAction: fan.needsAction ?? false,
      nextActionKey: fan.nextActionKey ?? null,
      nextActionLabel: fan.nextActionLabel ?? null,
      priorityScore: fan.priorityScore,
      agencyStage: fan.agencyStage ?? null,
      agencyObjective: fan.agencyObjective ?? null,
      agencyIntensity: fan.agencyIntensity ?? null,
      agencyNextAction: fan.agencyNextAction ?? null,
      agencyRecommendedOfferId: fan.agencyRecommendedOfferId ?? null,
      lastNoteSnippet: fan.lastNoteSnippet ?? null,
      nextActionSnippet: fan.nextActionSnippet ?? null,
      lastNoteSummary: fan.lastNoteSummary ?? fan.lastNoteSnippet ?? null,
      nextActionSummary: fan.nextActionSummary ?? fan.nextActionSnippet ?? null,
      nextActionText: fan.nextActionText ?? null,
      nextActionSource: fan.nextActionSource ?? null,
      extraLadderStatus: fan.extraLadderStatus ?? null,
      extraSessionToday: (fan as any).extraSessionToday ?? null,
      isBlocked: (fan as any).isBlocked ?? false,
      isArchived: (fan as any).isArchived ?? false,
      firstUtmSource: (fan as any).firstUtmSource ?? null,
      firstUtmMedium: (fan as any).firstUtmMedium ?? null,
      firstUtmCampaign: (fan as any).firstUtmCampaign ?? null,
      firstUtmContent: (fan as any).firstUtmContent ?? null,
      firstUtmTerm: (fan as any).firstUtmTerm ?? null,
    }));
  }, []);

  const showOpenFanToast = useCallback((message: string) => {
    setOpenFanToast(message);
    if (openFanToastTimerRef.current) {
      clearTimeout(openFanToastTimerRef.current);
    }
    openFanToastTimerRef.current = setTimeout(() => setOpenFanToast(""), 2200);
  }, []);

  const playPurchaseSound = useCallback(() => {
    if (typeof window === "undefined") return;
    const enabled = window.localStorage.getItem("novsy:purchaseSound") === "1";
    if (!enabled) return;
    try {
      const context = new AudioContext();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.12);
    } catch (_err) {
      // ignore audio errors
    }
  }, []);

  const hasFanListChanged = useCallback((prev: ConversationListData[], next: ConversationListData[]): boolean => {
    if (prev.length !== next.length) return true;
    const prevMap = new Map<string, ConversationListData>();
    prev.forEach((f) => {
      if (f.id) prevMap.set(f.id, f);
    });
    for (const fan of next) {
      if (!fan.id) return true;
      const prevFan = prevMap.get(fan.id);
      if (!prevFan) return true;
      const fields: Array<keyof ConversationListData> = [
        "contactName",
        "lastTime",
        "lastCreatorMessageAt",
        "lastActivityAt",
        "unreadCount",
        "lastMessage",
        "isHighPriority",
        "highPriorityAt",
        "adultConfirmedAt",
        "inviteUsedAt",
        "totalSpent",
        "extrasCount",
        "extrasSpentTotal",
        "tipsCount",
        "tipsSpentTotal",
        "giftsCount",
        "giftsSpentTotal",
        "notesCount",
        "notePreview",
        "temperatureBucket",
        "temperatureScore",
        "lastIntentKey",
        "nextAction",
        "nextActionAt",
        "nextActionNote",
        "needsAction",
        "nextActionKey",
        "nextActionLabel",
        "nextActionText",
        "nextActionSource",
        "agencyStage",
        "agencyObjective",
        "agencyIntensity",
        "agencyNextAction",
        "agencyRecommendedOfferId",
      ];
      const changed = fields.some((field) => (prevFan as any)?.[field] !== (fan as any)?.[field]);
      if (changed) return true;
      const prevFollowUp = prevFan.followUpOpen;
      const nextFollowUp = fan.followUpOpen;
      const followUpChanged =
        (prevFollowUp?.updatedAt ?? null) !== (nextFollowUp?.updatedAt ?? null) ||
        (prevFollowUp?.status ?? null) !== (nextFollowUp?.status ?? null) ||
        (prevFollowUp?.dueAt ?? null) !== (nextFollowUp?.dueAt ?? null);
      if (followUpChanged) return true;
    }
    return false;
  }, []);

  const mergeFansById = useCallback(
    (prev: ConversationListData[], incoming: ConversationListData[]): ConversationListData[] => {
      if (prev.length === 0) return incoming;
      const incomingIds = new Set<string>();
      const merged = incoming.map((fan) => {
        if (fan.id) incomingIds.add(fan.id);
        return fan;
      });
      for (const fan of prev) {
        if (fan.id && !incomingIds.has(fan.id)) {
          merged.push(fan);
        }
      }
      return merged;
    },
    []
  );

  useEffect(() => {
    fansRef.current = fans;
  }, [fans]);

  useEffect(() => {
    return () => {
      if (openFanToastTimerRef.current) {
        clearTimeout(openFanToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setUnseenPurchaseByFan(getUnseenPurchases());
    setUnseenVoiceByFan(getUnseenVoiceNotes());
  }, []);

  const fansWithScore: FanData[] = useMemo(
    () =>
      fans.map((fan) => ({
        ...fan,
        priorityScore: typeof fan.priorityScore === "number" ? fan.priorityScore : computePriorityScore(fan),
      })),
    [fans]
  );

  const boardPurchaseSummary = useMemo(() => {
    const entries = Object.entries(unseenPurchaseByFan);
    let latest: { fanId: string; notice: PurchaseNotice; ts: number } | null = null;
    let totalCount = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const [fanId, notice] = entries[i];
      if (!fanId || !notice) continue;
      const count = typeof notice.count === "number" ? notice.count : 0;
      totalCount += count;
      const createdAt = notice.last?.createdAt;
      const ts = createdAt ? new Date(createdAt).getTime() : 0;
      if (!latest || ts >= latest.ts) {
        latest = { fanId, notice, ts };
      }
    }
    return { latest, totalCount };
  }, [unseenPurchaseByFan]);

  const boardVoiceSummary = useMemo(() => {
    const entries = Object.entries(unseenVoiceByFan);
    let latest: { fanId: string; notice: VoiceNoteNotice; ts: number } | null = null;
    let totalCount = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const [fanId, notice] = entries[i];
      if (!fanId || !notice) continue;
      const count = typeof notice.count === "number" ? notice.count : 0;
      totalCount += count;
      const createdAt = notice.last?.createdAt;
      const ts = createdAt ? new Date(createdAt).getTime() : 0;
      if (!latest || ts >= latest.ts) {
        latest = { fanId, notice, ts };
      }
    }
    return { latest, totalCount };
  }, [unseenVoiceByFan]);

  const handleOpenPurchaseBanner = useCallback(() => {
    const latest = boardPurchaseSummary.latest;
    if (!latest) return;
    const targetPath = router.pathname.startsWith("/creator/manager") ? "/creator" : router.pathname || "/creator";
    setPendingPurchaseNotice({
      fanId: latest.fanId,
      fanName: latest.notice.last?.fanName,
      amountCents: latest.notice.last?.amountCents,
      kind: latest.notice.last?.kind,
      title: latest.notice.last?.title,
      purchaseId: latest.notice.last?.purchaseId,
      createdAt: latest.notice.last?.createdAt,
    });
    openFanChat(router, latest.fanId, { shallow: true, scroll: false, pathname: targetPath });
  }, [boardPurchaseSummary.latest, router]);

  const handleDismissPurchaseBanner = useCallback(() => {
    const entries = Object.keys(unseenPurchaseByFan);
    if (entries.length === 0) return;
    for (let i = 0; i < entries.length; i += 1) {
      clearUnseenPurchase(entries[i]);
    }
    setUnseenPurchaseByFan({});
  }, [unseenPurchaseByFan]);

  const handleOpenVoiceBanner = useCallback(() => {
    const latest = boardVoiceSummary.latest;
    if (!latest) return;
    clearUnseenVoiceNote(latest.fanId);
    setUnseenVoiceByFan((prev) => {
      if (!prev[latest.fanId]) return prev;
      const next = { ...prev };
      delete next[latest.fanId];
      return next;
    });
    const targetPath = router.pathname.startsWith("/creator/manager") ? "/creator" : router.pathname || "/creator";
    openFanChat(router, latest.fanId, { shallow: true, scroll: false, pathname: targetPath });
  }, [boardVoiceSummary.latest, router]);

  const handleDismissVoiceBanner = useCallback(() => {
    const entries = Object.keys(unseenVoiceByFan);
    if (entries.length === 0) return;
    for (let i = 0; i < entries.length; i += 1) {
      clearUnseenVoiceNote(entries[i]);
    }
    setUnseenVoiceByFan({});
  }, [unseenVoiceByFan]);

  const handleSelectConversation = useCallback(
    (item: ConversationListData) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("novsy:conversation:changing"));
      }
      if (item?.isManager) {
        void router.push("/creator/manager", undefined, { scroll: false });
        return;
      }
      if (item?.id) {
        const targetPath = router.pathname.startsWith("/creator/manager") ? "/creator" : router.pathname || "/creator";
        openFanChat(router, item.id, { shallow: true, scroll: false, pathname: targetPath });
      }
      setConversation(item as any);
    },
    [router, setConversation]
  );

  const getLastActivityTimestamp = useCallback((fan: FanData): number => {
    if (fan.lastActivityAt) {
      const d = new Date(fan.lastActivityAt);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    if (fan.lastMessageAt) {
      const d = new Date(fan.lastMessageAt);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    if (fan.lastCreatorMessageAt) {
      const d = new Date(fan.lastCreatorMessageAt);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    // fallback: try parsing lastTime if it resembles a timestamp
    const maybe = Date.parse(fan.lastTime || "");
    return Number.isNaN(maybe) ? 0 : maybe;
  }, []);

  const getHighPriorityTimestamp = useCallback(
    (fan: FanData): number => {
      if (fan.highPriorityAt) {
        const d = new Date(fan.highPriorityAt);
        if (!Number.isNaN(d.getTime())) return d.getTime();
      }
      return getLastActivityTimestamp(fan);
    },
    [getLastActivityTimestamp]
  );

  const getQueueSignals = useCallback((fan: FanData): QueueSignals => {
    const followUpTag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
    const daysLeftValue = typeof fan.daysLeft === "number" ? fan.daysLeft : null;
    const accessKind = getAccessKind(fan);
    const isTrial = accessKind === "trial";
    const isMonthly = accessKind === "monthly";
    const isExpired = isExpiredAccess({
      membershipStatus: fan.membershipStatus,
      daysLeft: daysLeftValue,
      followUpTag,
    });
    const isExpiringCritical =
      daysLeftValue !== null &&
      daysLeftValue <= 1 &&
      (isTrial || isMonthly);
    const isRisk = hasRiskFlag(fan);
    const isSilent = isSilentFan(fan);
    const isTrialSilent =
      isTrial &&
      daysLeftValue !== null &&
      daysLeftValue <= 7 &&
      isSilent;
    const isFollowUpToday = shouldFollowUpToday({
      membershipStatus: fan.membershipStatus,
      daysLeft: daysLeftValue,
      followUpTag,
      nextActionAt: fan.nextActionAt ?? null,
    });
    const isHighPriority = fan.isHighPriority === true;
    const hasUnread = (fan.unreadCount ?? 0) > 0;
    const extrasSignal = hasExtrasSignal(fan);
    const hasNextAction = Boolean(
      fan.followUpOpen ||
        Boolean(fan.nextActionAt) ||
        Boolean(fan.nextActionNote?.trim()) ||
        Boolean(getManualNextActionValue(fan))
    );

    return {
      followUpTag,
      daysLeftValue,
      isTrial,
      isMonthly,
      isExpired,
      isExpiringCritical,
      isRisk,
      isTrialSilent,
      isFollowUpToday,
      isHighPriority,
      hasUnread,
      extrasSignal,
      hasNextAction,
    };
  }, []);

  const buildQueueMeta = useCallback(
    (fan: FanData, signals: QueueSignals): RecommendationMeta => {
      let score = 0;
      if (signals.isExpired) score += 120;
      if (signals.isExpiringCritical) score += 110;
      if (signals.isRisk) score += 90;
      if (signals.isTrialSilent) score += 80;
      if (signals.isFollowUpToday) score += 70;
      if (signals.isHighPriority) score += 60;
      if (signals.hasUnread) score += 40;
      if (signals.extrasSignal) score += 30;
      if (signals.hasNextAction) score += 20;
      if (signals.daysLeftValue !== null && signals.daysLeftValue >= 0) {
        score += Math.max(0, 10 - signals.daysLeftValue);
      }

      let tag: RecommendationMeta["tag"] = "Seguimiento hoy";
      let tagTone: RecommendationMeta["tagTone"] = "emerald";
      let reason = "Seguimiento marcado para hoy";

      if (signals.isExpired) {
        if (signals.daysLeftValue === 0) {
          tag = "CADUCA HOY";
          tagTone = "amber";
          reason = "Crítico · 0 días restantes";
        } else {
          tag = "Caducado";
          tagTone = "rose";
          reason = "Acceso caducado";
        }
      } else if (signals.isExpiringCritical) {
        tag = "Caduca";
        tagTone = "amber";
        const accessLabel = signals.isTrial ? "Trial" : signals.isMonthly ? "Mensual" : "Acceso";
        const when =
          signals.daysLeftValue === 0
            ? "hoy"
            : signals.daysLeftValue === 1
            ? "mañana"
            : `en ${signals.daysLeftValue} días`;
        reason = `${accessLabel} · caduca ${when}`;
      } else if (signals.isRisk) {
        tag = "En riesgo";
        tagTone = "rose";
        reason = "Marcado en riesgo";
      } else if (signals.isTrialSilent) {
        tag = "Trial silencioso";
        tagTone = "sky";
        reason = "Trial ≤ 7 días sin respuesta";
      } else if (signals.isFollowUpToday) {
        tag = "Seguimiento hoy";
        tagTone = "emerald";
        reason = "Seguimiento marcado para hoy";
      } else if (signals.isHighPriority) {
        tag = "Alta prioridad";
        tagTone = "amber";
        reason = "Marcado por ti";
      } else if (signals.hasUnread) {
        tag = "Sin leer";
        tagTone = "sky";
        reason = "Mensajes sin leer";
      } else if (signals.hasNextAction) {
        tag = "Próxima acción";
        tagTone = "emerald";
        reason = "Acción pendiente";
      } else if (signals.extrasSignal) {
        tag = "Extras";
        tagTone = "emerald";
        reason = "Ha comprado extras";
      } else {
        reason = "En cola";
      }

      if (signals.extrasSignal && tag !== "Extras") {
        reason = `${reason} · potencial extra`;
      }

      return {
        fan,
        score,
        level: score,
        tag,
        tagTone,
        reason,
        daysLeftLabel: signals.daysLeftValue !== null ? `${signals.daysLeftValue} d` : "—",
        daysLeftValue: signals.daysLeftValue,
        lastActivity: getLastActivityTimestamp(fan),
      };
    },
    [getLastActivityTimestamp]
  );

  const matchesQueueFilter = useCallback((signals: QueueSignals, filter: QueueFilter): boolean => {
    if (!filter) return false;
    if (filter === "ventas_hoy") {
      return (
        signals.isExpired ||
        signals.isExpiringCritical ||
        signals.isRisk ||
        signals.isTrialSilent ||
        signals.isFollowUpToday ||
        signals.isHighPriority ||
        signals.hasUnread ||
        signals.extrasSignal ||
        signals.hasNextAction
      );
    }
    if (filter === "seguimiento_hoy") return signals.isFollowUpToday;
    if (filter === "caducados") return signals.isExpired;
    if (filter === "alta_prioridad") return signals.isHighPriority;
    return false;
  }, []);

  const buildQueueMetaList = useCallback(
    (list: FanData[], filter: QueueFilter): RecommendationMeta[] => {
      if (!filter) return [];
      const candidates: RecommendationMeta[] = [];

      list.forEach((fan) => {
        if (!fan?.id || fan.isManager) return;
        const signals = getQueueSignals(fan);
        if (!matchesQueueFilter(signals, filter)) return;
        candidates.push(buildQueueMeta(fan, signals));
      });

      return candidates.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        const da = a.daysLeftValue ?? Number.POSITIVE_INFINITY;
        const db = b.daysLeftValue ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        if (a.lastActivity !== b.lastActivity) return b.lastActivity - a.lastActivity;
        return a.fan.contactName.localeCompare(b.fan.contactName);
      });
    },
    [buildQueueMeta, getQueueSignals, matchesQueueFilter]
  );

  const getPriorityQueue = useCallback(
    (list: FanData[]): PriorityQueueResult => {
      const queueList = buildQueueMetaList(list, "ventas_hoy");
      const counts: PriorityQueueCounts = {
        total: queueList.length,
        expiringCritical: 0,
        expiringSoon: 0,
        expired: 0,
        risk: 0,
        highPriority: 0,
        followUpToday: 0,
        vip: 0,
        trialSilent: 0,
      };

      queueList.forEach((entry) => {
        const signals = getQueueSignals(entry.fan);
        if (signals.isExpired) counts.expired += 1;
        if (signals.isExpiringCritical) counts.expiringCritical += 1;
        if (signals.daysLeftValue === 1) counts.expiringSoon += 1;
        if (signals.isRisk) counts.risk += 1;
        if (signals.isHighPriority) counts.highPriority += 1;
        if (signals.isFollowUpToday) counts.followUpToday += 1;
        if (signals.isTrialSilent) counts.trialSilent += 1;
        const tier = (entry.fan.customerTier ?? "").toLowerCase();
        if (tier === "vip" || tier === "priority") counts.vip += 1;
      });

      return {
        queueList,
        nextRecommended: queueList[0] ?? null,
        counts,
      };
    },
    [buildQueueMetaList, getQueueSignals]
  );

  const totalCountLocal = fans.length;
  const heatCountsLocal = {
    all: totalCountLocal,
    cold: fans.filter((fan) => getTemperatureBucket(fan) === "COLD").length,
    warm: fans.filter((fan) => getTemperatureBucket(fan) === "WARM").length,
    hot: fans.filter((fan) => getTemperatureBucket(fan) === "HOT").length,
  };
  const intentCountsLocal = {
    BUY_NOW: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "BUY_NOW").length,
    PRICE_ASK: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "PRICE_ASK").length,
    CONTENT_REQUEST: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "CONTENT_REQUEST").length,
    CUSTOM_REQUEST: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "CUSTOM_REQUEST").length,
    SUBSCRIBE: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "SUBSCRIBE").length,
    CANCEL: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "CANCEL").length,
    OFF_PLATFORM: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "OFF_PLATFORM").length,
    SUPPORT: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "SUPPORT").length,
    OBJECTION: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "OBJECTION").length,
    RUDE_OR_HARASS: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "RUDE_OR_HARASS").length,
    OTHER: fans.filter((fan) => String((fan as any).lastIntentKey || "").toUpperCase() === "OTHER").length,
  };
  const followUpTodayCount = fans.filter((fan) =>
    shouldFollowUpToday({
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
      nextActionAt: fan.nextActionAt ?? null,
    })
  ).length;
  const expiredCount = fans.filter((fan) =>
    isExpiredAccess({
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
    })
  ).length;
  const withNotesCount = fans.filter((fan) => (fan.notesCount ?? 0) > 0).length;
  const withFollowUpCount = fans.filter((fan) => fan.needsAction === true).length;
  const needsReplyCount = fans.filter((fan) => String(fan.nextActionKey ?? "").toUpperCase() === "REPLY").length;
  const archivedCount = fans.filter((fan) => fan.isArchived === true).length;
  const blockedCount = fans.filter((fan) => fan.isBlocked === true).length;
  const priorityCount = fans.filter((fan) => (fan as any).isHighPriority === true).length;
  const regularCount = fans.filter((fan) => ((fan as any).segment || "").toUpperCase() === "LEAL_ESTABLE").length;
  const newCount = fans.filter((fan) => fan.isArchived !== true && fan.isBlocked !== true && fan.isNew30d === true).length;
  const withExtrasCount = fans.filter((fan) => (fan.extrasSpentTotal ?? 0) > 0).length;
  const atRiskCount = fans.filter((fan) => hasRiskFlag(fan)).length;
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollListToTop = useCallback(() => {
    const el = listScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const applyFilter = useCallback(
    (
      filter: "all" | "today" | "expired" | "priority",
      onlyNotes = false,
      tier: "all" | "new" | "regular" | "vip" = "all",
      onlyFollowUp = false
    ) => {
      setListSegment("all");
      setActiveQueueFilter(null);
      setStatusFilter("active");
      setFollowUpMode(filter);
      setShowOnlyWithNotes(onlyNotes);
      setTierFilter(tier);
      setOnlyWithFollowUp(onlyFollowUp);
      scrollListToTop();
    },
    [scrollListToTop, setActiveQueueFilter]
  );

  const selectStatusFilter = useCallback((next: "active" | "archived" | "blocked") => {
    setListSegment("all");
    setActiveQueueFilter(null);
    setStatusFilter(next);
    if (next !== "active") {
      setFollowUpMode("all");
      setShowOnlyWithNotes(false);
      setTierFilter("all");
      setOnlyWithFollowUp(false);
      setOnlyWithExtras(false);
      setOnlyNeedsReply(false);
      setOnlyAtRisk(false);
    }
    scrollListToTop();
  }, [
    scrollListToTop,
    setActiveQueueFilter,
    setFollowUpMode,
    setListSegment,
    setOnlyAtRisk,
    setOnlyNeedsReply,
    setOnlyWithExtras,
    setOnlyWithFollowUp,
    setShowOnlyWithNotes,
    setStatusFilter,
    setTierFilter,
  ]);

  const getFilterSnapshot = useCallback(
    (): FiltersDraft => ({
      listSegment,
      followUpMode,
      statusFilter,
      tierFilter,
      showOnlyWithNotes,
      onlyWithExtras,
      onlyWithFollowUp,
      onlyNeedsReply,
      onlyAtRisk,
    }),
    [
      followUpMode,
      listSegment,
      onlyAtRisk,
      onlyNeedsReply,
      onlyWithExtras,
      onlyWithFollowUp,
      showOnlyWithNotes,
      statusFilter,
      tierFilter,
    ]
  );

  const applyDraftFilter = useCallback(
    (
      filter: "all" | "today" | "expired" | "priority",
      onlyNotes = false,
      tier: "all" | "new" | "regular" | "vip" = "all",
      onlyFollowUp = false
    ) => {
      setFiltersDraft((prev) =>
        buildDraftWithFilter(prev, filter, onlyNotes, tier, onlyFollowUp)
      );
    },
    []
  );

  const selectDraftStatusFilter = useCallback((next: "active" | "archived" | "blocked") => {
    setFiltersDraft((prev) => buildDraftWithStatusFilter(prev, next));
  }, []);

  const applyDraftState = useCallback((draft: FiltersDraft) => {
    if (draft.statusFilter !== "active") {
      selectStatusFilter(draft.statusFilter);
    } else {
      applyFilter(
        draft.followUpMode,
        draft.showOnlyWithNotes,
        draft.tierFilter,
        draft.onlyWithFollowUp
      );
      setOnlyWithExtras(draft.onlyWithExtras);
      setOnlyNeedsReply(draft.onlyNeedsReply);
      setOnlyAtRisk(draft.onlyAtRisk);
    }
    if (draft.listSegment === "queue") {
      setListSegment("queue");
      setActiveQueueFilter("ventas_hoy");
    } else {
      setListSegment("all");
      setActiveQueueFilter(null);
    }
    setShowFiltersPanel(false);
  }, [
    applyFilter,
    selectStatusFilter,
    setActiveQueueFilter,
    setListSegment,
    setOnlyAtRisk,
    setOnlyNeedsReply,
    setOnlyWithExtras,
    setShowFiltersPanel,
  ]);

  const applyFiltersDraft = useCallback(() => {
    applyDraftState(filtersDraft);
  }, [applyDraftState, filtersDraft]);

  const resetFilters = useCallback(() => {
    applyFilter("all", false, "all", false);
    setOnlyWithExtras(false);
    setOnlyNeedsReply(false);
    setOnlyAtRisk(false);
    setHeatFilter("all");
    setIntentFilter("all");
    setSearch("");
    setShowLegend(false);
    setShowFiltersPanel(false);
  }, [
    applyFilter,
    setHeatFilter,
    setIntentFilter,
    setOnlyAtRisk,
    setOnlyNeedsReply,
    setOnlyWithExtras,
    setSearch,
    setShowLegend,
    setShowFiltersPanel,
  ]);

  const filterSummary = useMemo(() => {
    const labels: string[] = [];
    const heatLabels: Record<string, string> = {
      cold: "Frío",
      warm: "Templado",
      hot: "Caliente",
    };
    const intentLabels: Record<string, string> = {
      BUY_NOW: "Compra",
      PRICE_ASK: "Precio",
      CONTENT_REQUEST: "Contenido",
      CUSTOM_REQUEST: "Custom",
      SUBSCRIBE: "Suscribir",
      CANCEL: "Cancelar",
      OFF_PLATFORM: "Off-platform",
      SUPPORT: "Soporte",
      OBJECTION: "Objeción",
      RUDE_OR_HARASS: "Grosero",
      OTHER: "Otro",
    };

    if (listSegment === "queue") labels.push("Cola");
    if (followUpMode === "today") labels.push("Hoy");
    if (followUpMode === "expired") labels.push("Caducados");
    if (followUpMode === "priority") labels.push("Alta prioridad");
    if (showOnlyWithNotes) labels.push("Con notas");
    if (statusFilter === "archived") labels.push("Archivados");
    if (statusFilter === "blocked") labels.push("Bloqueados");
    if (tierFilter === "new") labels.push("Nuevos");
    if (tierFilter === "regular") labels.push("Habituales");
    if (tierFilter === "vip") labels.push("VIP");
    if (onlyAtRisk) labels.push("En riesgo");
    if (onlyWithExtras) labels.push("Con extras");
    if (onlyWithFollowUp) labels.push("Con próxima acción");
    if (onlyNeedsReply) labels.push("Responder");
    if (heatFilter !== "all") labels.push(`Temp: ${heatLabels[heatFilter] ?? heatFilter}`);
    if (intentFilter !== "all") labels.push(`Intención: ${intentLabels[intentFilter] ?? intentFilter}`);

    return labels;
  }, [
    followUpMode,
    heatFilter,
    intentFilter,
    listSegment,
    onlyAtRisk,
    onlyNeedsReply,
    onlyWithExtras,
    onlyWithFollowUp,
    showOnlyWithNotes,
    statusFilter,
    tierFilter,
  ]);

  async function handleCreateNewFan() {
    const label = newFanName.trim();
    const note = newFanNote.trim();
    if (!label) {
      setNewFanError("Introduce un nombre para la invitación.");
      return;
    }
    try {
      setNewFanSaving(true);
      setNewFanError(null);
      setNewFanInviteUrl(null);
      setNewFanInviteState("idle");
      setNewFanInviteError(null);
      const res = await fetch("/api/fans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameOrAlias: label,
          initialNote: note || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNewFanError(data?.error || "No se pudo crear el fan.");
        return;
      }
      const fanId = typeof data?.fanId === "string" ? data.fanId : "";
      if (!fanId) {
        setNewFanError("Respuesta inválida al crear el fan.");
        return;
      }
      setNewFanId(fanId);
      const inviteUrl = typeof data?.inviteUrl === "string" ? data.inviteUrl : null;
      setNewFanInviteUrl(inviteUrl);
      setNewFanInviteState("idle");
      if (!inviteUrl) {
        setNewFanInviteError("No se pudo generar el enlace.");
      } else {
        setNewFanInviteError(null);
      }
      const newConversation: ConversationListData = {
        id: fanId,
        contactName: label || "Invitado",
        displayName: null,
        creatorLabel: label,
        lastMessage: "",
        lastTime: "",
        image: "/avatar.jpg",
        messageHistory: [],
        unreadCount: 0,
        isNew: false,
        isHighPriority: false,
        highPriorityAt: null,
        inviteUsedAt: null,
      };
      updateChatPages((prev) => {
        if (prev.some((fan) => fan.id === fanId)) return prev;
        return [newConversation, ...prev];
      });
      void mutateChats();
      setConversation(newConversation as any);
      const targetPath = router.pathname.startsWith("/creator/manager") ? "/creator" : router.pathname || "/creator";
      openFanChat(router, fanId, { shallow: true, pathname: targetPath });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("fanDataUpdated"));
      }
    } catch (err) {
      console.error("Error creating fan", err);
      setNewFanError("No se pudo crear el fan.");
    } finally {
      setNewFanSaving(false);
    }
  }

  async function handleCopyInviteForNewFan() {
    if (!newFanId) return;
    try {
      setNewFanInviteState("loading");
      setNewFanInviteError(null);
      let inviteUrl = newFanInviteUrl;
      if (!inviteUrl) {
        const res = await fetch(`/api/fans/${newFanId}/invite`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.inviteUrl) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[invite] generate failed", data?.error || res.statusText);
          }
          setNewFanInviteState("error");
          setNewFanInviteError("No se pudo generar el enlace.");
          return;
        }
        inviteUrl = data.inviteUrl as string;
        setNewFanInviteUrl(inviteUrl);
      }
      await navigator.clipboard.writeText(inviteUrl);
      setNewFanInviteState("copied");
      setTimeout(() => setNewFanInviteState("idle"), 1500);
    } catch (err) {
      console.error("Error copying invite link", err);
      setNewFanInviteState("error");
      setNewFanInviteError("No se pudo copiar el enlace.");
    }
  }

  const handleCopyInviteForFan = useCallback(async (target: ConversationListData): Promise<boolean> => {
    const fanId = target?.id;
    if (!fanId) return false;
    try {
      const res = await fetch(`/api/fans/${fanId}/invite`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.inviteUrl) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[invite] generate failed", data?.error || res.statusText);
        }
        return false;
      }
      await navigator.clipboard.writeText(data.inviteUrl as string);
      return true;
    } catch (err) {
      console.error("Error copying invite link", err);
      return false;
    }
  }, []);

  function closeNewFanModal() {
    setIsNewFanOpen(false);
    setNewFanName("");
    setNewFanNote("");
    setNewFanError(null);
    setNewFanId(null);
    setNewFanInviteUrl(null);
    setNewFanInviteState("idle");
    setNewFanInviteError(null);
  }

  const filteredConversationsList = useMemo(
    () =>
      (search.length > 0
        ? fansWithScore.filter((fan) => fan.contactName.toLowerCase().includes(search.toLowerCase()))
        : fansWithScore)
        .filter((fan) => {
          if (statusFilter === "archived") return fan.isArchived === true;
          if (statusFilter === "blocked") return fan.isBlocked === true;
          return fan.isArchived !== true && fan.isBlocked !== true;
        })
        .filter((fan) => {
          if (heatFilter === "all") return true;
          const label = getTemperatureBucket(fan);
          if (!label) return false;
          if (heatFilter === "cold") return label === "COLD";
          if (heatFilter === "warm") return label === "WARM";
          if (heatFilter === "hot") return label === "HOT";
          return true;
        })
        .filter((fan) => {
          if (intentFilter === "all") return true;
          const key = (fan as any).lastIntentKey ? String((fan as any).lastIntentKey).toUpperCase() : "";
          if (!key) return false;
          return key === intentFilter;
        })
        .filter((fan) => (followUpMode === "priority" ? (fan.isHighPriority ?? false) : true))
        .filter((fan) => (!showOnlyWithNotes ? true : (fan.notesCount ?? 0) > 0))
        .filter((fan) => (!onlyWithExtras ? true : (fan.extrasSpentTotal ?? 0) > 0))
        .filter((fan) => {
          if (!onlyWithFollowUp) return true;
          return fan.needsAction === true;
        })
        .filter((fan) => (!onlyNeedsReply ? true : String(fan.nextActionKey ?? "").toUpperCase() === "REPLY"))
        .filter((fan) => (!onlyAtRisk ? true : hasRiskFlag(fan)))
        .filter((fan) => {
          const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
          if (followUpMode === "all" || followUpMode === "priority") return true;
          if (followUpMode === "expired") {
            return isExpiredAccess({ membershipStatus: fan.membershipStatus, daysLeft: fan.daysLeft, followUpTag: tag });
          }
          if (followUpMode === "today") {
            return shouldFollowUpToday({
              membershipStatus: fan.membershipStatus,
              daysLeft: fan.daysLeft,
              followUpTag: tag,
              nextActionAt: fan.nextActionAt ?? null,
            });
          }
          return true;
        })
        .filter((fan) => {
          if (tierFilter === "all") return true;
          const segment = ((fan as any).segment || "").toUpperCase();
          if (tierFilter === "vip") return segment === "VIP";
          if (tierFilter === "regular") return segment === "LEAL_ESTABLE";
          if (tierFilter === "new") return fan.isNew30d === true;
          const tier = normalizeTier(fan.customerTier);
          return tier === tierFilter;
        })
        .sort((a, b) => {
          if (followUpMode === "priority") {
            const pa = a.priorityScore ?? 0;
            const pb = b.priorityScore ?? 0;
            if (pa !== pb) return pb - pa;
            const la = getLastActivityTimestamp(a);
            const lb = getLastActivityTimestamp(b);
            if (la !== lb) return lb - la;
          }
          const highPriorityDelta = Number(!!b.isHighPriority) - Number(!!a.isHighPriority);
          if (highPriorityDelta !== 0) return highPriorityDelta;
          if (a.isHighPriority && b.isHighPriority) {
            const ha = getHighPriorityTimestamp(a);
            const hb = getHighPriorityTimestamp(b);
            if (ha !== hb) return hb - ha;
            const la = getLastActivityTimestamp(a);
            const lb = getLastActivityTimestamp(b);
            if (la !== lb) return lb - la;
            return 0;
          }
          if (followUpMode === "today") {
            const pa = a.priorityScore ?? 0;
            const pb = b.priorityScore ?? 0;
            if (pa !== pb) return pb - pa;
            const da = typeof a.daysLeft === "number" ? a.daysLeft : Number.POSITIVE_INFINITY;
            const db = typeof b.daysLeft === "number" ? b.daysLeft : Number.POSITIVE_INFINITY;
            if (da !== db) return da - db;
            const la = getLastActivityTimestamp(a);
            const lb = getLastActivityTimestamp(b);
            return lb - la;
          }

          if (tierFilter === "vip") {
            const pa = a.priorityScore ?? 0;
            const pb = b.priorityScore ?? 0;
            if (pa !== pb) return pb - pa;
            const da = typeof a.daysLeft === "number" ? a.daysLeft : Number.POSITIVE_INFINITY;
            const db = typeof b.daysLeft === "number" ? b.daysLeft : Number.POSITIVE_INFINITY;
            return da - db;
          }

          const la = getLastActivityTimestamp(a);
          const lb = getLastActivityTimestamp(b);
          if (la !== lb) return lb - la;
          return 0;
        }),
    [
      fansWithScore,
      getHighPriorityTimestamp,
      getLastActivityTimestamp,
      onlyAtRisk,
      onlyWithExtras,
      onlyWithFollowUp,
      onlyNeedsReply,
      search,
      showOnlyWithNotes,
      followUpMode,
      statusFilter,
      tierFilter,
      heatFilter,
      intentFilter,
    ]
  );

  const safeFilteredConversationsList: FanData[] = useMemo(
    () => (Array.isArray(filteredConversationsList) ? (filteredConversationsList as FanData[]) : []),
    [filteredConversationsList]
  );
  const attendedTodayCount = fans.filter((fan) => {
    if (!fan.lastCreatorMessageAt) return false;
    const d = new Date(fan.lastCreatorMessageAt);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;
  const extrasTodayBaseCount = Number.isFinite(extrasSummary?.extrasToday?.count)
    ? (extrasSummary?.extrasToday?.count as number)
    : Number.isFinite(extrasSummary?.today?.count)
    ? (extrasSummary?.today?.count as number)
    : 0;
  const extrasTodayBaseAmount = Number.isFinite(extrasSummary?.extrasToday?.amount)
    ? (extrasSummary?.extrasToday?.amount as number)
    : Number.isFinite(extrasSummary?.today?.amount)
    ? (extrasSummary?.today?.amount as number)
    : 0;
  const extrasLast7BaseCount = Number.isFinite(extrasSummary?.last7Days?.count)
    ? (extrasSummary?.last7Days?.count as number)
    : 0;
  const extrasLast7BaseAmount = Number.isFinite(extrasSummary?.last7Days?.amount)
    ? (extrasSummary?.last7Days?.amount as number)
    : 0;
  const incomeTodayCount = Number.isFinite(extrasSummary?.incomeToday?.count)
    ? (extrasSummary?.incomeToday?.count as number)
    : extrasTodayBaseCount;
  const incomeTodayAmount = Number.isFinite(extrasSummary?.incomeToday?.amount)
    ? (extrasSummary?.incomeToday?.amount as number)
    : extrasTodayBaseAmount;
  const tipsTodayCount = Number.isFinite(extrasSummary?.tipsToday?.count)
    ? (extrasSummary?.tipsToday?.count as number)
    : 0;
  const showIncomeBreakdown =
    incomeTodayCount === extrasTodayBaseCount + tipsTodayCount &&
    (extrasTodayBaseCount > 0 || tipsTodayCount > 0) &&
    tipsTodayCount > 0;
  const giftedTodayCount = 0;
  const giftedLast7Count = 0;
  const extrasTodayCount = extrasTodayBaseCount;
  const extrasTodayAmount = extrasTodayBaseAmount;
  const extrasLast7Count = extrasLast7BaseCount;
  const extrasLast7Amount = extrasLast7BaseAmount;
  const legendRef = useRef<HTMLDivElement | null>(null);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const filtersLastFocusRef = useRef<HTMLElement | null>(null);
  const hasRestoredFiltersRef = useRef(false);
  const skipPersistFiltersRef = useRef(false);
  const priorityQueue = useMemo(
    () => getPriorityQueue(fans as FanData[]),
    [fans, getPriorityQueue]
  );
  const queueList = priorityQueue.queueList;
  const queueCount = priorityQueue.counts.total;
  const colaHoyCount = priorityQueue.counts.total;
  const vipInQueue = priorityQueue.counts.vip;
  const priorityQueueList = useMemo(
    () => queueList.map((entry) => entry.fan),
    [queueList]
  );

  const handleAttendNext = useCallback(() => {
    const baseList = listSegment === "queue" ? priorityQueueList : safeFilteredConversationsList;
    const candidates = baseList.filter((fan) => !!fan?.id && !fan.isManager);
    if (candidates.length === 0) {
      showOpenFanToast("No hay fans disponibles.");
      return;
    }
    const isReplyCandidate = (fan: FanData) => {
      const key = typeof fan.nextActionKey === "string" ? fan.nextActionKey.trim().toUpperCase() : "";
      if (key === "REPLY") return true;
      if (!fan.lastInboundAt) return false;
      const inboundTime = new Date(fan.lastInboundAt).getTime();
      if (Number.isNaN(inboundTime)) return false;
      const creatorTime = fan.lastCreatorMessageAt ? new Date(fan.lastCreatorMessageAt).getTime() : null;
      return creatorTime === null || Number.isNaN(creatorTime) ? true : inboundTime > creatorTime;
    };
    const isExtrasCandidate = (fan: FanData) => (fan.extrasSpentTotal ?? 0) > 0;
    const isAtRiskCandidate = (fan: FanData) => hasRiskFlag(fan);
    const target =
      candidates.find(isReplyCandidate) ??
      candidates.find(isExtrasCandidate) ??
      candidates.find(isAtRiskCandidate) ??
      candidates[0];
    if (!target?.id) {
      showOpenFanToast("No hay fans disponibles.");
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("novsy:conversation:changing"));
    }
    const targetPath = router.pathname.startsWith("/creator/manager") ? "/creator" : router.pathname || "/creator";
    openFanChat(router, target.id, {
      shallow: true,
      scroll: false,
      pathname: targetPath,
      focusComposer: true,
      source: "attend_next",
    });
    setConversation(target as any);
  }, [listSegment, priorityQueueList, safeFilteredConversationsList, router, setConversation, showOpenFanToast]);

  useEffect(() => {
    const sameLength = queueFans.length === priorityQueueList.length;
    const sameOrder =
      sameLength && queueFans.every((fan, idx) => fan.id === priorityQueueList[idx]?.id);
    if (sameOrder && !hasFanListChanged(queueFans, priorityQueueList)) {
      return;
    }
    setQueueFans(priorityQueueList);
  }, [priorityQueueList, hasFanListChanged, queueFans, setQueueFans]);

  const smartTranscriptionTargets = useMemo(() => {
    const ids: string[] = [];
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < priorityQueueList.length; i += 1) {
      const fanId = priorityQueueList[i]?.id;
      if (!fanId || seen[fanId]) continue;
      seen[fanId] = true;
      ids.push(fanId);
    }
    for (let i = 0; i < fans.length; i += 1) {
      const fan = fans[i];
      if (!fan?.id) continue;
      if (fan.isHighPriority || fan.customerTier === "vip") {
        if (seen[fan.id]) continue;
        seen[fan.id] = true;
        ids.push(fan.id);
      }
    }
    return ids;
  }, [fans, priorityQueueList]);

  useEffect(() => {
    setSmartTranscriptionTargets(smartTranscriptionTargets);
  }, [smartTranscriptionTargets]);
  const apiFilter = (() => {
    if (statusFilter === "archived") return "archived";
    if (statusFilter === "blocked") return "blocked";
    if (showOnlyWithNotes) return "notes";
    if (onlyWithFollowUp) return "followup";
    if (tierFilter === "new") return "new";
    if (followUpMode === "expired") return "expired";
    if (followUpMode === "today") return "today";
    return "all";
  })();

  const refreshExtrasSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/extras/summary");
      if (!res.ok) throw new Error("Failed to fetch extras summary");
      const data = (await res.json()) as ExtrasSummary;
      setExtrasSummary(data);
      setExtrasSummaryError(null);
    } catch (err) {
      console.error("Error fetching extras summary", err);
      setExtrasSummaryError("extras-summary-failed");
    }
  }, []);

  const buildFansQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      params.set("filter", apiFilter);
      if (search.trim()) params.set("q", search.trim());
      if (heatFilter !== "all") params.set("temp", heatFilter);
      if (intentFilter !== "all") params.set("intent", intentFilter);
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [apiFilter, search, heatFilter, intentFilter]
  );

  const fetchChatsPage = useCallback(
    async (url: string) => {
      recordDevRequest("fans");
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const errorMessage =
          typeof data?.message === "string" && data.message.trim().length > 0
            ? data.message
            : "Error cargando fans";
        const error = new Error(errorMessage) as Error & {
          code?: string | null;
          fix?: string[] | null;
          details?: string | null;
        };
        error.code =
          typeof data?.code === "string"
            ? data.code
            : typeof data?.errorCode === "string"
            ? data.errorCode
            : typeof data?.error === "string"
            ? data.error
            : null;
        error.fix = Array.isArray(data?.fix) ? data.fix : null;
        error.details = typeof data?.details === "string" ? data.details : null;
        throw error;
      }
      const rawItems = Array.isArray(data.items)
        ? (data.items as Fan[])
        : Array.isArray(data.fans)
        ? (data.fans as Fan[])
        : [];
      const mapped = mapFans(rawItems);
      return { ...data, items: mapped };
    },
    [mapFans]
  );

  const fetchAccessRequests = useCallback(async (url: string) => {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { requests: [] as AccessRequestPreview[], count: 0 };
    }
    const list = Array.isArray(data?.requests) ? (data.requests as AccessRequestPreview[]) : [];
    const count = typeof data?.count === "number" ? data.count : list.length;
    return { requests: list, count };
  }, []);

  const fetchBlockedCount = useCallback(async (url: string) => {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { count: 0 };
    }
    const count =
      typeof data?.counts?.all === "number"
        ? data.counts.all
        : Array.isArray(data?.items)
        ? data.items.length
        : 0;
    return { count };
  }, []);

  const { data: accessRequestsData } = useSWR(
    "/api/creator/access-requests?status=PENDING",
    fetchAccessRequests,
    {
      refreshInterval: chatPollIntervalMs,
      dedupingInterval: chatPollDedupeMs,
      revalidateOnFocus: false,
    }
  );

  const { data: accessRequestsSpamData } = useSWR(
    "/api/creator/access-requests?status=SPAM",
    fetchAccessRequests,
    {
      refreshInterval: chatPollIntervalMs,
      dedupingInterval: chatPollDedupeMs,
      revalidateOnFocus: false,
    }
  );

  const { data: blockedCountData } = useSWR("/api/fans?filter=blocked&limit=1", fetchBlockedCount, {
    refreshInterval: chatPollIntervalMs,
    dedupingInterval: chatPollDedupeMs,
    revalidateOnFocus: false,
  });

  const pendingAccessRequests = useMemo(
    () => (Array.isArray(accessRequestsData?.requests) ? accessRequestsData.requests : []),
    [accessRequestsData?.requests]
  );
  const pendingAccessCount =
    typeof accessRequestsData?.count === "number" ? accessRequestsData.count : pendingAccessRequests.length;

  const spamAccessRequests = useMemo(
    () => (Array.isArray(accessRequestsSpamData?.requests) ? accessRequestsSpamData.requests : []),
    [accessRequestsSpamData?.requests]
  );
  const spamAccessCount =
    typeof accessRequestsSpamData?.count === "number" ? accessRequestsSpamData.count : spamAccessRequests.length;

  const blockedTotalCount = typeof blockedCountData?.count === "number" ? blockedCountData.count : 0;

  const accessRequestsByFanId = useMemo(() => {
    return pendingAccessRequests.reduce<Record<string, AccessRequestPreview>>((acc, request) => {
      if (request?.fanId) {
        acc[request.fanId] = request;
      }
      return acc;
    }, {});
  }, [pendingAccessRequests]);

  const fetchCreatorStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/profile/status", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.message || "Error cargando estado");
      }
      setCreatorResponseSla(normalizeCreatorResponseSla(data?.responseSla));
      setCreatorAvailability(normalizeCreatorAvailability(data?.availability));
      setCreatorStatusError("");
    } catch (err) {
      console.error("Error loading creator status", err);
      setCreatorStatusError("No se pudo cargar el estado.");
    } finally {
      setCreatorStatusLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!creatorStatusLoaded) {
      void fetchCreatorStatus();
    }
  }, [creatorStatusLoaded, fetchCreatorStatus]);

  const updateCreatorStatus = useCallback(
    async (next: { responseSla: CreatorResponseSla; availability: CreatorAvailability }) => {
      setCreatorStatusSaving(true);
      setCreatorStatusError("");
      try {
        const res = await fetch("/api/creator/profile/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          throw new Error(data?.message || data?.error || "No se pudo guardar el estado.");
        }
        setCreatorResponseSla(normalizeCreatorResponseSla(data?.responseSla));
        setCreatorAvailability(normalizeCreatorAvailability(data?.availability));
        setCreatorStatusError("");
        notifyCreatorStatusUpdated();
        return true;
      } catch (err) {
        console.error("Error saving creator status", err);
        setCreatorStatusError("No se pudo guardar el estado.");
        return false;
      } finally {
        setCreatorStatusSaving(false);
      }
    },
    []
  );

  const handleAvailabilityChange = useCallback(
    async (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextAvailability = event.target.value as CreatorAvailability;
      const previous = { availability: creatorAvailability, responseSla: creatorResponseSla };
      setCreatorAvailability(nextAvailability);
      const ok = await updateCreatorStatus({
        availability: nextAvailability,
        responseSla: creatorResponseSla,
      });
      if (!ok) {
        setCreatorAvailability(previous.availability);
        setCreatorResponseSla(previous.responseSla);
      }
    },
    [creatorAvailability, creatorResponseSla, updateCreatorStatus]
  );

  const handleResponseSlaChange = useCallback(
    async (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextSla = event.target.value as CreatorResponseSla;
      const previous = { availability: creatorAvailability, responseSla: creatorResponseSla };
      setCreatorResponseSla(nextSla);
      const ok = await updateCreatorStatus({
        availability: creatorAvailability,
        responseSla: nextSla,
      });
      if (!ok) {
        setCreatorAvailability(previous.availability);
        setCreatorResponseSla(previous.responseSla);
      }
    },
    [creatorAvailability, creatorResponseSla, updateCreatorStatus]
  );

  const safeFilteredConversationsWithAccess = useMemo(
    () => applyAccessRequestMeta(safeFilteredConversationsList, accessRequestsByFanId),
    [accessRequestsByFanId, safeFilteredConversationsList]
  );

  const priorityQueueListWithAccess = useMemo(
    () => applyAccessRequestMeta(priorityQueueList, accessRequestsByFanId),
    [accessRequestsByFanId, priorityQueueList]
  );

  const {
    data: chatPages,
    error: chatError,
    isValidating: isChatValidating,
    setSize: setChatPageCount,
    mutate: mutateChats,
  } = useSWRInfinite(
    (pageIndex, previousPageData) => {
      if (previousPageData && !previousPageData.hasMore) return null;
      const cursor = pageIndex === 0 ? null : previousPageData?.nextCursor ?? null;
      const params = buildFansQuery(cursor);
      return `/api/creator/chats?${params.toString()}`;
    },
    fetchChatsPage,
    {
      refreshInterval: chatPollIntervalMs,
      dedupingInterval: chatPollDedupeMs,
      revalidateOnFocus: false,
    }
  );

  const fetchedFans: ConversationListData[] = useMemo(() => {
    if (!chatPages) return [];
    return chatPages.flatMap((page) =>
      Array.isArray(page.items) ? (page.items as ConversationListData[]) : []
    );
  }, [chatPages]);

  const fansById = useMemo(() => {
    const map = new Map<string, ConversationListData>();
    fans.forEach((fan) => {
      if (fan?.id) {
        map.set(fan.id, fan);
      }
    });
    return map;
  }, [fans]);

  const pendingAccessRequestList = useMemo(
    () => buildAccessRequestConversations(pendingAccessRequests, fansById),
    [pendingAccessRequests, fansById]
  );

  const spamAccessRequestList = useMemo(
    () => buildAccessRequestConversations(spamAccessRequests, fansById),
    [spamAccessRequests, fansById]
  );

  const hasMore = Boolean(chatPages?.[chatPages.length - 1]?.hasMore);
  const apiHeatCounts = chatPages?.[0]?.counts as { all: number; cold: number; warm: number; hot: number } | undefined;
  const heatCounts = apiHeatCounts ?? heatCountsLocal;
  const apiIntentCounts = chatPages?.[0]?.intentCounts as Record<string, number> | undefined;
  const intentCounts = apiIntentCounts ?? intentCountsLocal;
  const totalCount = typeof heatCounts.all === "number" ? heatCounts.all : totalCountLocal;
  const showAccessRequestsSection =
    !focusMode && (pendingAccessCount > 0 || spamAccessCount > 0 || blockedTotalCount > 0);
  const activeAccessRequestList = showSpamRequests ? spamAccessRequestList : pendingAccessRequestList;
  const activeAccessRequestEmpty = showSpamRequests
    ? "No hay solicitudes marcadas como spam."
    : "Sin solicitudes pendientes.";

  useEffect(() => {
    if (!chatError) {
      setFansError("");
      setFansErrorCode(null);
      setFansErrorFix(null);
      return;
    }
    const code =
      typeof (chatError as any)?.code === "string"
        ? (chatError as any).code
        : typeof (chatError as any)?.errorCode === "string"
        ? (chatError as any).errorCode
        : null;
    const fix = Array.isArray((chatError as any)?.fix) ? ((chatError as any).fix as string[]) : null;
    const isMigrationError = code === DB_SCHEMA_OUT_OF_SYNC_CODE;
    const isCreatorMissing = code === "CREATOR_NOT_FOUND";
    const message = isMigrationError
      ? "Base de datos desactualizada."
      : isCreatorMissing
      ? "No se pudo resolver el creator."
      : chatError instanceof Error && chatError.message
      ? chatError.message
      : "Error cargando fans";
    setFansError(message);
    setFansErrorCode(code);
    setFansErrorFix(fix);
  }, [chatError]);

  useEffect(() => {
    if (!isChatValidating) {
      setIsLoadingMore(false);
    }
  }, [isChatValidating]);

  useEffect(() => {
    setFans(fetchedFans);
  }, [fetchedFans]);

  const updateChatPages = useCallback(
    (updater: (items: ConversationListData[]) => ConversationListData[]) => {
      mutateChats((pages) => {
        if (!pages) return pages;
        const flat = pages.flatMap((page) =>
          Array.isArray(page.items) ? (page.items as ConversationListData[]) : []
        );
        const nextFlat = updater(flat);
        let offset = 0;
        const nextPages = pages.map((page) => {
          const size = Array.isArray(page.items) ? page.items.length : 0;
          const items = nextFlat.slice(offset, offset + size);
          offset += size;
          return { ...page, items };
        });
        if (offset < nextFlat.length && nextPages.length > 0) {
          nextPages[0] = {
            ...nextPages[0],
            items: [
              ...(Array.isArray(nextPages[0].items) ? nextPages[0].items : []),
              ...nextFlat.slice(offset),
            ],
          };
        }
        return nextPages;
      }, { revalidate: false });
    },
    [mutateChats]
  );

  const fetchFanById = useCallback(
    async (fanId: string, options?: { signal?: AbortSignal }) => {
      if (!fanId) return null;
      try {
        recordDevRequest("fans");
        const res = await fetch(`/api/creator/chats?fanId=${encodeURIComponent(fanId)}`, {
          cache: "no-store",
          signal: options?.signal,
        });
        const data = await res.json().catch(() => ({}));
        const rawItems = Array.isArray(data.items)
          ? (data.items as Fan[])
          : Array.isArray(data.fans)
          ? (data.fans as Fan[])
          : [];
        const mapped = mapFans(rawItems);
        const target = mapped.find((fan) => fan.id === fanId) ?? null;
        if (!target) return null;
        updateChatPages((prev) => mergeFansById(prev, [target]));
        return target;
      } catch (err) {
        if ((err as any)?.name === "AbortError") return null;
        console.error("Error loading fan", err);
        return null;
      }
    },
    [mapFans, mergeFansById, updateChatPages]
  );

  const handleToggleHighPriority = useCallback(
    async (item: ConversationListData) => {
      if (!item?.id || item.isManager) return;
      const nextValue = !(item.isHighPriority ?? false);
      const nextTimestamp = nextValue ? new Date().toISOString() : null;

      updateChatPages((prev) =>
        prev.map((fan) =>
          fan.id === item.id
            ? { ...fan, isHighPriority: nextValue, highPriorityAt: nextTimestamp }
            : fan
        )
      );
      void mutateChats();

      if (conversation?.id === item.id) {
        setConversation({
          ...conversation,
          isHighPriority: nextValue,
          highPriorityAt: nextTimestamp,
        } as any);
      }

      try {
        const res = await fetch(`/api/fans/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isHighPriority: nextValue }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (process.env.NODE_ENV !== "production") {
            console.warn("[high-priority] patch failed", data?.error || res.statusText);
          }
          await mutateChats();
          return;
        }
        await mutateChats();
      } catch (err) {
        console.error("Error updating high priority", err);
        await mutateChats();
      }
    },
    [conversation, mutateChats, setConversation, updateChatPages]
  );

  useEffect(() => {
    void refreshExtrasSummary();
  }, [refreshExtrasSummary]);

  useEffect(() => {
    setChatPageCount(1);
  }, [apiFilter, search, setChatPageCount]);

  const handleExtrasUpdated = useCallback(
    (detail: {
      fanId?: string;
      totals?: {
        extrasCount?: number;
        extrasSpentTotal?: number;
        lifetimeSpend?: number;
        lifetimeValue?: number;
        customerTier?: "new" | "regular" | "vip";
        isHighPriority?: boolean;
      };
    }) => {
      if (detail?.fanId && detail?.totals) {
        updateChatPages((prev) =>
          prev.map((fan) =>
            fan.id === detail.fanId
              ? {
                  ...fan,
                  extrasCount: detail.totals?.extrasCount ?? fan.extrasCount,
                  extrasSpentTotal: detail.totals?.extrasSpentTotal ?? fan.extrasSpentTotal,
                  lifetimeSpend: detail.totals?.lifetimeSpend ?? fan.lifetimeSpend,
                  lifetimeValue:
                    detail.totals?.lifetimeValue ??
                    detail.totals?.lifetimeSpend ??
                    fan.lifetimeValue ??
                    fan.lifetimeSpend,
                  customerTier: detail.totals?.customerTier ?? fan.customerTier,
                  isHighPriority:
                    typeof detail.totals?.isHighPriority === "boolean"
                      ? detail.totals.isHighPriority
                      : fan.isHighPriority,
                }
              : fan
          )
        );
      }
      void refreshExtrasSummary();
    },
    [refreshExtrasSummary, updateChatPages]
  );

  const handleFanMessageSent = useCallback(
    (detail: FanMessageSentPayload) => {
      const fanId = typeof detail?.fanId === "string" ? detail.fanId : "";
      if (!fanId) return;
      const now = new Date();
      const sentAt = typeof detail?.sentAt === "string" ? new Date(detail.sentAt) : now;
      const safeSentAt = Number.isNaN(sentAt.getTime()) ? now : sentAt;
      const rawText = typeof detail?.text === "string" ? detail.text.trim() : "";
      const durationMs =
        typeof detail?.durationMs === "number"
          ? detail.durationMs
          : typeof (detail?.message as { audioDurationMs?: number } | undefined)?.audioDurationMs === "number"
          ? (detail?.message as { audioDurationMs?: number }).audioDurationMs
          : null;
      const durationLabel =
        typeof durationMs === "number" && durationMs > 0 ? formatVoiceDuration(durationMs) : "";
      const audioPreview =
        durationLabel ? `\uD83C\uDF99 Nota de voz (${durationLabel})` : "\uD83C\uDF99 Nota de voz";
      const preview =
        rawText ||
        (detail?.kind === "audio"
          ? audioPreview
          : detail?.kind === "sticker"
          ? "Sticker"
          : detail?.kind === "content"
          ? "Contenido compartido"
          : "");
      const isFromFan = detail?.from === "fan";
      const activeConversationId = conversation?.id || "";
      const isActiveConversation = !conversation?.isManager && activeConversationId === fanId;
      const existing = fansRef.current.find((fan) => fan.id === fanId) ?? null;
      const fanLabel = (existing?.contactName || "").trim();
      if (isFromFan) {
        clearTypingIndicator(fanId);
      }
      if (detail?.kind === "audio" && detail?.from === "fan" && !isActiveConversation) {
        const notice = recordUnseenVoiceNote({
          fanId,
          fanName: fanLabel || undefined,
          durationMs: typeof durationMs === "number" ? durationMs : 0,
          from: detail?.from,
          eventId: typeof detail?.eventId === "string" ? detail.eventId : undefined,
          createdAt: safeSentAt.toISOString(),
        });
        if (notice) {
          setUnseenVoiceByFan((prev) => ({
            ...prev,
            [fanId]: notice,
          }));
        }
      }
      publishChatEvent({
        type: "message_created",
        threadId: fanId,
        createdAt: safeSentAt.toISOString(),
        preview,
        isIncoming: isFromFan,
      });
      void refreshExtrasSummary();
    },
    [conversation?.id, conversation?.isManager, refreshExtrasSummary]
  );

  const handlePurchaseCreated = useCallback(
    (detail: PurchaseCreatedPayload) => {
      const fanId = typeof detail?.fanId === "string" ? detail.fanId : "";
      if (!fanId) return;
      const amount = typeof detail?.amountCents === "number" ? detail.amountCents / 100 : 0;
      const kind = (detail?.kind || "EXTRA").toString().toUpperCase();
      const title = typeof detail?.title === "string" ? detail.title.trim() : "";
      const timeValue = detail?.createdAt ? new Date(detail.createdAt) : new Date();
      const safeTime = Number.isNaN(timeValue.getTime()) ? new Date() : timeValue;
      const timeLabel = safeTime.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const amountLabel = amount > 0 ? formatCurrency(amount) : "";
      const previewBase =
        kind === "TIP"
          ? `\uD83D\uDCB6 Propina ${amountLabel}`
          : kind === "GIFT"
          ? `\uD83C\uDF81 Regalo ${title ? `${title} ` : ""}${amountLabel}`
          : kind === "SUBSCRIPTION" || kind === "SUB"
          ? `\uD83D\uDCB6 Suscripci\u00F3n ${title ? `${title} ` : ""}${amountLabel}`
          : `\uD83E\uDDFE ${title ? `${title} ` : "Extra "}${amountLabel}`;
      const preview = previewBase.trim();
      const activeConversationId = conversation?.id || "";
      const isActiveConversation = !conversation?.isManager && activeConversationId === fanId;
      const fanLabel =
        (typeof detail?.fanName === "string" ? detail.fanName.trim() : "") ||
        (fansRef.current.find((fan) => fan.id === fanId)?.contactName || "").trim();
      if (!isActiveConversation) {
        const unseenNotice = recordUnseenPurchase({
          fanId,
          fanName: fanLabel || undefined,
          amountCents: typeof detail?.amountCents === "number" ? detail.amountCents : 0,
          kind: detail?.kind,
          title: detail?.title,
          purchaseId: typeof detail?.purchaseId === "string" ? detail.purchaseId : undefined,
          eventId: typeof detail?.eventId === "string" ? detail.eventId : undefined,
          createdAt: safeTime.toISOString(),
        });
        if (unseenNotice) {
          setUnseenPurchaseByFan((prev) => ({
            ...prev,
            [fanId]: unseenNotice,
          }));
          playPurchaseSound();
        }
      }
      updateChatPages((prev) => {
        const index = prev.findIndex((fan) => fan.id === fanId);
        if (index === -1) return prev;
        const current = prev[index];
        const updated = {
          ...current,
          lastMessage: preview || current.lastMessage,
          lastTime: timeLabel,
          lastActivityAt: safeTime.toISOString(),
        };
        return [updated, ...prev.slice(0, index), ...prev.slice(index + 1)];
      });
      void refreshExtrasSummary();
    },
    [conversation?.id, conversation?.isManager, playPurchaseSound, refreshExtrasSummary, updateChatPages]
  );

  const handleVoiceTranscriptUpdated = useCallback(
    (detail: VoiceTranscriptPayload) => {
      const fanId = typeof detail?.fanId === "string" ? detail.fanId : "";
      if (!fanId) return;
      if (detail?.transcriptStatus !== "DONE") return;
      const timeValue = detail?.transcribedAt ? new Date(detail.transcribedAt) : new Date();
      const safeTime = Number.isNaN(timeValue.getTime()) ? new Date() : timeValue;
      const timeLabel = safeTime.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      updateChatPages((prev) => {
        const index = prev.findIndex((fan) => fan.id === fanId);
        if (index === -1) return prev;
        const current = prev[index];
        const updated = {
          ...current,
          lastTime: timeLabel,
          lastActivityAt: safeTime.toISOString(),
        };
        return [updated, ...prev.slice(0, index), ...prev.slice(index + 1)];
      });
    },
    [updateChatPages]
  );

  const handlePurchaseSeen = useCallback((detail: { fanId?: string; purchaseIds?: string[] }) => {
    const fanId = typeof detail?.fanId === "string" ? detail.fanId : "";
    if (!fanId) return;
    clearUnseenPurchase(fanId);
    setUnseenPurchaseByFan((prev) => {
      if (!prev[fanId]) return prev;
      const next = { ...prev };
      delete next[fanId];
      return next;
    });
  }, []);

  const handleCreatorDataChanged = useCallback(
    (detail: CreatorDataChangedPayload | undefined) => {
      const fanId = typeof detail?.fanId === "string" ? detail.fanId : "";
      const adultConfirmedAt =
        typeof detail?.adultConfirmedAt === "string" ? detail.adultConfirmedAt : null;
      const adultConfirmVersion =
        typeof detail?.adultConfirmVersion === "string" ? detail.adultConfirmVersion : null;
      const isAdultConfirmed = detail?.isAdultConfirmed === true;
      const confirmedAtValue = adultConfirmedAt ?? (isAdultConfirmed ? new Date().toISOString() : null);
      if (fanId && confirmedAtValue) {
        updateChatPages((prev) =>
          prev.map((fan) =>
            fan.id === fanId
              ? {
                  ...fan,
                  adultConfirmedAt: confirmedAtValue,
                  adultConfirmVersion: adultConfirmVersion ?? fan.adultConfirmVersion ?? null,
                }
              : fan
          )
        );
        if (conversation?.id === fanId && !conversation?.isManager) {
          setConversation({
            ...conversation,
            adultConfirmedAt: confirmedAtValue,
            adultConfirmVersion: adultConfirmVersion ?? conversation.adultConfirmVersion ?? null,
          } as any);
        }
      }
      if (fanId) {
        void fetchFanById(fanId);
      }
      void refreshExtrasSummary();
    },
    [conversation, fetchFanById, refreshExtrasSummary, setConversation, updateChatPages]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasRestoredFiltersRef.current) return;
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) {
        hasRestoredFiltersRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown> & { version?: number };
      if (typeof parsed.version === "number" && parsed.version !== FILTERS_STORAGE_VERSION) {
        hasRestoredFiltersRef.current = true;
        return;
      }
      const nextDraft: FiltersDraft = {
        ...INITIAL_FILTERS_DRAFT,
        listSegment: isListSegment(parsed.listSegment) ? parsed.listSegment : INITIAL_FILTERS_DRAFT.listSegment,
        followUpMode: isFollowUpMode(parsed.followUpMode) ? parsed.followUpMode : INITIAL_FILTERS_DRAFT.followUpMode,
        statusFilter: isStatusFilter(parsed.statusFilter) ? parsed.statusFilter : INITIAL_FILTERS_DRAFT.statusFilter,
        tierFilter: isTierFilter(parsed.tierFilter) ? parsed.tierFilter : INITIAL_FILTERS_DRAFT.tierFilter,
        showOnlyWithNotes:
          typeof parsed.showOnlyWithNotes === "boolean"
            ? parsed.showOnlyWithNotes
            : INITIAL_FILTERS_DRAFT.showOnlyWithNotes,
        onlyWithExtras:
          typeof parsed.onlyWithExtras === "boolean"
            ? parsed.onlyWithExtras
            : INITIAL_FILTERS_DRAFT.onlyWithExtras,
        onlyWithFollowUp:
          typeof parsed.onlyWithFollowUp === "boolean"
            ? parsed.onlyWithFollowUp
            : INITIAL_FILTERS_DRAFT.onlyWithFollowUp,
        onlyNeedsReply:
          typeof parsed.onlyNeedsReply === "boolean"
            ? parsed.onlyNeedsReply
            : INITIAL_FILTERS_DRAFT.onlyNeedsReply,
        onlyAtRisk:
          typeof parsed.onlyAtRisk === "boolean"
            ? parsed.onlyAtRisk
            : INITIAL_FILTERS_DRAFT.onlyAtRisk,
      };
      skipPersistFiltersRef.current = true;
      applyDraftState(nextDraft);
      if (isHeatFilter(parsed.heatFilter)) {
        setHeatFilter(parsed.heatFilter);
      }
      if (isIntentFilter(parsed.intentFilter)) {
        setIntentFilter(parsed.intentFilter);
      }
      if (typeof parsed.showEmptyFilters === "boolean") {
        setShowEmptyFilters(parsed.showEmptyFilters);
      }
      if (typeof parsed.showMoreSegments === "boolean") {
        setShowMoreSegments(parsed.showMoreSegments);
      }
    } catch (_err) {
      // ignore invalid storage payloads
    } finally {
      hasRestoredFiltersRef.current = true;
    }
  }, [applyDraftState, setHeatFilter, setIntentFilter, setShowEmptyFilters, setShowMoreSegments]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasRestoredFiltersRef.current) return;
    if (skipPersistFiltersRef.current) {
      skipPersistFiltersRef.current = false;
      return;
    }
    const payload = {
      version: FILTERS_STORAGE_VERSION,
      listSegment,
      followUpMode,
      statusFilter,
      tierFilter,
      showOnlyWithNotes,
      onlyWithExtras,
      onlyWithFollowUp,
      onlyNeedsReply,
      onlyAtRisk,
      heatFilter,
      intentFilter,
      showEmptyFilters,
      showMoreSegments,
    };
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    followUpMode,
    heatFilter,
    intentFilter,
    listSegment,
    onlyAtRisk,
    onlyNeedsReply,
    onlyWithExtras,
    onlyWithFollowUp,
    showEmptyFilters,
    showMoreSegments,
    showOnlyWithNotes,
    statusFilter,
    tierFilter,
  ]);

  useEffect(() => {
    function handleFanDataUpdated(event: Event) {
      const custom = event as CustomEvent;
      const rawFans = Array.isArray(custom.detail?.fans) ? (custom.detail.fans as Fan[]) : null;
      if (rawFans) {
        const mapped = mapFans(rawFans);
        mutateChats(
          [
            {
              ok: true,
              items: mapped,
              hasMore: false,
              nextCursor: null,
            },
          ],
          { revalidate: false }
        );
        setFansError("");
        return;
      }
      void mutateChats();
    }

    window.addEventListener("fanDataUpdated", handleFanDataUpdated as EventListener);
    const handleExternalFilter = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as
        | {
            followUpFilter?: "all" | "today" | "expired" | "priority";
            tierFilter?: "all" | "new" | "regular" | "vip";
            onlyWithExtras?: boolean;
          }
        | undefined;
      if (!detail) return;
      applyFilter(detail.followUpFilter ?? "all", false, detail.tierFilter ?? "all", false);
      if (typeof detail.onlyWithExtras === "boolean") {
        setOnlyWithExtras(detail.onlyWithExtras);
      }
    };
    window.addEventListener("applyChatFilter", handleExternalFilter as EventListener);

    // Si venimos desde otra pantalla con un filtro pendiente, aplicarlo.
    try {
      const raw = sessionStorage.getItem("novsy:pendingChatFilter");
      if (raw) {
        const parsed = JSON.parse(raw);
        applyFilter(parsed.followUpFilter ?? "all", false, parsed.tierFilter ?? "all", false);
        if (typeof parsed.onlyWithExtras === "boolean") {
          setOnlyWithExtras(parsed.onlyWithExtras);
        }
        sessionStorage.removeItem("novsy:pendingChatFilter");
      }
    } catch (_err) {
      // ignoramos parseos inválidos
    }

    return () => {
      window.removeEventListener("fanDataUpdated", handleFanDataUpdated as EventListener);
      window.removeEventListener("applyChatFilter", handleExternalFilter as EventListener);
    };
  }, [applyFilter, mapFans, mutateChats]);

  const handleTyping = useCallback((detail: TypingPayload) => {
    if (!detail) return;
    updateTypingIndicator(detail);
  }, []);

  useCreatorRealtime({
    onExtrasUpdated: handleExtrasUpdated,
    onFanMessageSent: handleFanMessageSent,
    onPurchaseCreated: handlePurchaseCreated,
    onPurchaseSeen: handlePurchaseSeen,
    onCreatorDataChanged: handleCreatorDataChanged,
    onVoiceTranscriptUpdated: handleVoiceTranscriptUpdated,
    onTyping: handleTyping,
  });

  useEffect(() => {
    return subscribeChatEvents((event) => {
      if (event.type === "message_created") {
        const threadId = event.threadId;
        if (!threadId) return;
        const createdAt = new Date(event.createdAt);
        const timeLabel = Number.isNaN(createdAt.getTime())
          ? ""
          : createdAt.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
        const isActive = !conversation?.isManager && conversation?.id === threadId;
        const shouldIncrement = event.isIncoming && !isActive;
        updateChatPages((prev) => {
          const index = prev.findIndex((fan) => fan.id === threadId);
          if (index === -1) return prev;
          const current = prev[index];
          const nextUnread = shouldIncrement
            ? (current.unreadCount ?? 0) + 1
            : isActive
            ? 0
            : current.unreadCount ?? 0;
          const updated = {
            ...current,
            lastMessage: event.preview || current.lastMessage,
            lastTime: timeLabel || current.lastTime,
            lastActivityAt: event.createdAt,
            lastMessageAt: event.createdAt,
            lastCreatorMessageAt: event.isIncoming ? current.lastCreatorMessageAt : event.createdAt,
            unreadCount: nextUnread,
          };
          const hasActivityChange =
            current.lastActivityAt !== event.createdAt ||
            current.lastMessageAt !== event.createdAt ||
            updated.lastMessage !== current.lastMessage;
          if (!hasActivityChange && updated.unreadCount === current.unreadCount) return prev;
          const next = prev.slice();
          next.splice(index, 1);
          return [updated, ...next];
        });
        return;
      }
      if (event.type === "thread_read") {
        const threadId = event.threadId;
        if (!threadId) return;
        updateChatPages((prev) =>
          prev.map((fan) =>
            fan.id === threadId
              ? {
                  ...fan,
                  unreadCount: 0,
                }
              : fan
          )
        );
      }
    });
  }, [conversation?.id, conversation?.isManager, updateChatPages]);

  useEffect(() => {
    const fanIdFromQuery = getFanIdFromQuery({ fan: queryFan, fanId: queryFanId });
    if (!fanIdFromQuery) return;
    const target = fans.find((fan) => fan.id === fanIdFromQuery);
    if (target) {
      setConversation(target as any);
      openFanFetchRef.current = null;
      openFanNotFoundRef.current = null;
      return;
    }
    if (openFanFetchRef.current === fanIdFromQuery) return;
    openFanFetchRef.current = fanIdFromQuery;
    const controller = new AbortController();
    let cancelled = false;
    void fetchFanById(fanIdFromQuery, { signal: controller.signal }).then((fetched) => {
      if (cancelled) return;
      const currentFanId = getFanIdFromQuery({ fan: queryFan, fanId: queryFanId });
      if (currentFanId !== fanIdFromQuery) return;
      if (!fetched) {
        if (openFanNotFoundRef.current !== fanIdFromQuery) {
          showOpenFanToast("Fan no encontrado");
          openFanNotFoundRef.current = fanIdFromQuery;
        }
        return;
      }
      setConversation(fetched as any);
      openFanNotFoundRef.current = null;
    }).catch(() => {
      if (!cancelled && openFanNotFoundRef.current !== fanIdFromQuery) {
        showOpenFanToast("Fan no encontrado");
        openFanNotFoundRef.current = fanIdFromQuery;
      }
    }).finally(() => {
      if (!cancelled && openFanFetchRef.current === fanIdFromQuery) {
        openFanFetchRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fans, queryFan, queryFanId, fetchFanById, setConversation, showOpenFanToast]);


  useEffect(() => {
    if (!showLegend) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (legendRef.current && target && !legendRef.current.contains(target)) {
        setShowLegend(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showLegend]);

  useEffect(() => {
    if (!showFiltersPanel) return;
    setFiltersDraft(getFilterSnapshot());
  }, [getFilterSnapshot, showFiltersPanel]);

  useEffect(() => {
    if (!showFiltersPanel) {
      const target = filtersLastFocusRef.current ?? filtersButtonRef.current;
      target?.focus();
      filtersLastFocusRef.current = null;
      return;
    }
    if (typeof document !== "undefined") {
      filtersLastFocusRef.current = document.activeElement as HTMLElement | null;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowFiltersPanel(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      filtersPanelRef.current?.focus();
    });
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showFiltersPanel, setShowFiltersPanel]);

  function formatVoiceDuration(durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatCurrency(value: number) {
    const rounded = Math.round((value ?? 0) * 100) / 100;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)} €`;
  }

  function getPurchaseBadgeLabel(notice: PurchaseNotice) {
    const ui = formatPurchaseUI({
      kind: notice.last.kind,
      amountCents: notice.totalAmountCents,
      viewer: "creator",
    });
    return `${ui.icon} ${ui.badgeLabel}`;
  }

  const handleOpenManagerPanel = useCallback((_item?: ConversationListData) => {
    if (!aiEnabled) return;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("novsy:conversation:changing"));
    }
    void router.push("/creator/manager", undefined, { scroll: false });
  }, [aiEnabled, router]);

  const managerPanelItem = useMemo<ConversationListData>(
    () => ({
      id: "__manager_panel__",
      contactName: "Cortex",
      lastMessage: "",
      lastTime: "",
      image: "avatar.jpg",
      messageHistory: [],
      isManager: true,
      managerCaption: "",
    }),
    []
  );

  const isLoading = !chatPages && !chatError;
  const isError = Boolean(fansError);
  const isCreatorMissing = fansErrorCode === "CREATOR_NOT_FOUND";
  useEffect(() => {
    if (chatError) {
      setChatListStatus("error");
      return;
    }
    if (!chatPages) {
      setChatListStatus("loading");
      return;
    }
    setChatListStatus("ready");
  }, [chatError, chatPages, setChatListStatus]);
  const filterRowClass =
    "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]";
  const countPillClass =
    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums tracking-tight";
  const boardVoiceMeta = useMemo(() => {
    const latest = boardVoiceSummary.latest;
    if (!latest) return null;
    const notice = latest.notice;
    const fallbackName =
      (fans.find((fan) => fan.id === latest.fanId)?.contactName || "").trim();
    const fanName = (notice.last.fanName || "").trim() || fallbackName || "Fan";
    const durationLabel = formatVoiceDuration(notice.last.durationMs);
    const base =
      notice.last.from === "creator" ? `Nota de voz enviada a ${fanName}` : `Nota de voz de ${fanName}`;
    const label = durationLabel ? `\uD83C\uDF99 ${base} (${durationLabel})` : `\uD83C\uDF99 ${base}`;
    const extraCount = Math.max(0, boardVoiceSummary.totalCount - 1);
    return { label, icon: "\uD83C\uDF99", extraCount };
  }, [boardVoiceSummary, fans]);
  const boardPurchaseMeta = useMemo(() => {
    const latest = boardPurchaseSummary.latest;
    if (!latest) return null;
    const notice = latest.notice;
    const fallbackName =
      (fans.find((fan) => fan.id === latest.fanId)?.contactName || "").trim();
    const fanName = (notice.last.fanName || "").trim() || fallbackName || "Fan";
    const amountCents =
      typeof notice.last.amountCents === "number" ? notice.last.amountCents : notice.totalAmountCents;
    const ui = formatPurchaseUI({
      kind: notice.last.kind,
      amountCents,
      fanName,
      viewer: "creator",
    });
    const label = fanName ? `Has recibido ${ui.amountLabel} de ${fanName}` : `Has recibido ${ui.amountLabel}`;
    const extraCount = Math.max(0, boardPurchaseSummary.totalCount - 1);
    return { label, icon: ui.icon, extraCount };
  }, [boardPurchaseSummary, fans]);
  const isFiltersDirty = useMemo(() => {
    const snapshot = getFilterSnapshot();
    return (
      snapshot.listSegment !== filtersDraft.listSegment ||
      snapshot.followUpMode !== filtersDraft.followUpMode ||
      snapshot.statusFilter !== filtersDraft.statusFilter ||
      snapshot.tierFilter !== filtersDraft.tierFilter ||
      snapshot.showOnlyWithNotes !== filtersDraft.showOnlyWithNotes ||
      snapshot.onlyWithExtras !== filtersDraft.onlyWithExtras ||
      snapshot.onlyWithFollowUp !== filtersDraft.onlyWithFollowUp ||
      snapshot.onlyNeedsReply !== filtersDraft.onlyNeedsReply ||
      snapshot.onlyAtRisk !== filtersDraft.onlyAtRisk
    );
  }, [filtersDraft, getFilterSnapshot]);
  const hasActiveFilters = filterSummary.length > 0;
  const hasActiveFiltersOrSearch = hasActiveFilters || search.trim().length > 0;
  const filterBadgeLabel = filterSummary.length > 9 ? "9+" : String(filterSummary.length);
  const filterSummaryLabel = filterSummary.join(" · ");
  const shouldShowFilterRow = (count: number, isActive = false) =>
    showEmptyFilters || count > 0 || (isActive && showEmptyFilters);
  const hasSecondarySegments =
    showEmptyFilters ||
    withNotesCount > 0 ||
    archivedCount > 0 ||
    blockedCount > 0 ||
    packsCount > 0 ||
    filtersDraft.showOnlyWithNotes ||
    filtersDraft.statusFilter !== "active" ||
    showPacksPanel;
  const isDraftTodos =
    filtersDraft.listSegment === "all" &&
    filtersDraft.statusFilter === "active" &&
    filtersDraft.followUpMode === "all" &&
    !filtersDraft.showOnlyWithNotes &&
    filtersDraft.tierFilter === "all";
  const isDraftQueue = filtersDraft.listSegment === "queue";
  const isDraftToday =
    filtersDraft.listSegment === "all" &&
    filtersDraft.statusFilter === "active" &&
    filtersDraft.followUpMode === "today" &&
    !filtersDraft.showOnlyWithNotes;
  const isDraftExpired =
    filtersDraft.listSegment === "all" &&
    filtersDraft.statusFilter === "active" &&
    filtersDraft.followUpMode === "expired" &&
    !filtersDraft.showOnlyWithNotes;
  const isDraftPriority =
    filtersDraft.listSegment === "all" &&
    filtersDraft.statusFilter === "active" &&
    filtersDraft.followUpMode === "priority";
  const isDraftNew =
    filtersDraft.listSegment === "all" &&
    filtersDraft.statusFilter === "active" &&
    filtersDraft.tierFilter === "new";
  const isDraftRegular =
    filtersDraft.listSegment === "all" &&
    filtersDraft.statusFilter === "active" &&
    filtersDraft.tierFilter === "regular";
  const isDraftNotes =
    filtersDraft.listSegment === "all" &&
    filtersDraft.statusFilter === "active" &&
    filtersDraft.showOnlyWithNotes;
  const isDraftArchived = filtersDraft.statusFilter === "archived";
  const isDraftBlocked = filtersDraft.statusFilter === "blocked";
  const renderSwitch = (active: boolean) => (
    <span
      className={clsx(
        "relative inline-flex h-5 w-9 items-center rounded-full border px-0.5 transition",
        active
          ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.2)]"
          : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)]"
      )}
    >
      <span
        className={clsx(
          "inline-block h-4 w-4 rounded-full bg-[color:var(--text)] transition",
          active ? "translate-x-4" : "translate-x-0"
        )}
      />
    </span>
  );
  return (
    <div
      data-creator-board="true"
      className="flex flex-col w-full md:w-[480px] lg:min-w-[420px] shrink-0 bg-[color:var(--surface-1)] min-h-[320px] md:h-full"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      <CreatorSettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <CreatorHeader
        name={config.creatorName}
        role="Creador"
        subtitle={config.creatorSubtitle}
        initial={creatorInitial}
        avatarUrl={config.avatarUrl}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="mb-2 px-3">
        {isError && (
          <div className="mb-2 rounded-xl border border-[color:rgba(244,63,94,0.5)] bg-[color:rgba(244,63,94,0.12)] px-3 py-2 text-[12px] text-[color:var(--text)]">
            <div className="flex items-center justify-between gap-2">
              <span>{fansError || "No se pudo cargar la lista de fans."}</span>
              <div className="flex items-center gap-2">
                {isCreatorMissing ? (
                  <button
                    type="button"
                    className="rounded-md border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.2)] px-2 py-1 text-[11px] font-semibold hover:bg-[color:rgba(244,63,94,0.28)]"
                    onClick={() => {
                      if (typeof window !== "undefined") window.location.reload();
                    }}
                  >
                    Reiniciar sesión
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-md border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.2)] px-2 py-1 text-[11px] font-semibold hover:bg-[color:rgba(244,63,94,0.28)]"
                    onClick={() => mutateChats()}
                  >
                    Reintentar
                  </button>
                )}
                {isCreatorMissing && process.env.NODE_ENV !== "production" && (
                  <button
                    type="button"
                    className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                    onClick={() => mutateChats()}
                  >
                    Crear creator demo
                  </button>
                )}
              </div>
            </div>
            {fansErrorCode === DB_SCHEMA_OUT_OF_SYNC_CODE && process.env.NODE_ENV !== "production" && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                <span>
                  Ejecuta:{" "}
                  <span className="font-mono">
                    {(fansErrorFix && fansErrorFix.length > 0 ? fansErrorFix[0] : "npm run db:reset")}
                  </span>{" "}
                  <span>(dev)</span>
                </span>
                <button
                  type="button"
                  className="rounded-md border border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-semibold hover:bg-[color:var(--surface-2)]"
                  onClick={async () => {
                    const command =
                      fansErrorFix && fansErrorFix.length > 0 ? fansErrorFix[0] : "npm run db:reset";
                    try {
                      await navigator.clipboard.writeText(command);
                    } catch (err) {
                      console.warn("No se pudo copiar el comando", err);
                    }
                  }}
                >
                  Copiar
                </button>
              </div>
            )}
          </div>
        )}
        {openFanToast && (
          <div className="mb-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-[11px] text-[color:var(--muted)]">
            {openFanToast}
          </div>
        )}
        <DevRequestCounters />
        {boardVoiceMeta && (
          <div className="mb-2 rounded-xl border border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-2 text-[11px] text-[color:var(--text)]">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleOpenVoiceBanner}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="text-base leading-none">{boardVoiceMeta.icon}</span>
                <span className="font-semibold truncate">{boardVoiceMeta.label}</span>
              </button>
              <div className="flex items-center gap-2">
                {boardVoiceMeta.extraCount > 0 && (
                  <span className="rounded-full border border-[color:rgba(var(--brand-rgb),0.4)] bg-[color:rgba(var(--brand-rgb),0.18)] px-2 py-0.5 text-[10px] font-semibold">
                    +{boardVoiceMeta.extraCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleDismissVoiceBanner}
                  className="rounded-full border border-[color:rgba(var(--brand-rgb),0.4)] bg-[color:rgba(var(--brand-rgb),0.14)] px-2 py-0.5 text-[10px] font-semibold hover:bg-[color:rgba(var(--brand-rgb),0.22)]"
                  aria-label="Cerrar"
                >
                  x
                </button>
              </div>
            </div>
          </div>
        )}
        {boardPurchaseMeta && (
          <div className="mb-2 rounded-xl border border-[color:rgba(34,197,94,0.4)] bg-[color:rgba(34,197,94,0.1)] px-3 py-2 text-[11px] text-[color:var(--text)]">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleOpenPurchaseBanner}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="text-base leading-none">{boardPurchaseMeta.icon}</span>
                <span className="font-semibold truncate">{boardPurchaseMeta.label}</span>
              </button>
              <div className="flex items-center gap-2">
                {boardPurchaseMeta.extraCount > 0 && (
                  <span className="rounded-full border border-[color:rgba(34,197,94,0.5)] bg-[color:rgba(34,197,94,0.16)] px-2 py-0.5 text-[10px] font-semibold">
                    +{boardPurchaseMeta.extraCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleDismissPurchaseBanner}
                  className="rounded-full border border-[color:rgba(34,197,94,0.5)] bg-[color:rgba(34,197,94,0.12)] px-2 py-0.5 text-[10px] font-semibold hover:bg-[color:rgba(34,197,94,0.2)]"
                  aria-label="Cerrar"
                >
                  x
                </button>
              </div>
            </div>
          </div>
        )}
        <LeftSectionCard className="mb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[color:var(--text)]">Resumen y extras</div>
            <button
              type="button"
              onClick={toggleInsightsOpen}
              aria-label={insightsOpen ? "Ocultar resumen" : "Mostrar resumen"}
              title={insightsOpen ? "Ocultar resumen" : "Mostrar resumen"}
              className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-2 text-[color:var(--text)] transition hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]"
            >
              <IconGlyph name={insightsOpen ? "eyeOff" : "eye"} className="h-4 w-4" ariaHidden />
              <span className="sr-only">{insightsOpen ? "Ocultar resumen" : "Mostrar resumen"}</span>
            </button>
          </div>
        </LeftSectionCard>
        {insightsOpen && (
          <>
            {isLoading ? (
              <LeftSectionCard className="mb-2">
                <div className="animate-pulse space-y-3">
                  <div className="flex justify-between">
                    <div className="h-3 w-28 rounded bg-[color:var(--surface-2)]" />
                    <div className="h-3 w-20 rounded bg-[color:var(--surface-2)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={`skeleton-${n}`} className="h-16 rounded-xl bg-[color:var(--surface-2)]" />
                    ))}
                  </div>
                </div>
              </LeftSectionCard>
            ) : (
              <>
                <LeftSectionCard className="mb-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-[color:var(--text)]">Resumen de hoy</div>
                      <div className="text-[11px] ui-muted">Ventas y actividad</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <LeftKpiCard
                      label="Chats atendidos"
                      value={attendedTodayCount}
                      tone={attendedTodayCount > 0 ? "accent" : "default"}
                    />
                    <LeftKpiCard
                      label="Cola"
                      value={colaHoyCount}
                      tone={colaHoyCount > 0 ? "accent" : "default"}
                    />
                    <LeftKpiCard
                      label="VIP en cola"
                      value={vipInQueue}
                      tone={vipInQueue > 0 ? "accent" : "default"}
                    />
                    <LeftKpiCard
                      label="Ingresos hoy"
                      value={`${incomeTodayCount} cobro${incomeTodayCount === 1 ? "" : "s"} · ${formatCurrency(incomeTodayAmount)}`}
                      tone={incomeTodayCount > 0 ? "accent" : "default"}
                      valueClassName="text-xl leading-tight"
                      supporting={
                        <div className="space-y-1">
                          {showIncomeBreakdown && (
                            <div>
                              {extrasTodayCount} venta{extrasTodayCount === 1 ? "" : "s"} + {tipsTodayCount} propina{tipsTodayCount === 1 ? "" : "s"}
                            </div>
                          )}
                          <div>suscripciones + ventas + propinas</div>
                          {giftedTodayCount > 0 && <div>Regalos: {giftedTodayCount}</div>}
                        </div>
                      }
                    />
                  </div>
                </LeftSectionCard>
                {extrasSummary && (
                  <LeftSectionCard className="mb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[color:var(--text)]">Extras hoy</div>
                      <div
                        className={clsx(
                          "text-xl font-semibold tracking-tight tabular-nums leading-tight",
                          extrasTodayCount > 0 ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]"
                        )}
                      >
                        {extrasTodayCount} venta{extrasTodayCount === 1 ? "" : "s"} · {formatCurrency(extrasTodayAmount)}
                      </div>
                    </div>
                    {giftedTodayCount > 0 && (
                      <div className="mt-1 text-[10px] ui-muted">Regalos hoy: {giftedTodayCount}</div>
                    )}
                    <div className="mt-3 flex items-center justify-between text-[10px] ui-muted">
                      <span>Últimos 7 días</span>
                      <span
                        className={clsx(
                          "text-base font-semibold tracking-tight tabular-nums leading-tight",
                          extrasLast7Count > 0 ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]"
                        )}
                      >
                        {extrasLast7Count} venta{extrasLast7Count === 1 ? "" : "s"} · {formatCurrency(extrasLast7Amount)}
                      </span>
                    </div>
                    {giftedLast7Count > 0 && (
                      <div className="mt-1 text-[10px] ui-muted">Regalos 7d: {giftedLast7Count}</div>
                    )}
                  </LeftSectionCard>
                )}
              </>
            )}
          </>
        )}
      </div>
      {showPacksPanel && (
        <div className="mb-2 px-3">
          <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-3 text-[11px] text-[color:var(--text)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[color:var(--text)]">Packs disponibles</span>
              <button
                type="button"
                className="text-[color:var(--muted)] hover:text-[color:var(--text)] text-xs"
                onClick={() => setShowPacksPanel(false)}
              >
                Cerrar
              </button>
            </div>
            {Object.values(PACKS).map((pack) => (
              <div key={pack.code} className="rounded-lg bg-[color:var(--surface-2)] px-3 py-2 border border-[color:var(--surface-border)]">
                <div className="flex items-center justify-between text-[12px] text-[color:var(--text)]">
                  <span className="font-semibold">{pack.name}</span>
                  <span className="text-[color:var(--warning)]">{pack.price} €</span>
                </div>
                <div className="text-[11px] text-[color:var(--muted)]">{pack.durationDays} días</div>
                <p className="text-[11px] text-[color:var(--muted)] mt-1">{pack.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        ref={listScrollRef}
        className="relative flex flex-col w-full flex-1 min-h-0 overflow-y-auto"
        id="conversation"
      >
        <div className="sticky top-0 z-30 bg-[color:var(--surface-1)] pb-2">
          <div className="relative">
            <div className="px-3 pt-2 w-full">
              <div className="flex items-center justify-end mb-2">
                <button
                  type="button"
                  onClick={handleAttendNext}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)]"
                >
                  <IconGlyph name="spark" className="h-3.5 w-3.5" />
                  <span>Atender siguiente</span>
                </button>
              </div>
              <div className="mb-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-[11px] text-[color:var(--text)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Estado del creador</span>
                  {creatorStatusSaving && <span className="text-[10px] text-[color:var(--muted)]">Guardando...</span>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select
                    value={creatorAvailability}
                    onChange={handleAvailabilityChange}
                    className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]"
                    disabled={creatorStatusSaving}
                  >
                    {CREATOR_AVAILABILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={creatorResponseSla}
                    onChange={handleResponseSlaChange}
                    className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]"
                    disabled={creatorStatusSaving}
                  >
                    {CREATOR_SLA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {creatorStatusError && (
                  <div className="mt-2 text-[10px] text-[color:var(--danger)]">{creatorStatusError}</div>
                )}
              </div>
              <div className="flex items-center gap-3 w-full rounded-full bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 shadow-sm transition focus-within:border-[color:var(--border-a)] focus-within:ring-1 focus-within:ring-[color:var(--ring)]">
                <svg viewBox="0 0 24 24" width="20" height="20" className="text-[color:var(--muted)]">
                  <path fill="currentColor" d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z" />
                </svg>
                <input
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
                  placeholder="Buscar o iniciar un nuevo chat"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    scrollListToTop();
                  }}
                />
                <select
                  className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] shrink-0"
                  value={heatFilter}
                  onChange={(e) => {
                    const next = e.target.value as typeof heatFilter;
                    setHeatFilter(next);
                    scrollListToTop();
                  }}
                  title="Filtrar por temperatura"
                >
                  <option value="all">Temp: todas ({heatCounts.all})</option>
                  <option value="cold">Frío ({heatCounts.cold})</option>
                  <option value="warm">Templado ({heatCounts.warm})</option>
                  <option value="hot">Caliente ({heatCounts.hot})</option>
                </select>
                <select
                  className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[11px] text-[color:var(--text)] focus:border-[color:var(--border-a)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] shrink-0"
                  value={intentFilter}
                  onChange={(e) => {
                    const next = e.target.value as typeof intentFilter;
                    setIntentFilter(next);
                    scrollListToTop();
                  }}
                  title="Filtrar por intención"
                >
                  <option value="all">Intención: todas ({totalCount})</option>
                  <option value="BUY_NOW">Compra ({intentCounts.BUY_NOW ?? 0})</option>
                  <option value="PRICE_ASK">Precio ({intentCounts.PRICE_ASK ?? 0})</option>
                  <option value="CONTENT_REQUEST">Contenido ({intentCounts.CONTENT_REQUEST ?? 0})</option>
                  <option value="CUSTOM_REQUEST">Custom ({intentCounts.CUSTOM_REQUEST ?? 0})</option>
                  <option value="SUBSCRIBE">Suscribir ({intentCounts.SUBSCRIBE ?? 0})</option>
                  <option value="CANCEL">Cancelar ({intentCounts.CANCEL ?? 0})</option>
                  <option value="OFF_PLATFORM">Off-platform ({intentCounts.OFF_PLATFORM ?? 0})</option>
                  <option value="SUPPORT">Soporte ({intentCounts.SUPPORT ?? 0})</option>
                  <option value="OBJECTION">Objeción ({intentCounts.OBJECTION ?? 0})</option>
                  <option value="RUDE_OR_HARASS">Grosero ({intentCounts.RUDE_OR_HARASS ?? 0})</option>
                  <option value="OTHER">Otro ({intentCounts.OTHER ?? 0})</option>
                </select>
                <button
                  ref={filtersButtonRef}
                  type="button"
                  onClick={() => setShowFiltersPanel((prev) => !prev)}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)] transition shrink-0",
                    showFiltersPanel
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.2)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-1)]"
                  )}
                  aria-pressed={showFiltersPanel}
                  aria-label="Filtros"
                >
                  <IconGlyph name="settings" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Filtros</span>
                  {hasActiveFilters && (
                    <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-1 text-[10px] font-semibold text-[color:var(--text)]">
                      {filterBadgeLabel}
                    </span>
                  )}
                </button>
                {hasActiveFiltersOrSearch && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)] shrink-0"
                  >
                    Reset
                  </button>
                )}
                {listSegment === "all" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] shrink-0"
                    aria-label="Crear invitación"
                    onClick={() => {
                      setIsNewFanOpen(true);
                      setNewFanError(null);
                      setNewFanId(null);
                      setNewFanInviteUrl(null);
                      setNewFanInviteState("idle");
                      setNewFanInviteError(null);
                    }}
                  >
                    <span aria-hidden>+</span>
                    <span className="hidden sm:inline">Crear invitación</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFocusMode((prev) => !prev)}
                  className={clsx(
                    "inline-flex h-10 w-10 items-center justify-center rounded-full border transition shrink-0",
                    focusMode
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.22)] text-[color:var(--text)] shadow-[0_0_0_1px_rgba(var(--brand-rgb),0.25)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] hover:bg-[color:var(--surface-1)]"
                  )}
                  aria-pressed={focusMode}
                  title={focusMode ? "Salir de modo enfoque" : "Activar modo enfoque"}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" preserveAspectRatio="xMidYMid meet">
                    <path fill="currentColor" d="M10 18.1h4v-2h-4v2zm-7-12v2h18v-2H3zm3 7h12v-2H6v2z">
                    </path>
                  </svg>
                </button>
              </div>
              {hasActiveFilters && (
                <div className="mt-2 text-[11px] text-[color:var(--muted)]">
                  Filtros: {filterSummaryLabel}
                </div>
              )}
            </div>
            {showFiltersPanel && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowFiltersPanel(false)}
              >
                <div className="absolute inset-0 bg-[color:var(--surface-overlay)]" />
                <div
                  className="absolute bottom-0 left-0 right-0 md:right-4 md:left-auto md:top-24 md:bottom-auto md:w-[360px]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div
                    ref={filtersPanelRef}
                    tabIndex={-1}
                    className="rounded-t-2xl md:rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-xl max-h-[80vh] overflow-hidden outline-none flex flex-col"
                  >
                    <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[color:var(--surface-border)] shrink-0">
                      <span className="text-sm font-semibold text-[color:var(--text)]">Filtros</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="Qué significa cada etiqueta"
                          onClick={() => setShowLegend((prev) => !prev)}
                          className={clsx(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]",
                            showLegend
                              ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                              : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]"
                          )}
                        >
                          i
                        </button>
                      </div>
                    </div>
                    <div className="px-4 pt-3 pb-4 flex-1 overflow-y-auto">
                      {showLegend && (
                        <div
                          ref={legendRef}
                          className="mt-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-3 text-[11px] text-[color:var(--text)] shadow-lg"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-semibold text-[color:var(--text)]">Qué significa cada etiqueta</span>
                            <button
                              type="button"
                              className="text-[11px] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                              onClick={() => setShowLegend(false)}
                            >
                              Cerrar
                            </button>
                          </div>
                          <ul className="space-y-1 text-[color:var(--muted)]">
                            <li><span className="font-semibold">VIP</span> → Ha gastado más de {HIGH_PRIORITY_LIMIT} € en total contigo.</li>
                            <li>
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <IconGlyph name="pin" className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                                <span>Alta prioridad</span>
                              </span>{" "}
                              → Marcados por ti para atender primero.
                            </li>
                            <li><span className="font-semibold">Extras</span> → Ya te han comprado contenido extra (PPV).</li>
                            <li>
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <IconGlyph name="clock" className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                                <span>Próxima acción</span>
                              </span>{" "}
                              → Le debes un mensaje o seguimiento hoy.
                            </li>
                            <li><span className="font-semibold">Seguimiento hoy</span> → Suscripción a punto de renovarse o tarea marcada para hoy.</li>
                            <li><span className="font-semibold">Cola</span> → Lista de chats importantes para hoy, ordenados por prioridad.</li>
                          </ul>
                          <div className="mt-3 border-t border-[color:var(--surface-border)] pt-2">
                            <div className="text-[12px] font-semibold text-[color:var(--text)] mb-1">Cómo usarlo hoy</div>
                            <ol className="list-decimal list-inside space-y-1 text-[color:var(--muted)]">
                              <li>Abre «Cola» para ver tu cola del día.</li>
                              <li>Revisa «Alta prioridad» y «Con extras» para cerrar el día.</li>
                              <li>Marca «Próxima acción» en quienes necesiten seguimiento.</li>
                            </ol>
                          </div>
                        </div>
                      )}
                      <div className="mt-3 space-y-4 text-[11px] text-[color:var(--muted)]">
                        <button
                          type="button"
                          onClick={() => setShowEmptyFilters((prev) => !prev)}
                          className="flex items-center justify-between rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-[11px] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                          aria-pressed={showEmptyFilters}
                        >
                          <span className="font-semibold">Mostrar vacíos</span>
                          {renderSwitch(showEmptyFilters)}
                        </button>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Segmento</div>
                          <div className="mt-2 flex flex-col gap-2">
                            {shouldShowFilterRow(totalCount, isDraftTodos) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const base = getFilterSnapshot();
                                  applyDraftState(buildDraftWithFilter(base, "all", false));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(isDraftTodos && "font-semibold text-[color:var(--warning)]")}>
                                  Todos
                                </span>
                                <span
                                  className={clsx(
                                    countPillClass,
                                    totalCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                    isDraftTodos && "ring-1 ring-[color:var(--ring)]"
                                  )}
                                >
                                  {totalCount}
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(queueCount, isDraftQueue) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const base = getFilterSnapshot();
                                  applyDraftState({ ...base, listSegment: "queue" });
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(isDraftQueue && "font-semibold text-[color:var(--warning)]")}>
                                  Cola
                                </span>
                                <span
                                  className={clsx(
                                    countPillClass,
                                    queueCount > 0 ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                    isDraftQueue && "ring-1 ring-[color:var(--ring)]"
                                  )}
                                >
                                  {queueCount}
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(followUpTodayCount, isDraftToday) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const base = getFilterSnapshot();
                                  applyDraftState(buildDraftWithFollowUpMode(base, "today"));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(isDraftToday && "font-semibold text-[color:var(--warning)]")}>
                                  Hoy
                                  <span
                                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--surface-border-hover)] text-[9px] text-[color:var(--muted)]"
                                    title="Chats con renovación o tarea marcada para hoy."
                                  >
                                    i
                                  </span>
                                </span>
                                <span
                                  className={clsx(
                                    countPillClass,
                                    followUpTodayCount > 0
                                      ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                                      : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                    isDraftToday && "ring-1 ring-[color:var(--ring)]"
                                  )}
                                >
                                  {followUpTodayCount}
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(expiredCount, isDraftExpired) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const base = getFilterSnapshot();
                                  applyDraftState(buildDraftWithFollowUpMode(base, "expired"));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(isDraftExpired && "font-semibold text-[color:var(--warning)]")}>Caducados</span>
                                <span
                                  className={clsx(
                                    countPillClass,
                                    expiredCount > 0 ? "bg-[color:rgba(244,63,94,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                    isDraftExpired && "ring-1 ring-[color:var(--ring)]"
                                  )}
                                >
                                  {expiredCount}
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(priorityCount, isDraftPriority) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const base = getFilterSnapshot();
                                  applyDraftState(buildDraftWithFollowUpMode(base, "priority"));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(isDraftPriority && "font-semibold text-[color:var(--warning)]")}>
                                  <span className="inline-flex items-center gap-1">
                                    <IconGlyph name="pin" className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                                    <span>Alta prioridad</span>
                                  </span>
                                  <span
                                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--surface-border-hover)] text-[9px] text-[color:var(--muted)]"
                                    title="Marcados por ti para atender primero."
                                  >
                                    i
                                  </span>
                                </span>
                                <span
                                  className={clsx(
                                    countPillClass,
                                    priorityCount > 0 ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                    isDraftPriority && "ring-1 ring-[color:var(--ring)]"
                                  )}
                                >
                                  {priorityCount}
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(newCount, isDraftNew) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const base = getFilterSnapshot();
                                  applyDraftState(buildDraftWithTierFilter(base, "new"));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(isDraftNew && "font-semibold text-[color:var(--warning)]")}>Nuevos</span>
                                <span
                                  className={clsx(
                                    countPillClass,
                                    newCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                    isDraftNew && "ring-1 ring-[color:var(--ring)]"
                                  )}
                                >
                                  {newCount}
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(regularCount, isDraftRegular) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const base = getFilterSnapshot();
                                  applyDraftState(buildDraftWithTierFilter(base, "regular"));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(isDraftRegular && "font-semibold text-[color:var(--warning)]")}>Habituales</span>
                                <span
                                  className={clsx(
                                    countPillClass,
                                    regularCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                    isDraftRegular && "ring-1 ring-[color:var(--ring)]"
                                  )}
                                >
                                  {regularCount}
                                </span>
                              </button>
                            )}
                            {hasSecondarySegments && (
                              <button
                                type="button"
                                onClick={() => setShowMoreSegments((prev) => !prev)}
                                className={clsx(filterRowClass, "w-full")}
                                aria-expanded={showMoreSegments}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <IconGlyph name={showMoreSegments ? "chevronDown" : "chevronRight"} className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                                  <span>Más</span>
                                </span>
                                <span className="text-[10px] text-[color:var(--muted)]">
                                  {showMoreSegments ? "Ocultar" : "Ver"}
                                </span>
                              </button>
                            )}
                            {showMoreSegments && (
                              <>
                                {shouldShowFilterRow(withNotesCount, isDraftNotes) && (
                                  <button
                                    type="button"
                                    onClick={() => applyDraftFilter("all", true)}
                                    className={clsx(filterRowClass, "w-full")}
                                  >
                                    <span className={clsx(isDraftNotes && "font-semibold text-[color:var(--warning)]")}>Con notas</span>
                                    <span
                                      className={clsx(
                                        countPillClass,
                                        withNotesCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                        isDraftNotes && "ring-1 ring-[color:var(--ring)]"
                                      )}
                                    >
                                      {withNotesCount}
                                    </span>
                                  </button>
                                )}
                                {shouldShowFilterRow(archivedCount, isDraftArchived) && (
                                  <button
                                    type="button"
                                    onClick={() => selectDraftStatusFilter("archived")}
                                    className={clsx(filterRowClass, "w-full")}
                                  >
                                    <span className={clsx(isDraftArchived && "font-semibold text-[color:var(--warning)]")}>Archivados</span>
                                    <span
                                      className={clsx(
                                        countPillClass,
                                        archivedCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                        isDraftArchived && "ring-1 ring-[color:var(--ring)]"
                                      )}
                                    >
                                      {archivedCount}
                                    </span>
                                  </button>
                                )}
                                {shouldShowFilterRow(blockedCount, isDraftBlocked) && (
                                  <button
                                    type="button"
                                    onClick={() => selectDraftStatusFilter("blocked")}
                                    className={clsx(filterRowClass, "w-full")}
                                  >
                                    <span className={clsx(isDraftBlocked && "font-semibold text-[color:var(--warning)]")}>Bloqueados</span>
                                    <span
                                      className={clsx(
                                        countPillClass,
                                        blockedCount > 0 ? "bg-[color:rgba(244,63,94,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                        isDraftBlocked && "ring-1 ring-[color:var(--ring)]"
                                      )}
                                    >
                                      {blockedCount}
                                    </span>
                                  </button>
                                )}
                                {shouldShowFilterRow(packsCount, showPacksPanel) && (
                                  <button
                                    type="button"
                                    onClick={() => setShowPacksPanel((prev) => !prev)}
                                    className={clsx(filterRowClass, "w-full")}
                                  >
                                    <span className={clsx(showPacksPanel && "font-semibold text-[color:var(--warning)]")}>Packs disponibles ({packsCount})</span>
                                    <span className={clsx(showPacksPanel && "font-semibold text-[color:var(--warning)]")}>⋯</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Toggles</div>
                          <div className="mt-2 flex flex-col gap-2">
                            {shouldShowFilterRow(atRiskCount, filtersDraft.onlyAtRisk) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFiltersDraft((prev) => ({
                                    ...prev,
                                    listSegment: "all",
                                    onlyAtRisk: !prev.onlyAtRisk,
                                  }));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(filtersDraft.onlyAtRisk && "font-semibold text-[color:var(--warning)]")}>
                                  <span className="inline-flex items-center gap-1">
                                    <IconGlyph name="alert" className="h-3.5 w-3.5 text-[color:var(--danger)]" />
                                    <span>En riesgo</span>
                                  </span>
                                </span>
                                <span className="flex items-center gap-2">
                                  {renderSwitch(filtersDraft.onlyAtRisk)}
                                  <span
                                    className={clsx(
                                      countPillClass,
                                      atRiskCount > 0 ? "bg-[color:rgba(244,63,94,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                      filtersDraft.onlyAtRisk && "ring-1 ring-[color:var(--ring)]"
                                    )}
                                  >
                                    {atRiskCount}
                                  </span>
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(withExtrasCount, filtersDraft.onlyWithExtras) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFiltersDraft((prev) => ({
                                    ...prev,
                                    listSegment: "all",
                                    onlyWithExtras: !prev.onlyWithExtras,
                                  }));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(filtersDraft.onlyWithExtras && "font-semibold text-[color:var(--warning)]")}>
                                  <span className="inline-flex items-center gap-1">
                                    <IconGlyph name="coin" className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                                    <span>Con extras</span>
                                  </span>
                                  <span
                                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--surface-border-hover)] text-[9px] text-[color:var(--muted)]"
                                    title="Este fan ya te ha comprado contenido extra (PPV)."
                                  >
                                    i
                                  </span>
                                </span>
                                <span className="flex items-center gap-2">
                                  {renderSwitch(filtersDraft.onlyWithExtras)}
                                  <span
                                    className={clsx(
                                      countPillClass,
                                      withExtrasCount > 0 ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                      filtersDraft.onlyWithExtras && "ring-1 ring-[color:var(--ring)]"
                                    )}
                                  >
                                    {withExtrasCount}
                                  </span>
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(withFollowUpCount, filtersDraft.onlyWithFollowUp) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFiltersDraft((prev) => ({
                                    ...prev,
                                    listSegment: "all",
                                    statusFilter: "active",
                                    onlyWithFollowUp: !prev.onlyWithFollowUp,
                                  }));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(filtersDraft.onlyWithFollowUp && "font-semibold text-[color:var(--warning)]")}>
                                  <span className="inline-flex items-center gap-1">
                                    <IconGlyph name="clock" className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                                    <span>Con próxima acción</span>
                                  </span>
                                  <span
                                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--surface-border-hover)] text-[9px] text-[color:var(--muted)]"
                                    title="Tienes una tarea anotada para este fan (nota con rayo)."
                                  >
                                    i
                                  </span>
                                </span>
                                <span className="flex items-center gap-2">
                                  {renderSwitch(filtersDraft.onlyWithFollowUp)}
                                  <span
                                    className={clsx(
                                      countPillClass,
                                      withFollowUpCount > 0 ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                      filtersDraft.onlyWithFollowUp && "ring-1 ring-[color:var(--ring)]"
                                    )}
                                  >
                                    {withFollowUpCount}
                                  </span>
                                </span>
                              </button>
                            )}
                            {shouldShowFilterRow(needsReplyCount, filtersDraft.onlyNeedsReply) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFiltersDraft((prev) => ({
                                    ...prev,
                                    listSegment: "all",
                                    onlyNeedsReply: !prev.onlyNeedsReply,
                                  }));
                                }}
                                className={clsx(filterRowClass, "w-full")}
                              >
                                <span className={clsx(filtersDraft.onlyNeedsReply && "font-semibold text-[color:var(--warning)]")}>
                                  <span className="inline-flex items-center gap-1">
                                    <IconGlyph name="inbox" className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                                    <span>Responder</span>
                                  </span>
                                </span>
                                <span className="flex items-center gap-2">
                                  {renderSwitch(filtersDraft.onlyNeedsReply)}
                                  <span
                                    className={clsx(
                                      countPillClass,
                                      needsReplyCount > 0 ? "bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                                      filtersDraft.onlyNeedsReply && "ring-1 ring-[color:var(--ring)]"
                                    )}
                                  >
                                    {needsReplyCount}
                                  </span>
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)] shrink-0">
                      <button
                        type="button"
                        className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                        onClick={() => setShowFiltersPanel(false)}
                      >
                        Cerrar
                      </button>
                      <button
                        type="button"
                        onClick={applyFiltersDraft}
                        disabled={!isFiltersDirty}
                        className={clsx(
                          "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                          isFiltersDirty
                            ? "border-[color:rgba(var(--brand-rgb),0.4)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.22)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        )}
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {showAccessRequestsSection && (
          <div className="px-3 pb-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setShowSpamRequests(false)}
                className={clsx(
                  "flex items-center justify-between rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition",
                  showSpamRequests
                    ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                    : "border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                )}
              >
                <span>Solicitudes</span>
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full border border-[color:var(--surface-border)] px-1 text-[10px] text-[color:var(--text)]">
                  {pendingAccessCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (spamAccessCount > 0) setShowSpamRequests(true);
                }}
                disabled={spamAccessCount === 0}
                className={clsx(
                  "flex items-center justify-between rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition",
                  showSpamRequests
                    ? "border-[color:rgba(244,63,94,0.5)] bg-[color:rgba(244,63,94,0.16)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                  spamAccessCount === 0 && "cursor-not-allowed opacity-60"
                )}
              >
                <span>Spam</span>
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full border border-[color:var(--surface-border)] px-1 text-[10px] text-[color:var(--text)]">
                  {spamAccessCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => selectStatusFilter("blocked")}
                disabled={blockedTotalCount === 0}
                className={clsx(
                  "flex items-center justify-between rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition",
                  statusFilter === "blocked"
                    ? "border-[color:rgba(244,63,94,0.5)] bg-[color:rgba(244,63,94,0.16)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                  blockedTotalCount === 0 && "cursor-not-allowed opacity-60"
                )}
              >
                <span>Bloqueados</span>
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full border border-[color:var(--surface-border)] px-1 text-[10px] text-[color:var(--text)]">
                  {blockedTotalCount}
                </span>
              </button>
            </div>
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
              {activeAccessRequestList.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-[color:var(--muted)]">
                  {activeAccessRequestEmpty}
                </div>
              ) : (
                activeAccessRequestList.map((conversation, index) => (
                  <ConversationList
                    key={`${conversation.id || index}-${showSpamRequests ? "spam" : "pending"}`}
                    isFirstConversation={index === 0}
                    data={conversation}
                    onSelect={handleSelectConversation}
                    onToggleHighPriority={handleToggleHighPriority}
                    onCopyInvite={handleCopyInviteForFan}
                    variant="compact"
                  />
                ))
              )}
            </div>
          </div>
        )}
        {aiEnabled && (
          <ConversationList
            data={managerPanelItem}
            isFirstConversation
            onSelect={handleOpenManagerPanel}
            variant="compact"
          />
        )}
        {isLoading && (
          <div className="text-center text-[color:var(--muted)] py-4 text-sm">Cargando fans...</div>
        )}
        {fansError && !isLoading && (
          <div className="text-center text-[color:var(--danger)] py-4 text-sm">{fansError}</div>
        )}
        {!isLoading && !fansError && listSegment === "queue" && !focusMode && (
          <>
            {queueCount === 0 ? (
              <div className="px-4 py-3 text-xs text-[color:var(--muted)]">
                No hay chats en cola.
              </div>
            ) : (
              priorityQueueListWithAccess.map((conversation, index) => {
                const notice = conversation.id ? unseenPurchaseByFan[conversation.id] : null;
                const data = notice
                  ? {
                      ...conversation,
                      unseenPurchaseCount: notice.count,
                      unseenPurchaseLabel: getPurchaseBadgeLabel(notice),
                    }
                  : conversation;
                return (
                  <ConversationList
                    key={conversation.id || index}
                    isFirstConversation={false}
                    data={data}
                    onSelect={handleSelectConversation}
                    onToggleHighPriority={handleToggleHighPriority}
                    onCopyInvite={handleCopyInviteForFan}
                  />
                );
              })
            )}
          </>
        )}
        {!isLoading && !fansError && listSegment === "all" && !focusMode && (
          <>
            {followUpMode === "priority" && safeFilteredConversationsList.length === 0 && (
              <div className="px-4 py-3 text-xs text-[color:var(--muted)]">
                No hay chats prioritarios por ahora.
              </div>
            )}
            {safeFilteredConversationsList.length === 0 && (
              <div className="text-center text-[color:var(--muted)] py-4 text-sm px-4 whitespace-pre-line">
                {(() => {
                  if (followUpMode === "today") {
                    return (
                      <>
                        <span>Hoy no tienes seguimientos pendientes.</span>
                        {"\n"}
                        <span>
                          Verás personas aquí cuando su suscripción esté cerca de renovarse o les marques «Próxima acción»{" "}
                          <IconGlyph
                            name="clock"
                            className="inline-block h-3.5 w-3.5 align-text-bottom text-[color:var(--warning)]"
                          />{" "}
                          en el chat.
                        </span>
                      </>
                    );
                  }
                  if (followUpMode === "priority") {
                    return (
                      <>
                        <span>Aún no tienes chats de alta prioridad.</span>
                        {"\n"}
                        <span>
                          Se marcan{" "}
                          <IconGlyph
                            name="pin"
                            className="inline-block h-3.5 w-3.5 align-text-bottom text-[color:var(--warning)]"
                          />{" "}
                          cuando los señalas manualmente para atender primero.
                        </span>
                      </>
                    );
                  }
                  if (activeQueueFilter === "ventas_hoy") {
                    return "No hay cola.\nTip: revisa el filtro «Con extras» y ofrece un nuevo pack o contenido extra.";
                  }
                  if (activeQueueFilter === "seguimiento_hoy") {
                    return "No hay seguimientos en cola para hoy.";
                  }
                  if (activeQueueFilter === "caducados") {
                    return "No hay accesos caducados en cola.";
                  }
                  if (activeQueueFilter === "alta_prioridad") {
                    return "No hay chats marcados como alta prioridad.";
                  }
                  return "No hay fans que cumplan este filtro por ahora.";
                })()}
              </div>
            )}
            {safeFilteredConversationsWithAccess.map((conversation, index) => {
              const notice = conversation.id ? unseenPurchaseByFan[conversation.id] : null;
              const data = notice
                ? {
                    ...conversation,
                    unseenPurchaseCount: notice.count,
                    unseenPurchaseLabel: getPurchaseBadgeLabel(notice),
                  }
                : conversation;
              return (
                <ConversationList
                  key={conversation.id || index}
                  isFirstConversation={false}
                  data={data}
                  onSelect={handleSelectConversation}
                  onToggleHighPriority={handleToggleHighPriority}
                  onCopyInvite={handleCopyInviteForFan}
                />
              );
            })}
          </>
        )}
        {!isLoading && !fansError && !focusMode && hasMore && (
          <div className="px-4 py-3">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() => {
                setIsLoadingMore(true);
                setChatPageCount((count) => count + 1);
              }}
              className={clsx(
                "w-full rounded-lg border px-3 py-2 text-sm font-semibold",
                isLoadingMore
                  ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                  : "border-[color:var(--warning)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)] hover:bg-[color:rgba(245,158,11,0.16)]"
              )}
            >
              {isLoadingMore ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        )}
      </div>
      {isNewFanOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[color:var(--surface-2)] backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[color:var(--text)]">Crear invitación</h2>
              <button
                type="button"
                onClick={closeNewFanModal}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-[color:var(--surface-2)] text-[color:var(--text)]"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>
            <p className="text-xs text-[color:var(--muted)]">
              Crea un link privado /i/token y un fan queda en Pendiente hasta que entra.
            </p>
            <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
              <span>Nombre o alias</span>
              <input
                className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)]"
                value={newFanName}
                onChange={(e) => setNewFanName(e.target.value)}
                placeholder="Ej: Ana"
                disabled={newFanSaving || !!newFanId}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
              <span>Nota inicial (opcional)</span>
              <textarea
                className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--border-a)] h-20"
                value={newFanNote}
                onChange={(e) => setNewFanNote(e.target.value)}
                placeholder="Contexto rápido para este fan..."
                disabled={newFanSaving || !!newFanId}
              />
            </label>
            {newFanError && <p className="text-xs text-[color:var(--danger)]">{newFanError}</p>}
            {newFanId && (
              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text)]">
                Invitación creada.{newFanInviteUrl ? " Enlace listo para compartir." : " Genera el enlace para invitar."}
              </div>
            )}
            {newFanInviteUrl && (
              <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted)] break-all">
                {newFanInviteUrl}
              </div>
            )}
            {newFanInviteError && <p className="text-xs text-[color:var(--danger)]">{newFanInviteError}</p>}
            <div className="flex items-center justify-end gap-2">
              {newFanId ? (
                <>
                  <button
                    type="button"
                    className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                    onClick={closeNewFanModal}
                  >
                    Cerrar
                  </button>
                  {newFanInviteUrl && process.env.NODE_ENV !== "production" && (
                    <button
                      type="button"
                      className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      onClick={() => {
                        if (newFanInviteUrl) {
                          window.open(newFanInviteUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      Abrir en incógnito
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={newFanInviteState === "loading"}
                    className={clsx(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition",
                      newFanInviteState === "loading"
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
                    )}
                    onClick={() => void handleCopyInviteForNewFan()}
                  >
                    {newFanInviteState === "copied"
                      ? "Enlace copiado"
                      : newFanInviteState === "loading"
                      ? "Generando..."
                      : "Copiar enlace"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                    onClick={closeNewFanModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={newFanSaving}
                    className={clsx(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition",
                      newFanSaving
                        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
                    )}
                    onClick={() => void handleCreateNewFan()}
                  >
                    {newFanSaving ? "Creando..." : "Crear invitación"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
