import ConversationList from "../ConversationList";
import { useCallback, useContext, useEffect, useState } from "react";
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

export default function SideBar() {
  const [ search, setSearch ] = useState("");
  const [ isSettingsOpen, setIsSettingsOpen ] = useState(false);
  const [ fans, setFans ] = useState<ConversationListData[]>([]);
  const [ loadingFans, setLoadingFans ] = useState(true);
  const [ fansError, setFansError ] = useState("");
  const [ showPriorityOnly, setShowPriorityOnly ] = useState(false);
  const [ followUpFilter, setFollowUpFilter ] = useState<"all" | "today" | "expired">("all");
  const [ showOnlyWithNotes, setShowOnlyWithNotes ] = useState(false);
  const [ tierFilter, setTierFilter ] = useState<"all" | "new" | "regular" | "vip">("all");
  const [ onlyWithNextAction, setOnlyWithNextAction ] = useState(false);
  const [ onlyWithExtras, setOnlyWithExtras ] = useState(false);
  const [ showPacksPanel, setShowPacksPanel ] = useState(false);
  const [ nextCursor, setNextCursor ] = useState<string | null>(null);
  const [ hasMore, setHasMore ] = useState(false);
  const [ isLoadingMore, setIsLoadingMore ] = useState(false);
  const [ unreadMap, setUnreadMap ] = useState<UnreadMap>({});
  const packsCount = Object.keys(PACKS).length;
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const { setConversation } = useContext(ConversationContext);
  const [ extrasSummary, setExtrasSummary ] = useState<ExtrasSummary | null>(null);
  const [ extrasSummaryError, setExtrasSummaryError ] = useState<string | null>(null);

  type FanData = ConversationListData & { priorityScore?: number };

  function normalizeTier(tier?: string | null): "new" | "regular" | "vip" {
    if (!tier) return "new";
    const lower = tier.toLowerCase();
    if (lower === "priority" || lower === "vip") return "vip";
    if (lower === "regular") return "regular";
    return "new";
  }

  function mapFans(rawFans: Fan[]): ConversationListData[] {
    return rawFans.map((fan) => ({
      id: fan.id,
      contactName: fan.name,
      lastMessage: fan.preview,
      lastTime: fan.time,
      image: fan.avatar || "avatar.jpg",
      messageHistory: [],
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      unreadCount: fan.unreadCount,
      isNew: fan.isNew,
      lastSeen: fan.lastSeen,
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
      novsyStatus: (fan as any).novsyStatus ?? null,
      isHighPriority: (fan as any).isHighPriority ?? false,
      customerTier: normalizeTier(fan.customerTier),
      nextAction: fan.nextAction ?? null,
      priorityScore: fan.priorityScore,
      lastNoteSnippet: fan.lastNoteSnippet ?? null,
      nextActionSnippet: fan.nextActionSnippet ?? null,
      lastNoteSummary: fan.lastNoteSummary ?? fan.lastNoteSnippet ?? null,
      nextActionSummary: fan.nextActionSummary ?? fan.nextActionSnippet ?? null,
    }));
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

  const fansWithScore: FanData[] = fans.map((fan) => ({
    ...fan,
    priorityScore: typeof fan.priorityScore === "number" ? fan.priorityScore : computePriorityScore(fan),
  }));

  function parseMessageTimestamp(msg: Message): number | null {
    const idParts = (msg.id || "").split("-");
    const last = idParts[idParts.length - 1];
    const num = Number(last);
    if (Number.isFinite(num) && last.length >= 10) return num;
    return null;
  }

  async function updateUnreadCounts(fanList: ConversationListData[], map: UnreadMap) {
    const entries = await Promise.all(
      fanList.map(async (fan) => {
        const lastRead = getLastReadForFan(map, fan.id);
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
      acc[curr.id] = curr.count;
      return acc;
    }, {});

    setFans((prev) =>
      prev.map((fan) => ({
        ...fan,
        unreadCount: byId[fan.id] ?? fan.unreadCount,
      }))
    );
  }

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
  const withNextActionCount = fans.filter((fan) => {
    const na = fan.nextAction;
    return typeof na === "string" && na.trim().length > 0;
  }).length;
  const priorityCount = fans.filter((fan) => (fan as any).isHighPriority === true).length;
  const regularCount = fans.filter((fan) => normalizeTier(fan.customerTier) === "regular").length;
  const newCount = fans.filter((fan) => normalizeTier(fan.customerTier) === "new").length;
  const withExtrasCount = fans.filter((fan) => (fan.extrasCount ?? 0) > 0).length;

  function applyFilter(
    filter: "all" | "today" | "expired",
    onlyNotes = false,
    tier: "all" | "new" | "regular" | "vip" = "all",
    onlyNextAction = false
  ) {
    setFollowUpFilter(filter);
    setShowOnlyWithNotes(onlyNotes);
    setTierFilter(tier);
    setOnlyWithNextAction(onlyNextAction);
  }

  const filteredConversationsList = (search.length > 0 ? fansWithScore.filter(fan => fan.contactName.toLowerCase().includes(search.toLowerCase())) : fansWithScore)
    .filter(fan => (showPriorityOnly ? (fan.priorityScore ?? 0) > 0 : true))
    .filter((fan) => (!showOnlyWithNotes ? true : (fan.notesCount ?? 0) > 0))
    .filter((fan) => (!onlyWithExtras ? true : (fan.extrasCount ?? 0) > 0))
    .filter((fan) => {
      if (!onlyWithNextAction) return true;
      const na = fan.nextAction;
      return typeof na === "string" && na.trim().length > 0;
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
      if (tierFilter === "vip") return fan.isHighPriority === true;
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

  const recommendedFan = getRecommendedFan(fansWithScore);
  const apiFilter = (() => {
    if (showOnlyWithNotes) return "notes";
    if (onlyWithNextAction) return "nextAction";
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

  useEffect(() => {
    setUnreadMap(loadUnreadMap());
    fetchFansPage();
    void refreshExtrasSummary();
  }, [refreshExtrasSummary]);

  async function fetchFansPage(cursor?: string | null, append = false) {
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
  }

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
    const handleExtrasUpdated = () => {
      void refreshExtrasSummary();
    };
    window.addEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated);
    return () => {
      window.removeEventListener("fanDataUpdated", handleFanDataUpdated as EventListener);
      window.removeEventListener("unreadUpdated", handleUnreadUpdated);
      window.removeEventListener(EXTRAS_UPDATED_EVENT, handleExtrasUpdated);
    };
  }, [apiFilter, refreshExtrasSummary, search]);

  useEffect(() => {
    if (fans.length === 0) return;
    updateUnreadCounts(fans, unreadMap);
  }, [fans, unreadMap]);

  useEffect(() => {
    // refetch on filter/search changes
    fetchFansPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFilter, search, showPriorityOnly, followUpFilter, showOnlyWithNotes, tierFilter, onlyWithNextAction, onlyWithExtras]);

  function formatCurrency(value: number) {
    const rounded = Math.round((value ?? 0) * 100) / 100;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)} €`;
  }

  return (
    <div className="flex flex-col w-full md:w-[480px] bg-[#202c33] min-h-[320px] md:h-full" style={{borderRight: "1px solid rgba(134,150,160,0.15)"}}>
      <CreatorSettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <CreatorHeader
        name={config.creatorName}
        role="Creador"
        subtitle={config.creatorSubtitle}
        initial={creatorInitial}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="flex bg-[#111b21] w-full h-max px-3 py-2">
        <div className="relative w-[95%] h-max">
          <div className="absolute text-[#AEBAC1] h-full w-9">
            <svg viewBox="0 0 24 24" width="24" height="24" className="left-[50%] right-[50%] ml-auto mr-auto h-full">
              <path fill="currentColor" d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z">
            </path>
          </svg>
          </div>
          <div className="">
            <input className="w-[96%] h-9 rounded-lg bg-[#202c33] text-white text-sm px-10" placeholder="Buscar o iniciar un nuevo chat" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex w-[5%] h-full items-center justify-center">
          <button
            type="button"
            onClick={() => setShowPriorityOnly((prev) => !prev)}
            className={clsx(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border transition",
              showPriorityOnly
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700"
            )}
            aria-pressed={showPriorityOnly}
            title={showPriorityOnly ? "Mostrar todos los chats" : "Mostrar solo prioritarios"}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" preserveAspectRatio="xMidYMid meet">
              <path fill="currentColor" d="M10 18.1h4v-2h-4v2zm-7-12v2h18v-2H3zm3 7h12v-2H6v2z">
              </path>
            </svg>
          </button>
        </div>
      </div>
      <div className="mb-2 px-3">
        {extrasSummary && (
          <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-300">
            <div className="flex justify-between">
              <span>Extras hoy</span>
              <span className="font-semibold">
                {extrasSummary.today.count} venta{extrasSummary.today.count === 1 ? "" : "s"} · {formatCurrency(extrasSummary.today.amount)}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Últimos 7 días</span>
              <span className="font-semibold text-slate-200">
                {extrasSummary.last7Days.count} venta{extrasSummary.last7Days.count === 1 ? "" : "s"} · {formatCurrency(extrasSummary.last7Days.amount)}
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-300">
          <button
            type="button"
            onClick={() => applyFilter("all", false)}
            className="flex justify-between text-left"
          >
            <span className={clsx("text-slate-400", followUpFilter === "all" && !showOnlyWithNotes && "font-semibold text-amber-300")}>Hoy</span>
            <span className={clsx("font-semibold text-slate-100", followUpFilter === "all" && !showOnlyWithNotes && "text-amber-300")}>
              {totalCount} fan{totalCount === 1 ? "" : "s"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => applyFilter("today", false)}
            className="flex justify-between text-left"
          >
            <span className={clsx(followUpFilter === "today" && !showOnlyWithNotes && "font-semibold text-amber-300")}>Seguimiento hoy</span>
            <span className={clsx(followUpFilter === "today" && !showOnlyWithNotes && "font-semibold text-amber-300")}>{followUpTodayCount}</span>
          </button>
          <button
            type="button"
            onClick={() => applyFilter("expired", false)}
            className="flex justify-between text-left"
          >
            <span className={clsx(followUpFilter === "expired" && !showOnlyWithNotes && "font-semibold text-amber-300")}>Caducados</span>
            <span className={clsx(followUpFilter === "expired" && !showOnlyWithNotes && "font-semibold text-amber-300")}>{expiredCount}</span>
          </button>
          <button
            type="button"
            onClick={() => applyFilter("all", true)}
            className="flex justify-between text-left"
          >
            <span className={clsx(showOnlyWithNotes && "font-semibold text-amber-300")}>Con notas</span>
            <span className={clsx(showOnlyWithNotes && "font-semibold text-amber-300")}>{withNotesCount}</span>
          </button>
          <button
            type="button"
            onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter, !onlyWithNextAction)}
            className="flex justify-between text-left"
          >
            <span className={clsx(onlyWithNextAction && "font-semibold text-amber-300")}>⚡ Con próxima acción</span>
            <span className={clsx(onlyWithNextAction && "font-semibold text-amber-300")}>{withNextActionCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setOnlyWithExtras((prev) => !prev)}
            className="flex justify-between text-left"
          >
            <span className={clsx(onlyWithExtras && "font-semibold text-amber-300")}>
              <span aria-hidden className="mr-1">💰</span>
              Con extras
            </span>
            <span className={clsx(onlyWithExtras && "font-semibold text-amber-300")}>{withExtrasCount}</span>
          </button>
          <button
            type="button"
            onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter === "vip" ? "all" : "vip")}
            className="flex justify-between text-left"
          >
            <span className={clsx(tierFilter === "vip" && "font-semibold text-amber-300")}>🔥 Alta prioridad</span>
            <span className={clsx(tierFilter === "vip" && "font-semibold text-amber-300")}>{priorityCount}</span>
          </button>
          <button
            type="button"
            onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter === "regular" ? "all" : "regular")}
            className="flex justify-between text-left"
          >
            <span className={clsx(tierFilter === "regular" && "font-semibold text-amber-300")}>Habituales</span>
            <span className={clsx(tierFilter === "regular" && "font-semibold text-amber-300")}>{regularCount}</span>
          </button>
          <button
            type="button"
            onClick={() => applyFilter(followUpFilter, showOnlyWithNotes, tierFilter === "new" ? "all" : "new")}
            className="flex justify-between text-left"
          >
            <span className={clsx(tierFilter === "new" && "font-semibold text-amber-300")}>Nuevos</span>
            <span className={clsx(tierFilter === "new" && "font-semibold text-amber-300")}>{newCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowPacksPanel((prev) => !prev)}
            className="flex justify-between text-left"
          >
            <span className={clsx(showPacksPanel && "font-semibold text-amber-300")}>Packs disponibles ({packsCount})</span>
            <span className={clsx(showPacksPanel && "font-semibold text-amber-300")}>⋯</span>
          </button>
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
              onClick={() => setConversation(recommendedFan)}
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
            setOnlyWithNextAction(false);
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
        {!loadingFans && !fansError && filteredConversationsList.map((conversation, index) => {
          return (
            <ConversationList key={conversation.id || index} isFirstConversation={index == 0} data={conversation} />
          )
        })}
        {!loadingFans && !fansError && hasMore && (
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
