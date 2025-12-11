import { useMemo, useState } from "react";
import clsx from "clsx";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { ManagerChatCard } from "./ManagerChatCard";
import { ContentManagerChatCard } from "./ContentManagerChatCard";
import type { CreatorManagerSummary } from "../../lib/creatorManager";
import type { FanManagerRow } from "../../server/manager/managerService";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import { ManagerGlobalSidebarCard } from "./ManagerGlobalSidebarCard";

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
};

export function IaWorkspaceCard({
  businessSnapshot,
  contentSnapshot,
  summary,
  queue,
  queueError,
  advisorInput,
  advisorError,
  advisorLoading,
  onOpenFanChat,
}: Props) {
  const [activeTab, setActiveTab] = useState<"business" | "content">("business");
  const isDemo = !process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  const chips = useMemo(() => {
    if (!businessSnapshot) return [];
    return [
      { label: "Fans nuevos", value: businessSnapshot.newFansLast30Days },
      { label: "En riesgo", value: businessSnapshot.fansAtRisk },
      { label: "VIP activos", value: businessSnapshot.vipActiveCount },
      { label: "Ingresos 30d", value: `${Math.round(businessSnapshot.ingresosUltimos30Dias)} €` },
    ];
  }, [businessSnapshot]);

  const mobileSummary = useMemo(() => {
    if (!summary) return null;
    return {
      ingresos7d: summary.kpis.last7.revenue,
      ingresos30d: summary.kpis.last30.revenue,
      extras30d: summary.kpis.last30.extras,
      newFans30d: summary.kpis.last30.newFans,
    };
  }, [summary]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 lg:p-7 space-y-5">
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-white">Chat con tu Manager IA</h2>
          <p className="text-sm text-slate-300">
            Habla con tu manager de negocio o de contenido. Cambia de pestaña según lo que necesites hoy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.length > 0
            ? chips.map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-100 shadow-sm"
                >
                  <span className="mr-2 text-emerald-200 font-semibold">{chip.value}</span>
                  <span className="uppercase tracking-wide text-slate-400">{chip.label}</span>
                </span>
              ))
            : (
              <span className="text-xs text-slate-500">Cargando resumen...</span>
            )}
        </div>
        {isDemo && (
          <div className="rounded-md border border-amber-500/40 bg-amber-900/40 px-3 py-2 text-[11px] text-amber-100">
            Modo demo: la IA aún no está conectada. Cuando añadas tu OPENAI_API_KEY, el manager responderá usando tus datos en tiempo real.
          </div>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)] lg:gap-6 space-y-4 lg:space-y-0">
        <div className="flex flex-col gap-4 min-h-[520px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={clsx(
                "rounded-full border px-4 py-2 text-xs font-semibold transition",
                activeTab === "business"
                  ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
                  : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-100"
              )}
              onClick={() => setActiveTab("business")}
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
          </div>

          <div className="flex-1 min-h-[260px]">
            {activeTab === "business" ? (
              <ManagerChatCard businessSnapshot={businessSnapshot} hideTitle embedded />
            ) : (
              <ContentManagerChatCard initialSnapshot={contentSnapshot ?? undefined} hideTitle embedded />
            )}
        </div>

        {mobileSummary && (
          <section className="mt-2 flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200 md:hidden">
            <div className="flex flex-col">
              <span className="uppercase tracking-wide text-slate-400">Ingresos 7d</span>
              <span className="font-semibold text-slate-50">{Math.round(mobileSummary.ingresos7d)} €</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="uppercase tracking-wide text-slate-400">Ingresos 30d</span>
              <span className="font-semibold text-slate-50">{Math.round(mobileSummary.ingresos30d)} €</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="uppercase tracking-wide text-slate-400">Extras 30d</span>
              <span className="font-semibold text-slate-50">{mobileSummary.extras30d}</span>
            </div>
          </section>
        )}
      </div>

        <ManagerGlobalSidebarCard
          summary={summary}
          queue={queue}
          queueError={queueError}
          advisorInput={advisorInput ?? undefined}
          advisorError={advisorError}
          advisorLoading={advisorLoading}
          onOpenFanChat={onOpenFanChat}
        />
      </div>
    </section>
  );
}
