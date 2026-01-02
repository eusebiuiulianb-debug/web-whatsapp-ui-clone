import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { ManagerChatCard } from "./ManagerChatCard";
import type { ManagerChatCardHandle } from "./ManagerChatCard";
import { ContentManagerChatCard } from "./ContentManagerChatCard";
import type { ContentManagerChatCardHandle } from "./ContentManagerChatCard";
import type { CreatorManagerSummary } from "../../lib/creatorManager";
import type { FanManagerRow } from "../../server/manager/managerService";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import { ManagerInsightsPanel } from "./ManagerInsightsPanel";
import { ManagerMobilePanels } from "./ManagerMobilePanels";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setIsDesktop(mq.matches);
      setReady(true);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return { isDesktop, ready };
}

type Props = {
  businessSnapshot: CreatorBusinessSnapshot | null;
  contentSnapshot: CreatorContentSnapshot | null;
  summary: CreatorManagerSummary | null;
  queue: FanManagerRow[];
  queueError?: string;
  advisorInput?: CreatorAiAdvisorInput | null;
  advisorError?: boolean;
  advisorLoading?: boolean;
  onOpenFanChat?: (fanId: string) => void;
  hideChat?: boolean;
  className?: string;
};

type PrimaryTab = "today" | "queue" | "pulse" | "catalog";
type SecondaryTab = "strategy" | "content" | "growth";
type ChipKey = `${PrimaryTab}:${SecondaryTab}`;
type ManagerChip = {
  id: PrimaryTab;
  label: string;
  summary?: string;
};

type DailyPlanStep = {
  id: string;
  label: string;
  description?: string;
  kind: "FANS" | "NEW_FANS" | "PACKS";
  fanId?: string;
};

export function IaWorkspaceCard({
  businessSnapshot,
  contentSnapshot,
  summary,
  queue,
  queueError,
  advisorInput,
  advisorError: _advisorError,
  advisorLoading: _advisorLoading,
  onOpenFanChat,
  hideChat = false,
  className = "",
}: Props) {
  const { isDesktop, ready: viewportReady } = useIsDesktop();
  const showMobileUi = viewportReady && !isDesktop;
  const [activeTab, setActiveTab] = useState<"strategy" | "content" | "growth">("strategy");
  const [panelTab, setPanelTab] = useState<"today" | "queue" | "pulse" | "catalog">("today");
  const [density, setDensity] = useState<"comfortable" | "compact">("compact");
  const [focus, setFocus] = useState<"normal" | "solo_chat">("normal");
  const [showSettings, setShowSettings] = useState(false);
  const [demoDismissed, setDemoDismissed] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"priority" | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ tab: SecondaryTab; text: string } | null>(null);
  const isDemo = !process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  const chatRef = useRef<ManagerChatCardHandle | null>(null);
  const contentChatRef = useRef<ContentManagerChatCardHandle | null>(null);

  const planSteps = useMemo(() => buildDailyPlan({ summary, queue }), [summary, queue]);
  const preview = advisorInput?.preview;
  const topFansRef = useRef<HTMLDivElement | null>(null);
  const contextTabs = useMemo(
    () => [
      { id: "today", label: "Hoy", summary: `${planSteps.length} pasos` },
      { id: "queue", label: "Cola", summary: `${queue.length} en cola` },
      {
        id: "pulse",
        label: "Pulso",
        summary: `${formatCurrency(summary?.kpis?.last7?.revenue ?? 0)} / ${formatCurrency(summary?.revenueAtRisk7d ?? 0)} riesgo`,
      },
      {
        id: "catalog",
        label: "Catálogo",
        summary: `Packs: 3 · Seg: ${(summary?.segments?.newFans ?? 0) + (summary?.segments?.habitual ?? 0) + (summary?.segments?.vip ?? 0)}`,
      },
    ],
    [
      planSteps.length,
      queue.length,
      summary?.kpis?.last7?.revenue,
      summary?.revenueAtRisk7d,
      summary?.segments?.newFans,
      summary?.segments?.habitual,
      summary?.segments?.vip,
    ]
  );

  const sidebarItems = useMemo(
    () => [
      { id: "today", label: `Hoy · ${planSteps.length} pasos`, icon: "🗓️" },
      { id: "queue", label: `Cola · ${queue.length}`, icon: "📥" },
    {
      id: "pulse",
      label: `Pulso · ${formatCurrency(summary?.kpis?.last7?.revenue ?? 0)}`,
      icon: "📊",
    },
    { id: "catalog", label: "Catálogo · 3 packs", icon: "🗂️" },
  ],
  [planSteps.length, queue.length, summary?.kpis?.last7?.revenue]
);

  const quickPromptsByTab: Record<typeof panelTab, string[]> = {
    today: ["¿A quién escribo hoy?", "Dame 3 pasos", "Mensaje para reactivar…"],
    queue: ["Prioriza cola", "Siguiente recomendado", "Quién caduca primero"],
    pulse: ["Resumen 7d", "Riesgos", "Top € por fan"],
    catalog: ["Qué pack empujo", "Huecos de catálogo", "Qué extra falta"],
  };

  const shortcutTemplatesByMode: Record<SecondaryTab, Record<PrimaryTab, string>> = {
    strategy: {
      today: "Resúmeme mis 3 pasos de hoy y dime a quién escribir primero.",
      queue: "¿Quién tengo en cola hoy y qué siguiente paso me recomiendas para cada uno?",
      pulse: "Resúmeme ingresos y riesgo de los últimos 7 días.",
      catalog: "Resumen rápido de catálogo: packs, segmentos y qué se vende mejor.",
    },
    content: {
      today: "¿Qué pack debería promocionar este fin de semana?",
      queue: "¿Qué huecos tengo ahora mismo en el catálogo?",
      pulse: "¿Qué pack nuevo te parece que falta?",
      catalog: "Resumen rápido del catálogo: packs, segmentos y qué se vende mejor.",
    },
    growth: {
      today: "Leer métricas: te paso números y me das diagnóstico.",
      queue: "Dame 3 movimientos concretos para crecer esta semana.",
      pulse: "Dame 10 ideas de contenido alineadas a lo que vendo.",
      catalog: "Riesgos esta semana: qué cortar y qué reforzar.",
    },
  };

  const CHIP_CONFIG: Record<ChipKey, ManagerChip[]> = {
    "today:strategy": [
      { id: "today", label: "Ingresos hoy" },
      { id: "queue", label: "Caducan pronto" },
      { id: "pulse", label: "En riesgo" },
      { id: "catalog", label: "VIP activos" },
    ],
    "today:content": [
      { id: "today", label: "Packs" },
      { id: "queue", label: "Extras" },
      { id: "pulse", label: "Plantillas" },
      { id: "catalog", label: "Assets" },
    ],
    "today:growth": [
      { id: "today", label: "Ideas rápidas" },
      { id: "queue", label: "CTA del día" },
      { id: "pulse", label: "Colaboraciones" },
      { id: "catalog", label: "Story anclado" },
    ],
    "queue:strategy": [
      { id: "today", label: "Seguimientos" },
      { id: "queue", label: "Caducados" },
      { id: "pulse", label: "En riesgo" },
      { id: "catalog", label: "Prioridad alta" },
    ],
    "queue:content": [
      { id: "today", label: "Extras en cola" },
      { id: "queue", label: "Pedidos" },
      { id: "pulse", label: "Plantillas" },
      { id: "catalog", label: "Pendientes" },
    ],
    "queue:growth": [
      { id: "today", label: "Reactivar" },
      { id: "queue", label: "Upsell" },
      { id: "pulse", label: "Oportunidades" },
      { id: "catalog", label: "Abandonos" },
    ],
    "pulse:strategy": [
      { id: "today", label: "MRR" },
      { id: "queue", label: "Churn (30d)" },
      { id: "pulse", label: "ARPPU" },
      { id: "catalog", label: "LTV est." },
    ],
    "pulse:content": [
      { id: "today", label: "Pack top" },
      { id: "queue", label: "Extra top" },
      { id: "pulse", label: "Tiempo resp. medio" },
      { id: "catalog", label: "Satisfacción 👍" },
    ],
    "pulse:growth": [
      { id: "today", label: "Retención (7d)" },
      { id: "queue", label: "Tasa compra (30d)" },
      { id: "pulse", label: "Referidos" },
      { id: "catalog", label: "Embudo" },
    ],
    "catalog:strategy": [
      { id: "today", label: "Precio medio" },
      { id: "queue", label: "Bundles" },
      { id: "pulse", label: "Promos" },
      { id: "catalog", label: "Huecos" },
    ],
    "catalog:content": [
      { id: "today", label: "Packs" },
      { id: "queue", label: "Extras" },
      { id: "pulse", label: "Plantillas" },
      { id: "catalog", label: "Assets" },
    ],
    "catalog:growth": [
      { id: "today", label: "Productos a crear" },
      { id: "queue", label: "Promos" },
      { id: "pulse", label: "A/B copy" },
      { id: "catalog", label: "Campañas" },
    ],
  };

  function getManagerChips(primary: PrimaryTab, secondary: SecondaryTab, summaries: Record<PrimaryTab, string>): ManagerChip[] {
    const key = `${primary}:${secondary}` as ChipKey;
    const chips = CHIP_CONFIG[key] ?? CHIP_CONFIG["today:content"];
    return chips.map((chip) => ({
      ...chip,
      summary: chip.summary ?? summaries[chip.id] ?? "",
    }));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedDensity = window.localStorage.getItem("novsy_density");
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setDensity(storedDensity);
    }
    const storedFocus = window.localStorage.getItem("novsy_focus");
    if (storedFocus === "normal" || storedFocus === "solo_chat") {
      setFocus(storedFocus);
    } else if (storedFocus === "on" || storedFocus === "off") {
      setFocus(storedFocus === "on" ? "solo_chat" : "normal");
    }
    const storedBanner = window.localStorage.getItem("novsy_manager_demo_banner_dismissed");
    if (storedBanner === "1") {
      setDemoDismissed(true);
    }
    const width = window.innerWidth;
    if (width < 768) {
      setFocus("solo_chat");
    }
    const storedTab = window.localStorage.getItem("novsy_manager_tab");
    if (storedTab === "strategy" || storedTab === "content" || storedTab === "growth") {
      setActiveTab(storedTab as typeof activeTab);
    } else if (storedTab === "business") {
      setActiveTab("strategy");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("novsy_density", density);
  }, [density]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("novsy_focus", focus);
  }, [focus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("novsy_manager_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (isDesktop && mobilePanel) {
      setMobilePanel(null);
    }
  }, [isDesktop, mobilePanel]);

  useEffect(() => {
    if (!pendingPrompt) return;
    if (pendingPrompt.tab !== activeTab) return;
    if (pendingPrompt.tab === "strategy") {
      chatRef.current?.setDraft(pendingPrompt.text);
    } else {
      contentChatRef.current?.setDraft(pendingPrompt.text);
    }
    setPendingPrompt(null);
  }, [activeTab, pendingPrompt]);

  function routeToPrompt(tab: SecondaryTab, text: string) {
    setActiveTab(tab);
    setPendingPrompt({ tab, text });
  }

  function handleQuickQuestion(message: string) {
    if (!message) return;
    if (activeTab === "strategy") {
      chatRef.current?.sendQuickPrompt(message);
    } else {
      contentChatRef.current?.sendQuickPrompt(message);
    }
  }

  function handleContextShortcut(tabId: typeof panelTab) {
    setPanelTab(tabId);
    const template = shortcutTemplatesByMode[activeTab]?.[tabId];
    if (!template) return;
    if (activeTab === "strategy") {
      chatRef.current?.setDraft(template);
    } else {
      contentChatRef.current?.setDraft(template);
    }
  }

  function handlePlanStep(step: DailyPlanStep) {
    if (step.kind === "FANS" && step.fanId) {
      onOpenFanChat?.(step.fanId);
      return;
    }
    handleQuickQuestion("Recuérdame mi plan de hoy en 3 pasos.");
  }

  const currentTab = contextTabs.find((tab) => tab.id === panelTab);
  const summaryByTab = contextTabs.reduce<Record<PrimaryTab, string>>(
    (acc, tab) => {
      const key = tab.id as PrimaryTab;
      acc[key] = tab.summary ?? "";
      return acc;
    },
    { today: "", queue: "", pulse: "", catalog: "" }
  );
  const managerChips = getManagerChips(panelTab as PrimaryTab, activeTab as SecondaryTab, summaryByTab);

  const statTiles = [
    {
      id: "pulse",
      title: "Pulso",
      value: formatCurrency(summary?.kpis?.last7?.revenue ?? 0),
      helper: `${formatCurrency(summary?.revenueAtRisk7d ?? 0)} riesgo`,
      description: "Ingresos últimos 7 días / riesgo 7d",
      action: () => {
        setPanelTab("pulse");
      },
    },
    {
      id: "revenue30",
      title: "Ingresos 30d",
      value: formatCurrency(summary?.kpis?.last30?.revenue ?? 0),
      helper: "Últimos 30 días",
      description: "Total facturado en los últimos 30 días",
      action: () => {
        setPanelTab("catalog");
      },
    },
    {
      id: "vip",
      title: "VIP activos",
      value: String(summary?.segments?.vip ?? 0),
      helper: "Cuida a tus mejores fans",
      description: "Fans VIP activos para mimar hoy",
      action: () => handleQuickQuestion("Dame 3 acciones para mis fans VIP."),
    },
    {
      id: "risk",
      title: "En riesgo",
      value: String(summary?.atRiskFansCount ?? 0),
      helper: "Rescata ingresos",
      description: "Fans en riesgo que caducan pronto",
      action: () => handleQuickQuestion("¿Qué fans están en riesgo esta semana y qué les digo?"),
    },
  ];

  return (
    <section
      className={clsx(
        "rounded-2xl border border-slate-800 bg-slate-950/90 shadow-sm flex flex-col gap-4 h-full min-h-0 w-full flex-1",
        density === "compact" ? "p-4 pb-16 md:pb-4" : "p-5 lg:p-6 pb-16 lg:pb-6",
        className
      )}
    >
      <div className="space-y-2 lg:sticky lg:top-0 lg:z-10 lg:bg-slate-950/95 lg:backdrop-blur">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Manager IA</p>
            <h2 className={clsx("font-semibold text-white leading-tight", density === "compact" ? "text-xl" : "text-2xl md:text-3xl")}>
              Chat con tu Manager IA
            </h2>
            <p className={clsx("text-slate-300", density === "compact" ? "text-xs" : "text-sm")}>Resumen de hoy y acciones rápidas.</p>
            <p className={clsx("text-[12px] text-slate-400", density === "compact" ? "leading-tight" : "")}>
              {activeTab === "strategy" && "Pregúntale al Manager IA sobre tus fans y tus ingresos."}
              {activeTab === "content" && "Habla con el Manager IA sobre tus packs, extras y huecos de catálogo."}
              {activeTab === "growth" && "Pega métricas de YouTube/TikTok/Instagram y el Manager IA te propone 3 movimientos."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                focus === "solo_chat" ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100" : "border-slate-700 bg-slate-800/70 text-slate-100"
              )}
              title="Oculta panel lateral y usa solo el chat del Manager IA."
              onClick={() => setFocus((prev) => (prev === "solo_chat" ? "normal" : "solo_chat"))}
            >
              {focus === "solo_chat" ? "Salir de solo chat" : "Solo chat"}
            </button>
            <button
              type="button"
              className="rounded-full border border-emerald-500/60 bg-emerald-600/15 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/25"
              title="Abre el panel lateral con ventas, catálogo y crecimiento."
              onClick={() => setInsightsOpen(true)}
            >
              Insights
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
              title="Configura cómo trabaja tu Manager IA."
              onClick={() => setShowSettings((prev) => !prev)}
            >
              ⚙ Ajustes
            </button>
          </div>
        </div>
        {isDemo && !demoDismissed && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-amber-100 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Modo demo activo</p>
              <p className="text-[12px] text-amber-100/90">Conecta tu OPENAI_API_KEY para respuestas con tus datos reales.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/creator/ai-settings"
                className="rounded-full bg-amber-500/20 px-3 py-1 text-[12px] font-semibold text-amber-50 hover:bg-amber-500/30 border border-amber-400/50"
              >
                Conectar
              </Link>
              <button
                type="button"
                className="text-[12px] text-amber-100 hover:text-amber-50"
                onClick={() => {
                  setDemoDismissed(true);
                  if (typeof window !== "undefined") window.localStorage.setItem("novsy_manager_demo_banner_dismissed", "1");
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {focus === "normal" && (
        <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          {managerChips.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={clsx(
                "rounded-full border px-4 py-2 text-xs font-semibold transition text-left",
                panelTab === tab.id
                  ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
                  : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-100"
              )}
              onClick={() => handleContextShortcut(tab.id as typeof panelTab)}
            >
              <span className="block">{tab.label}</span>
              <span className="text-[11px] text-slate-400 font-normal">{tab.summary}</span>
            </button>
          ))}
        </div>
      )}
      {focus === "solo_chat" && (
        <div className="flex w-full flex-nowrap items-stretch gap-2 overflow-x-auto pb-1">
          {managerChips.map((tab) => (
            <div
              key={tab.id}
              className="min-w-[160px] flex-1 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 shadow-sm"
              onClick={() => handleContextShortcut(tab.id as typeof panelTab)}
              role="button"
              tabIndex={0}
            >
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{tab.label}</div>
              <div className="text-sm font-semibold text-white">{tab.summary}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 min-h-0 flex-1">
        {focus === "normal" && (
          <div className="hidden lg:block">
            <ManagerKpiCards tiles={statTiles} density={density} />
          </div>
        )}

        {focus === "normal" && (
        <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={clsx(
                "rounded-full border px-4 py-2 text-xs font-semibold transition",
                activeTab === "strategy"
                  ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
                  : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-100"
              )}
              onClick={() => setActiveTab("strategy")}
            >
              Estrategia y números
            </button>
            <button
              type="button"
              className={clsx(
                "rounded-full border px-4 py-2 text-xs font-semibold transition",
                activeTab === "content"
                  ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
                  : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-100"
              )}
              onClick={() => setActiveTab("content")}
            >
              Contenido y catálogo
            </button>
            <button
              type="button"
              className={clsx(
                "rounded-full border px-4 py-2 text-xs font-semibold transition",
                activeTab === "growth"
                  ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
                  : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-100"
              )}
              onClick={() => setActiveTab("growth")}
            >
              Crecimiento
            </button>
          </div>
        )}

        {!hideChat && (
          <div className="flex-1 min-h-0">
            <div className={clsx("grid min-h-0 w-full grid-cols-1 gap-4 h-full", focus === "normal" && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
              <div className="flex min-h-0 min-w-0 flex-col gap-3">
                <div
                  className={clsx(
                    "rounded-2xl border border-slate-800 bg-slate-950/85 shadow-inner flex flex-col flex-1 min-h-0 min-w-0",
                    density === "compact" ? "p-3 gap-3" : "p-4 lg:p-5 gap-4"
                  )}
                >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Chat interno</p>
                    <h3 className={clsx("font-semibold text-white", density === "compact" ? "text-base" : "text-lg")}>Manager IA</h3>
                  </div>
                </div>
                  <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 min-h-[360px]">
                    {activeTab === "strategy" ? (
                      <ManagerChatCard
                        ref={chatRef}
                        businessSnapshot={businessSnapshot}
                        hideTitle
                        embedded
                        suggestions={quickPromptsByTab[panelTab]}
                        density={density}
                      />
                    ) : activeTab === "content" ? (
                      <ContentManagerChatCard
                        ref={contentChatRef}
                        initialSnapshot={contentSnapshot ?? undefined}
                        hideTitle
                        embedded
                        mode="CONTENT"
                      />
                    ) : (
                      <ContentManagerChatCard ref={contentChatRef} hideTitle embedded mode="GROWTH" />
                    )}
                  </div>
                </div>
              </div>

              {focus === "normal" && (
                <div className="hidden lg:flex lg:flex-col lg:gap-3 min-w-[320px] lg:sticky lg:top-4" ref={topFansRef}>
                  <TodayPriorityList queue={queue} queueError={queueError} onOpenFanChat={onOpenFanChat} onSendTemplate={handleQuickQuestion} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <div className="relative">
          <div className="absolute right-0 top-0 z-30 w-64 rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-200">Ajustes rápidos</span>
              <button className="text-[11px] text-slate-400 hover:text-slate-200" onClick={() => setShowSettings(false)}>
                Cerrar
              </button>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Densidad</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDensity("comfortable")}
                  className={clsx(
                    "flex-1 rounded-full border px-2 py-1 text-xs",
                    density === "comfortable" ? "border-emerald-500 bg-emerald-600/20 text-emerald-100" : "border-slate-700 bg-slate-800 text-slate-200"
                  )}
                >
                  Cómodo
                </button>
                <button
                  type="button"
                  onClick={() => setDensity("compact")}
                  className={clsx(
                    "flex-1 rounded-full border px-2 py-1 text-xs",
                    density === "compact" ? "border-emerald-500 bg-emerald-600/20 text-emerald-100" : "border-slate-700 bg-slate-800 text-slate-200"
                  )}
                >
                  Compacto
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Focus</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFocus("normal")}
                  className={clsx(
                    "flex-1 rounded-full border px-2 py-1 text-xs",
                    focus === "normal" ? "border-emerald-500 bg-emerald-600/20 text-emerald-100" : "border-slate-700 bg-slate-800 text-slate-200"
                  )}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocus("solo_chat");
                  }}
                  className={clsx(
                    "flex-1 rounded-full border px-2 py-1 text-xs",
                    focus === "solo_chat" ? "border-emerald-500 bg-emerald-600/20 text-emerald-100" : "border-slate-700 bg-slate-800 text-slate-200"
                  )}
                >
                  Solo chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ManagerInsightsPanel
        open={insightsOpen && focus === "normal"}
        onClose={() => setInsightsOpen(false)}
        summary={summary}
        preview={preview}
        onPrompt={(tab, text) => routeToPrompt(tab, text)}
      />
      {focus === "normal" && (showMobileUi || isDesktop) && (
        <div className="fixed bottom-3 left-0 right-0 z-30 px-4 lg:hidden">
          <button
            type="button"
            className="mx-auto flex max-w-3xl flex-1 items-center justify-center gap-2 rounded-full border border-slate-800 bg-slate-950/95 px-4 py-2 text-xs font-semibold text-slate-100 shadow-lg hover:border-emerald-500/60"
            onClick={() => {
              if (isDesktop && topFansRef.current) {
                topFansRef.current.scrollIntoView({ behavior: "smooth" });
              } else {
                setMobilePanel("priority");
              }
            }}
          >
            <span className="text-emerald-300">⚡</span>
            Prioridad ({queue.length})
          </button>
        </div>
      )}
      {showMobileUi && (
        <ManagerMobilePanels
          panel={mobilePanel}
          onClose={() => setMobilePanel(null)}
          priorityContent={<TodayPriorityList queue={queue} queueError={queueError} onOpenFanChat={onOpenFanChat} onSendTemplate={handleQuickQuestion} />}
        />
      )}
    </section>
  );
}

function PlanMini({ steps, onPlanClick }: { steps: DailyPlanStep[]; onPlanClick: (step: DailyPlanStep) => void }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Plan de hoy</p>
          <h4 className="text-lg font-semibold text-white">{steps.length} pasos</h4>
        </div>
        <span className="text-xs text-slate-400">{steps.length} tareas</span>
      </div>
      <ol className="space-y-2">
        {steps.map((step, idx) => (
          <li key={step.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-100">
              {idx + 1}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-50">{step.label}</p>
              {step.description && <p className="text-[12px] text-slate-400">{step.description}</p>}
            </div>
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
              onClick={() => onPlanClick(step)}
            >
              Ir al chat
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function QueueMini({
  queue,
  queueError,
  onOpenFanChat,
}: {
  queue: FanManagerRow[];
  queueError?: string;
  onOpenFanChat?: (fanId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Fans priorizados</p>
          <h4 className="text-lg font-semibold text-white">Cola de hoy</h4>
        </div>
        <span className="text-xs text-slate-400">{queue.length} fans</span>
      </div>
      {queueError && <div className="text-xs text-amber-200">{queueError}</div>}
      {!queueError && queue.length === 0 && <div className="text-xs text-slate-400">Sin datos todavía.</div>}
      {!queueError && queue.length > 0 && (
        <div className="max-h-[220px] overflow-y-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-xs text-slate-200">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wide text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Fan</th>
                <th className="px-3 py-2 text-left">Segmento</th>
                <th className="px-3 py-2 text-left">Health</th>
                <th className="px-3 py-2 text-left">Caduca</th>
              </tr>
            </thead>
            <tbody>
              {queue.slice(0, 6).map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onOpenFanChat?.(row.id)}
                      className="text-left text-slate-50 hover:underline"
                    >
                      {row.displayName}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full border border-slate-700 px-2 py-[2px] text-[11px] uppercase tracking-wide">
                      {row.segment}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold" style={{ color: healthColor(row.riskLevel) }}>
                    {row.healthScore}
                  </td>
                  <td className="px-3 py-2 text-slate-200">{formatExpireShort(row.daysToExpiry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length > 6 && (
            <div className="px-3 py-2 text-[11px] text-slate-400">Mostrando top {Math.min(queue.length, 6)} de {queue.length}.</div>
          )}
        </div>
      )}
    </div>
  );
}

function PulsePanel({
  summary,
  preview,
}: {
  summary: CreatorManagerSummary | null;
  preview?: CreatorAiAdvisorInput["preview"];
}) {
  const extrasRevenue30 = summary?.kpis?.extras?.last30?.revenue ?? 0;
  const metrics = summary
    ? [
        { label: "Ingresos 7d", value: formatCurrency(summary.kpis.last7.revenue) },
        { label: "Ingresos 30d", value: formatCurrency(summary.kpis.last30.revenue) },
        { label: "Extras 30d", value: formatCurrency(extrasRevenue30) },
        { label: "Fans nuevos 30d", value: summary.kpis.last30.newFans },
        {
          label: "Riesgo 7d",
          value: formatCurrency(summary.revenueAtRisk7d ?? 0),
          helper: `${summary.atRiskFansCount ?? 0} fans en riesgo`,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h4 className="text-lg font-semibold text-white">Estado de hoy</h4>
          {preview?.riskLevel && (
            <span className={clsx("inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase", riskBadge(preview.riskLevel))}>
              {preview.riskLevel}
            </span>
          )}
        </div>
        {preview?.headline && <p className="text-sm text-slate-200">{preview.headline}</p>}
        {preview?.summaryLines && (
          <ul className="list-disc list-inside space-y-1 text-[12px] text-slate-300">
            {preview.summaryLines.slice(0, 3).map((line, idx) => (
              <li key={`pulse-line-${idx}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3">
            <div className="text-lg font-semibold text-emerald-100">{metric.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{metric.label}</div>
            {metric.helper && <div className="text-[11px] text-slate-400 mt-1">{metric.helper}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CatalogPanel({ summary }: { summary: CreatorManagerSummary | null }) {
  if (!summary) return null;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <h4 className="text-lg font-semibold text-white">Packs</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
            <div className="text-sm font-semibold">Bienvenida</div>
            <div className="text-xs text-slate-400">Fans activos: {summary.packs.welcome.activeFans}</div>
            <div className="text-xs text-slate-400">Ingresos 30d: {formatCurrency(summary.packs.welcome.revenue30)}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
            <div className="text-sm font-semibold">Mensual</div>
            <div className="text-xs text-slate-400">Fans activos: {summary.packs.monthly.activeFans}</div>
            <div className="text-xs text-slate-400">Renovaciones ≤7d: {summary.packs.monthly.renewalsIn7Days}</div>
            <div className="text-xs text-slate-400">Churn 30d: {summary.packs.monthly.churn30}</div>
            <div className="text-xs text-slate-400">Ingresos 30d: {formatCurrency(summary.packs.monthly.revenue30)}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
            <div className="text-sm font-semibold">Especial</div>
            <div className="text-xs text-slate-400">Fans activos: {summary.packs.special.activeFans}</div>
            <div className="text-xs text-slate-400">Ingresos 30d: {formatCurrency(summary.packs.special.revenue30)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h4 className="text-lg font-semibold text-white">Segmentos</h4>
          <Info
            text={
              "Segmentos\nNOVSY clasifica a tus fans según su salud y su historial de compras.\nSirve para saber con quién hablar antes cuando tienes poco tiempo."
            }
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-200">
          <span className="flex items-center gap-1">Fans nuevos: {summary.segments.newFans}</span>
          <span className="flex items-center gap-1">Habitual: {summary.segments.habitual}</span>
          <span className="flex items-center gap-1">VIP: {summary.segments.vip}</span>
          <span className="flex items-center gap-1">En riesgo: {summary.segments.atRisk}</span>
        </div>
      </div>
    </div>
  );
}

function ManagerKpiCards({
  tiles,
  density,
}: {
  tiles: { id: string; title: string; value: string; helper?: string; action?: () => void; description?: string }[];
  density: "comfortable" | "compact";
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          className={clsx(
            "rounded-xl border border-slate-800 bg-slate-900/70 text-left shadow-sm transition hover:border-emerald-500/50 hover:bg-slate-900",
            density === "compact" ? "p-3" : "p-4"
          )}
          title={
            tile.id === "pulse"
              ? "Pulso: ingresos recientes y riesgo en 7 días."
              : tile.id === "revenue30"
              ? "Ingresos de los últimos 30 días según tu panel."
              : tile.id === "vip"
              ? "VIP activos a cuidar hoy."
              : tile.id === "risk"
              ? "Fans en riesgo para priorizar."
              : undefined
          }
          onClick={() => tile.action?.()}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{tile.title}</div>
              <span className="text-slate-500">●</span>
            </div>
            <div className={clsx("font-semibold text-white", density === "compact" ? "text-base" : "text-lg")}>{tile.value}</div>
            {tile.helper && <div className={clsx("text-slate-400", density === "compact" ? "text-[11px]" : "text-sm")}>{tile.helper}</div>}
            {tile.description && <div className="mt-1 text-xs text-slate-400">{tile.description}</div>}
        </button>
      ))}
    </div>
  );
}

function TodayPriorityList({
  queue,
  queueError,
  onOpenFanChat,
  onSendTemplate,
}: {
  queue: FanManagerRow[];
  queueError?: string;
  onOpenFanChat?: (fanId: string) => void;
  onSendTemplate: (text: string) => void;
}) {
  const top = queue.slice(0, 3);
  const [next, ...rest] = top;
  const renderChip = (label: string, tone: "muted" | "info" | "warning" | "success" = "muted") => {
    const toneClass =
      tone === "info"
        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
        : tone === "warning"
        ? "border-amber-500/60 bg-amber-500/10 text-amber-100"
        : tone === "success"
        ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-50"
        : "border-slate-700 bg-slate-800/70 text-slate-200";
    return (
      <span className={clsx("rounded-full px-2 py-[2px] text-[11px] uppercase tracking-wide border", toneClass)}>
        {label}
      </span>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Prioridad de hoy</p>
          <h4 className="text-lg font-semibold text-white">Top fans</h4>
        </div>
        <span className="text-[11px] text-slate-400">{queue.length} en cola</span>
      </div>
      {queueError && <div className="text-xs text-amber-200">{queueError}</div>}
      {!queueError && !next && <div className="text-sm text-slate-400">Sin fans priorizados por ahora.</div>}

      {!queueError && next && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-3 space-y-2 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-200/80">Siguiente recomendado</p>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-white">{next.displayName}</span>
              </div>
            </div>
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow hover:bg-emerald-500"
              onClick={() => onOpenFanChat?.(next.id)}
            >
              Abrir chat
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renderChip(next.segment, next.segment === "VIP" ? "info" : next.segment === "EN_RIESGO" ? "warning" : "muted")}
            {renderChip(`Salud ${next.healthScore}`, next.healthScore <= 40 ? "warning" : "info")}
            {renderChip(`Caduca ${formatExpireShort(next.daysToExpiry)}`, next.daysToExpiry !== null && next.daysToExpiry <= 2 ? "warning" : "muted")}
          </div>
          <p className="text-[12px] text-slate-300">
            Prioridad alta · {next.segment} · {formatExpireShort(next.daysToExpiry)}
          </p>
        </div>
      )}

      {!queueError &&
        rest.map((fan) => (
          <div
            key={fan.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-white">{fan.displayName}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {renderChip(fan.segment, fan.segment === "VIP" ? "info" : fan.segment === "EN_RIESGO" ? "warning" : "muted")}
                {renderChip(`Salud ${fan.healthScore}`, fan.healthScore <= 40 ? "warning" : "muted")}
                {renderChip(formatExpireShort(fan.daysToExpiry), typeof fan.daysToExpiry === "number" && fan.daysToExpiry <= 2 ? "warning" : "muted")}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                className="rounded-full border border-emerald-500/60 bg-emerald-600/10 px-3 py-1 text-[11px] text-emerald-100 hover:border-emerald-400/60"
                onClick={() => onOpenFanChat?.(fan.id)}
              >
                Abrir
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-[11px] text-slate-100 hover:border-emerald-500/60"
                onClick={() => onSendTemplate(`Dame una plantilla breve para ${fan.displayName}`)}
              >
                Plantilla
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}

function Info({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-300"
      title={text}
    >
      i
    </span>
  );
}

function buildDailyPlan(args: { summary: CreatorManagerSummary | null; queue: FanManagerRow[] }): DailyPlanStep[] {
  const steps: DailyPlanStep[] = [];
  const first = args.queue[0];
  if (first) {
    steps.push({
      id: "main-fan",
      kind: "FANS",
      fanId: first.id,
      label: `Habla hoy con ${first.displayName}`,
      description: `Segmento ${first.segment}, salud ${first.healthScore}. Un mensaje hoy puede evitar que se enfríe.`,
    });
  }

  const newFans = args.summary?.kpis?.last30?.newFans ?? 0;
  steps.push({
    id: "new-fans",
    kind: "NEW_FANS",
    label: newFans > 0 ? `Mima a tus ${newFans} fans nuevos` : "Revisa si hay fans nuevos para darles la bienvenida",
    description:
      newFans > 0
        ? "Envía un mensaje de bienvenida o un contenido sencillo para que sientan que estás cerca."
        : undefined,
  });

  const packMetrics = args.summary?.packs;
  let strongestPackName: string | null = null;
  if (packMetrics) {
    const packEntries = [
      { name: "Bienvenida", revenue: packMetrics.welcome?.revenue30 ?? 0 },
      { name: "Mensual", revenue: packMetrics.monthly?.revenue30 ?? 0 },
      { name: "Especial", revenue: packMetrics.special?.revenue30 ?? 0 },
    ];
    strongestPackName = packEntries.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))[0]?.name ?? null;
  }

  steps.push({
    id: "packs",
    kind: "PACKS",
    label: strongestPackName ? `Empuja el pack "${strongestPackName}" hoy` : "Elige un pack para empujar hoy",
    description: strongestPackName
      ? "Busca 2-3 fans a los que les encaje y menciónalo en el chat."
      : "Define qué pack merece foco esta semana y proponlo en tus chats.",
  });

  return steps.slice(0, 3);
}

function riskBadge(level: string) {
  if (level === "ALTO" || level === "HIGH") return "border border-rose-500/60 bg-rose-500/10 text-rose-200";
  if (level === "MEDIO" || level === "MEDIUM") return "border border-amber-500/60 bg-amber-500/10 text-amber-100";
  return "border border-emerald-500/60 bg-emerald-500/10 text-emerald-100";
}

function healthColor(level: FanManagerRow["riskLevel"]) {
  const normalized = String(level).toUpperCase();
  if (normalized === "HIGH" || normalized === "ALTO") return "#fca5a5";
  if (normalized === "MEDIUM" || normalized === "MEDIO") return "#fcd34d";
  return "#86efac";
}

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

function formatExpireShort(days: number | null | undefined) {
  if (typeof days !== "number") return "—";
  if (days <= 0) return "Hoy";
  if (days === 1) return "1 día";
  return `${Math.round(days)} días`;
}
