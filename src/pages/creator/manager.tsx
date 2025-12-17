import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import type { CreatorBusinessSnapshot, CreatorManagerSummary } from "../../lib/creatorManager";
import { getCreatorBusinessSnapshot } from "../../lib/creatorManager";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { getCreatorContentSnapshot } from "../../lib/creatorContentManager";
import type { FanManagerRow } from "../../server/manager/managerService";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import type { CreatorPlatforms } from "../../lib/creatorPlatforms";
import { normalizeCreatorPlatforms } from "../../lib/creatorPlatforms";
import { openCreatorChat } from "../../lib/navigation/openCreatorChat";
import SideBar from "../../components/SideBar";
import { CreatorShell } from "../../components/creator/CreatorShell";
import { ManagerChatCard, ManagerChatCardHandle } from "../../components/creator/ManagerChatCard";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { ManagerInsightsPanel } from "../../components/creator/ManagerInsightsPanel";

type Props = {
  initialSnapshot: CreatorBusinessSnapshot | null;
  initialContentSnapshot: CreatorContentSnapshot | null;
};

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

export default function CreatorManagerPage({ initialSnapshot, initialContentSnapshot }: Props) {
  const { config } = useCreatorConfig();
  const [summary, setSummary] = useState<CreatorManagerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [queue, setQueue] = useState<FanManagerRow[]>([]);
  const [queueError, setQueueError] = useState("");
  const [advisorInput, setAdvisorInput] = useState<CreatorAiAdvisorInput | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [advisorError, setAdvisorError] = useState(false);
  const [mobileView, setMobileView] = useState<"board" | "chat">("chat");
  const conversationSectionRef = useRef<HTMLDivElement>(null!);
  const chatRef = useRef<ManagerChatCardHandle>(null!);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [platforms, setPlatforms] = useState<CreatorPlatforms | null>(null);

  useEffect(() => {
    fetchSummary();
    fetchQueue();
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
      const data = (await res.json()) as any;
      setSummary(data as CreatorManagerSummary);
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

  async function fetchQueue() {
    try {
      setQueueError("");
      const res = await fetch("/api/manager/queue");
      if (!res.ok) throw new Error("Error fetching queue");
      const data = (await res.json()) as FanManagerRow[];
      setQueue(data);
    } catch (_err) {
      setQueueError("No se pudo cargar la cola de fans.");
      setQueue([]);
    }
  }

  function handleOpenFanChat(fanId: string) {
    if (!fanId) return;
    openCreatorChat(router, fanId);
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
            initialSnapshot={initialSnapshot}
            queue={queue}
            queueError={queueError}
            advisorInput={advisorInput}
            advisorError={advisorError}
            advisorLoading={advisorLoading}
            onOpenFanChat={handleOpenFanChat}
            onBackToBoard={onBackToBoard}
            chatRef={chatRef}
            insightsOpen={insightsOpen}
            onCloseInsights={() => setInsightsOpen(false)}
            onOpenInsights={() => setInsightsOpen(true)}
            contextOpen={contextOpen}
            onToggleContext={() => setContextOpen((prev) => !prev)}
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
  initialSnapshot: CreatorBusinessSnapshot | null;
  queue: FanManagerRow[];
  queueError: string;
  advisorInput?: CreatorAiAdvisorInput | null;
  advisorError: boolean;
  advisorLoading: boolean;
  onOpenFanChat: (fanId: string) => void;
  onBackToBoard: () => void;
  chatRef: React.RefObject<ManagerChatCardHandle>;
  insightsOpen: boolean;
  onCloseInsights: () => void;
  onOpenInsights: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
  creatorName: string;
  creatorSubtitle: string;
  avatarUrl?: string | null;
  platforms: CreatorPlatforms | null;
};

function ManagerChatLayout({
  loading,
  error,
  summary,
  initialSnapshot,
  queue,
  queueError,
  advisorInput,
  advisorError,
  advisorLoading,
  onOpenFanChat,
  onBackToBoard,
  chatRef,
  insightsOpen,
  onCloseInsights,
  onOpenInsights,
  contextOpen,
  onToggleContext,
  creatorName,
  creatorSubtitle,
  avatarUrl,
  platforms,
}: ManagerChatLayoutProps) {
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"strategy" | "content">("strategy");
  const [soloChat, setSoloChat] = useState(false);
  const quickActions =
    activeTab === "strategy"
      ? ["¿A qué fans priorizo hoy?", "Resúmeme mis números de esta semana", "Dame 1 acción para subir ingresos hoy"]
      : ["Idea de extra para VIP", "CTA a mensual desde contenido", "Plantilla breve para fans en riesgo"];

  const formatNumber = (value: number) => new Intl.NumberFormat("es-ES").format(value);
  const safeRevenue7 = Number.isFinite(summary?.kpis?.last7?.revenue) ? summary?.kpis?.last7?.revenue ?? 0 : 0;
  const safeRevenue30 = Number.isFinite(summary?.kpis?.last30?.revenue) ? summary?.kpis?.last30?.revenue ?? 0 : 0;
  const safeExtras30 = Number.isFinite(summary?.kpis?.last30?.extras) ? summary?.kpis?.last30?.extras ?? 0 : 0;
  const safeNewFans30 = Number.isFinite(summary?.kpis?.last30?.newFans) ? summary?.kpis?.last30?.newFans ?? 0 : 0;
  const safeRiskRevenue = Number.isFinite(summary?.revenueAtRisk7d) ? summary?.revenueAtRisk7d ?? 0 : 0;
  const prioritizedToday = initialSnapshot?.prioritizedFansToday?.length ?? 0;
  const vipCount = Number.isFinite(summary?.segments?.vip) ? summary?.segments?.vip ?? 0 : 0;
  const atRiskCount = Number.isFinite(summary?.segments?.atRisk) ? summary?.segments?.atRisk ?? 0 : 0;

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
      value: `${formatNumber(queue.length)} fans`,
      helper: queueError || "En espera",
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

  const contextItems = statTiles.slice(0, 4);

  const handlePrompt = (_tab: "strategy" | "content" | "growth", text: string) => {
    chatRef.current?.setDraft(text);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 text-white">
      <div className="flex-1 min-h-0 px-0 md:px-4 md:pb-4">
        <div className="max-w-6xl xl:max-w-7xl mx-auto h-full w-full flex flex-col gap-4 md:gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
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
            </div>
          )}

          <div className="flex-1 min-h-[560px] px-0 md:px-4 pb-4">
            <div className="h-full rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
              <ManagerChatCard
                ref={chatRef}
                variant="chat"
                businessSnapshot={initialSnapshot}
                onBackToBoard={onBackToBoard}
                onShowSummary={() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                suggestions={quickActions}
                avatarUrl={avatarUrl || undefined}
                title="Manager IA"
                statusText="Panel e insights en tiempo real"
                onOpenInsights={onOpenInsights}
                onOpenSettings={() => window.location.assign("/creator/edit")}
                contextContent={
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={onToggleContext}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
                    >
                      Contexto
                      <span className="text-[11px] text-slate-400">{contextOpen ? "Ocultar" : "Ver más"}</span>
                    </button>
                    {contextOpen && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {contextItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3 shadow-sm"
                          >
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">{item.title}</div>
                            <div className="text-lg font-semibold text-white">{item.value}</div>
                            <div className="text-xs text-slate-400">{item.helper}</div>
                          </div>
                        ))}
                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3 shadow-sm">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">Cola</div>
                          <div className="text-lg font-semibold text-white">{queue.length} fans</div>
                          <div className="text-xs text-slate-400">{queueError || "Hoy"}</div>
                        </div>
                      </div>
                    )}
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
        preview={advisorInput?.preview}
        onPrompt={handlePrompt}
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
