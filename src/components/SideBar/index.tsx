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
import { getRecommendedFan } from "../../utils/recommendedFan";
import { PACKS } from "../../config/packs";
import { getLastReadForFan, loadUnreadMap, UnreadMap } from "../../utils/unread";
import type { Message } from "../../types/chat";
import { ConversationContext } from "../../context/ConversationContext";
import { EXTRAS_UPDATED_EVENT } from "../../constants/events";
import { HIGH_PRIORITY_LIMIT } from "../../config/customers";

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
  const [ nextCursor, setNextCursor ] = useState<string | null>(null);
  const [ hasMore, setHasMore ] = useState(false);
  const [ isLoadingMore, setIsLoadingMore ] = useState(false);
  const [ unreadMap, setUnreadMap ] = useState<UnreadMap>({});
  const packsCount = Object.keys(PACKS).length;
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const {
    conversation,
    setConversation,
    queueMode,
    setQueueMode,
    todayQueue,
    setTodayQueue,
    queueIndex,
    setQueueIndex,
  } = useContext(ConversationContext);
  const [ extrasSummary, setExtrasSummary ] = useState<ExtrasSummary | null>(null);
  const [ extrasSummaryError, setExtrasSummaryError ] = useState<string | null>(null);
  const [ statusFilter, setStatusFilter ] = useState<"active" | "archived" | "blocked">("active");

  type FanData = ConversationListData & { priorityScore?: number };

  function normalizeTier(tier?: string | null): "new" | "regular" | "vip" {
    if (!tier) return "new";
    const lower = tier.toLowerCase();
    if (lower === "priority" || lower === "vip") return "vip";
    if (lower === "regular") return "regular";
    return "new";
  }

  const mapFans = useCallback((rawFans: Fan[]): ConversationListData[] => {
    return rawFans.map((fan) => ({
      id: fan.id,
      contactName: fan.name,
      lastMessage: fan.preview,
      lastTime: fan.time,
      image: fan.avatar || "avatar.jpg",
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
      isHighPriority:
        fan.isHighPriority ||
        ((fan as any).segment ?? "").toUpperCase() === "EN_RIESGO" ||
        (((fan as any).segment ?? "").toUpperCase() === "VIP" &&
          ((fan as any).riskLevel ?? "LOW").toUpperCase() !== "LOW") ||
        false,
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

  const safeFans: ConversationListData[] = Array.isArray(fans) ? fans : [];

  const fansWithScore: FanData[] = safeFans.map((fan) => ({
    ...fan,
    priorityScore: typeof fan.priorityScore === "number" ? fan.priorityScore : computePriorityScore(fan),
  }));

  const handleSelectConversation = useCallback(
    (item: ConversationListData) => {
      if (item?.isManager) {
        void router.push("/creator/manager");
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
          { shallow: true }
        );
      }
      setConversation(item as any);
    },
    [router, setConversation]
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

  const buildTodayQueue = useCallback((list: FanData[]): FanData[] => {
    const groupHighPriority: FanData[] = [];
    const groupFollowUp: FanData[] = [];
    const groupUnread: FanData[] = [];
    const groupExtras: FanData[] = [];
    const groupRest: FanData[] = [];

    list.forEach((fan) => {
      const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
      const shouldFollow = shouldFollowUpToday({
        membershipStatus: fan.membershipStatus,
        daysLeft: fan.daysLeft,
        followUpTag: tag,
      });
      const hasUnread = (fan.unreadCount ?? 0) > 0;
      const hasExtrasSpend = (fan.extrasSpentTotal ?? 0) > 0;
      const isPriority = fan.isHighPriority === true;

      if (isPriority && (shouldFollow || hasUnread)) {
        groupHighPriority.push(fan);
        return;
      }
      if (shouldFollow) {
        groupFollowUp.push(fan);
        return;
      }
      if (hasUnread) {
        groupUnread.push(fan);
        return;
      }
      if (hasExtrasSpend) {
        groupExtras.push(fan);
        return;
      }
      groupRest.push(fan);
    });

    const byRecent = (a: FanData, b: FanData) => getLastActivityTimestamp(b) - getLastActivityTimestamp(a);
    const byExtrasSpent = (a: FanData, b: FanData) =>
      (b.extrasSpentTotal ?? 0) - (a.extrasSpentTotal ?? 0) || byRecent(a, b);

    return [
      ...groupHighPriority.sort(byRecent),
      ...groupFollowUp.sort(byRecent),
      ...groupUnread.sort(byRecent),
      ...groupExtras.sort(byExtrasSpent),
      ...groupRest.sort(byRecent),
    ];
  }, [getLastActivityTimestamp]);

  function parseMessageTimestamp(msg: Message): number | null {
    const idParts = (msg.id || "").split("-");
    const last = idParts[idParts.length - 1];
    const num = Number(last);
    if (Number.isFinite(num) && last.length >= 10) return num;
    return null;
  }

  const updateUnreadCounts = useCallback(async (fanList: ConversationListData[], map: UnreadMap) => {
    const entries = await Promise.all(
      fanList.map(async (fan) => {
        const lastRead = getLastReadForFan(map, fan.id as string);
        if (!lastRead) return { id: fan.id, count: 0 };
        try {
          const res = await fetch(`/api/messages?fanId=${fan.id}`);
          if (!res.ok) throw new Error("error");
          const data = await res.json();
          const msgs = Array.isArray(data.messages) ? (data.messages as Message[]) : [];
          const lrTs = lastRead.getTime();
          const unread = msgs.filter((msg) => {
            if (msg.from !== "fan") return false;
            const ts = parseMessageTimestamp(msg);
            if (ts === null) return false;
            return ts > lrTs;
          }).length;
          return { id: fan.id, count: unread };
        } catch (_err) {
          return { id: fan.id, count: 0 };
        }
      })
    );

    const byId = entries.reduce<Record<string, number>>((acc, curr) => {
      if (curr.id) acc[curr.id] = curr.count;
      return acc;
    }, {});

    setFans((prev) =>
      prev.map((fan) => ({
        ...fan,
        unreadCount: fan.id ? byId[fan.id] ?? fan.unreadCount : fan.unreadCount,
      }))
    );
  }, []);

  const totalCount = safeFans.length;
  const followUpTodayCount = safeFans.filter((fan) =>
    shouldFollowUpToday({
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
    })
  ).length;
  const expiredCount = safeFans.filter((fan) =>
    isExpiredAccess({
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
    })
  ).length;
  const withNotesCount = safeFans.filter((fan) => (fan.notesCount ?? 0) > 0).length;
  const withFollowUpCount = safeFans.filter((fan) => {
    const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
    return tag && tag !== "none";
  }).length;
  const archivedCount = safeFans.filter((fan) => fan.isArchived === true).length;
  const blockedCount = safeFans.filter((fan) => fan.isBlocked === true).length;
  const priorityCount = safeFans.filter((fan) => {
    const segment = ((fan as any).segment || "").toUpperCase();
    const risk = ((fan as any).riskLevel || "LOW").toUpperCase();
    return segment === "EN_RIESGO" || (segment === "VIP" && risk !== "LOW") || (fan as any).isHighPriority === true;
  }).length;
  const regularCount = safeFans.filter((fan) => ((fan as any).segment || "").toUpperCase() === "LEAL_ESTABLE").length;
  const newCount = safeFans.filter((fan) => ((fan as any).segment || "").toUpperCase() === "NUEVO").length;
  const withExtrasCount = safeFans.filter((fan) => (fan.extrasSpentTotal ?? 0) > 0).length;

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
    },
    []
  );

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
  }

  const filteredConversationsList =
    (search.length > 0 ? fansWithScore.filter((fan) => fan.contactName.toLowerCase().includes(search.toLowerCase())) : fansWithScore)
      .filter((fan) => {
        if (statusFilter === "archived") return fan.isArchived === true;
        if (statusFilter === "blocked") return fan.isBlocked === true;
        return fan.isArchived !== true && fan.isBlocked !== true;
      })
      .filter((fan) => (showPriorityOnly ? (fan.priorityScore ?? 0) > 0 : true))
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

      if (showPriorityOnly && (b.priorityScore ?? 0) !== (a.priorityScore ?? 0)) {
        return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
      }
      return 0;
    });

  const safeFilteredConversationsList: FanData[] = useMemo(
    () => (Array.isArray(filteredConversationsList) ? (filteredConversationsList as FanData[]) : []),
    [filteredConversationsList]
  );
  const visibleList: FanData[] = queueMode ? buildTodayQueue(safeFilteredConversationsList) : safeFilteredConversationsList;
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
  const safeTodayQueue = Array.isArray(todayQueue) ? todayQueue : [];
  const queueLength = safeTodayQueue.length;
  const vipInQueue = safeTodayQueue.filter((fan) => fan?.isHighPriority).length;
  const extrasTodayCount = Number.isFinite(extrasSummary?.today?.count) ? (extrasSummary?.today?.count as number) : 0;
  const extrasTodayAmount = Number.isFinite(extrasSummary?.today?.amount) ? (extrasSummary?.today?.amount as number) : 0;
  const legendRef = useRef<HTMLDivElement | null>(null);

  const recommendedFan = getRecommendedFan(fansWithScore);
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
        updateUnreadCounts(mapped, loadUnreadMap());
      } catch (_err) {
        setFansError("Error cargando fans");
        if (!append) setFans([]);
      } finally {
        setLoadingFans(false);
        setIsLoadingMore(false);
      }
    },
    [apiFilter, mapFans, search, updateUnreadCounts]
  );

  useEffect(() => {
    setUnreadMap(loadUnreadMap());
    fetchFansPage();
    void refreshExtrasSummary();
  }, [fetchFansPage, refreshExtrasSummary]);

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
    const handleUnreadUpdated = () => setUnreadMap(loadUnreadMap());
    window.addEventListener("unreadUpdated", handleUnreadUpdated);
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
      window.removeEventListener("unreadUpdated", handleUnreadUpdated);
      window.removeEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated as EventListener);
      window.removeEventListener("applyChatFilter", handleExternalFilter as EventListener);
    };
  }, [applyFilter, fetchFansPage, mapFans, refreshExtrasSummary]);

  useEffect(() => {
    if (fans.length === 0) return;
    updateUnreadCounts(fans, unreadMap);
  }, [fans, unreadMap, updateUnreadCounts]);

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
    // refetch on filter/search changes
    fetchFansPage();
  }, [
    apiFilter,
    fetchFansPage,
    followUpFilter,
    onlyWithExtras,
    onlyWithFollowUp,
    search,
    showOnlyWithNotes,
    showPriorityOnly,
    tierFilter,
  ]);

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
    if (!queueMode) return;
    const queue = buildTodayQueue(safeFilteredConversationsList);
    setTodayQueue(queue);
    if (conversation?.id) {
      const idx = queue.findIndex((f) => f.id === conversation.id);
      setQueueIndex(idx >= 0 ? idx : queueIndex);
    } else if (queue.length > 0 && queueIndex >= queue.length) {
      setQueueIndex(0);
    }
  }, [
    buildTodayQueue,
    conversation?.id,
    queueIndex,
    queueMode,
    safeFilteredConversationsList,
    setQueueIndex,
    setTodayQueue,
  ]);

  useEffect(() => {
    if (!queueMode) return;
    if (!conversation?.id) return;
    const safeQueue = Array.isArray(todayQueue) ? todayQueue : [];
    const idx = safeQueue.findIndex((f) => f.id === conversation.id);
    if (idx >= 0 && idx !== queueIndex) setQueueIndex(idx);
  }, [conversation?.id, queueMode, queueIndex, setQueueIndex, todayQueue]);

  function formatCurrency(value: number) {
    const rounded = Math.round((value ?? 0) * 100) / 100;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)} €`;
  }

  const managerChatEntry: ConversationListData = {
    id: "manager-ia",
    contactName: "Manager IA",
    lastMessage: "Panel e insights en tiempo real",
    lastTime: "Hoy",
    image: "avatar3.png",
    messageHistory: [],
    isManager: true,
  };

  const isLoading = loadingFans;
  const isError = Boolean(fansError);
  return (
    <div className="flex flex-col w-full md:w-[480px] bg-[#202c33] min-h-[320px] md:h-full" style={{borderRight: "1px solid rgba(134,150,160,0.15)"}}>
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
                  <span className={clsx("mt-1 text-2xl font-semibold", queueLength > 0 ? "text-emerald-300" : "text-slate-300")}>
                    {queueLength}
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
              onClick={() => applyFilter("all", false)}
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
                <li><span className="font-semibold">🔥 Alta prioridad</span> → Clientes que más han gastado (se atienden primero).</li>
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
            onClick={() => applyFilter("today", false)}
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
                onClick={() => applyFilter("expired", false)}
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
                onClick={() => setOnlyWithExtras((prev) => !prev)}
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
                onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter === "vip" ? "all" : "vip")}
                className="flex justify-between text-left"
              >
                <span className={clsx(tierFilter === "vip" && "font-semibold text-amber-300")}>
                  🔥 Alta prioridad
                  <span
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[9px] text-slate-300"
                    title={`Fans que más han gastado contigo (VIP / límite ${HIGH_PRIORITY_LIMIT} €).`}
                  >
                    i
                  </span>
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    priorityCount > 0 ? "bg-amber-500/20 text-amber-100" : "bg-slate-800 text-slate-300",
                    tierFilter === "vip" && "ring-1 ring-amber-300/60"
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
      {recommendedFan && (
        <div className="mb-2 px-3">
          <div className="flex items-center justify-between rounded-xl border border-amber-500/60 bg-slate-900/80 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-400">Siguiente recomendado</span>
              <span className="text-sm font-semibold text-slate-50">{recommendedFan.contactName}</span>
              <span className="text-[11px] text-slate-500">
                {(recommendedFan.customerTier === "priority" || recommendedFan.customerTier === "vip"
                  ? "Alta prioridad"
                  : recommendedFan.customerTier === "regular"
                  ? "Habitual"
                  : "Nuevo") +
                  ` · ${Math.round(recommendedFan.lifetimeValue ?? 0)} €` +
                  (recommendedFan.followUpTag === "trial_soon" && typeof recommendedFan.daysLeft === "number"
                    ? ` · prueba – ${recommendedFan.daysLeft} d`
                    : recommendedFan.followUpTag === "monthly_soon" && typeof recommendedFan.daysLeft === "number"
                    ? ` · suscripción – ${recommendedFan.daysLeft} d`
                    : recommendedFan.daysLeft !== undefined && recommendedFan.daysLeft !== null
                    ? ` · ${recommendedFan.daysLeft} d`
                    : "")}
              </span>
            </div>
            <button
              type="button"
              className="rounded-lg bg-amber-500/90 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-500"
              onClick={() => recommendedFan && handleSelectConversation(recommendedFan)}
            >
              Abrir chat
            </button>
          </div>
        </div>
      )}
      <div className="mb-2 flex gap-2 text-xs px-3">
        <button
          type="button"
          onClick={() => applyFilter("all", false, "all", false)}
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
          onClick={() => applyFilter("today", false, "all", false)}
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
          onClick={() => applyFilter("expired", false, "all", false)}
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
            setFollowUpFilter("all");
            setShowOnlyWithNotes(false);
            setOnlyWithFollowUp(false);
            setTierFilter(tierFilter === "vip" ? "all" : "vip");
          }}
          className={clsx(
            "rounded-full border px-3 py-1",
            tierFilter === "vip"
              ? "border-amber-400 bg-amber-500/10 text-amber-100"
              : "border-amber-700 bg-slate-800/60 text-amber-200/80"
          )}
        >
          Alta prioridad{priorityCount > 0 ? ` (${priorityCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !queueMode;
            setQueueMode(next);
            if (!next) {
              setTodayQueue([]);
              setQueueIndex(0);
            } else {
              const queue = buildTodayQueue(safeFilteredConversationsList);
              setTodayQueue(queue);
              if (conversation?.id) {
                const idx = queue.findIndex((f) => f.id === conversation.id);
                setQueueIndex(idx >= 0 ? idx : 0);
              } else {
                setQueueIndex(0);
              }
            }
          }}
          className={clsx(
            "rounded-full border px-3 py-1",
            queueMode
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
            onChange={e => setSearch(e.target.value)}
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
      </div>
      <div className="flex flex-col w-full flex-1 overflow-y-auto" id="conversation">
        {loadingFans && (
          <div className="text-center text-[#aebac1] py-4 text-sm">Cargando fans...</div>
        )}
        {fansError && !loadingFans && (
          <div className="text-center text-red-400 py-4 text-sm">{fansError}</div>
        )}
        {showPriorityOnly && filteredConversationsList.length === 0 && (
          <div className="px-4 py-3 text-xs text-slate-400">
            No hay chats prioritarios por ahora.
          </div>
        )}
        {!loadingFans && !fansError && visibleList.length === 0 && (
          <div className="text-center text-[#aebac1] py-4 text-sm px-4 whitespace-pre-line">
            {(() => {
              if (followUpFilter === "today") {
                return "Hoy no tienes seguimientos pendientes.\nVerás personas aquí cuando su suscripción esté cerca de renovarse o les marques «Próxima acción» ⚡ en el chat.";
              }
              if (tierFilter === "vip") {
                return `Aún no tienes clientes de alta prioridad.\nSe marcan 🔥 cuando alguien ha gastado más de ${HIGH_PRIORITY_LIMIT} € en total contigo.`;
              }
              if (queueMode) {
                return "No hay ventas en cola.\nTip: revisa el filtro «Con extras» y ofrece un nuevo pack o contenido extra.";
              }
              return "No hay fans que cumplan este filtro por ahora.";
            })()}
          </div>
        )}
        {!loadingFans && !fansError && !focusMode && (
          <ConversationList
            key={managerChatEntry.id}
            data={managerChatEntry}
            onSelect={handleSelectConversation}
          />
        )}
        {!loadingFans && !fansError && !focusMode && visibleList.map((conversation, index) => {
          return (
            <ConversationList
              key={conversation.id || index}
              isFirstConversation={index == 0}
              data={conversation}
              onSelect={handleSelectConversation}
            />
          )
        })}
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
    </div>
  )
}
