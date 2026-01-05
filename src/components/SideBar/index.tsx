import ConversationList from "../ConversationList";
import React, { Component, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
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
import { clearUnseenPurchase, getUnseenPurchases, recordUnseenPurchase, type PurchaseNotice } from "../../lib/unseenPurchases";
import { formatPurchaseUI } from "../../lib/purchaseUi";
import { useCreatorRealtime } from "../../hooks/useCreatorRealtime";
import { IconGlyph } from "../ui/IconGlyph";
import { Chip } from "../ui/Chip";

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
  const isExpiredToday = tag === "expired" && (fan.daysLeft ?? 0) === 0;
  let urgencyScore = 0;
  switch (isExpiredToday ? "expired_today" : tag) {
    case "trial_soon":
    case "monthly_soon":
      urgencyScore = 3;
      break;
    case "expired_today":
      urgencyScore = 2;
      break;
    default:
      urgencyScore = 0;
  }

  const tier = normalizeTier(fan.customerTier);
  const tierScore = tier === "vip" ? 2 : tier === "regular" ? 1 : 0;

  return urgencyScore * 10 + tierScore;
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
  const queryFan = router.query.fan;
  const queryFanId = router.query.fanId;
  const [ search, setSearch ] = useState("");
  const [ isSettingsOpen, setIsSettingsOpen ] = useState(false);
  const [ fans, setFans ] = useState<ConversationListData[]>([]);
  const [ loadingFans, setLoadingFans ] = useState(true);
  const [ fansError, setFansError ] = useState("");
  const [ followUpMode, setFollowUpMode ] = useState<"all" | "today" | "expired" | "priority">("all");
  const [ showOnlyWithNotes, setShowOnlyWithNotes ] = useState(false);
  const [ tierFilter, setTierFilter ] = useState<"all" | "new" | "regular" | "vip">("all");
  const [ onlyWithFollowUp, setOnlyWithFollowUp ] = useState(false);
  const [ onlyWithExtras, setOnlyWithExtras ] = useState(false);
  const [ showLegend, setShowLegend ] = useState(false);
  const [ showAllTodayMetrics, setShowAllTodayMetrics ] = useState(false);
  const [ focusMode, setFocusMode ] = useState(false);
  const [ showPacksPanel, setShowPacksPanel ] = useState(false);
  const [ listSegment, setListSegment ] = useState<"all" | "queue">("all");
  const [ nextCursor, setNextCursor ] = useState<string | null>(null);
  const [ hasMore, setHasMore ] = useState(false);
  const [ isLoadingMore, setIsLoadingMore ] = useState(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const openFanFetchRef = useRef<string | null>(null);
  const fansRef = useRef<ConversationListData[]>([]);
  const didInitialFetchRef = useRef(false);
  const didMountFetchRef = useRef(false);
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
  } = useContext(ConversationContext);
  const [ extrasSummary, setExtrasSummary ] = useState<ExtrasSummary | null>(null);
  const [ extrasSummaryError, setExtrasSummaryError ] = useState<string | null>(null);
  const [ statusFilter, setStatusFilter ] = useState<"active" | "archived" | "blocked">("active");
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
  const fansRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ purchaseToast, setPurchaseToast ] = useState<{
    fanId: string;
    icon: string;
    label: string;
    amount: number;
    purchaseIds: string[];
  } | null>(null);
  const purchaseToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ unseenPurchaseByFan, setUnseenPurchaseByFan ] = useState<Record<string, PurchaseNotice>>({});


  const mapFans = useCallback((rawFans: Fan[]): ConversationListData[] => {
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
      accessLabel: (fan as any).accessLabel ?? null,
      daysLeft: fan.daysLeft,
      unreadCount: fan.unreadCount,
      isNew: fan.isNew,
      isNew30d: fan.isNew30d ?? false,
      lastSeen: fan.lastSeen,
      lastSeenAt: fan.lastSeenAt ?? null,
      lastCreatorMessageAt: fan.lastCreatorMessageAt,
      lastActivityAt: fan.lastActivityAt ?? null,
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
      inviteUsedAt: fan.inviteUsedAt ?? null,
      segment: (fan as any).segment ?? null,
      riskLevel: (fan as any).riskLevel ?? "LOW",
      healthScore: (fan as any).healthScore ?? 0,
      customerTier: normalizeTier(fan.customerTier),
      nextAction: fan.nextAction ?? null,
      nextActionAt: fan.nextActionAt ?? null,
      nextActionNote: fan.nextActionNote ?? null,
      priorityScore: fan.priorityScore,
      lastNoteSnippet: fan.lastNoteSnippet ?? null,
      nextActionSnippet: fan.nextActionSnippet ?? null,
      lastNoteSummary: fan.lastNoteSummary ?? fan.lastNoteSnippet ?? null,
      nextActionSummary: fan.nextActionSummary ?? fan.nextActionSnippet ?? null,
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

  const showPurchaseToast = useCallback(
    (payload: { fanId: string; icon: string; label: string; amount: number; purchaseIds: string[] }) => {
      setPurchaseToast(payload);
      playPurchaseSound();
      if (purchaseToastTimerRef.current) {
        clearTimeout(purchaseToastTimerRef.current);
      }
      purchaseToastTimerRef.current = setTimeout(() => setPurchaseToast(null), 2600);
    },
    [playPurchaseSound]
  );

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
        "nextAction",
        "nextActionAt",
        "nextActionNote",
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
      if (fansRefetchTimerRef.current) {
        clearTimeout(fansRefetchTimerRef.current);
      }
      if (purchaseToastTimerRef.current) {
        clearTimeout(purchaseToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setUnseenPurchaseByFan(getUnseenPurchases());
  }, []);

  const fansWithScore: FanData[] = useMemo(
    () =>
      fans.map((fan) => ({
        ...fan,
        priorityScore: typeof fan.priorityScore === "number" ? fan.priorityScore : computePriorityScore(fan),
      })),
    [fans]
  );

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

  const handleOpenPurchaseFan = useCallback(() => {
    if (!purchaseToast?.fanId) return;
    const targetPath = router.pathname.startsWith("/creator/manager") ? "/creator" : router.pathname || "/creator";
    openFanChat(router, purchaseToast.fanId, { shallow: true, scroll: false, pathname: targetPath });
    setPurchaseToast(null);
  }, [purchaseToast?.fanId, router]);

  const getLastActivityTimestamp = useCallback((fan: FanData): number => {
    if (fan.lastActivityAt) {
      const d = new Date(fan.lastActivityAt);
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
        Boolean(fan.nextAction?.trim())
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

  const totalCount = fans.length;
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
  const withFollowUpCount = fans.filter((fan) => {
    const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
    const hasTag = tag && tag !== "none";
    const hasNextAction =
      Boolean(fan.followUpOpen) ||
      Boolean(fan.nextActionAt) ||
      Boolean(fan.nextActionNote?.trim()) ||
      Boolean(fan.nextAction?.trim());
    return hasTag || hasNextAction;
  }).length;
  const archivedCount = fans.filter((fan) => fan.isArchived === true).length;
  const blockedCount = fans.filter((fan) => fan.isBlocked === true).length;
  const priorityCount = fans.filter((fan) => (fan as any).isHighPriority === true).length;
  const regularCount = fans.filter((fan) => ((fan as any).segment || "").toUpperCase() === "LEAL_ESTABLE").length;
  const newCount = fans.filter((fan) => fan.isArchived !== true && fan.isBlocked !== true && fan.isNew30d === true).length;
  const withExtrasCount = fans.filter((fan) => (fan.extrasSpentTotal ?? 0) > 0).length;
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

  const toggleFollowUpMode = useCallback(
    (mode: "today" | "expired" | "priority") => {
      const next = followUpMode === mode ? "all" : mode;
      applyFilter(next, false, "all", false);
    },
    [applyFilter, followUpMode]
  );

  const handleSegmentChange = useCallback(
    (next: "all" | "queue") => {
      setListSegment(next);
      if (next === "queue") {
        setActiveQueueFilter("ventas_hoy");
      } else {
        setActiveQueueFilter(null);
      }
      scrollListToTop();
    },
    [scrollListToTop, setActiveQueueFilter]
  );

  function selectStatusFilter(next: "active" | "archived" | "blocked") {
    setListSegment("all");
    setActiveQueueFilter(null);
    setStatusFilter(next);
    if (next !== "active") {
      setFollowUpMode("all");
      setShowOnlyWithNotes(false);
      setTierFilter("all");
      setOnlyWithFollowUp(false);
      setOnlyWithExtras(false);
    }
    scrollListToTop();
  }

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
      setFans((prev) => {
        if (prev.some((fan) => fan.id === fanId)) return prev;
        return [newConversation, ...prev];
      });
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
        .filter((fan) => (followUpMode === "priority" ? (fan.isHighPriority ?? false) : true))
        .filter((fan) => (!showOnlyWithNotes ? true : (fan.notesCount ?? 0) > 0))
        .filter((fan) => (!onlyWithExtras ? true : (fan.extrasSpentTotal ?? 0) > 0))
        .filter((fan) => {
          if (!onlyWithFollowUp) return true;
          return Boolean(
            fan.followUpOpen ||
              Boolean(fan.nextActionAt) ||
              Boolean(fan.nextActionNote?.trim()) ||
              Boolean(fan.nextAction?.trim())
          );
        })
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
      onlyWithExtras,
      onlyWithFollowUp,
      search,
      showOnlyWithNotes,
      followUpMode,
      statusFilter,
      tierFilter,
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

  useEffect(() => {
    const sameLength = queueFans.length === priorityQueueList.length;
    const sameOrder =
      sameLength && queueFans.every((fan, idx) => fan.id === priorityQueueList[idx]?.id);
    if (sameOrder && !hasFanListChanged(queueFans, priorityQueueList)) {
      return;
    }
    setQueueFans(priorityQueueList);
  }, [priorityQueueList, hasFanListChanged, queueFans, setQueueFans]);
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

  const fetchFansPage = useCallback(
    async (cursor?: string | null, append = false) => {
      try {
        if (append) setIsLoadingMore(true);
        else setLoadingFans(true);
        const params = new URLSearchParams();
        params.set("limit", "30");
        params.set("filter", apiFilter);
        if (search.trim()) params.set("q", search.trim());
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/fans?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Error fetching fans");
        const data = await res.json();
        const rawItems = Array.isArray(data.items) ? (data.items as Fan[]) : [];
        const mapped: ConversationListData[] = mapFans(rawItems);
        setFans((prev) => (append ? [...prev, ...mapped] : mapped));
        setFansError("");
        setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
        setHasMore(Boolean(data.hasMore));
      } catch (_err) {
        setFansError("Error cargando fans");
        if (!append) setFans([]);
      } finally {
        setLoadingFans(false);
        setIsLoadingMore(false);
      }
    },
    [apiFilter, mapFans, search]
  );

  const scheduleFansRefresh = useCallback(
    (delay = 350) => {
      if (fansRefetchTimerRef.current) {
        clearTimeout(fansRefetchTimerRef.current);
      }
      fansRefetchTimerRef.current = setTimeout(() => {
        void fetchFansPage();
      }, delay);
    },
    [fetchFansPage]
  );

  const fetchFanById = useCallback(
    async (fanId: string, options?: { signal?: AbortSignal }) => {
      if (!fanId) return null;
      try {
        const res = await fetch(`/api/fans?fanId=${encodeURIComponent(fanId)}`, {
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
        setFans((prev) => mergeFansById(prev, [target]));
        return target;
      } catch (err) {
        if ((err as any)?.name === "AbortError") return null;
        console.error("Error loading fan", err);
        return null;
      }
    },
    [mapFans, mergeFansById]
  );

  const handleToggleHighPriority = useCallback(
    async (item: ConversationListData) => {
      if (!item?.id || item.isManager) return;
      const nextValue = !(item.isHighPriority ?? false);
      const nextTimestamp = nextValue ? new Date().toISOString() : null;

      setFans((prev) =>
        prev.map((fan) =>
          fan.id === item.id
            ? { ...fan, isHighPriority: nextValue, highPriorityAt: nextTimestamp }
            : fan
        )
      );

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
          await fetchFansPage();
          return;
        }
        await fetchFansPage();
      } catch (err) {
        console.error("Error updating high priority", err);
        await fetchFansPage();
      }
    },
    [conversation, fetchFansPage, setConversation]
  );

  const pollFans = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
      }
      const controller = new AbortController();
      pollAbortRef.current = controller;
      const params = new URLSearchParams();
      params.set("limit", "30");
      params.set("filter", apiFilter);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/fans?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error("poll-fans-failed");
      const data = await res.json();
      const rawItems = Array.isArray(data.items) ? (data.items as Fan[]) : [];
      const mapped: ConversationListData[] = mapFans(rawItems);
      const merged = mergeFansById(fansRef.current, mapped);
      if (hasFanListChanged(fansRef.current, merged)) {
        setFans(merged);
        setFansError("");
        setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
        setHasMore(Boolean(data.hasMore));
      }
    } catch (_err) {
      // silent poll failure
    }
  }, [apiFilter, hasFanListChanged, mapFans, mergeFansById, search, setFansError]);

  useEffect(() => {
    if (didMountFetchRef.current) return;
    didMountFetchRef.current = true;
    fetchFansPage();
    void refreshExtrasSummary();
  }, [fetchFansPage, refreshExtrasSummary]);

  useEffect(() => {
    if (!didInitialFetchRef.current) {
      didInitialFetchRef.current = true;
      return;
    }
    fetchFansPage();
  }, [apiFilter, fetchFansPage, search]);

  useEffect(() => {
    void pollFans();
    const interval = setInterval(() => {
      void pollFans();
    }, 2500);
    pollIntervalRef.current = interval as any;
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current as any);
      if (pollAbortRef.current) pollAbortRef.current.abort();
    };
  }, [pollFans]);

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
        setFans((prev) =>
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
    [refreshExtrasSummary]
  );

  const handleFanMessageSent = useCallback(
    (detail: { fanId?: string; text?: string; kind?: string; sentAt?: string }) => {
      const fanId = typeof detail?.fanId === "string" ? detail.fanId : "";
      if (!fanId) {
        scheduleFansRefresh();
        return;
      }
      const now = new Date();
      const sentAt = typeof detail?.sentAt === "string" ? new Date(detail.sentAt) : now;
      const safeSentAt = Number.isNaN(sentAt.getTime()) ? now : sentAt;
      const timeLabel = safeSentAt.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const rawText = typeof detail?.text === "string" ? detail.text.trim() : "";
      const preview =
        rawText ||
        (detail?.kind === "audio"
          ? "\uD83C\uDFA4 Nota de voz"
          : detail?.kind === "sticker"
          ? "Sticker"
          : detail?.kind === "content"
          ? "Contenido compartido"
          : "");
      const existing = fansRef.current.find((fan) => fan.id === fanId) ?? null;
      if (existing) {
        setFans((prev) => {
          const index = prev.findIndex((fan) => fan.id === fanId);
          if (index === -1) return prev;
          const current = prev[index];
          const updated = {
            ...current,
            lastMessage: preview || current.lastMessage,
            lastTime: timeLabel,
            lastCreatorMessageAt: safeSentAt.toISOString(),
            lastActivityAt: safeSentAt.toISOString(),
          };
          return [updated, ...prev.slice(0, index), ...prev.slice(index + 1)];
        });
      }
      void fetchFanById(fanId);
      void refreshExtrasSummary();
    },
    [fetchFanById, refreshExtrasSummary, scheduleFansRefresh]
  );

  const handlePurchaseCreated = useCallback(
    (detail: {
      fanId?: string;
      fanName?: string;
      amountCents?: number;
      kind?: string;
      title?: string;
      purchaseId?: string;
      createdAt?: string;
    }) => {
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
          createdAt: safeTime.toISOString(),
        });
        if (unseenNotice) {
          const ui = formatPurchaseUI({
            kind: detail?.kind,
            amountCents: unseenNotice.totalAmountCents,
            fanName: fanLabel || undefined,
            viewer: "creator",
          });
          setUnseenPurchaseByFan((prev) => ({
            ...prev,
            [fanId]: unseenNotice,
          }));
          showPurchaseToast({
            fanId,
            icon: ui.icon,
            label: ui.toastLabel,
            amount,
            purchaseIds: unseenNotice.purchaseIds,
          });
        }
      }
      setFans((prev) => {
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
      scheduleFansRefresh();
      void refreshExtrasSummary();
    },
    [conversation?.id, conversation?.isManager, refreshExtrasSummary, scheduleFansRefresh, showPurchaseToast]
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
    (detail: { fanId?: string } = {}) => {
      if (detail?.fanId) {
        void fetchFanById(detail.fanId);
      }
      void refreshExtrasSummary();
    },
    [fetchFanById, refreshExtrasSummary]
  );

  useEffect(() => {
    function handleFanDataUpdated(event: Event) {
      const custom = event as CustomEvent;
      const rawFans = Array.isArray(custom.detail?.fans) ? (custom.detail.fans as Fan[]) : null;
      if (rawFans) {
        setFans(mapFans(rawFans));
        setFansError("");
        setLoadingFans(false);
        setHasMore(false);
        setNextCursor(null);
        return;
      }
      fetchFansPage();
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
  }, [
    applyFilter,
    conversation?.id,
    conversation?.isManager,
    fetchFansPage,
    mapFans,
  ]);

  useCreatorRealtime({
    onExtrasUpdated: handleExtrasUpdated,
    onFanMessageSent: handleFanMessageSent,
    onPurchaseCreated: handlePurchaseCreated,
    onPurchaseSeen: handlePurchaseSeen,
    onCreatorDataChanged: handleCreatorDataChanged,
  });

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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("novsy:conversation:changing"));
    }
    void router.push("/creator/manager", undefined, { scroll: false });
  }, [router]);

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

  const isLoading = loadingFans;
  const isError = Boolean(fansError);
  const filterRowClass =
    "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]";
  const countPillClass =
    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums tracking-tight";
  return (
    <div
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
            <div className="flex items-center justify-between">
              <span>{fansError || "No se pudo cargar la lista de fans."}</span>
              <button
                type="button"
                className="rounded-md border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.2)] px-2 py-1 text-[11px] font-semibold hover:bg-[color:rgba(244,63,94,0.28)]"
                onClick={() => fetchFansPage()}
              >
                Reintentar
              </button>
            </div>
          </div>
        )}
        {openFanToast && (
          <div className="mb-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-[11px] text-[color:var(--muted)]">
            {openFanToast}
          </div>
        )}
        {purchaseToast && (
          <div className="mb-2 rounded-xl border border-[color:rgba(34,197,94,0.4)] bg-[color:rgba(34,197,94,0.1)] px-3 py-2 text-[11px] text-[color:var(--text)] novsy-pop">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">{purchaseToast.icon}</span>
                <span className="font-semibold">{purchaseToast.label}</span>
              </div>
              <button
                type="button"
                onClick={handleOpenPurchaseFan}
                className="rounded-full border border-[color:rgba(34,197,94,0.5)] bg-[color:rgba(34,197,94,0.16)] px-2 py-0.5 text-[10px] font-semibold hover:bg-[color:rgba(34,197,94,0.24)]"
              >
                Abrir chat
              </button>
            </div>
          </div>
        )}
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
        <LeftSectionCard className="mb-2">
          <div className="flex flex-col gap-2 text-[11px] text-[color:var(--muted)]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  applyFilter("all", false);
                }}
                className={clsx(filterRowClass, "flex-1")}
              >
                <span className={clsx("text-[color:var(--muted)]", followUpMode === "all" && !showOnlyWithNotes && "font-semibold text-[color:var(--warning)]")}>
                  Hoy
                </span>
                <span
                  className={clsx(
                    countPillClass,
                    totalCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                  )}
                >
                  {totalCount} fan{totalCount === 1 ? "" : "s"}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Qué significa cada etiqueta"
                  onClick={() => setShowLegend((prev) => !prev)}
                  className={clsx(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]",
                    showLegend
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:border-[color:var(--brand)] hover:text-[color:var(--text)]"
                  )}
                >
                  i
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[color:rgba(var(--brand-rgb),0.4)] bg-[color:rgba(var(--brand-rgb),0.1)] px-2 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]"
                  onClick={() => setShowAllTodayMetrics((prev) => !prev)}
                >
                  {showAllTodayMetrics ? "Ver menos" : "Ver más"}
                </button>
              </div>
            </div>
            {showLegend && (
              <div
                ref={legendRef}
                className="mt-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-3 text-[11px] text-[color:var(--text)] shadow-lg"
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
                    <li>Usa «Siguiente venta» hasta vaciar la cola.</li>
                    <li>Revisa «Alta prioridad» y «Con extras» para cerrar el día.</li>
                  </ol>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                toggleFollowUpMode("today");
              }}
              className={clsx(filterRowClass, "w-full")}
            >
              <span className={clsx(followUpMode === "today" && !showOnlyWithNotes && "font-semibold text-[color:var(--warning)]")}>
                Seguimiento hoy
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
                  followUpMode === "today" && !showOnlyWithNotes && "ring-1 ring-[color:var(--ring)]"
                )}
              >
                {followUpTodayCount}
              </span>
            </button>
            {showAllTodayMetrics && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    toggleFollowUpMode("expired");
                  }}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(followUpMode === "expired" && !showOnlyWithNotes && "font-semibold text-[color:var(--warning)]")}>Caducados</span>
                  <span
                    className={clsx(
                      countPillClass,
                      expiredCount > 0 ? "bg-[color:rgba(244,63,94,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                      followUpMode === "expired" && !showOnlyWithNotes && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {expiredCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFilter("all", true)}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(showOnlyWithNotes && "font-semibold text-[color:var(--warning)]")}>Con notas</span>
                  <span
                    className={clsx(
                      countPillClass,
                      withNotesCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                      showOnlyWithNotes && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {withNotesCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectStatusFilter("archived");
                    setShowAllTodayMetrics(false);
                  }}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(statusFilter === "archived" && "font-semibold text-[color:var(--warning)]")}>Archivados</span>
                  <span
                    className={clsx(
                      countPillClass,
                      archivedCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                      statusFilter === "archived" && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {archivedCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectStatusFilter("blocked");
                    setShowAllTodayMetrics(false);
                  }}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(statusFilter === "blocked" && "font-semibold text-[color:var(--warning)]")}>Bloqueados</span>
                  <span
                    className={clsx(
                      countPillClass,
                      blockedCount > 0 ? "bg-[color:rgba(244,63,94,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                      statusFilter === "blocked" && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {blockedCount}
                  </span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => applyFilter(followUpMode, showOnlyWithNotes, tierFilter, !onlyWithFollowUp)}
              className={clsx(filterRowClass, "w-full")}
            >
              <span className={clsx(onlyWithFollowUp && "font-semibold text-[color:var(--warning)]")}>
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
              <span
                className={clsx(
                  countPillClass,
                  withFollowUpCount > 0 ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                  onlyWithFollowUp && "ring-1 ring-[color:var(--ring)]"
                )}
              >
                {withFollowUpCount}
              </span>
            </button>
            {showAllTodayMetrics && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOnlyWithExtras((prev) => !prev);
                    setListSegment("all");
                    setActiveQueueFilter(null);
                    scrollListToTop();
                  }}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(onlyWithExtras && "font-semibold text-[color:var(--warning)]")}>
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
                  <span
                    className={clsx(
                      countPillClass,
                      withExtrasCount > 0 ? "bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                      onlyWithExtras && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {withExtrasCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = followUpMode === "priority" ? "all" : "priority";
                    setFollowUpMode(next);
                    setTierFilter("all");
                    setListSegment("all");
                    setActiveQueueFilter(null);
                    scrollListToTop();
                  }}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(followUpMode === "priority" && "font-semibold text-[color:var(--warning)]")}>
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
                      followUpMode === "priority" && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {priorityCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFilter(followUpMode, showOnlyWithNotes, tierFilter === "regular" ? "all" : "regular")}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(tierFilter === "regular" && "font-semibold text-[color:var(--warning)]")}>Habituales</span>
                  <span
                    className={clsx(
                      countPillClass,
                      regularCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                      tierFilter === "regular" && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {regularCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFilter(followUpMode, showOnlyWithNotes, tierFilter === "new" ? "all" : "new")}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(tierFilter === "new" && "font-semibold text-[color:var(--warning)]")}>Nuevos</span>
                  <span
                    className={clsx(
                      countPillClass,
                      newCount > 0 ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--muted)]",
                      tierFilter === "new" && "ring-1 ring-[color:var(--ring)]"
                    )}
                  >
                    {newCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPacksPanel((prev) => !prev)}
                  className={clsx(filterRowClass, "w-full")}
                >
                  <span className={clsx(showPacksPanel && "font-semibold text-[color:var(--warning)]")}>Packs disponibles ({packsCount})</span>
                  <span className={clsx(showPacksPanel && "font-semibold text-[color:var(--warning)]")}>⋯</span>
                </button>
              </>
            )}
          </div>
        </LeftSectionCard>
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
            <div className="px-3 pt-2">
              <div
                className={clsx(
                  "flex items-center gap-2 text-xs",
                  listSegment === "all" ? "overflow-x-auto whitespace-nowrap flex-nowrap" : "justify-end"
                )}
              >
                {listSegment === "all" && (
                  <>
                    <Chip
                      variant={followUpMode === "today" ? "accent" : "subtle"}
                      tone="amber"
                      size="sm"
                      active={followUpMode === "today"}
                      onClick={() => toggleFollowUpMode("today")}
                      className="shrink-0"
                    >
                      Seguimiento hoy{followUpTodayCount > 0 ? ` (${followUpTodayCount})` : ""}
                    </Chip>
                    <Chip
                      variant={followUpMode === "expired" ? "accent" : "subtle"}
                      tone="danger"
                      size="sm"
                      active={followUpMode === "expired"}
                      onClick={() => toggleFollowUpMode("expired")}
                      className="shrink-0"
                    >
                      Caducados{expiredCount > 0 ? ` (${expiredCount})` : ""}
                    </Chip>
                    <Chip
                      variant={followUpMode === "priority" ? "accent" : "subtle"}
                      tone="amber"
                      size="sm"
                      active={followUpMode === "priority"}
                      onClick={() => toggleFollowUpMode("priority")}
                      className="shrink-0"
                    >
                      Alta prioridad{priorityCount > 0 ? ` (${priorityCount})` : ""}
                    </Chip>
                  </>
                )}
                <div
                  className={clsx(
                    "inline-flex items-center gap-2 shrink-0",
                    listSegment === "all" && "ml-auto"
                  )}
                >
                  <Chip
                    variant={listSegment === "all" ? "accent" : "subtle"}
                    tone={listSegment === "all" ? "emerald" : "neutral"}
                    size="sm"
                    active={listSegment === "all"}
                    onClick={() => handleSegmentChange("all")}
                  >
                    Todos ({totalCount})
                  </Chip>
                  <Chip
                    variant={listSegment === "queue" ? "accent" : "subtle"}
                    tone={listSegment === "queue" ? "amber" : "neutral"}
                    size="sm"
                    active={listSegment === "queue"}
                    onClick={() => handleSegmentChange("queue")}
                  >
                    Cola ({queueCount})
                  </Chip>
                </div>
              </div>
            </div>
            <div className="mt-2 px-3 w-full">
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
            </div>
          </div>
        </div>
        <ConversationList
          data={managerPanelItem}
          isFirstConversation
          onSelect={handleOpenManagerPanel}
          variant="compact"
        />
        {loadingFans && (
          <div className="text-center text-[color:var(--muted)] py-4 text-sm">Cargando fans...</div>
        )}
        {fansError && !loadingFans && (
          <div className="text-center text-[color:var(--danger)] py-4 text-sm">{fansError}</div>
        )}
        {!loadingFans && !fansError && listSegment === "queue" && !focusMode && (
          <>
            {queueCount === 0 ? (
              <div className="px-4 py-3 text-xs text-[color:var(--muted)]">
                No hay chats en cola.
              </div>
            ) : (
              priorityQueueList.map((conversation, index) => {
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
        {!loadingFans && !fansError && listSegment === "all" && !focusMode && (
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
            {safeFilteredConversationsList.map((conversation, index) => {
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
        {!loadingFans && !fansError && !focusMode && hasMore && (
          <div className="px-4 py-3">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() => fetchFansPage(nextCursor, true)}
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
