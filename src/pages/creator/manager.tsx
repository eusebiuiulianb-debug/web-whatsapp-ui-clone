import Head from "next/head";
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
import { ManagerChatCard, ManagerChatCardHandle } from "../../components/creator/ManagerChatCard";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { ManagerInsightsPanel } from "../../components/creator/ManagerInsightsPanel";

type Props = {
  initialSnapshot: CreatorBusinessSnapshot | null;
  initialContentSnapshot: CreatorContentSnapshot | null;
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

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

export default function CreatorManagerPage({ initialSnapshot, initialContentSnapshot }: Props) {
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
  const handleOpenSettings = useCallback(() => {
    void router.push("/creator/ai-settings");
  }, [router]);

  useEffect(() => {
    fetchSummary();
    fetchAdvisorInput();
    fetchPlatforms();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) {
      setMobileView("chat");
      conversationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  async function fetchSummary() {
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
  }

  async function fetchAdvisorInput() {
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
  }

  async function fetchPlatforms() {
    try {
      const res = await fetch("/api/creator/ai-settings");
      if (!res.ok) throw new Error("Error fetching platforms");
      const data = await res.json();
      const normalized = normalizeCreatorPlatforms(data?.settings?.platforms);
      setPlatforms(normalized);
    } catch (_err) {
      setPlatforms(null);
    }
  }

  return (
    <>
      <Head>
        <title>Panel del creador · NOVSY</title>
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
            onOpenSettings={handleOpenSettings}
            creatorName={config.creatorName || "Creador"}
            creatorSubtitle={config.creatorSubtitle || "Panel e insights en tiempo real"}
            avatarUrl={config.avatarUrl}
            platforms={platforms}
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
  onOpenSettings: () => void;
  creatorName: string;
  creatorSubtitle: string;
  avatarUrl?: string | null;
  platforms: CreatorPlatforms | null;
};

function ManagerChatLayout({
  loading,
  error,
  summary,
  queueData,
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
  onOpenSettings,
  creatorName,
  creatorSubtitle,
  avatarUrl,
  platforms,
}: ManagerChatLayoutProps) {
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"strategy" | "content">("strategy");
  const [soloChat, setSoloChat] = useState(false);
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
  const quickActions =
    activeTab === "strategy"
      ? ["¿A qué fans priorizo hoy?", "Resúmeme mis números de esta semana", "Dame 1 acción para subir ingresos hoy"]
      : ["Idea de extra para VIP", "CTA a mensual desde contenido", "Plantilla breve para fans en riesgo"];

  const queueStats = queueData?.stats;
  const formatNumber = (value: number) => new Intl.NumberFormat("es-ES").format(value);
  const safeRevenue7 = Number.isFinite(summary?.kpis?.last7?.revenue) ? summary?.kpis?.last7?.revenue ?? 0 : 0;
  const safeRevenue30 = Number.isFinite(summary?.kpis?.last30?.revenue) ? summary?.kpis?.last30?.revenue ?? 0 : 0;
  const safeExtras30 = Number.isFinite(summary?.kpis?.last30?.extras) ? summary?.kpis?.last30?.extras ?? 0 : 0;
  const safeNewFans30 = Number.isFinite(queueStats?.newFans30d)
    ? queueStats?.newFans30d ?? 0
    : Number.isFinite(queueStats?.fansNew30d)
    ? queueStats?.fansNew30d ?? 0
    : Number.isFinite(summary?.kpis?.last30?.newFans)
    ? summary?.kpis?.last30?.newFans ?? 0
    : 0;
  const safeRiskRevenue = Number.isFinite(summary?.revenueAtRisk7d) ? summary?.revenueAtRisk7d ?? 0 : 0;
  const queueTop3 = useMemo(() => queueData?.top3 ?? [], [queueData]);
  const prioritizedToday = queueStats?.todayCount ?? 0;
  const vipCount = Number.isFinite(summary?.segments?.vip) ? summary?.segments?.vip ?? 0 : 0;
  const atRiskCount = queueStats?.atRiskCount ?? (summary?.segments?.atRisk ?? 0);
  const expiringSoonCount = useMemo(
    () => queueData?.queue?.filter((item) => item.flags.expiredSoon).length ?? 0,
    [queueData]
  );

  const statTiles = [
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
      value: `${formatNumber(safeExtras30)} extras`,
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
  const statusStats = [
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
          { title: "Extras 30d", value: `${safeExtras30}`, helper: "Ventas de catálogo" },
          { title: "Fans nuevos 30d", value: `${safeNewFans30}`, helper: "Altas recientes" },
        ]
      : [
          { title: "VIP activos", value: `${vipCount}`, helper: "Mimo + upsell" },
          { title: "En riesgo", value: `${atRiskCount}`, helper: "Caducan pronto" },
          { title: "Packs activos", value: "3", helper: "Bienvenida · Mensual · Especial" },
          { title: "Ideas de extras", value: "En curso", helper: "Activa con el chat" },
        ];

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
        <div className="max-w-6xl xl:max-w-7xl mx-auto h-full w-full flex flex-col gap-3 md:gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Panel del creador</p>
              <h1 className="text-2xl font-semibold text-white">Manager IA</h1>
              <p className="text-sm text-slate-400">Chat ancho con pulsos clave y catálogo sin columnas estrechas.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!soloChat && (
                <button
                  type="button"
                  className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
                  onClick={() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  Ir a tarjetas
                </button>
              )}
              <button
                type="button"
                className="rounded-full border border-emerald-500/60 bg-emerald-600/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/25"
                onClick={() => setSoloChat((prev) => !prev)}
              >
                {soloChat ? "Ver panel + tabs" : "Solo chat"}
              </button>
              <div className="relative" ref={headerMenuRef}>
                <button
                  type="button"
                  aria-label="Opciones"
                  onClick={() => setHeaderMenuOpen((prev) => !prev)}
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-2 text-[11px] font-semibold text-slate-100 hover:border-emerald-500/60"
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

          {!soloChat && (
            <div className="flex flex-col gap-3 px-4" ref={summaryRef}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statTiles.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 shadow-sm flex flex-col gap-1"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">{item.title}</div>
                    <div className="text-xl font-semibold text-white leading-tight">{item.value}</div>
                    <div className="text-xs text-slate-400">{item.helper}</div>
                  </div>
                ))}
              </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "strategy", label: "Estrategia y números" },
                { id: "content", label: "Contenido y catálogo" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as "strategy" | "content")}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        activeTab === tab.id
                          ? "border-emerald-500/70 bg-emerald-600/20 text-emerald-100"
                          : "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Modo amplio · sin columnas estrechas</span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {tabHighlights.map((item) => (
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
                <div className="mt-4 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">Discovery</p>
                      <h3 className="text-lg font-semibold text-white">Ficha para el asistente de fans</h3>
                      <p className="text-sm text-slate-400">
                        Resumen rapido de tu ficha. Edita los detalles desde Bio-link.
                      </p>
                    </div>
                    <Link href="/creator/bio-link/discovery" legacyBehavior>
                      <a className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
                        Editar ficha Discovery
                      </a>
                    </Link>
                  </div>

                  {discoveryError && <div className="text-sm text-rose-300">{discoveryError}</div>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Visibilidad</div>
                      <div className="text-sm font-semibold text-white">
                        {discoveryLoading ? "Cargando..." : discoverySummary.visibility}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Tags</div>
                      <div className="text-sm text-slate-200">
                        {discoveryLoading ? "Cargando..." : discoverySummary.tags}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Precio</div>
                      <div className="text-sm text-slate-200">
                        {discoveryLoading ? "Cargando..." : discoverySummary.priceRange}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Tiempo de respuesta</div>
                      <div className="text-sm text-slate-200">
                        {discoveryLoading ? "Cargando..." : discoverySummary.response}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-[560px] px-0 md:px-4 pb-3">
            <div className="h-full rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
              <ManagerChatCard
                ref={chatRef}
                variant="chat"
                hideTitle
                businessSnapshot={initialSnapshot}
                onBackToBoard={onBackToBoard}
                suggestions={quickActions}
                avatarUrl={avatarUrl || undefined}
                title="Manager IA"
                statusText="Panel e insights en tiempo real"
                contextContent={
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-[220px]">
                      {statusStats.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200"
                        >
                          <span className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</span>
                          <span className="font-semibold text-slate-100">{formatNumber(item.value)}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenInsights("sales")}
                      className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
                    >
                      Ver más
                    </button>
                  </div>
                }
                scope="global"
                platforms={platforms}
              />
            </div>
          </div>
        </div>
      </div>
      <ManagerInsightsPanel
        open={insightsOpen}
        onClose={onCloseInsights}
        summary={summary}
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
      initialSnapshot,
      initialContentSnapshot,
    },
  };
};
