import useSWR from "swr";
import { useEffect } from "react";
import type { FanManagerSummary } from "../../server/manager/managerService";

type Props = {
  fanId: string | null | undefined;
  onSummary?: (summary: FanManagerSummary | null) => void;
  onSuggestionClick?: (text: string) => void;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function FanManagerPanel({ fanId, onSummary, onSuggestionClick }: Props) {
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

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-[11px] text-slate-200 space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Manager IA</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-[2px] text-[10px] uppercase tracking-wide">
          {data.segment}
          <span className={riskColor}>{data.healthScore}</span>
        </span>
      </div>
      <div className="flex items-center justify-between text-slate-300">
        <span>Caduca</span>
        <span>{data.hasActivePack ? data.daysToExpiry ?? "—" : "Sin pack activo"}</span>
      </div>
      <div className="text-slate-200">{data.priorityReason}</div>
      <div className="text-slate-300">
        Objetivo hoy: {data.objectiveToday || mapActionToGoal(data.nextBestAction)}
      </div>
      {data.messageSuggestions && data.messageSuggestions.length > 0 && (
        <div className="pt-1 space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Sugerencias del Manager</div>
          <div className="flex flex-wrap gap-1">
            {data.messageSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-[2px] text-[10px] text-emerald-100 hover:bg-emerald-500/20 transition"
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

function mapActionToGoal(action: FanManagerSummary["nextBestAction"]): string {
  if (action === "RENOVAR_PACK") return "Renovar el pack sin sonar agresivo.";
  if (action === "CUIDAR_VIP") return "Reforzar vínculo y hacerle sentir trato VIP.";
  if (action === "BIENVENIDA") return "Darle la bienvenida y entender qué busca.";
  if (action === "REACTIVAR_DORMIDO") return "Ver si sigue interesado sin presionar.";
  if (action === "OFRECER_EXTRA") return "Ofrecer un extra alineado con lo que ya te compró.";
  return "No hay nada urgente; sigue el flujo normal.";
}
