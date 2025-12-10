import useSWR from "swr";
import { useEffect } from "react";
import type { FanManagerSummary } from "../../server/manager/managerService";

type Props = {
  fanId: string | null | undefined;
  onSummary?: (summary: FanManagerSummary | null) => void;
  onSuggestionClick?: (text: string) => void;
  hideSuggestions?: boolean;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function FanManagerPanel({ fanId, onSummary, onSuggestionClick, hideSuggestions = false }: Props) {
  const { data, error } = useSWR<FanManagerSummary>(fanId ? `/api/fans/${fanId}/manager` : null, fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (onSummary) {
      onSummary(data ?? null);
    }
  }, [data, onSummary]);

  if (!fanId) return null;
  if (error) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-[11px] text-slate-300">
        No se pudo cargar el contexto de Manager IA.
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-[11px] text-slate-300">
        Cargando contexto…
      </div>
    );
  }

  const riskColor =
    data.riskLevel === "HIGH" ? "text-rose-200" : data.riskLevel === "MEDIUM" ? "text-amber-200" : "text-emerald-200";

  const scoreLabel = data.healthScore ? `${data.segment} · ${data.healthScore}` : data.segment;
  const stageLabel = data.relationshipStage;
  const riskLabel =
    data.riskLevel === "HIGH" ? "Riesgo alto" : data.riskLevel === "MEDIUM" ? "Riesgo medio" : "Riesgo bajo";
  const styleLabel = data.communicationStyle ? `Estilo ${data.communicationStyle}` : null;
  const daysLeftLabel = data.hasActivePack
    ? `${typeof data.daysToExpiry === "number" ? `${data.daysToExpiry} días restantes` : "Con pack activo"}`
    : "Sin pack activo";
  const riskChipClass =
    data.riskLevel === "HIGH"
      ? "border-rose-400/70 bg-rose-500/10 text-rose-100"
      : data.riskLevel === "MEDIUM"
      ? "border-amber-400/70 bg-amber-500/10 text-amber-100"
      : "border-emerald-400/70 bg-emerald-500/10 text-emerald-100";

  return (
    <div className="rounded-2xl bg-slate-950/60 border border-slate-800 px-4 py-3 md:px-5 md:py-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-sm md:text-base font-semibold text-slate-50">Manager IA</span>
          {scoreLabel && (
            <span className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/5 px-3 py-0.5 text-xs md:text-sm font-medium text-emerald-300">
              {scoreLabel}
            </span>
          )}
          {stageLabel && (
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-0.5 text-xs md:text-sm text-slate-100">
              {stageLabel}
            </span>
          )}
          {riskLabel && (
            <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs md:text-sm font-medium ${riskChipClass}`}>
              {riskLabel}
            </span>
          )}
          {styleLabel && (
            <span className="inline-flex items-center rounded-full border border-sky-500/60 bg-sky-500/5 px-3 py-0.5 text-xs md:text-sm text-sky-200">
              {styleLabel}
            </span>
          )}
          {daysLeftLabel && (
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-0.5 text-xs md:text-sm text-slate-200">
              {daysLeftLabel}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 text-sm md:text-base text-slate-200">
        {data.priorityReason && <div className="text-slate-200/90">{data.priorityReason}</div>}
        {data.objectiveToday && (
          <div className="font-medium text-slate-100">
            <span className="text-slate-300">Objetivo hoy: </span>
            {data.objectiveToday}
          </div>
        )}
        {data.lastTopic && <div className="text-slate-300">Último tema: {data.lastTopic}</div>}
        {data.personalizationHints && (
          <div className="text-xs md:text-sm text-amber-200">{data.personalizationHints}</div>
        )}
      </div>

      {data.summary && (
        <div className="mt-1 space-y-1.5 text-sm md:text-base text-slate-200">
          <div className="font-semibold text-slate-100">Resumen del vínculo</div>
          {data.summary.profile && <div>• {data.summary.profile}</div>}
          {data.summary.recent && <div>• {data.summary.recent}</div>}
          {data.summary.opportunity && <div>• {data.summary.opportunity}</div>}
        </div>
      )}

      {!hideSuggestions && data.messageSuggestions && data.messageSuggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs md:text-sm font-semibold text-slate-200 uppercase tracking-wide">
            Sugerencias del Manager
          </div>
          <div className="mt-1 flex flex-wrap gap-3">
            {data.messageSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full md:w-auto inline-flex items-center justify-center rounded-full border border-emerald-500/70 bg-transparent px-5 md:px-6 py-2.5 text-sm md:text-base font-medium text-emerald-300 hover:bg-emerald-500/10 transition"
                onClick={() => {
                  if (onSuggestionClick) onSuggestionClick(s.text);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
