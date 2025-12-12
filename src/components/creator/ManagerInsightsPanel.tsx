import clsx from "clsx";
import { useMemo, useState } from "react";
import type { CreatorManagerSummary } from "../../lib/creatorManager";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";

type Props = {
  open: boolean;
  onClose: () => void;
  summary: CreatorManagerSummary | null;
  preview?: CreatorAiAdvisorInput["preview"];
};

type TabId = "sales" | "catalog" | "growth";

export function ManagerInsightsPanel({ open, onClose, summary, preview }: Props) {
  const [tab, setTab] = useState<TabId>("sales");
  const [growthInput, setGrowthInput] = useState("");
  const [growthActions, setGrowthActions] = useState<string[] | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthError, setGrowthError] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const safeRevenue30 = Number.isFinite(summary?.kpis?.last30?.revenue) ? summary?.kpis?.last30?.revenue ?? 0 : 0;
    const safeRevenue7 = Number.isFinite(summary?.kpis?.last7?.revenue) ? summary?.kpis?.last7?.revenue ?? 0 : 0;
    const safeExtras30 = Number.isFinite(summary?.kpis?.last30?.extras) ? summary?.kpis?.last30?.extras ?? 0 : 0;
    const safeExtras7 = Number.isFinite(summary?.kpis?.last7?.extras) ? summary?.kpis?.last7?.extras ?? 0 : 0;
    const safeRisk = Number.isFinite(summary?.revenueAtRisk7d) ? summary?.revenueAtRisk7d ?? 0 : 0;
    return { safeRevenue30, safeRevenue7, safeExtras30, safeExtras7, safeRisk };
  }, [summary]);

  if (!open) return null;

  const panel = (
    <div
      className={clsx(
        "relative z-50 h-full overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-2xl flex flex-col gap-4",
        "p-4",
        "w-screen max-w-full lg:w-[520px]"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Insights</p>
          <h3 className="text-xl font-semibold text-white">Ventas · Catálogo · Crecimiento</h3>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs text-slate-100 hover:border-emerald-500/60"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>

      <div className="flex gap-2">
        {[
          { id: "sales", label: "Ventas" },
          { id: "catalog", label: "Catálogo" },
          { id: "growth", label: "Crecimiento" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={clsx(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              tab === item.id
                ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
                : "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100"
            )}
            onClick={() => setTab(item.id as TabId)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "sales" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <InsightCard title="Ingresos 30d" value={formatCurrency(metrics.safeRevenue30)} helper="Ventas totales" />
            <InsightCard title="Ingresos 7d" value={formatCurrency(metrics.safeRevenue7)} helper="Última semana" />
            <InsightCard title="Extras 30d" value={metrics.safeExtras30} helper="Ventas extras" />
            <InsightCard title="Extras 7d" value={metrics.safeExtras7} helper="Ventas extras" />
            <InsightCard title="Ingresos en riesgo" value={formatCurrency(metrics.safeRisk)} helper="Caducan en 7d" tone="warning" />
            {summary?.packs?.monthly?.renewalsIn7Days !== undefined && (
              <InsightCard title="Renovaciones 7d" value={summary.packs.monthly.renewalsIn7Days} helper="Suscripciones que renuevan" />
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Top packs</div>
            <div className="space-y-2">
              <InsightRow title="Mensual" value={formatCurrency(summary?.packs?.monthly?.revenue30 ?? 0)} detail={`Fans ${summary?.packs?.monthly?.activeFans ?? 0}`} />
              <InsightRow title="Bienvenida" value={formatCurrency(summary?.packs?.welcome?.revenue30 ?? 0)} detail={`Fans ${summary?.packs?.welcome?.activeFans ?? 0}`} />
              <InsightRow title="Especial" value={formatCurrency(summary?.packs?.special?.revenue30 ?? 0)} detail={`Fans ${summary?.packs?.special?.activeFans ?? 0}`} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Top extras (placeholder)</div>
            <p className="text-xs text-slate-400">Aún no conectado. Cuando conectes tu data, verás el top 5 extras aquí.</p>
          </div>
        </div>
      )}

      {tab === "catalog" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <InsightCard title="Packs activos" value={3} helper="Bienvenida · Mensual · Especial" />
            <InsightCard title="Segmentos" value={safeCount(summary?.segments?.vip) + safeCount(summary?.segments?.habitual) + safeCount(summary?.segments?.newFans)} helper="VIP · Habitual · Nuevos" />
            <InsightCard title="Extras activos" value="—" helper="Conecta para ver tus extras" />
            <InsightCard title="Huecos" value="2" helper="Upsell VIP · Reactivar riesgo" tone="muted" />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Huecos sugeridos</div>
            <ul className="space-y-2 text-sm text-slate-200">
              <li className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">Upsell VIP mensual con bonus limitado.</li>
              <li className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">Extra “check-in” para fans en riesgo (7€).</li>
              <li className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">Pack bienvenida con CTA a mensual.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Acción</div>
            <button
              type="button"
              className="rounded-lg border border-emerald-500/60 bg-emerald-600/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/25"
            >
              Crear nuevo extra
            </button>
          </div>
        </div>
      )}

      {tab === "growth" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
            <p className="text-sm font-semibold text-white">Crecimiento</p>
            <p className="text-xs text-slate-400">Conecta YouTube / TikTok / Instagram para ver métricas aquí.</p>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Pega métricas de la semana</div>
            <textarea
              value={growthInput}
              onChange={(e) => setGrowthInput(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              rows={4}
              placeholder="Ej: Seguidores +120, Visitas 15k, CPM 8€, Leads 45..."
            />
            <button
              type="button"
              className="rounded-lg border border-emerald-500/60 bg-emerald-600/20 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/30"
              disabled={growthLoading}
              onClick={async () => {
                try {
                  setGrowthLoading(true);
                  setGrowthError(null);
                  setGrowthActions(null);
                  const res = await fetch("/api/creator/ai-manager/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      tab: "GROWTH",
                      message: growthInput.trim() || "Dame un diagnóstico rápido y 3 movimientos para crecer esta semana.",
                      action: "growth_3_moves",
                    }),
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body?.error ?? "No se pudo generar acciones");
                  }
                  const data = await res.json();
                  const text: string = data?.reply?.text ?? "";
                  const bullets = text.split("\n").filter((line: string) => line.trim().length > 0);
                  setGrowthActions(bullets);
                  // Podríamos enviar este output al chat de crecimiento para historial compartido.
                } catch (err) {
                  console.error(err);
                  setGrowthError("No se pudieron generar acciones de crecimiento.");
                } finally {
                  setGrowthLoading(false);
                }
              }}
            >
              {growthLoading ? "Generando..." : "Generar acciones"}
            </button>
            {growthError && <p className="text-xs text-rose-300">{growthError}</p>}
            {growthActions && (
              <ul className="space-y-2 text-sm text-slate-200">
                {growthActions.map((act, idx) => (
                  <li key={idx} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                    {act}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {preview?.headline && (
            <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <div className="text-sm font-semibold text-white">Estado rápido</div>
              <p className="text-sm text-slate-200">{preview.headline}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative h-full w-full max-w-full lg:w-[520px] overflow-hidden">
        {panel}
      </div>
    </div>
  );
}

function InsightCard({ title, value, helper, tone }: { title: string; value: string | number; helper?: string; tone?: "warning" | "muted" }) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-3 py-2",
        tone === "warning"
          ? "border-amber-500/60 bg-amber-500/10 text-amber-50"
          : tone === "muted"
            ? "border-slate-700 bg-slate-800/60 text-slate-200"
            : "border-slate-800 bg-slate-900/70 text-slate-100"
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
      {helper && <div className="text-[11px] text-slate-400">{helper}</div>}
    </div>
  );
}

function InsightRow({ title, value, detail }: { title: string; value: string | number; detail?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        {detail && <div className="text-[11px] text-slate-400">{detail}</div>}
      </div>
      <div className="text-sm font-semibold text-emerald-100">{value}</div>
    </div>
  );
}

function safeCount(val: unknown) {
  return Number.isFinite(val as number) ? (val as number) : 0;
}

function formatCurrency(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${Math.round(value)} €`;
}
