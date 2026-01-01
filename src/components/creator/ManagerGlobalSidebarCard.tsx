import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import type { CreatorManagerSummary } from "../../lib/creatorManager";
import type { FanManagerRow } from "../../server/manager/managerService";
import clsx from "clsx";

type Props = {
  summary: CreatorManagerSummary | null;
  queue: FanManagerRow[];
  queueError?: string;
  advisorInput?: CreatorAiAdvisorInput;
  advisorError?: boolean;
  advisorLoading?: boolean;
  onOpenFanChat?: (fanId: string) => void;
};

export function ManagerGlobalSidebarCard({
  summary,
  queue,
  queueError,
  advisorInput,
  advisorError,
  advisorLoading,
  onOpenFanChat,
}: Props) {
  const preview = advisorInput?.preview;
  const planSteps = buildDailyPlan({ summary, queue });
  const extrasRevenue30 =
    (summary?.kpis?.extras?.last30?.revenue ?? 0) + (summary?.kpis?.tips?.last30?.revenue ?? 0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 lg:p-5 space-y-5 h-full shadow-inner">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Manager IA</div>
          <h3 className="text-xl font-semibold text-white">Estado de hoy</h3>
        </div>
        {preview?.riskLevel && (
          <span className={clsx("inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase", riskBadge(preview.riskLevel))}>
            {preview.riskLevel}
          </span>
        )}
      </div>

      {planSteps.length > 0 && (
        <section className="space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Plan de hoy</p>
            <h3 className="text-sm font-semibold text-slate-50">3 pasos para hoy</h3>
          </div>
          <ol className="space-y-2">
            {planSteps.map((step, index) => (
              <li
                key={step.id}
                className="flex items-start gap-3 rounded-lg bg-slate-900/60 px-3 py-2"
              >
                <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-200">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-50">{step.label}</p>
                  {step.description && (
                    <p className="mt-0.5 text-[11px] text-slate-400">{step.description}</p>
                  )}
                </div>
                {step.kind === "FANS" && onOpenFanChat && step.fanId && (
                  <button
                    type="button"
                    onClick={() => onOpenFanChat(step.fanId!)}
                    className="ml-2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                  >
                    Ir al chat
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100">Asesor IA del creador</div>
          {preview?.riskLevel && (
            <span className={clsx("inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] uppercase", riskBadge(preview.riskLevel))}>
              {preview.riskLevel}
            </span>
          )}
        </div>
        {advisorError && <div className="text-xs text-amber-200">No se ha podido cargar el asesor IA.</div>}
        {advisorLoading && <div className="text-xs text-slate-400">Preparando recomendación...</div>}
        {!advisorLoading && !advisorError && preview && (
          <div className="space-y-3 text-sm text-slate-200">
            <div className="text-base leading-relaxed text-slate-100">{preview.headline}</div>
            <div className="grid grid-cols-3 gap-2">
              <MetricPill label="Ingresos 30d" value={`${Math.round(summary?.kpis.last30.revenue ?? 0)} €`} />
              <MetricPill label="Extras 30d" value={`${Math.round(extrasRevenue30)} €`} />
              <MetricPill label="Nuevos 30d" value={`${summary?.kpis.last30.newFans ?? 0}`} />
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300 text-[13px]">
              {preview.summaryLines.map((line, idx) => (
                <li key={`advisor-line-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {!advisorLoading && !advisorError && !preview && (
          <div className="text-xs text-slate-400">Sin datos del asesor IA todavía.</div>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-100">Acciones sugeridas hoy</div>
        {summary?.suggestions?.length ? (
          <div className="flex flex-wrap gap-2">
            {summary.suggestions.slice(0, 6).map((sugg) => (
              <span
                key={sugg.id}
                className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-100 shadow-sm"
                title={sugg.description}
              >
                {sugg.label}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400">Aún no hay acciones sugeridas.</div>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-100">Cola de fans priorizados (hoy)</div>
        {queueError && <div className="text-xs text-amber-200">{queueError}</div>}
        {!queueError && queue.length === 0 && <div className="text-xs text-slate-400">Sin datos todavía.</div>}
        {!queueError && queue.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-[240px]">
            <table className="min-w-full text-xs text-slate-200">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wide text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Fan</th>
                  <th className="text-left px-3 py-2">Segmento</th>
                  <th className="text-left px-3 py-2">Etapa</th>
                  <th className="text-left px-3 py-2">Health</th>
                  <th className="text-left px-3 py-2">Caduca</th>
                  <th className="text-right px-3 py-2">Acción</th>
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
                      <span className="inline-flex rounded-full border border-slate-700 px-2 py-[2px] text-[11px]">
                        {row.segment}
                      </span>
                    </td>
                    <td className="px-3 py-2 uppercase text-[10px] text-slate-300">{row.relationshipStage}</td>
                    <td className="px-3 py-2">
                      <span
                        className={clsx(
                          "font-semibold",
                          row.riskLevel === "HIGH" ? "text-rose-200" : row.riskLevel === "MEDIUM" ? "text-amber-200" : "text-emerald-200"
                        )}
                      >
                        {row.healthScore}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.daysToExpiry ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenFanChat?.(row.id)}
                        className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                      >
                        Ir al chat
                      </button>
                    </td>
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
    </div>
  );
}

function riskBadge(level: string) {
  if (level === "ALTO" || level === "HIGH") return "border-rose-500/60 bg-rose-500/10 text-rose-200";
  if (level === "MEDIO" || level === "MEDIUM") return "border-amber-500/60 bg-amber-500/10 text-amber-100";
  return "border-emerald-500/60 bg-emerald-500/10 text-emerald-100";
}

type DailyPlanStep = {
  id: string;
  label: string;
  description?: string;
  kind: "FANS" | "NEW_FANS" | "PACKS";
  fanId?: string;
};

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

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-center">
      <div className="text-lg font-semibold text-emerald-100">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
