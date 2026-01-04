import clsx from "clsx";
import type { CreatorManagerSummary } from "../../lib/creatorManager";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";

type Props = {
  open: boolean;
  panelTab: "today" | "queue" | "pulse" | "catalog";
  summary: CreatorManagerSummary | null;
  preview?: CreatorAiAdvisorInput["preview"];
  onToggle: () => void;
  density: "comfortable" | "compact";
};

export function ManagerInsightsPane({ open, panelTab, summary, preview, onToggle, density }: Props) {
  if (!open) {
    return null;
  }
  const extrasRevenue30 = summary?.kpis?.extras?.last30?.revenue ?? 0;
  const extrasCount30 = summary?.kpis?.extras?.last30?.count ?? summary?.kpis?.last30?.extras ?? 0;
  const extrasDetail = `${extrasCount30} ventas`;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end">
      <div className="absolute inset-0 bg-[color:var(--surface-overlay)] backdrop-blur-sm" onClick={onToggle} />
      <aside
        className={clsx(
          "relative z-10 h-full overflow-y-auto border-l border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 shadow-2xl flex flex-col gap-3",
          density === "compact" ? "p-3 w-[320px]" : "p-4 w-[360px]"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-[color:var(--text)]">Insights</div>
          <button type="button" className="text-[12px] text-[color:var(--brand)] hover:text-[color:var(--text)]" onClick={onToggle}>
            Cerrar
          </button>
        </div>

        {panelTab === "today" && preview?.headline && (
          <div className="space-y-2 text-sm text-[color:var(--text)]">
            <div className="font-semibold text-[color:var(--text)]">Estado de hoy</div>
            <p className={clsx("leading-snug", density === "compact" ? "text-xs" : "text-sm")}>{preview.headline}</p>
            {preview.summaryLines && (
              <ul className="list-disc list-inside text-[12px] text-[color:var(--muted)] space-y-1">
                {preview.summaryLines.slice(0, 3).map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {panelTab === "pulse" && summary && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[color:var(--text)]">Pulso</div>
            <div className="grid grid-cols-2 gap-2">
              <CatalogRow title="Ingresos 30d" value={formatCurrency(summary.kpis.last30.revenue)} detail="Últimos 30 días" />
              <CatalogRow title="Extras 30d" value={formatCurrency(extrasRevenue30)} detail={extrasDetail} />
              <CatalogRow title="Churn" value={`${summary.packs.monthly.churn30}%`} detail="Mensual" />
              <CatalogRow title="Renovaciones 7d" value={summary.packs.monthly.renewalsIn7Days} detail="Próximas" />
            </div>
          </div>
        )}

        {panelTab === "catalog" && summary && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[color:var(--text)]">Top packs</div>
            <div className="space-y-2">
              <CatalogRow title="Mensual" value={formatCurrency(summary.packs.monthly.revenue30)} detail={`Fans ${summary.packs.monthly.activeFans}`} />
              <CatalogRow title="Bienvenida" value={formatCurrency(summary.packs.welcome.revenue30)} detail={`Fans ${summary.packs.welcome.activeFans}`} />
              <CatalogRow title="Especial" value={formatCurrency(summary.packs.special.revenue30)} detail={`Fans ${summary.packs.special.activeFans}`} />
            </div>
          </div>
        )}

        {panelTab === "today" && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[color:var(--text)]">Plan de hoy</div>
            {summary?.kpis?.last30 && (
              <CatalogRow title="Ingresos 7d" value={formatCurrency(summary.kpis.last7.revenue)} detail="Últimos 7 días" />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function CatalogRow({ title, value, detail }: { title: string; value: string | number; detail: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2">
      <div>
        <div className="text-sm font-semibold text-[color:var(--text)]">{title}</div>
        <div className="text-[11px] text-[color:var(--muted)]">{detail}</div>
      </div>
      <div className="text-sm font-semibold text-[color:var(--text)]">{value}</div>
    </div>
  );
}

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}
