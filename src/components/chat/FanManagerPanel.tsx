import useSWR from "swr";
import { useEffect } from "react";
import clsx from "clsx";
import type { FanManagerSummary } from "../../server/manager/managerService";
import type { FanManagerChip, FanManagerState, FanTone, ManagerObjective } from "../../types/manager";

function formatObjectiveLabel(objective?: ManagerObjective | null) {
  switch (objective) {
    case "bienvenida":
      return "Bienvenida";
    case "romper_hielo":
      return "Romper el hielo";
    case "reactivar_fan_frio":
      return "Reactivar fan frío";
    case "ofrecer_extra":
      return "Ofrecer un extra";
    case "llevar_a_mensual":
      return "Llevar a mensual";
    case "renovacion":
      return "Renovación";
    default:
      return null;
  }
}

type Props = {
  fanId: string | null | undefined;
  onSummary?: (summary: FanManagerSummary | null) => void;
  onSuggestionClick?: (text: string) => void;
  hideSuggestions?: boolean;
  headline?: string | null;
  chips?: FanManagerChip[];
  fanManagerState?: FanManagerState | null;
  suggestedObjective?: ManagerObjective | null;
  tone?: FanTone;
  onChangeTone?: (tone: FanTone) => void;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function FanManagerPanel({
  fanId,
  onSummary,
  onSuggestionClick,
  hideSuggestions = false,
  headline,
  chips,
  fanManagerState,
  suggestedObjective,
  tone,
  onChangeTone,
}: Props) {
  const { data, error } = useSWR<FanManagerSummary>(fanId ? `/api/fans/${fanId}/manager` : null, fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (onSummary) {
      onSummary(data ?? null);
    }
  }, [data, onSummary]);

  if (!fanId) return null;

  const isLoading = !data && !error;
  const toneClass = (tone?: FanManagerChip["tone"]) =>
    tone === "danger"
      ? "border-rose-400/70 bg-rose-500/10 text-rose-100"
      : tone === "warning"
      ? "border-amber-400/70 bg-amber-500/10 text-amber-100"
      : tone === "success"
      ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
      : tone === "info"
      ? "border-sky-400/70 bg-sky-500/10 text-sky-100"
      : "border-slate-700 bg-slate-900/60 text-slate-100";

  const scoreLabel = data?.healthScore ? `${data.segment} · ${data.healthScore}` : data?.segment;
  const stageLabel = data?.relationshipStage;
  const riskLabel = data
    ? data.riskLevel === "HIGH"
      ? "Riesgo alto"
      : data.riskLevel === "MEDIUM"
      ? "Riesgo medio"
      : "Riesgo bajo"
    : null;
  const styleLabel = data?.communicationStyle ? `Estilo ${data.communicationStyle}` : null;
  const daysLeftLabel = data
    ? data.hasActivePack
      ? `${typeof data.daysToExpiry === "number" ? `${data.daysToExpiry} días restantes` : "Con pack activo"}`
      : "Sin pack activo"
    : null;
  const riskChipClass = data
    ? data.riskLevel === "HIGH"
      ? "border-rose-400/70 bg-rose-500/10 text-rose-100"
      : data.riskLevel === "MEDIUM"
      ? "border-amber-400/70 bg-amber-500/10 text-amber-100"
      : "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
    : "border-slate-700 bg-slate-900/60 text-slate-100";

  const dataChips: { label: string; className: string }[] = [];
  if (scoreLabel) {
    dataChips.push({
      label: scoreLabel,
      className: "inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/5 px-3 py-0.5 text-xs md:text-sm font-medium text-emerald-300",
    });
  }
  if (stageLabel) {
    dataChips.push({
      label: stageLabel,
      className: "inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-0.5 text-xs md:text-sm text-slate-100",
    });
  }
  if (riskLabel) {
    dataChips.push({
      label: riskLabel,
      className: `inline-flex items-center rounded-full px-3 py-0.5 text-xs md:text-sm font-medium ${riskChipClass}`,
    });
  }
  if (styleLabel) {
    dataChips.push({
      label: styleLabel,
      className: "inline-flex items-center rounded-full border border-sky-500/60 bg-sky-500/5 px-3 py-0.5 text-xs md:text-sm text-sky-200",
    });
  }
  if (daysLeftLabel) {
    dataChips.push({
      label: daysLeftLabel,
      className: "inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-0.5 text-xs md:text-sm text-slate-200",
    });
  }

  const displayChips = [
    ...(chips ?? []).map((chip) => ({
      label: chip.label,
      className: `inline-flex items-center rounded-full border px-3 py-0.5 text-xs md:text-sm font-medium ${toneClass(chip.tone)}`,
    })),
    ...dataChips,
  ];

  return (
    <div className="rounded-2xl bg-slate-950/60 border border-slate-800 px-4 py-3 md:px-5 md:py-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-sm md:text-base font-semibold text-slate-50">Manager IA</span>
          {displayChips.map((chip, idx) => (
            <span key={`${chip.label}-${idx}`} className={chip.className}>
              {chip.label}
            </span>
          ))}
        </div>
        {headline && <div className="text-xs md:text-sm text-slate-300">{headline}</div>}
        {suggestedObjective && (
          <div className="text-[11px] text-emerald-200">
            Objetivo sugerido: {formatObjectiveLabel(suggestedObjective)}
          </div>
        )}
        {fanManagerState && !headline && (
          <div className="text-xs md:text-sm text-slate-400">Estado: {fanManagerState.replace(/_/g, " ")}</div>
        )}
        {tone && onChangeTone && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Tono</span>
            <button
              type="button"
              onClick={() => onChangeTone("suave")}
              className={clsx(
                "rounded-full px-3 py-1 text-xs border transition",
                tone === "suave"
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-slate-800 text-slate-200 border-slate-600 hover:border-emerald-400"
              )}
            >
              Suave
            </button>
            <button
              type="button"
              onClick={() => onChangeTone("intimo")}
              className={clsx(
                "rounded-full px-3 py-1 text-xs border transition",
                tone === "intimo"
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-slate-800 text-slate-200 border-slate-600 hover:border-emerald-400"
              )}
            >
              Íntimo
            </button>
            <button
              type="button"
              onClick={() => onChangeTone("picante")}
              className={clsx(
                "rounded-full px-3 py-1 text-xs border transition",
                tone === "picante"
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-slate-800 text-slate-200 border-slate-600 hover:border-emerald-400"
              )}
            >
              Picante
            </button>
          </div>
        )}
        {error && !data && (
          <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            No se pudo cargar el contexto adicional. Mostrando estado calculado con datos del fan.
          </div>
        )}
        {isLoading && <div className="text-[11px] text-slate-300">Cargando contexto…</div>}
      </div>

      {data && (
        <>
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
        </>
      )}
    </div>
  );
}
