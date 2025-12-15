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

  useEffect(() => {
    fetchSummary();
    fetchQueue();
    fetchAdvisorInput();
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
}: ManagerChatLayoutProps) {
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const quickActions = ["Romper el hielo", "Ofrecer un extra", "Llevar a mensual"];

  const statTiles = [
    {
      id: "pulse",
      title: "Ingresos 7d",
      value: formatCurrency(summary?.kpis?.last7?.revenue ?? 0),
      helper: `${formatCurrency(summary?.revenueAtRisk7d ?? 0)} riesgo`,
    },
    {
      id: "revenue30",
      title: "Ingresos 30d",
      value: formatCurrency(summary?.kpis?.last30?.revenue ?? 0),
      helper: "Últimos 30 días",
    },
    {
      id: "vip",
      title: "VIP activos",
      value: String(summary?.segments?.vip ?? 0),
      helper: "Cuida a tus mejores fans",
    },
    {
      id: "risk",
      title: "En riesgo",
      value: String(summary?.atRiskFansCount ?? 0),
      helper: "Caducan pronto",
    },
  ];

  const contextItems = statTiles.slice(0, 4);

  const handlePrompt = (_tab: "strategy" | "content" | "growth", text: string) => {
    chatRef.current?.setDraft(text);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-4 md:px-6 md:py-5 border-b border-[rgba(134,150,160,0.15)] bg-[#0d1720]/90">
        <div className="flex items-center gap-3 min-w-0">
          {avatarUrl ? (
            <div className="w-11 h-11 rounded-full overflow-hidden border border-[rgba(134,150,160,0.2)] bg-[#2a3942] shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={creatorName} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-[#2a3942] text-white font-semibold shadow-md">
              {creatorName.trim().charAt(0) || "M"}
            </div>
          )}
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-base font-semibold text-white truncate">Manager IA</span>
            <span className="text-sm text-slate-300 truncate">{creatorSubtitle || "Panel e insights en tiempo real"}</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenInsights}
            className="rounded-full border border-emerald-500/60 bg-emerald-600/15 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/25"
          >
            Insights
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/creator/edit")}
            className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
          >
            Ajustes
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 px-0 md:px-4 md:pb-4">
        <div className="max-w-6xl xl:max-w-7xl mx-auto h-full w-full">
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
          />
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
