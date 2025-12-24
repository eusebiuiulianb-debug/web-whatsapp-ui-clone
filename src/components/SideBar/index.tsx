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
import { EXTRAS_UPDATED_EVENT } from "../../constants/events";
import { HIGH_PRIORITY_LIMIT } from "../../config/customers";
import { normalizePreferredLanguage } from "../../lib/language";

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
        <div className="p-4 text-sm text-red-100 bg-red-900/40 border border-red-700 rounded-lg space-y-2">
          <div className="font-semibold">Algo falló al cargar la barra lateral.</div>
          <button
            type="button"
            className="rounded-md bg-red-700/50 px-3 py-1 text-xs font-semibold text-red-50 hover:bg-red-700"
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
  const [ search, setSearch ] = useState("");
  const [ isSettingsOpen, setIsSettingsOpen ] = useState(false);
  const [ fans, setFans ] = useState<ConversationListData[]>([]);
  const [ loadingFans, setLoadingFans ] = useState(true);
  const [ fansError, setFansError ] = useState("");
  const [ showPriorityOnly, setShowPriorityOnly ] = useState(false);
  const [ followUpFilter, setFollowUpFilter ] = useState<"all" | "today" | "expired">("all");
  const [ showOnlyWithNotes, setShowOnlyWithNotes ] = useState(false);
  const [ tierFilter, setTierFilter ] = useState<"all" | "new" | "regular" | "vip">("all");
  const [ onlyWithFollowUp, setOnlyWithFollowUp ] = useState(false);
  const [ onlyWithExtras, setOnlyWithExtras ] = useState(false);
  const [ showLegend, setShowLegend ] = useState(false);
  const [ showAllTodayMetrics, setShowAllTodayMetrics ] = useState(false);
  const [ focusMode, setFocusMode ] = useState(false);
  const [ showPacksPanel, setShowPacksPanel ] = useState(false);
  const [ listSegment, setListSegment ] = useState<"all" | "queue">("all");
  const [ showPriorities, setShowPriorities ] = useState(true);
  const [ nextCursor, setNextCursor ] = useState<string | null>(null);
  const [ hasMore, setHasMore ] = useState(false);
  const [ isLoadingMore, setIsLoadingMore ] = useState(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
    openManagerPanel,
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


  function getRecommendationTagClass(
    tone: RecommendationMeta["tagTone"],
    size: "sm" | "xs" = "sm"
  ) {
    const sizeClass = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]";
    const toneClass =
      tone === "rose"
        ? "border-rose-400/70 bg-rose-500/15 text-rose-100"
        : tone === "amber"
        ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
        : tone === "sky"
        ? "border-sky-400/70 bg-sky-500/15 text-sky-100"
        : "border-emerald-400/70 bg-emerald-500/15 text-emerald-100";
    return clsx(
      "inline-flex items-center rounded-full border font-semibold uppercase tracking-wide whitespace-nowrap",
      sizeClass,
      toneClass
    );
  }

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
      lastSeen: fan.lastSeen,
      lastSeenAt: fan.lastSeenAt ?? null,
      lastCreatorMessageAt: fan.lastCreatorMessageAt,
      activeGrantTypes: fan.activeGrantTypes ?? [],
      hasAccessHistory: fan.hasAccessHistory ?? false,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
      urgencyLevel: getUrgencyLevel(
        fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
        fan.daysLeft
      ),
      notesCount: fan.notesCount ?? 0,
      paidGrantsCount: fan.paidGrantsCount ?? 0,
      lifetimeValue: fan.lifetimeValue ?? 0,
      extrasCount: fan.extrasCount ?? 0,
      extrasSpentTotal: fan.extrasSpentTotal ?? 0,
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
        "unreadCount",
        "lastMessage",
        "isHighPriority",
        "highPriorityAt",
        "inviteUsedAt",
        "extrasCount",
        "extrasSpentTotal",
        "notesCount",
      ];
      const changed = fields.some((field) => (prevFan as any)?.[field] !== (fan as any)?.[field]);
      if (changed) return true;
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
        const targetPath = router.pathname.startsWith("/creator/manager") ? "/" : router.pathname || "/";
        void router.push(
          {
            pathname: targetPath,
            query: { fanId: item.id },
          },
          undefined,
          { shallow: true, scroll: false }
        );
      }
      setConversation(item as any);
    },
    [router, setConversation]
  );

  const handleOpenRecommended = useCallback(
    (item: FanData) => {
      if (!item?.id) return;
      handleSelectConversation(item);
    },
    [handleSelectConversation]
  );

  const getLastActivityTimestamp = useCallback((fan: FanData): number => {
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
    });
    const isHighPriority = fan.isHighPriority === true;
    const hasUnread = (fan.unreadCount ?? 0) > 0;
    const extrasSignal = hasExtrasSignal(fan);
    const hasNextAction = Boolean(fan.nextAction && fan.nextAction.trim().length > 0);

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

  const totalCount = fans.length;
  const followUpTodayCount = fans.filter((fan) =>
    shouldFollowUpToday({
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
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
    return tag && tag !== "none";
  }).length;
  const archivedCount = fans.filter((fan) => fan.isArchived === true).length;
  const blockedCount = fans.filter((fan) => fan.isBlocked === true).length;
  const priorityCount = fans.filter((fan) => (fan as any).isHighPriority === true).length;
  const regularCount = fans.filter((fan) => ((fan as any).segment || "").toUpperCase() === "LEAL_ESTABLE").length;
  const newCount = fans.filter((fan) => ((fan as any).segment || "").toUpperCase() === "NUEVO").length;
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
      filter: "all" | "today" | "expired",
      onlyNotes = false,
      tier: "all" | "new" | "regular" | "vip" = "all",
      onlyFollowUp = false
    ) => {
      setStatusFilter("active");
      setFollowUpFilter(filter);
      setShowOnlyWithNotes(onlyNotes);
      setTierFilter(tier);
      setOnlyWithFollowUp(onlyFollowUp);
      scrollListToTop();
    },
    [scrollListToTop]
  );

  const handleSegmentChange = useCallback(
    (next: "all" | "queue") => {
      setListSegment(next);
      if (next === "queue") {
        setShowPriorities(true);
      }
      scrollListToTop();
    },
    [scrollListToTop]
  );

  const openQueueSegment = useCallback(() => {
    handleSegmentChange("queue");
    requestAnimationFrame(() => {
      queueHeaderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [handleSegmentChange]);

  function selectStatusFilter(next: "active" | "archived" | "blocked") {
    setStatusFilter(next);
    if (next !== "active") {
      setFollowUpFilter("all");
      setShowOnlyWithNotes(false);
      setTierFilter("all");
      setOnlyWithFollowUp(false);
      setOnlyWithExtras(false);
      setShowPriorityOnly(false);
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
      const targetPath = router.pathname.startsWith("/creator/manager") ? "/" : router.pathname || "/";
      void router.push(
        {
          pathname: targetPath,
          query: { fanId },
        },
        undefined,
        { shallow: true }
      );
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
        .filter((fan) => (showPriorityOnly ? (fan.isHighPriority ?? false) : true))
        .filter((fan) => (!showOnlyWithNotes ? true : (fan.notesCount ?? 0) > 0))
        .filter((fan) => (!onlyWithExtras ? true : (fan.extrasSpentTotal ?? 0) > 0))
        .filter((fan) => {
          if (!onlyWithFollowUp) return true;
          const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
          return tag && tag !== "none";
        })
        .filter((fan) => {
          const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
          if (followUpFilter === "all") return true;
          if (followUpFilter === "expired") {
            return isExpiredAccess({ membershipStatus: fan.membershipStatus, daysLeft: fan.daysLeft, followUpTag: tag });
          }
          if (followUpFilter === "today") {
            return shouldFollowUpToday({
              membershipStatus: fan.membershipStatus,
              daysLeft: fan.daysLeft,
              followUpTag: tag,
            });
          }
          return true;
        })
        .filter((fan) => {
          if (tierFilter === "all") return true;
          const segment = ((fan as any).segment || "").toUpperCase();
          if (tierFilter === "vip") return segment === "VIP";
          if (tierFilter === "regular") return segment === "LEAL_ESTABLE";
          if (tierFilter === "new") return segment === "NUEVO";
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
          if (followUpFilter === "today") {
            const pa = a.priorityScore ?? 0;
            const pb = b.priorityScore ?? 0;
            if (pa !== pb) return pb - pa;
            const da = typeof a.daysLeft === "number" ? a.daysLeft : Number.POSITIVE_INFINITY;
            const db = typeof b.daysLeft === "number" ? b.daysLeft : Number.POSITIVE_INFINITY;
            if (da !== db) return da - db;
            const la = a.lastCreatorMessageAt ? new Date(a.lastCreatorMessageAt).getTime() : 0;
            const lb = b.lastCreatorMessageAt ? new Date(b.lastCreatorMessageAt).getTime() : 0;
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
      followUpFilter,
      getHighPriorityTimestamp,
      getLastActivityTimestamp,
      onlyWithExtras,
      onlyWithFollowUp,
      search,
      showOnlyWithNotes,
      showPriorityOnly,
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
  const extrasTodayCount = Number.isFinite(extrasSummary?.today?.count) ? (extrasSummary?.today?.count as number) : 0;
  const extrasTodayAmount = Number.isFinite(extrasSummary?.today?.amount) ? (extrasSummary?.today?.amount as number) : 0;
  const legendRef = useRef<HTMLDivElement | null>(null);
  const queueHeaderRef = useRef<HTMLDivElement | null>(null);
  const activeQueueMeta = useMemo(
    () => buildQueueMetaList(safeFilteredConversationsList, activeQueueFilter),
    [activeQueueFilter, buildQueueMetaList, safeFilteredConversationsList]
  );
  const activeQueueCount = activeQueueMeta.length;
  const ventasHoyQueueMeta = useMemo(
    () => buildQueueMetaList(fans as FanData[], "ventas_hoy"),
    [buildQueueMetaList, fans]
  );
  const ventasHoyCount = ventasHoyQueueMeta.length;
  const vipInQueue = ventasHoyQueueMeta.filter((entry) => entry?.fan?.isHighPriority).length;
  const recommendedCandidate = useMemo(() => {
    if (!activeQueueFilter || activeQueueMeta.length === 0) return null;
    const activeId = conversation?.id ?? null;
    if (!activeId) return activeQueueMeta[0] ?? null;
    const idx = activeQueueMeta.findIndex((entry) => entry.fan.id === activeId);
    if (idx >= 0) return activeQueueMeta[idx + 1] ?? null;
    return activeQueueMeta[0] ?? null;
  }, [activeQueueFilter, activeQueueMeta, conversation?.id]);
  const queueEntries = useMemo(() => {
    if (!recommendedCandidate) return activeQueueMeta;
    return activeQueueMeta.filter((entry) => entry.fan.id !== recommendedCandidate.fan.id);
  }, [activeQueueMeta, recommendedCandidate]);
  const queueCount = activeQueueCount;
  const queuePreviewEntries = queueEntries.slice(0, 3);
  const queueFanIds = useMemo(
    () => new Set(activeQueueMeta.map((entry) => entry.fan.id).filter(Boolean)),
    [activeQueueMeta]
  );
  const restList = useMemo(
    () =>
      safeFilteredConversationsList.filter((fan) => {
        if (!fan?.id) return false;
        return !queueFanIds.has(fan.id);
      }),
    [queueFanIds, safeFilteredConversationsList]
  );
  const restCount = restList.length;
  const activeQueueList = useMemo(
    () => activeQueueMeta.map((entry) => entry.fan),
    [activeQueueMeta]
  );

  useEffect(() => {
    const sameLength = queueFans.length === activeQueueList.length;
    const sameOrder =
      sameLength && queueFans.every((fan, idx) => fan.id === activeQueueList[idx]?.id);
    if (sameOrder && !hasFanListChanged(queueFans, activeQueueList)) {
      return;
    }
    setQueueFans(activeQueueList);
  }, [activeQueueList, hasFanListChanged, queueFans, setQueueFans]);
  const apiFilter = (() => {
    if (statusFilter === "archived") return "archived";
    if (statusFilter === "blocked") return "blocked";
    if (showOnlyWithNotes) return "notes";
    if (onlyWithFollowUp) return "followup";
    if (tierFilter === "new") return "new";
    if (followUpFilter === "expired") return "expired";
    if (followUpFilter === "today") return "today";
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
        const res = await fetch(`/api/fans?${params.toString()}`);
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
      const res = await fetch(`/api/fans?${params.toString()}`, { signal: controller.signal });
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
    const handleExtrasUpdated = (event: Event) => {
      const custom = event as CustomEvent;
      const detail = custom.detail as
        | {
            fanId?: string;
            totals?: {
              extrasCount?: number;
              extrasSpentTotal?: number;
              lifetimeSpend?: number;
              lifetimeValue?: number;
              customerTier?: "new" | "regular" | "vip";
              isHighPriority?: boolean;
            };
          }
        | undefined;

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
    };
    window.addEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated as EventListener);

    const handleExternalFilter = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as
        | {
            followUpFilter?: "all" | "today" | "expired";
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
      window.removeEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated as EventListener);
      window.removeEventListener("applyChatFilter", handleExternalFilter as EventListener);
    };
  }, [applyFilter, fetchFansPage, mapFans, refreshExtrasSummary]);

  useEffect(() => {
    const fanIdFromQuery = typeof router.query.fanId === "string" ? router.query.fanId : null;
    if (!fanIdFromQuery) return;
    if (fans.length === 0) return;
    const target = fans.find((fan) => fan.id === fanIdFromQuery);
    if (target) {
      setConversation(target as any);
    }
  }, [fans, router.query.fanId, setConversation]);


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

  const handleOpenManagerInternal = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (process.env.NODE_ENV !== "production") {
      console.debug("Manager open click", {
        activeConversationId: conversation?.id ?? null,
        isManager: conversation?.isManager ?? false,
      });
    }
    const targetFanId = conversation?.isManager ? null : conversation?.id ?? null;
    openManagerPanel({
      tab: "manager",
      mode: targetFanId ? "fan" : "general",
      targetFanId,
      source: "sidebar",
    });
  }, [conversation?.id, conversation?.isManager, openManagerPanel]);

  const isLoading = loadingFans;
  const isError = Boolean(fansError);
  return (
    <div className="flex flex-col w-full md:w-[480px] lg:min-w-[420px] shrink-0 bg-[#202c33] min-h-[320px] md:h-full" style={{borderRight: "1px solid rgba(134,150,160,0.15)"}}>
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
          <div className="mb-2 rounded-xl border border-rose-500/50 bg-rose-900/40 px-3 py-2 text-[12px] text-rose-50">
            <div className="flex items-center justify-between">
              <span>{fansError || "No se pudo cargar la lista de fans."}</span>
              <button
                type="button"
                className="rounded-md border border-rose-300/50 bg-rose-700/50 px-2 py-1 text-[11px] font-semibold hover:bg-rose-700"
                onClick={() => fetchFansPage()}
              >
                Reintentar
              </button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
            <div className="animate-pulse space-y-3">
              <div className="flex justify-between">
                <div className="h-3 w-28 rounded bg-slate-700" />
                <div className="h-3 w-20 rounded bg-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <div key={`skeleton-${n}`} className="h-16 rounded-xl bg-slate-800" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-100">Resumen de hoy</span>
                <span className="text-slate-400">Ventas y actividad</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex flex-col rounded-xl bg-slate-950/70 px-3 py-3 shadow-sm">
                  <span className="text-[12px] text-slate-400">Chats atendidos</span>
                  <span className={clsx("mt-1 text-2xl font-semibold", attendedTodayCount > 0 ? "text-emerald-300" : "text-slate-300")}>
                    {attendedTodayCount}
                  </span>
                </div>
                <div className="flex flex-col rounded-xl bg-slate-950/70 px-3 py-3 shadow-sm">
                  <span className="text-[12px] text-slate-400">Ventas hoy (cola)</span>
                  <span className={clsx("mt-1 text-2xl font-semibold", ventasHoyCount > 0 ? "text-emerald-300" : "text-slate-300")}>
                    {ventasHoyCount}
                  </span>
                </div>
                <div className="flex flex-col rounded-xl bg-slate-950/70 px-3 py-3 shadow-sm">
                  <span className="text-[12px] text-slate-400">VIP en cola</span>
                  <span className={clsx("mt-1 text-2xl font-semibold", vipInQueue > 0 ? "text-emerald-300" : "text-slate-300")}>
                    {vipInQueue}
                  </span>
                </div>
                <div className="flex flex-col rounded-xl bg-slate-950/70 px-3 py-3 shadow-sm">
                  <span className="text-[12px] text-slate-400">Extras vendidos hoy</span>
                  <span className={clsx("mt-1 text-lg font-semibold leading-tight", extrasTodayCount > 0 ? "text-emerald-300" : "text-slate-300")}>
                    {extrasTodayCount} venta{extrasTodayCount === 1 ? "" : "s"} · {formatCurrency(extrasTodayAmount)}
                  </span>
                </div>
              </div>
            </div>
            {extrasSummary && (
              <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-[12px] text-slate-300">
                <div className="flex justify-between">
                  <span>Extras hoy</span>
                  <span className={clsx("font-semibold text-2xl leading-tight", extrasSummary.today.count > 0 ? "text-emerald-300" : "text-slate-300")}>
                    {extrasSummary.today.count} venta{extrasSummary.today.count === 1 ? "" : "s"} · {formatCurrency(extrasSummary.today.amount)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-slate-400">
                  <span>Últimos 7 días</span>
                  <span className={clsx("font-semibold text-lg", extrasSummary.last7Days.count > 0 ? "text-emerald-200" : "text-slate-300")}>
                    {extrasSummary.last7Days.count} venta{extrasSummary.last7Days.count === 1 ? "" : "s"} · {formatCurrency(extrasSummary.last7Days.amount)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-[12px] text-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                applyFilter("all", false);
                setActiveQueueFilter(null);
              }}
              className="flex flex-1 justify-between text-left pr-2"
            >
              <span className={clsx("text-slate-400", followUpFilter === "all" && !showOnlyWithNotes && "font-semibold text-amber-300")}>Hoy</span>
              <span
                className={clsx(
                  "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold",
                  totalCount > 0 ? "bg-slate-800 text-slate-50" : "bg-slate-800/70 text-slate-300"
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
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition",
                  showLegend
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                    : "border-slate-600 bg-slate-800/60 text-slate-200 hover:border-emerald-400/70 hover:text-emerald-100"
                )}
              >
                i
              </button>
              <button
                type="button"
                className="text-[11px] text-emerald-200 hover:text-emerald-100"
                onClick={() => setShowAllTodayMetrics((prev) => !prev)}
              >
                {showAllTodayMetrics ? "Ver menos" : "Ver más"}
              </button>
            </div>
          </div>
          {showLegend && (
            <div
              ref={legendRef}
              className="mt-2 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-3 text-[11px] text-slate-200 shadow-lg"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-semibold text-slate-100">Qué significa cada etiqueta</span>
                <button
                  type="button"
                  className="text-[11px] text-slate-400 hover:text-slate-100"
                  onClick={() => setShowLegend(false)}
                >
                  Cerrar
                </button>
              </div>
              <ul className="space-y-1 text-slate-300">
                <li><span className="font-semibold">VIP</span> → Ha gastado más de {HIGH_PRIORITY_LIMIT} € en total contigo.</li>
                <li><span className="font-semibold">🔥 Alta prioridad</span> → Marcados por ti para atender primero.</li>
                <li><span className="font-semibold">Extras</span> → Ya te han comprado contenido extra (PPV).</li>
                <li><span className="font-semibold">⚡ Próxima acción</span> → Le debes un mensaje o seguimiento hoy.</li>
                <li><span className="font-semibold">Seguimiento hoy</span> → Suscripción a punto de renovarse o tarea marcada para hoy.</li>
                <li><span className="font-semibold">Ventas hoy</span> → Lista de chats importantes para hoy, ordenados por prioridad.</li>
              </ul>
              <div className="mt-3 border-t border-slate-700 pt-2">
                <div className="text-[12px] font-semibold text-slate-100 mb-1">Cómo usarlo hoy</div>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>Enciende «Ventas hoy» para ver tu cola del día.</li>
                  <li>Usa «Siguiente venta» hasta vaciar la cola.</li>
                  <li>Revisa «Alta prioridad» y «Con extras» para cerrar el día.</li>
                </ol>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              applyFilter("today", false);
              setActiveQueueFilter("seguimiento_hoy");
            }}
            className="flex justify-between text-left"
          >
            <span className={clsx(followUpFilter === "today" && !showOnlyWithNotes && "font-semibold text-amber-300")}>
              Seguimiento hoy
              <span
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[9px] text-slate-300"
                title="Chats con renovación o tarea marcada para hoy."
              >
                i
              </span>
            </span>
            <span
              className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                followUpTodayCount > 0 ? "bg-emerald-500/20 text-emerald-100" : "bg-slate-800 text-slate-300",
                followUpFilter === "today" && !showOnlyWithNotes && "ring-1 ring-amber-300/60"
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
                  applyFilter("expired", false);
                  setActiveQueueFilter("caducados");
                }}
                className="flex justify-between text-left"
              >
                <span className={clsx(followUpFilter === "expired" && !showOnlyWithNotes && "font-semibold text-amber-300")}>Caducados</span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    expiredCount > 0 ? "bg-rose-500/20 text-rose-100" : "bg-slate-800 text-slate-300",
                    followUpFilter === "expired" && !showOnlyWithNotes && "ring-1 ring-amber-300/60"
                  )}
                >
                  {expiredCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyFilter("all", true)}
                className="flex justify-between text-left"
              >
                <span className={clsx(showOnlyWithNotes && "font-semibold text-amber-300")}>Con notas</span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    withNotesCount > 0 ? "bg-slate-800 text-slate-50" : "bg-slate-800/80 text-slate-300",
                    showOnlyWithNotes && "ring-1 ring-amber-300/60"
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
                className="flex justify-between text-left"
              >
                <span className={clsx(statusFilter === "archived" && "font-semibold text-amber-300")}>Archivados</span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    archivedCount > 0 ? "bg-slate-800 text-slate-50" : "bg-slate-800/80 text-slate-300",
                    statusFilter === "archived" && "ring-1 ring-amber-300/60"
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
                className="flex justify-between text-left"
              >
                <span className={clsx(statusFilter === "blocked" && "font-semibold text-amber-300")}>Bloqueados</span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    blockedCount > 0 ? "bg-rose-500/20 text-rose-100" : "bg-slate-800 text-slate-300",
                    statusFilter === "blocked" && "ring-1 ring-amber-300/60"
                  )}
                >
                  {blockedCount}
                </span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter, !onlyWithFollowUp)}
            className="flex justify-between text-left"
          >
            <span className={clsx(onlyWithFollowUp && "font-semibold text-amber-300")}>
              ⚡ Con próxima acción
              <span
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[9px] text-slate-300"
                title="Tienes una tarea anotada para este fan (nota con rayo)."
              >
                i
              </span>
            </span>
            <span
              className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                withFollowUpCount > 0 ? "bg-amber-500/20 text-amber-100" : "bg-slate-800 text-slate-300",
                onlyWithFollowUp && "ring-1 ring-amber-300/60"
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
                  scrollListToTop();
                }}
                className="flex justify-between text-left"
              >
                <span className={clsx(onlyWithExtras && "font-semibold text-amber-300")}>
                  <span aria-hidden className="mr-1">💰</span>
                  Con extras
                  <span
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[9px] text-slate-300"
                    title="Este fan ya te ha comprado contenido extra (PPV)."
                  >
                    i
                  </span>
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    withExtrasCount > 0 ? "bg-amber-500/20 text-amber-100" : "bg-slate-800 text-slate-300",
                    onlyWithExtras && "ring-1 ring-amber-300/60"
                  )}
                >
                  {withExtrasCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextPriorityOnly = !showPriorityOnly;
                  setShowPriorityOnly(nextPriorityOnly);
                  setTierFilter("all");
                  setActiveQueueFilter(nextPriorityOnly ? "alta_prioridad" : null);
                  scrollListToTop();
                }}
                className="flex justify-between text-left"
              >
                <span className={clsx(showPriorityOnly && "font-semibold text-amber-300")}>
                  🔥 Alta prioridad
                  <span
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[9px] text-slate-300"
                    title="Marcados por ti para atender primero."
                  >
                    i
                  </span>
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    priorityCount > 0 ? "bg-amber-500/20 text-amber-100" : "bg-slate-800 text-slate-300",
                    showPriorityOnly && "ring-1 ring-amber-300/60"
                  )}
                >
                  {priorityCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter === "regular" ? "all" : "regular")}
                className="flex justify-between text-left"
              >
                <span className={clsx(tierFilter === "regular" && "font-semibold text-amber-300")}>Habituales</span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    regularCount > 0 ? "bg-slate-800 text-slate-50" : "bg-slate-800/80 text-slate-300",
                    tierFilter === "regular" && "ring-1 ring-amber-300/60"
                  )}
                >
                  {regularCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter === "new" ? "all" : "new")}
                className="flex justify-between text-left"
              >
                <span className={clsx(tierFilter === "new" && "font-semibold text-amber-300")}>Nuevos</span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    newCount > 0 ? "bg-slate-800 text-slate-50" : "bg-slate-800/80 text-slate-300",
                    tierFilter === "new" && "ring-1 ring-amber-300/60"
                  )}
                >
                  {newCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowPacksPanel((prev) => !prev)}
                className="flex justify-between text-left"
              >
                <span className={clsx(showPacksPanel && "font-semibold text-amber-300")}>Packs disponibles ({packsCount})</span>
                <span className={clsx(showPacksPanel && "font-semibold text-amber-300")}>⋯</span>
              </button>
            </>
          )}
        </div>
      </div>
      {showPacksPanel && (
        <div className="mb-2 px-3">
          <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-[11px] text-slate-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100">Packs disponibles</span>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-200 text-xs"
                onClick={() => setShowPacksPanel(false)}
              >
                Cerrar
              </button>
            </div>
            {Object.values(PACKS).map((pack) => (
              <div key={pack.code} className="rounded-lg bg-slate-950/60 px-3 py-2 border border-slate-800">
                <div className="flex items-center justify-between text-[12px] text-slate-100">
                  <span className="font-semibold">{pack.name}</span>
                  <span className="text-amber-200">{pack.price} €</span>
                </div>
                <div className="text-[11px] text-slate-400">{pack.durationDays} días</div>
                <p className="text-[11px] text-slate-300 mt-1">{pack.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mb-2 px-3">
        <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/70 p-1 text-[11px] text-slate-200">
          <button
            type="button"
            onClick={() => handleSegmentChange("all")}
            className={clsx(
              "rounded-full px-3 py-1 font-semibold transition",
              listSegment === "all"
                ? "bg-emerald-500/20 text-emerald-100"
                : "text-slate-300 hover:text-slate-100"
            )}
          >
            Todos ({totalCount})
          </button>
          <button
            type="button"
            onClick={openQueueSegment}
            className={clsx(
              "rounded-full px-3 py-1 font-semibold transition",
              listSegment === "queue"
                ? "bg-amber-500/20 text-amber-100"
                : "text-slate-300 hover:text-slate-100"
            )}
          >
            Cola ({queueCount})
          </button>
        </div>
      </div>
      <div className="mb-2 flex gap-2 text-xs px-3">
        <button
          type="button"
          onClick={() => {
            applyFilter("all", false, "all", false);
            setActiveQueueFilter(null);
          }}
          className={clsx(
            "rounded-full border px-3 py-1",
            followUpFilter === "all"
              ? "border-slate-400 bg-slate-700/60 text-slate-50"
              : "border-slate-600 bg-slate-800/60 text-slate-300"
          )}
        >
          Todos{totalCount > 0 ? ` (${totalCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => {
            applyFilter("today", false, "all", false);
            setActiveQueueFilter("seguimiento_hoy");
          }}
          className={clsx(
            "rounded-full border px-3 py-1",
            followUpFilter === "today"
              ? "border-amber-400 bg-amber-500/10 text-amber-100"
              : "border-amber-700 bg-slate-800/60 text-amber-200/80"
          )}
        >
          Seguimiento hoy{followUpTodayCount > 0 ? ` (${followUpTodayCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => {
            applyFilter("expired", false, "all", false);
            setActiveQueueFilter("caducados");
          }}
          className={clsx(
            "rounded-full border px-3 py-1",
            followUpFilter === "expired"
              ? "border-rose-400 bg-rose-500/10 text-rose-100"
              : "border-rose-800 bg-slate-800/60 text-rose-200/80"
          )}
        >
          Caducados{expiredCount > 0 ? ` (${expiredCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => {
            const nextPriorityOnly = !showPriorityOnly;
            setFollowUpFilter("all");
            setShowOnlyWithNotes(false);
            setOnlyWithFollowUp(false);
            setTierFilter("all");
            setShowPriorityOnly(nextPriorityOnly);
            setActiveQueueFilter(nextPriorityOnly ? "alta_prioridad" : null);
            scrollListToTop();
          }}
          className={clsx(
            "rounded-full border px-3 py-1",
            showPriorityOnly
              ? "border-amber-400 bg-amber-500/10 text-amber-100"
              : "border-amber-700 bg-slate-800/60 text-amber-200/80"
          )}
        >
          Alta prioridad{priorityCount > 0 ? ` (${priorityCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => {
            const nextFilter = activeQueueFilter === "ventas_hoy" ? null : "ventas_hoy";
            setActiveQueueFilter(nextFilter);
            handleSegmentChange(nextFilter ? "queue" : "all");
          }}
          className={clsx(
            "rounded-full border px-3 py-1",
            activeQueueFilter === "ventas_hoy"
              ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
              : "border-emerald-700 bg-slate-800/60 text-emerald-200/80"
          )}
        >
          Ventas hoy
        </button>
      </div>
      <div className="px-3 mb-3 w-full">
        <div className="flex items-center gap-3 w-full rounded-full bg-slate-900/80 border border-slate-800/70 px-3 py-2 shadow-sm flex-wrap">
          <svg viewBox="0 0 24 24" width="20" height="20" className="text-slate-400/80">
            <path fill="currentColor" d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z" />
          </svg>
          <input
            className="flex-1 min-w-[160px] bg-transparent border-none outline-none text-sm text-slate-100 placeholder:text-slate-400"
            placeholder="Buscar o iniciar un nuevo chat"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              scrollListToTop();
            }}
          />
          <button
            type="button"
            onClick={() => setFocusMode((prev) => !prev)}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
              focusMode
                ? "border-emerald-400 bg-emerald-500/25 text-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                : "border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-700"
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
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="rounded-full border border-emerald-500/70 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
            onClick={() => {
              setIsNewFanOpen(true);
              setNewFanError(null);
              setNewFanId(null);
              setNewFanInviteUrl(null);
              setNewFanInviteState("idle");
              setNewFanInviteError(null);
            }}
          >
            + Crear invitación
          </button>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={handleOpenManagerInternal}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-200 hover:border-emerald-400/60 hover:bg-slate-900/90"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200">
                IA
              </span>
              <div>
                <div className="font-semibold text-slate-100">Manager IA</div>
                <div className="text-[10px] text-slate-400">Chat interno</div>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-200">Abrir</span>
          </button>
        </div>
      </div>
      <div
        ref={listScrollRef}
        className="flex flex-col w-full flex-1 min-h-0 overflow-y-auto"
        id="conversation"
      >
        {loadingFans && (
          <div className="text-center text-[#aebac1] py-4 text-sm">Cargando fans...</div>
        )}
        {fansError && !loadingFans && (
          <div className="text-center text-red-400 py-4 text-sm">{fansError}</div>
        )}
        {!loadingFans && !fansError && listSegment === "queue" && !focusMode && (
          <>
            <div ref={queueHeaderRef} className="px-3 pt-2 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">En cola ({queueCount})</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPriorities((prev) => !prev)}
                    className="text-[11px] font-semibold text-slate-300 hover:text-slate-100"
                  >
                    {showPriorities ? "Ocultar cola" : "Mostrar cola"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSegmentChange("all")}
                    className="text-[11px] font-semibold text-slate-300 hover:text-slate-100"
                  >
                    Ver todos
                  </button>
                </div>
              </div>
              {showPriorities ? (
                <div className="mt-2 space-y-2">
                  {recommendedCandidate ? (
                    <div className="rounded-xl border border-amber-500/50 bg-slate-900/80 px-3 py-2">
                      <div className="text-[11px] text-slate-400">Siguiente recomendado</div>
                      <div className="mt-1 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-50 truncate">
                              {recommendedCandidate.fan.contactName}
                            </span>
                            <span className={getRecommendationTagClass(recommendedCandidate.tagTone)}>
                              {recommendedCandidate.tag}
                            </span>
                            <span className="text-[10px] text-slate-400">{recommendedCandidate.daysLeftLabel}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {recommendedCandidate.reason}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg bg-amber-500/90 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-500"
                          onClick={() => handleOpenRecommended(recommendedCandidate.fan)}
                        >
                          Abrir
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      {activeQueueFilter
                        ? activeQueueCount === 0
                          ? "No hay cola activa."
                          : "Cola terminada."
                        : "No hay cola activa."}
                    </div>
                  )}
                  {queueCount > 0 ? (
                    <div className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2">
                      <div className="text-[11px] font-semibold text-slate-400">Cola ({queueCount})</div>
                      <div className="mt-1 space-y-1">
                        {queueEntries.map((entry) => (
                          <button
                            key={entry.fan.id}
                            type="button"
                            onClick={() => handleSelectConversation(entry.fan)}
                            className="flex w-full flex-col gap-1 rounded-lg border border-transparent px-2 py-1 text-left transition hover:border-slate-700/70 hover:bg-slate-900/60"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-semibold text-slate-100 truncate">
                                {entry.fan.contactName}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {entry.daysLeftLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span className={getRecommendationTagClass(entry.tagTone, "xs")}>{entry.tag}</span>
                              <span className="truncate">{entry.reason}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Sin cola por ahora.</div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">Cola oculta.</div>
              )}
            </div>
            <div className="px-3 pt-2 pb-2">
              <div className="text-[11px] font-semibold text-slate-400">Resto ({restCount})</div>
            </div>
            {restCount === 0 ? (
              <div className="px-3 pb-2 text-xs text-slate-400">Sin más fans.</div>
            ) : (
              restList.map((conversation, index) => (
                <ConversationList
                  key={conversation.id || index}
                  isFirstConversation={index === 0}
                  data={conversation}
                  onSelect={handleSelectConversation}
                  onToggleHighPriority={handleToggleHighPriority}
                  onCopyInvite={handleCopyInviteForFan}
                />
              ))
            )}
          </>
        )}
        {!loadingFans && !fansError && listSegment === "all" && !focusMode && (
          <>
            <div className="px-3 pt-2 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">Prioridades</span>
                <button
                  type="button"
                  onClick={() => setShowPriorities((prev) => !prev)}
                  className="text-[11px] font-semibold text-slate-300 hover:text-slate-100"
                >
                  {showPriorities ? "Ocultar prioridades" : "Mostrar prioridades"}
                </button>
              </div>
              {showPriorities && (
                <div className="mt-2 space-y-2">
                  {recommendedCandidate ? (
                    <div className="rounded-xl border border-amber-500/50 bg-slate-900/80 px-3 py-2">
                      <div className="text-[11px] text-slate-400">Siguiente recomendado</div>
                      <div className="mt-1 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-50 truncate">
                              {recommendedCandidate.fan.contactName}
                            </span>
                            <span className={getRecommendationTagClass(recommendedCandidate.tagTone)}>
                              {recommendedCandidate.tag}
                            </span>
                            <span className="text-[10px] text-slate-400">{recommendedCandidate.daysLeftLabel}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {recommendedCandidate.reason}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg bg-amber-500/90 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-500"
                          onClick={() => handleOpenRecommended(recommendedCandidate.fan)}
                        >
                          Abrir
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      {activeQueueFilter
                        ? activeQueueCount === 0
                          ? "No hay cola activa."
                          : "Cola terminada."
                        : "No hay cola activa."}
                    </div>
                  )}
                  {queueCount > 0 && (
                    <div className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-slate-400">Cola ({queueCount})</div>
                        <button
                          type="button"
                          onClick={openQueueSegment}
                          className="text-[11px] font-semibold text-slate-300 hover:text-slate-100"
                        >
                          Ver cola ({queueCount})
                        </button>
                      </div>
                      <div className="mt-1 space-y-1">
                        {queuePreviewEntries.map((entry) => (
                          <button
                            key={entry.fan.id}
                            type="button"
                            onClick={() => handleSelectConversation(entry.fan)}
                            className="flex w-full flex-col gap-1 rounded-lg border border-transparent px-2 py-1 text-left transition hover:border-slate-700/70 hover:bg-slate-900/60"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-semibold text-slate-100 truncate">
                                {entry.fan.contactName}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {entry.daysLeftLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span className={getRecommendationTagClass(entry.tagTone, "xs")}>{entry.tag}</span>
                              <span className="truncate">{entry.reason}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {showPriorityOnly && safeFilteredConversationsList.length === 0 && (
              <div className="px-4 py-3 text-xs text-slate-400">
                No hay chats prioritarios por ahora.
              </div>
            )}
            {safeFilteredConversationsList.length === 0 && (
              <div className="text-center text-[#aebac1] py-4 text-sm px-4 whitespace-pre-line">
                {(() => {
                  if (followUpFilter === "today") {
                    return "Hoy no tienes seguimientos pendientes.\nVerás personas aquí cuando su suscripción esté cerca de renovarse o les marques «Próxima acción» ⚡ en el chat.";
                  }
                  if (showPriorityOnly) {
                    return "Aún no tienes chats de alta prioridad.\nSe marcan 🔥 cuando los señalas manualmente para atender primero.";
                  }
                  if (activeQueueFilter === "ventas_hoy") {
                    return "No hay ventas en cola.\nTip: revisa el filtro «Con extras» y ofrece un nuevo pack o contenido extra.";
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
              return (
                <ConversationList
                  key={conversation.id || index}
                  isFirstConversation={index == 0}
                  data={conversation}
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
                  ? "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                  : "border-amber-400 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
              )}
            >
              {isLoadingMore ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        )}
      </div>
      {isNewFanOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl bg-slate-900 border border-slate-700 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-200">Crear invitación</h2>
              <button
                type="button"
                onClick={closeNewFanModal}
                className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span className="sr-only">Cerrar</span>
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Crea un link privado /i/token y un fan queda en Pendiente hasta que entra.
            </p>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span>Nombre o alias</span>
              <input
                className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                value={newFanName}
                onChange={(e) => setNewFanName(e.target.value)}
                placeholder="Ej: Ana"
                disabled={newFanSaving || !!newFanId}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span>Nota inicial (opcional)</span>
              <textarea
                className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400 h-20"
                value={newFanNote}
                onChange={(e) => setNewFanNote(e.target.value)}
                placeholder="Contexto rápido para este fan..."
                disabled={newFanSaving || !!newFanId}
              />
            </label>
            {newFanError && <p className="text-xs text-rose-300">{newFanError}</p>}
            {newFanId && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                Invitación creada.{newFanInviteUrl ? " Enlace listo para compartir." : " Genera el enlace para invitar."}
              </div>
            )}
            {newFanInviteUrl && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300 break-all">
                {newFanInviteUrl}
              </div>
            )}
            {newFanInviteError && <p className="text-xs text-rose-300">{newFanInviteError}</p>}
            <div className="flex items-center justify-end gap-2">
              {newFanId ? (
                <>
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                    onClick={closeNewFanModal}
                  >
                    Cerrar
                  </button>
                  {newFanInviteUrl && process.env.NODE_ENV !== "production" && (
                    <button
                      type="button"
                      className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
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
                        ? "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                        : "border-emerald-400 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
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
                    className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
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
                        ? "border-slate-700 bg-slate-800/60 text-slate-400 cursor-not-allowed"
                        : "border-emerald-400 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
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
