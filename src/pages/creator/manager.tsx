import Head from "next/head";
import clsx from "clsx";
import type { GetServerSideProps } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import type { CreatorBusinessSnapshot, CreatorManagerSummary } from "../../lib/creatorManager";
import { getCreatorBusinessSnapshot } from "../../lib/creatorManager";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { getCreatorContentSnapshot } from "../../lib/creatorContentManager";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import type { CreatorPlatforms } from "../../lib/creatorPlatforms";
import { normalizeCreatorPlatforms } from "../../lib/creatorPlatforms";
import SideBar from "../../components/SideBar";
import { CreatorShell } from "../../components/creator/CreatorShell";
import {
  ManagerChatCard,
  type ManagerChatCardHandle,
  type CortexCatalogFans,
  type CortexOverviewData,
  type CortexOverviewFan,
} from "../../components/creator/ManagerChatCard";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { ManagerInsightsPanel } from "../../components/creator/ManagerInsightsPanel";
import type { CatalogItem } from "../../lib/catalog";

type Props = {
  initialSnapshot: CreatorBusinessSnapshot | null;
  initialContentSnapshot: CreatorContentSnapshot | null;
  creatorId?: string;
};

type CreatorDiscoveryProfile = {
  id?: string;
  creatorId?: string;
  isDiscoverable: boolean;
  niches: string[];
  communicationStyle: string;
  limits: string;
  priceMin: number | null;
  priceMax: number | null;
  responseHours: number | null;
  allowLocationMatching: boolean;
  showCountry: boolean;
  showCityApprox: boolean;
  country?: string | null;
  cityApprox?: string | null;
  creatorName?: string;
  avatarUrl?: string | null;
  handle?: string;
};

type ManagerQueueFlags = {
  expiredSoon: boolean;
  expired: boolean;
  atRisk7d: boolean;
  followUpToday: boolean;
  isNew30d: boolean;
};

type ManagerQueueItem = {
  fanId: string;
  handle: string | null;
  displayName: string;
  flags: ManagerQueueFlags;
  nextReason: string;
  expiresInDays?: number | null;
  lastActivityAt: string | null;
  quickNote?: string | null;
  attendedAt?: string | null;
};

type ManagerQueueStats = {
  todayCount: number;
  queueCount: number;
  atRiskCount: number;
  activePacksCount?: number;
  activeExtrasCount?: number;
  revenue7d?: number;
  revenue30d?: number;
  newFans30d?: number;
  fansNew30d?: number;
  archivedCount?: number;
  blockedCount?: number;
};

type ManagerQueueNextAction = {
  fan: ManagerQueueItem | null;
  reason: string | null;
};

type ManagerOverviewResponse = {
  summary: CreatorManagerSummary;
  queue: ManagerQueueItem[];
  stats: ManagerQueueStats;
  top3: ManagerQueueItem[];
  nextAction: ManagerQueueNextAction;
};

type ManagerQueueData = {
  queue: ManagerQueueItem[];
  stats: ManagerQueueStats;
  top3: ManagerQueueItem[];
  nextAction: ManagerQueueNextAction;
};

type InsightsTab = "sales" | "catalog" | "growth";
type SummaryFilter = "today" | "queue" | "pulse" | "catalog" | "expiring" | "risk" | null;

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

export default function CreatorManagerPage(props: Props) {
  const { initialSnapshot, initialContentSnapshot } = props;
  const { config } = useCreatorConfig();
  const [summary, setSummary] = useState<CreatorManagerSummary | null>(null);
  const [queueData, setQueueData] = useState<ManagerQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [advisorInput, setAdvisorInput] = useState<CreatorAiAdvisorInput | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [advisorError, setAdvisorError] = useState(false);
  const [mobileView, setMobileView] = useState<"board" | "chat">("chat");
  const conversationSectionRef = useRef<HTMLDivElement>(null!);
  const chatRef = useRef<ManagerChatCardHandle>(null!);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insightsTab, setInsightsTab] = useState<InsightsTab>("sales");
  const [platforms, setPlatforms] = useState<CreatorPlatforms | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const creatorId = props.creatorId ?? "creator-1";
  const handleOpenSettings = useCallback(() => {
    void router.push("/creator/ai-settings");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) {
      setMobileView("chat");
      conversationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const fetchCatalogItems = useCallback(async () => {
    if (!creatorId) return;
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const res = await fetch(`/api/catalog?creatorId=${encodeURIComponent(creatorId)}`);
      if (!res.ok) throw new Error("Error fetching catalog");
      const data = (await res.json()) as { items: CatalogItem[] };
      setCatalogItems(data.items ?? []);
    } catch (_err) {
      setCatalogError("No se pudo cargar el catálogo.");
    } finally {
      setCatalogLoading(false);
    }
  }, [creatorId]);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/manager/overview");
      if (!res.ok) throw new Error("Error fetching summary");
      const data = (await res.json()) as ManagerOverviewResponse;
      setSummary(data.summary);
      setQueueData({
        queue: data.queue ?? [],
        stats: data.stats ?? { todayCount: 0, queueCount: 0, atRiskCount: 0 },
        top3: data.top3 ?? [],
        nextAction: data.nextAction ?? { fan: null, reason: null },
      });
    } catch (_err) {
      setError("No se pudo cargar el panel del creador.");
    } finally {
      setLoading(false);
    }
    void fetchCatalogItems();
  }, [fetchCatalogItems]);

  const fetchAdvisorInput = useCallback(async () => {
    try {
      setAdvisorLoading(true);
      setAdvisorError(false);
      const res = await fetch("/api/creator/ai-advisor-input");
      if (!res.ok) throw new Error("Error fetching advisor input");
      const data = (await res.json()) as CreatorAiAdvisorInput;
      setAdvisorInput(data);
    } catch (_err) {
      setAdvisorError(true);
      setAdvisorInput(null);
    } finally {
      setAdvisorLoading(false);
    }
  }, []);

  const fetchPlatforms = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/ai-settings");
      if (!res.ok) throw new Error("Error fetching platforms");
      const data = await res.json();
      const normalized = normalizeCreatorPlatforms(data?.settings?.platforms);
      setPlatforms(normalized);
    } catch (_err) {
      setPlatforms(null);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
    void fetchAdvisorInput();
    void fetchPlatforms();
  }, [fetchSummary, fetchAdvisorInput, fetchPlatforms]);

  return (
    <>
      <Head>
        <title>Cortex · NOVSY</title>
      </Head>
      <CreatorShell
        mobileView={mobileView}
        onBackToBoard={() => setMobileView("board")}
        sidebar={<SideBar />}
        showChat
        renderChat={({ onBackToBoard }) => (
          <ManagerChatLayout
            loading={loading}
            error={error}
            summary={summary}
            queueData={queueData}
            setQueueData={setQueueData}
            initialSnapshot={initialSnapshot}
            advisorInput={advisorInput}
            advisorError={advisorError}
            advisorLoading={advisorLoading}
            onBackToBoard={onBackToBoard}
            chatRef={chatRef}
            insightsOpen={insightsOpen}
            insightsTab={insightsTab}
            onCloseInsights={() => setInsightsOpen(false)}
            onOpenInsights={(tab) => {
              setInsightsTab(tab ?? "sales");
              setInsightsOpen(true);
            }}
            onRefreshOverview={fetchSummary}
            onOpenSettings={handleOpenSettings}
            creatorName={config.creatorName || "Creador"}
            creatorSubtitle={config.creatorSubtitle || "Centro de mando del creador"}
            avatarUrl={config.avatarUrl}
            platforms={platforms}
            creatorId={props.creatorId}
            catalogItems={catalogItems}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            setCatalogItems={setCatalogItems}
            onRefreshCatalog={fetchCatalogItems}
          />
        )}
        fallback={<div />}
        conversationSectionRef={conversationSectionRef}
      />
    </>
  );
}

type ManagerChatLayoutProps = {
  loading: boolean;
  error: string;
  summary: CreatorManagerSummary | null;
  queueData: ManagerQueueData | null;
  setQueueData: React.Dispatch<React.SetStateAction<ManagerQueueData | null>>;
  initialSnapshot: CreatorBusinessSnapshot | null;
  advisorInput?: CreatorAiAdvisorInput | null;
  advisorError: boolean;
  advisorLoading: boolean;
  onBackToBoard: () => void;
  chatRef: React.RefObject<ManagerChatCardHandle>;
  insightsOpen: boolean;
  insightsTab: InsightsTab;
  onCloseInsights: () => void;
  onOpenInsights: (tab?: InsightsTab) => void;
  onRefreshOverview: () => Promise<void>;
  onOpenSettings: () => void;
  creatorName: string;
  creatorSubtitle: string;
  avatarUrl?: string | null;
  platforms: CreatorPlatforms | null;
  creatorId?: string;
  catalogItems: CatalogItem[];
  catalogLoading: boolean;
  catalogError: string | null;
  setCatalogItems: React.Dispatch<React.SetStateAction<CatalogItem[]>>;
  onRefreshCatalog: () => Promise<void>;
};

function ManagerChatLayout({
  loading,
  error,
  summary,
  queueData,
  setQueueData,
  initialSnapshot,
  advisorInput,
  advisorError,
  advisorLoading,
  onBackToBoard,
  chatRef,
  insightsOpen,
  insightsTab,
  onCloseInsights,
  onOpenInsights,
  onRefreshOverview,
  onOpenSettings,
  creatorName,
  creatorSubtitle,
  avatarUrl,
  platforms,
  creatorId,
  catalogItems,
  catalogLoading,
  catalogError,
  setCatalogItems,
  onRefreshCatalog,
}: ManagerChatLayoutProps) {
  const router = useRouter();
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"strategy" | "content">("strategy");
  const [soloChat, setSoloChat] = useState(false);
  const [activeFilter, setActiveFilter] = useState<SummaryFilter>(null);
  const [fanPanelOpen, setFanPanelOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteEditingId, setNoteEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSavingId, setNoteSavingId] = useState<string | null>(null);
  const [noteToast, setNoteToast] = useState("");
  const [copiedFanId, setCopiedFanId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [discoveryProfile, setDiscoveryProfile] = useState<CreatorDiscoveryProfile>({
    isDiscoverable: false,
    niches: [],
    communicationStyle: "calido",
    limits: "",
    priceMin: null,
    priceMax: null,
    responseHours: null,
    allowLocationMatching: false,
    showCountry: false,
    showCityApprox: false,
    country: null,
    cityApprox: null,
  });
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const loadDiscoveryProfile = useCallback(async () => {
    try {
      setDiscoveryLoading(true);
      setDiscoveryError(null);
      const res = await fetch("/api/creator/discovery-profile");
      if (!res.ok) throw new Error("Error cargando discovery");
      const data = await res.json();
      setDiscoveryProfile((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error(err);
      setDiscoveryError("No se pudo cargar Discovery.");
    } finally {
      setDiscoveryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscoveryProfile();
  }, [loadDiscoveryProfile]);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!headerMenuRef.current) return;
      if (headerMenuRef.current.contains(event.target as Node)) return;
      setHeaderMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [headerMenuOpen]);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 220);
    return () => {
      window.clearTimeout(handle);
    };
  }, [searchQuery]);
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
      if (noteToastTimerRef.current) {
        clearTimeout(noteToastTimerRef.current);
        noteToastTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!soloChat) return;
    setFanPanelOpen(false);
  }, [soloChat]);
  useEffect(() => {
    if (fanPanelOpen) return;
    setNoteEditingId(null);
    setNoteDraft("");
  }, [fanPanelOpen]);
  useEffect(() => {
    if (!fanPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFanPanelOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [fanPanelOpen]);
  useEffect(() => {
    if (!queueData?.queue) return;
    setNotes((prev) => {
      const next = { ...prev };
      queueData.queue.forEach((item) => {
        if (typeof item.quickNote === "string") {
          next[item.fanId] = item.quickNote;
        } else if (item.quickNote === null) {
          next[item.fanId] = "";
        }
      });
      return next;
    });
  }, [queueData]);
  const quickActions =
    activeTab === "strategy"
      ? ["¿A qué fans priorizo hoy?", "Resúmeme mis números de esta semana", "Dame 1 acción para subir ingresos hoy"]
      : ["Idea de extra para VIP", "CTA a mensual desde contenido", "Plantilla breve para fans en riesgo"];

  const summaryWithLocal = summary;

  const queueStats = queueData?.stats;
  const formatNumber = (value: number) => new Intl.NumberFormat("es-ES").format(value);
  const safeRevenue7 = Number.isFinite(summaryWithLocal?.kpis?.last7?.revenue)
    ? summaryWithLocal?.kpis?.last7?.revenue ?? 0
    : 0;
  const safeRevenue30 = Number.isFinite(summaryWithLocal?.kpis?.last30?.revenue)
    ? summaryWithLocal?.kpis?.last30?.revenue ?? 0
    : 0;
  const safeExtras30Count = Number.isFinite(summaryWithLocal?.kpis?.last30?.extras)
    ? summaryWithLocal?.kpis?.last30?.extras ?? 0
    : 0;
  const extrasBase = summaryWithLocal?.kpis?.extras;
  const tipsBase = summaryWithLocal?.kpis?.tips;
  const giftsBase = summaryWithLocal?.kpis?.gifts;
  const extrasRevenueToday = extrasBase?.today?.revenue ?? 0;
  const extrasCountToday = extrasBase?.today?.count ?? 0;
  const extrasRevenue7 = extrasBase?.last7?.revenue ?? 0;
  const extrasCount7 = extrasBase?.last7?.count ?? 0;
  const extrasRevenue30 = extrasBase?.last30?.revenue ?? 0;
  const extrasCount30 = extrasBase?.last30?.count ?? safeExtras30Count;
  const tipsRevenueToday = tipsBase?.today?.revenue ?? 0;
  const tipsCountToday = tipsBase?.today?.count ?? 0;
  const tipsCount7 = tipsBase?.last7?.count ?? 0;
  const tipsRevenue7 = tipsBase?.last7?.revenue ?? 0;
  const tipsRevenue30 = tipsBase?.last30?.revenue ?? 0;
  const tipsCount30 = tipsBase?.last30?.count ?? 0;
  const giftedTodayCount = giftsBase?.today?.count ?? 0;
  const gifted30Count = giftsBase?.last30?.count ?? 0;
  const safeNewFans30 = Number.isFinite(queueStats?.newFans30d)
    ? queueStats?.newFans30d ?? 0
    : Number.isFinite(queueStats?.fansNew30d)
    ? queueStats?.fansNew30d ?? 0
    : Number.isFinite(summaryWithLocal?.kpis?.last30?.newFans)
    ? summaryWithLocal?.kpis?.last30?.newFans ?? 0
    : 0;
  const safeRiskRevenue = Number.isFinite(summaryWithLocal?.revenueAtRisk7d)
    ? summaryWithLocal?.revenueAtRisk7d ?? 0
    : 0;
  const queueTop3 = useMemo(() => queueData?.top3 ?? [], [queueData]);
  const prioritizedToday = queueStats?.todayCount ?? 0;
  const vipCount = Number.isFinite(summaryWithLocal?.segments?.vip) ? summaryWithLocal?.segments?.vip ?? 0 : 0;
  const atRiskCount = queueStats?.atRiskCount ?? (summaryWithLocal?.segments?.atRisk ?? 0);
  const expiringSoonCount = useMemo(
    () => queueData?.queue?.filter((item) => item.flags.expiredSoon).length ?? 0,
    [queueData]
  );
  const expiringFans = useMemo<CortexOverviewData["expiringFans"]>(() => {
    if (!queueData?.queue) return [];
    return queueData.queue
      .filter(
        (fan) =>
          fan.flags.expired ||
          fan.flags.expiredSoon ||
          (typeof fan.expiresInDays === "number" && fan.expiresInDays <= 7)
      )
      .sort((a, b) => {
        const aDays = typeof a.expiresInDays === "number" ? a.expiresInDays : Number.POSITIVE_INFINITY;
        const bDays = typeof b.expiresInDays === "number" ? b.expiresInDays : Number.POSITIVE_INFINITY;
        return aDays - bDays;
      })
      .slice(0, 5)
      .map((fan) => ({
        fanId: fan.fanId,
        displayName: fan.displayName,
        expiresInDays: fan.expiresInDays ?? null,
        flags: {
          expired: fan.flags.expired,
          expiredSoon: fan.flags.expiredSoon,
          isNew30d: fan.flags.isNew30d,
          atRisk7d: fan.flags.atRisk7d,
        },
      }));
  }, [queueData]);
  const overviewData = useMemo<CortexOverviewData | null>(() => {
    if (!summaryWithLocal && !queueData) return null;
    return {
      metrics: {
        todayCount: queueStats?.todayCount,
        queueCount: queueStats?.queueCount,
        expiringSoonCount,
        atRiskCount,
        revenue7d: safeRevenue7,
        revenue30d: safeRevenue30,
        extras30d: safeExtras30Count,
        extrasRevenueToday: extrasRevenueToday,
        extrasCountToday: extrasCountToday,
        extrasRevenue7d: extrasRevenue7,
        extrasCount7d: extrasCount7,
        extrasRevenue30d: extrasRevenue30,
        extrasCount30d: extrasCount30,
        tipsRevenueToday: tipsRevenueToday,
        tipsCountToday: tipsCountToday,
        tipsRevenue7d: tipsRevenue7,
        tipsCount7d: tipsCount7,
        tipsRevenue30d: tipsRevenue30,
        tipsCount30d: tipsCount30,
        giftedCountToday: giftedTodayCount,
        giftedCount30d: gifted30Count,
        newFans30d: safeNewFans30,
      },
      expiringFans,
    };
  }, [
    summaryWithLocal,
    queueData,
    queueStats?.queueCount,
    queueStats?.todayCount,
    expiringSoonCount,
    atRiskCount,
    safeRevenue7,
    safeRevenue30,
    safeExtras30Count,
    extrasRevenueToday,
    extrasCountToday,
    extrasRevenue7,
    extrasCount7,
    extrasRevenue30,
    extrasCount30,
    tipsRevenueToday,
    tipsCountToday,
    tipsCount7,
    tipsRevenue7,
    tipsRevenue30,
    tipsCount30,
    giftedTodayCount,
    gifted30Count,
    safeNewFans30,
    expiringFans,
  ]);

  const catalogFans = useMemo<CortexCatalogFans>(() => {
    if (!queueData?.queue) return { priority: [], rest: [] };
    const priorityFans = queueData.queue
      .filter((fan) => fan.flags.expired || fan.flags.expiredSoon || fan.flags.atRisk7d)
      .map<CortexOverviewFan>((fan) => ({
        fanId: fan.fanId,
        displayName: fan.displayName,
        expiresInDays: fan.expiresInDays ?? null,
        flags: {
          expired: fan.flags.expired,
          expiredSoon: fan.flags.expiredSoon,
          isNew30d: fan.flags.isNew30d,
          atRisk7d: fan.flags.atRisk7d,
        },
      }))
      .slice(0, 8);
    const priorityIds = new Set(priorityFans.map((fan) => fan.fanId));
    const restFans = queueData.queue
      .filter((fan) => !priorityIds.has(fan.fanId))
      .map<CortexOverviewFan>((fan) => ({
        fanId: fan.fanId,
        displayName: fan.displayName,
        expiresInDays: fan.expiresInDays ?? null,
        flags: {
          expired: fan.flags.expired,
          expiredSoon: fan.flags.expiredSoon,
          isNew30d: fan.flags.isNew30d,
          atRisk7d: fan.flags.atRisk7d,
        },
      }))
      .slice(0, 10);
    return { priority: priorityFans, rest: restFans };
  }, [queueData]);

  const statTiles: Array<{ id: Exclude<SummaryFilter, null>; title: string; value: string; helper: string }> = [
    {
      id: "today",
      title: "Hoy",
      value: `${formatNumber(prioritizedToday)} fans`,
      helper: "Prioridades del día",
    },
    {
      id: "queue",
      title: "Cola",
      value: `${formatNumber(queueStats?.queueCount ?? 0)} fans`,
      helper: "En espera",
    },
    {
      id: "pulse",
      title: "Pulso",
      value: formatCurrency(safeRevenue7),
      helper: `${formatCurrency(safeRiskRevenue)} en riesgo 7d`,
    },
    {
      id: "catalog",
      title: "Catálogo",
      value: `${formatNumber(safeExtras30Count)} extras`,
      helper: "Packs activos · últimas 4 semanas",
    },
  ];

  const topPriorityItems = useMemo(
    () =>
      queueTop3.map((fan, index) => ({
        id: fan.fanId,
        kind: "AT_RISK" as const,
        title: fan.displayName,
        subtitle: fan.nextReason,
        fanId: fan.fanId,
        score: 100 - index,
        primaryAction: { type: "open" as const, label: "Abrir chat" },
      })),
    [queueTop3]
  );
  const statusStats: Array<{ id: Exclude<SummaryFilter, null>; label: string; value: number }> = [
    { id: "today", label: "Hoy", value: prioritizedToday },
    { id: "queue", label: "Cola", value: queueStats?.queueCount ?? 0 },
    { id: "expiring", label: "Caducan pronto", value: expiringSoonCount },
    { id: "risk", label: "En riesgo", value: atRiskCount },
  ];

  const tabHighlights =
    activeTab === "strategy"
      ? [
          { title: "Ingresos 30d", value: formatCurrency(safeRevenue30), helper: "Mes en curso" },
          { title: "Ingresos 7d", value: formatCurrency(safeRevenue7), helper: "Pulso corto" },
          {
            title: "Extras 30d",
            value: formatCurrency(extrasRevenue30),
            helper: "Ventas extras",
          },
          { title: "Fans nuevos 30d", value: `${safeNewFans30}`, helper: "Altas recientes" },
        ]
      : [
          { title: "VIP activos", value: `${vipCount}`, helper: "Mimo + upsell" },
          { title: "En riesgo", value: `${atRiskCount}`, helper: "Caducan pronto" },
          { title: "Packs activos", value: "3", helper: "Bienvenida · Mensual · Especial" },
          { title: "Ideas de extras", value: "En curso", helper: "Activa con el chat" },
        ];
  const filterLabels: Record<Exclude<SummaryFilter, null>, string> = {
    today: "Hoy",
    queue: "Cola",
    pulse: "Pulso",
    catalog: "Catálogo",
    expiring: "Caducan pronto",
    risk: "En riesgo",
  };
  const monthlyActive = summaryWithLocal?.packs?.monthly?.activeFans ?? 0;
  const specialActive = summaryWithLocal?.packs?.special?.activeFans ?? 0;
  const filterHighlights = activeFilter
    ? activeFilter === "pulse"
      ? [
          { title: "Ingresos 7d", value: formatCurrency(safeRevenue7), helper: "Pulso corto" },
          { title: "Ingresos 30d", value: formatCurrency(safeRevenue30), helper: "Mes en curso" },
          { title: "Riesgo 7d", value: formatCurrency(safeRiskRevenue), helper: "Revisar hoy" },
          {
            title: "Extras 30d",
            value: formatCurrency(extrasRevenue30),
            helper: "Ventas extras",
          },
        ]
      : activeFilter === "catalog"
      ? [
          {
            title: "Extras 30d",
            value: formatCurrency(extrasRevenue30),
            helper: "Ventas extras",
          },
          { title: "VIP activos", value: `${vipCount}`, helper: "Upsell" },
          { title: "Mensual activos", value: `${formatNumber(monthlyActive)}`, helper: "Retención" },
          { title: "Especial activos", value: `${formatNumber(specialActive)}`, helper: "Catálogo" },
        ]
      : activeFilter === "expiring"
      ? [
          { title: "Caducan pronto", value: `${formatNumber(expiringSoonCount)}`, helper: "72h" },
          { title: "En riesgo", value: `${formatNumber(atRiskCount)}`, helper: "Seguimiento" },
          { title: "Ingresos 7d", value: formatCurrency(safeRevenue7), helper: "Pulso corto" },
          { title: "Prioridades hoy", value: `${formatNumber(prioritizedToday)}`, helper: "Pendientes" },
        ]
      : activeFilter === "risk"
      ? [
          { title: "En riesgo", value: `${formatNumber(atRiskCount)}`, helper: "Seguimiento" },
          { title: "Riesgo 7d", value: formatCurrency(safeRiskRevenue), helper: "Ingresos" },
          { title: "Caducan pronto", value: `${formatNumber(expiringSoonCount)}`, helper: "72h" },
          { title: "Cola total", value: `${formatNumber(queueStats?.queueCount ?? 0)}`, helper: "En espera" },
        ]
      : [
          { title: "Prioridades hoy", value: `${formatNumber(prioritizedToday)}`, helper: "Pendientes" },
          { title: "Cola total", value: `${formatNumber(queueStats?.queueCount ?? 0)}`, helper: "En espera" },
          { title: "En riesgo", value: `${formatNumber(atRiskCount)}`, helper: "Seguimiento" },
          { title: "Caducan pronto", value: `${formatNumber(expiringSoonCount)}`, helper: "72h" },
        ]
    : tabHighlights;
  const panelFilter: Exclude<SummaryFilter, null> = activeFilter ?? "queue";
  const queueItems = useMemo(() => queueData?.queue ?? [], [queueData]);
  const filteredQueue = useMemo(() => {
    if (queueItems.length === 0) return [];
    switch (panelFilter) {
      case "today":
        return queueItems.filter((item) => item.flags.followUpToday);
      case "queue":
        return queueItems;
      case "expiring":
        return queueItems.filter((item) => item.flags.expiredSoon || item.flags.expired);
      case "risk":
        return queueItems.filter((item) => item.flags.atRisk7d);
      case "pulse":
        return queueItems.filter((item) => item.flags.atRisk7d || item.flags.expiredSoon || item.flags.expired);
      case "catalog":
        return queueItems.filter((item) => item.flags.isNew30d);
      default:
        return queueItems;
    }
  }, [panelFilter, queueItems]);
  const normalizedSearch = debouncedSearch.toLowerCase();
  const visibleQueue = useMemo(() => {
    if (!normalizedSearch) return filteredQueue;
    return filteredQueue.filter((fan) => {
      const haystack = [fan.displayName, fan.handle, fan.nextReason]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [filteredQueue, normalizedSearch]);
  const emptyMessages: Record<Exclude<SummaryFilter, null>, { title: string; detail: string }> = {
    today: { title: "Sin prioridades hoy", detail: "No hay fans marcados para seguimiento inmediato." },
    queue: { title: "Cola vacía", detail: "Tu cola está limpia por ahora." },
    expiring: { title: "Sin caducidades próximas", detail: "Ningún fan caduca en las próximas 72 horas." },
    risk: { title: "Sin fans en riesgo", detail: "Todo estable por ahora." },
    pulse: { title: "Pulso en calma", detail: "No hay alertas activas para ingresos." },
    catalog: { title: "Sin fans de catálogo", detail: "No hay movimientos de catálogo para este filtro." },
  };
  const hasSearch = normalizedSearch.length > 0;
  const panelMeta = hasSearch
    ? { title: "Sin resultados", detail: "Prueba otro nombre o handle." }
    : emptyMessages[panelFilter];
  const panelTitle = filterLabels[panelFilter];
  const isQueueLoading = loading && queueItems.length === 0;
  const formatLastActivity = (value: string | null) => {
    if (!value) return "Sin actividad reciente";
    try {
      return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(new Date(value));
    } catch (_err) {
      return "Sin actividad reciente";
    }
  };
  const isAttendedToday = useCallback((value: string | null | undefined) => {
    if (!value) return false;
    const attendedAt = new Date(value);
    if (Number.isNaN(attendedAt.getTime())) return false;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return attendedAt >= startOfToday;
  }, []);
  const getAttendedAtForFan = useCallback((data: ManagerQueueData | null, fanId: string) => {
    if (!data) return null;
    const queueMatch = data.queue.find((item) => item.fanId === fanId);
    if (queueMatch) return queueMatch.attendedAt ?? null;
    const topMatch = data.top3.find((item) => item.fanId === fanId);
    if (topMatch) return topMatch.attendedAt ?? null;
    if (data.nextAction?.fan?.fanId === fanId) {
      return data.nextAction.fan.attendedAt ?? null;
    }
    return null;
  }, []);
  const updateAttendedInQueue = useCallback(
    (data: ManagerQueueData, fanId: string, attendedAt: string | null) => ({
      ...data,
      queue: data.queue.map((item) => (item.fanId === fanId ? { ...item, attendedAt } : item)),
      top3: data.top3.map((item) => (item.fanId === fanId ? { ...item, attendedAt } : item)),
      nextAction:
        data.nextAction?.fan?.fanId === fanId
          ? { ...data.nextAction, fan: { ...data.nextAction.fan, attendedAt } }
          : data.nextAction,
    }),
    []
  );
  const handleOpenChat = (fanId: string) => {
    if (!fanId) return;
    setFanPanelOpen(false);
    void router.push(`/?fanId=${encodeURIComponent(fanId)}`);
  };
  const getFirstName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    return trimmed.split(" ")[0];
  };
  const buildSuggestedMessage = (fan: ManagerQueueItem) => {
    const name = getFirstName(fan.displayName || "");
    const safeName = name || "allí";
    if (fan.flags.expired) {
      return `Hola ${safeName}, vi que tu acceso terminó.\nSi quieres, lo reactivamos hoy y te preparo algo especial.`;
    }
    if (typeof fan.expiresInDays === "number" && fan.expiresInDays > 0 && fan.expiresInDays <= 7) {
      return `Hola ${safeName}, tu renovación está cerca.\nSi te apetece, lo dejamos listo hoy.`;
    }
    if (fan.flags.isNew30d) {
      return `Hola ${safeName}, bienvenida por aquí.\n¿Qué te apetece ver primero?`;
    }
    return `Hola ${safeName}, ¿cómo estás?\nSi te apetece, te cuento novedades.`;
  };
  const handleSendDraft = (fan: ManagerQueueItem) => {
    if (!fan.fanId) return;
    const draft = buildSuggestedMessage(fan);
    if (!draft.trim()) {
      handleOpenChat(fan.fanId);
      return;
    }
    setFanPanelOpen(false);
    const fanParam = encodeURIComponent(fan.fanId);
    const draftParam = encodeURIComponent(draft);
    void router.push(`/?fanId=${fanParam}&draft=${draftParam}`);
  };
  const toggleAttended = async (fanId: string) => {
    if (!fanId) return;
    const previousAttendedAt = getAttendedAtForFan(queueData, fanId);
    const optimisticAttendedAt = isAttendedToday(previousAttendedAt) ? null : new Date().toISOString();
    setQueueData((prev) => (prev ? updateAttendedInQueue(prev, fanId, optimisticAttendedAt) : prev));
    try {
      const res = await fetch(`/api/fans/${encodeURIComponent(fanId)}/attended`, { method: "PATCH" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error("attended update failed");
      const nextAttendedAt = typeof data.attendedAt === "string" ? data.attendedAt : null;
      setQueueData((prev) => (prev ? updateAttendedInQueue(prev, fanId, nextAttendedAt) : prev));
      await onRefreshOverview();
    } catch (err) {
      console.error("Error updating attended status", err);
      setQueueData((prev) => (prev ? updateAttendedInQueue(prev, fanId, previousAttendedAt) : prev));
    }
  };
  const handleCopyLink = async (fanId: string) => {
    if (!fanId || typeof window === "undefined") return;
    const base = window.location.origin;
    const link = `${base}/?fanId=${encodeURIComponent(fanId)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedFanId(fanId);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedFanId(null);
      }, 1800);
    } catch (_err) {
      setCopiedFanId(null);
    }
  };
  const showNoteToast = (message: string) => {
    setNoteToast(message);
    if (noteToastTimerRef.current) {
      clearTimeout(noteToastTimerRef.current);
    }
    noteToastTimerRef.current = setTimeout(() => setNoteToast(""), 2000);
  };
  const openNoteEditor = (fanId: string, noteText: string) => {
    setNoteEditingId(fanId);
    setNoteDraft(noteText);
  };
  const saveNote = async (fanId: string) => {
    const trimmed = noteDraft.trim();
    const previousNote = notes[fanId] ?? "";
    setNotes((prev) => ({ ...prev, [fanId]: trimmed }));
    setNoteEditingId(null);
    setNoteDraft("");
    try {
      setNoteSavingId(fanId);
      const res = await fetch("/api/fans/quick-note", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId, quickNote: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error("save failed");
      const saved = typeof data.quickNote === "string" ? data.quickNote : "";
      setNotes((prev) => ({ ...prev, [fanId]: saved }));
      showNoteToast("Nota guardada");
    } catch (err) {
      console.error("Error guardando nota rápida", err);
      setNotes((prev) => ({ ...prev, [fanId]: previousNote }));
      showNoteToast("No se pudo guardar la nota");
    } finally {
      setNoteSavingId(null);
    }
  };
  const cancelNote = () => {
    setNoteEditingId(null);
    setNoteDraft("");
  };
  const fanPanelContent = (
    <div className="flex h-full flex-col">
      <div className="lg:hidden flex justify-center py-2">
        <div className="h-1 w-12 rounded-full bg-slate-700/80" />
      </div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Fans · {panelTitle}</p>
          <p className="text-xs text-slate-400">
            {isQueueLoading
              ? "Cargando..."
              : `${visibleQueue.length} ${hasSearch ? "coincidencias" : "resultados"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFanPanelOpen(false)}
          className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-100 hover:border-emerald-500/60"
        >
          ✕
          <span>Cerrar</span>
        </button>
      </div>
      <div className="border-b border-slate-900/70 bg-slate-950/80 px-4 py-3">
        <div className="relative">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar fan..."
            className="w-full rounded-full border border-slate-800 bg-slate-900/70 py-2 pl-3 pr-9 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            aria-label="Buscar fan"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300 hover:text-slate-100"
              aria-label="Limpiar búsqueda"
              title="Limpiar"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {noteToast && (
        <div className="border-b border-slate-900/70 bg-slate-950/80 px-4 py-2 text-[11px] text-emerald-200">
          {noteToast}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isQueueLoading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
            Cargando lista de fans…
          </div>
        ) : visibleQueue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
            <div className="text-sm font-semibold text-slate-100">{panelMeta.title}</div>
            <div className="text-xs text-slate-400">{panelMeta.detail}</div>
          </div>
        ) : (
          visibleQueue.map((fan) => {
            const isAttended = isAttendedToday(fan.attendedAt);
            const expiringLabel = fan.flags.expired
              ? "Caducado"
              : typeof fan.expiresInDays === "number"
              ? `Caduca en ${Math.max(fan.expiresInDays, 0)}d`
              : "Caduca pronto";
            const badgeCandidates = [
              { key: "new", label: "Nuevo", show: fan.flags.isNew30d, tone: "emerald" },
              { key: "risk", label: "En riesgo", show: fan.flags.atRisk7d, tone: "rose" },
              { key: "expiring", label: expiringLabel, show: fan.flags.expiredSoon || fan.flags.expired, tone: "amber" },
              { key: "today", label: "Hoy", show: fan.flags.followUpToday, tone: "sky" },
            ].filter((badge) => badge.show);
            const primaryBadges = badgeCandidates.slice(0, 3);
            const extraBadges = badgeCandidates.slice(3);
            const extraBadgeLabel = extraBadges.map((badge) => badge.label).join(", ");
            const noteValue =
              typeof notes[fan.fanId] === "string" ? notes[fan.fanId] : fan.quickNote ?? "";
            const hasNote = Boolean(noteValue.trim()) || noteEditingId === fan.fanId;
            const badgeToneClass = (tone: string) =>
              tone === "emerald"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                : tone === "rose"
                ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
                : tone === "amber"
                ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                : "border-sky-500/50 bg-sky-500/10 text-sky-100";
            return (
              <div
                key={fan.fanId}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenChat(fan.fanId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleOpenChat(fan.fanId);
                  }
                }}
                className={clsx(
                  "group rounded-xl border border-slate-800 bg-slate-900/70 p-3 transition",
                  "hover:border-slate-700/80 hover:bg-slate-900/80 cursor-pointer",
                  isAttended && "opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className={clsx("truncate text-sm font-semibold text-white", isAttended && "line-through")}>
                          {fan.displayName}
                        </span>
                        {fan.handle && <span className="truncate text-[10px] text-slate-500">@{fan.handle}</span>}
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-500 whitespace-nowrap">
                        Últ. act. {formatLastActivity(fan.lastActivityAt)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">{fan.nextReason}</div>
                    {(primaryBadges.length > 0 || extraBadges.length > 0) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {primaryBadges.map((badge) => (
                          <span
                            key={badge.key}
                            className={clsx(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              badgeToneClass(badge.tone)
                            )}
                          >
                            {badge.label}
                          </span>
                        ))}
                        {extraBadges.length > 0 && (
                          <span
                            title={extraBadgeLabel}
                            className="rounded-full border border-slate-700/70 bg-slate-950/70 px-2 py-0.5 text-[10px] text-slate-300"
                          >
                            +{extraBadges.length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenChat(fan.fanId);
                      }}
                      className="inline-flex h-8 items-center rounded-full border border-emerald-500/60 bg-emerald-600/15 px-3 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-600/25"
                    >
                      Abrir chat
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleAttended(fan.fanId);
                        }}
                        title={isAttended ? "Deshacer atendido" : "Marcar atendido"}
                        aria-label={isAttended ? "Deshacer atendido" : "Marcar atendido"}
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-full border transition",
                          isAttended
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                            : "border-slate-700/70 bg-slate-950/60 text-slate-200 hover:border-slate-500/70 hover:text-white"
                        )}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      {fan.fanId && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCopyLink(fan.fanId);
                          }}
                          title={copiedFanId === fan.fanId ? "Copiado" : "Copiar enlace"}
                          aria-label="Copiar enlace"
                          className={clsx(
                            "flex h-8 w-8 items-center justify-center rounded-full border transition",
                            copiedFanId === fan.fanId
                              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                              : "border-slate-700/70 bg-slate-950/60 text-slate-200 hover:border-slate-500/70 hover:text-white"
                          )}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="10" height="10" rx="2" />
                            <rect x="5" y="5" width="10" height="10" rx="2" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSendDraft(fan);
                        }}
                        title="Enviar borrador"
                        aria-label="Enviar borrador"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/70 bg-slate-950/60 text-slate-200 transition hover:border-slate-500/70 hover:text-white"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 11l18-8-8 18-2-7-8-3z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openNoteEditor(fan.fanId, noteValue);
                        }}
                        title="Nota rápida"
                        aria-label="Nota rápida"
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-full border transition",
                          hasNote
                            ? "border-amber-500/60 bg-amber-500/15 text-amber-100"
                            : "border-slate-700/70 bg-slate-950/60 text-slate-200 hover:border-slate-500/70 hover:text-white"
                        )}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 20h4l10-10-4-4L4 16v4z" />
                          <path d="M14 6l4 4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                {noteEditingId === fan.fanId ? (
                  <div className="mt-2 space-y-2" onClick={(event) => event.stopPropagation()}>
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      placeholder="Nota rápida..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      rows={3}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void saveNote(fan.fanId);
                        }}
                        disabled={noteSavingId === fan.fanId}
                        className="rounded-full border border-emerald-500/60 bg-emerald-600/20 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-600/30"
                      >
                        {noteSavingId === fan.fanId ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          cancelNote();
                        }}
                        className="rounded-full border border-slate-700/70 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-300 hover:text-white"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : noteValue.trim() ? (
                  <div
                    className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-200"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {noteValue}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const handlePrompt = (_tab: "strategy" | "content" | "growth", text: string) => {
    chatRef.current?.setDraft(text);
  };

  const discoverySummary = useMemo(() => {
    const priceRange =
      discoveryProfile.priceMin !== null && discoveryProfile.priceMax !== null
        ? `${discoveryProfile.priceMin}€ - ${discoveryProfile.priceMax}€`
        : discoveryProfile.priceMin !== null
        ? `Desde ${discoveryProfile.priceMin}€`
        : discoveryProfile.priceMax !== null
        ? `Hasta ${discoveryProfile.priceMax}€`
        : "Rango privado";
    const response =
      typeof discoveryProfile.responseHours === "number"
        ? `Resp. ~${discoveryProfile.responseHours}h`
        : "Resp. estándar";
    const tags = discoveryProfile.niches.length > 0 ? discoveryProfile.niches.join(", ") : "Sin tags";
    return {
      visibility: discoveryProfile.isDiscoverable ? "Descubrible" : "Invisible",
      tags,
      priceRange,
      response,
    };
  }, [discoveryProfile]);

  return (
    <div className="flex flex-col flex-1 min-h-0 text-white">
      <div className="flex-1 min-h-0 px-0 md:px-4 md:pb-3">
        <div className="h-full w-full flex flex-col gap-3 md:gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-1.5">
            <div className="space-y-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Cortex</p>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-slate-400/70"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                </svg>
                <span>Cortex</span>
              </h1>
              <p className="text-xs text-slate-400">Centro de mando del creador</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!soloChat && (
                <button
                  type="button"
                  className="h-8 rounded-full border border-slate-700/70 bg-slate-800/60 px-3 text-[11px] font-semibold text-slate-200 hover:border-emerald-500/60"
                  onClick={() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  Ver panel
                </button>
              )}
              <button
                type="button"
                className={clsx(
                  "h-8 rounded-full border px-3 text-[11px] font-semibold transition",
                  soloChat
                    ? "border-slate-700/70 bg-slate-900/60 text-slate-300 hover:text-slate-100"
                    : "border-emerald-500/60 bg-emerald-600/15 text-emerald-100 hover:bg-emerald-600/25"
                )}
                onClick={() => setSoloChat((prev) => !prev)}
              >
                {soloChat ? "Ver panel + tabs" : "Enfocar chat"}
              </button>
              <div className="relative" ref={headerMenuRef}>
                <button
                  type="button"
                  aria-label="Opciones"
                  onClick={() => setHeaderMenuOpen((prev) => !prev)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800/70 text-[10px] font-semibold text-slate-100 hover:border-emerald-500/60"
                >
                  ⋮
                </button>
                {headerMenuOpen && (
                  <div className="absolute right-0 mt-2 w-40 rounded-lg border border-slate-700 bg-slate-900 shadow-lg z-20">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        onOpenInsights("sales");
                      }}
                    >
                      Insights
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        onOpenSettings();
                      }}
                    >
                      Ajustes
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            className={clsx(
              "flex flex-col gap-3 px-4 overflow-hidden transition-[max-height,opacity] duration-200",
              soloChat ? "max-h-0 opacity-0 pointer-events-none" : "max-h-[1200px] opacity-100"
            )}
            ref={summaryRef}
            aria-hidden={soloChat}
          >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statTiles.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveFilter((prev) => (prev === item.id ? null : item.id))}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 shadow-sm flex flex-col gap-1 text-left transition cursor-pointer",
                      activeFilter === item.id
                        ? "border-emerald-500/70 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                        : "border-slate-800 bg-slate-900/70 hover:border-emerald-500/40 hover:bg-slate-900/80"
                    )}
                    aria-pressed={activeFilter === item.id}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">{item.title}</div>
                    <div className="text-xl font-semibold text-white leading-tight">{item.value}</div>
                    <div className="text-xs text-slate-400">{item.helper}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 flex flex-col gap-3">
                {activeFilter && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                      Filtro: {filterLabels[activeFilter]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveFilter(null)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-950/60 px-2 py-0.5 text-[10px] text-slate-300 hover:text-slate-100"
                    >
                      ✕
                      Quitar
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-2 py-1">
                    {[
                      { id: "strategy", label: "Estrategia y números" },
                      { id: "content", label: "Contenido y catálogo" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as "strategy" | "content")}
                        className={clsx(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                          activeTab === tab.id
                            ? "bg-emerald-600/20 text-emerald-100 ring-1 ring-emerald-500/40"
                            : "text-slate-200 hover:text-emerald-100"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {filterHighlights.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 shadow-sm"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">{item.title}</div>
                      <div className="text-lg font-semibold text-white">{item.value}</div>
                      <div className="text-xs text-slate-400">{item.helper}</div>
                    </div>
                  ))}
                </div>

                {activeTab === "content" && !soloChat && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-emerald-300/80">Discovery</p>
                        <p className="text-xs text-slate-400">Ficha del asistente · resumen rápido.</p>
                      </div>
                      <Link href="/creator/bio-link/discovery" legacyBehavior>
                        <a className="inline-flex items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-600/15 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/25">
                          Editar ficha
                        </a>
                      </Link>
                    </div>

                    {discoveryError && <div className="mt-2 text-xs text-rose-300">{discoveryError}</div>}

                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Visibilidad</div>
                        <div className="text-xs font-semibold text-white">
                          {discoveryLoading ? "Cargando..." : discoverySummary.visibility}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Tags</div>
                        <div className="text-xs text-slate-200">
                          {discoveryLoading ? "Cargando..." : discoverySummary.tags}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Precio</div>
                        <div className="text-xs text-slate-200">
                          {discoveryLoading ? "Cargando..." : discoverySummary.priceRange}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Respuesta</div>
                        <div className="text-xs text-slate-200">
                          {discoveryLoading ? "Cargando..." : discoverySummary.response}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          <div className="flex-1 min-h-[560px] px-0 md:px-4 pb-3">
            <div className="relative h-full rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden">
              <ManagerChatCard
                ref={chatRef}
                variant="chat"
                hideTitle
                businessSnapshot={initialSnapshot}
                overviewData={overviewData}
                creatorId={creatorId}
                catalogItems={catalogItems}
                catalogLoading={catalogLoading}
                catalogError={catalogError}
                catalogFans={catalogFans}
                setCatalogItems={setCatalogItems}
                refreshCatalogItems={onRefreshCatalog}
                onBackToBoard={onBackToBoard}
                suggestions={quickActions}
                avatarUrl={avatarUrl || undefined}
                title="Cortex"
                statusText="Chat primero · control total"
                contextContent={
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-[220px]">
                        {statusStats.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveFilter((prev) => (prev === item.id ? null : (item.id as SummaryFilter)))}
                        className={clsx(
                          "flex h-7 items-center justify-between rounded-full border px-2 text-[11px] transition",
                          activeFilter === item.id
                            ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/40"
                            : "border-slate-800 bg-slate-900/70 text-slate-200 hover:border-emerald-500/40"
                        )}
                      >
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{item.label}</span>
                        <span className="font-semibold text-slate-100">{formatNumber(item.value)}</span>
                      </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setFanPanelOpen(true)}
                      className="inline-flex h-8 items-center rounded-full border border-slate-700 bg-slate-800/70 px-3 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
                    >
                      Ver más
                    </button>
                  </div>
                }
                scope="global"
                platforms={platforms}
              />
              {fanPanelOpen && (
                <div className="absolute inset-0 z-20 hidden lg:flex">
                  <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => setFanPanelOpen(false)}
                  />
                  <div className="relative ml-auto h-full w-full max-w-[380px] border-l border-slate-700/80 bg-slate-950/95 shadow-2xl">
                    {fanPanelContent}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {fanPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setFanPanelOpen(false)} />
          <div className="relative w-full max-w-3xl">
            <div className="rounded-t-3xl border border-slate-800 bg-slate-950 shadow-2xl max-h-[85dvh] overflow-hidden">
              {fanPanelContent}
            </div>
          </div>
        </div>
      )}
      <ManagerInsightsPanel
        open={insightsOpen}
        onClose={onCloseInsights}
        summary={summaryWithLocal}
        priorityItems={topPriorityItems}
        preview={advisorInput?.preview}
        onPrompt={handlePrompt}
        initialTab={insightsTab}
      />
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  let initialSnapshot: CreatorBusinessSnapshot | null = null;
  let initialContentSnapshot: CreatorContentSnapshot | null = null;

  try {
    initialSnapshot = await getCreatorBusinessSnapshot(creatorId);
  } catch (err) {
    console.error("Error loading business snapshot for manager chat", err);
    initialSnapshot = null;
  }

  try {
    initialContentSnapshot = await getCreatorContentSnapshot(creatorId);
  } catch (err) {
    console.error("Error loading content snapshot for content manager chat", err);
    initialContentSnapshot = null;
  }

  return {
    props: {
      creatorId,
      initialSnapshot,
      initialContentSnapshot,
    },
  };
};
