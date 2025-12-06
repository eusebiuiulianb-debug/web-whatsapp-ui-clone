import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import type { CreatorManagerSummary } from "../../lib/creatorManager";
import type { FanManagerRow } from "../../server/manager/managerService";

export default function CreatorManagerPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const [summary, setSummary] = useState<CreatorManagerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [queue, setQueue] = useState<FanManagerRow[]>([]);
  const [queueError, setQueueError] = useState("");

  useEffect(() => {
    fetchSummary();
    fetchQueue();
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

  function formatCurrency(amount: number) {
    return `${Math.round(amount)} €`;
  }

  function navigateToChats(filter: {
    followUpFilter?: "all" | "today" | "expired";
    tierFilter?: "all" | "new" | "regular" | "vip";
    onlyWithExtras?: boolean;
    segment?: string;
  }) {
    if (typeof window !== "undefined") {
      const payload = {
        followUpFilter: filter.followUpFilter ?? "all",
        tierFilter: filter.tierFilter ?? "all",
        onlyWithExtras: filter.onlyWithExtras ?? false,
        segment: filter.segment ?? null,
      };
      sessionStorage.setItem("novsy:pendingChatFilter", JSON.stringify(payload));
    }
    void router.push("/");
  }

  const kpiCards = summary
    ? [
        { label: "Ingresos 7 días", value: formatCurrency((summary as any).kpis.last7.revenue) },
        { label: "Ingresos 30 días", value: formatCurrency((summary as any).kpis.last30.revenue) },
        { label: "Extras 30 días", value: (summary as any).kpis.last30.extras },
        { label: "Fans nuevos 30 días", value: (summary as any).kpis.last30.newFans },
        {
          label: "Ingresos en riesgo (7 días)",
          value: formatCurrency((summary as any).revenueAtRisk7d ?? 0),
          helper: `${(summary as any).atRiskFansCount ?? 0} fans en riesgo esta semana`,
        },
      ]
    : [];

  const Info = ({ text }: { text: string }) => (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[9px] text-slate-300"
      title={text}
    >
      i
    </span>
  );

  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>Panel del creador · NOVSY</title>
      </Head>
      <CreatorHeader
        name={config.creatorName || "Creador"}
        role="Panel del creador"
        subtitle="Resumen de actividad y segmentos"
        initial={creatorInitial}
        onOpenSettings={() => {}}
      />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {loading && <div className="text-sm text-slate-300">Cargando panel...</div>}
        {error && !loading && <div className="text-sm text-rose-300">{error}</div>}
        {!loading && !error && summary && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {kpiCards.map((card) => (
                <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">{card.label}</div>
                  <div className="text-2xl font-semibold text-emerald-200 mt-2">{card.value}</div>
                  {"helper" in card && card.helper && (
                    <div className="text-[11px] text-slate-400 mt-1">{(card as any).helper}</div>
                  )}
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-3">
              <h2 className="text-lg font-semibold">Packs</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-sm font-semibold">Bienvenida</div>
                  <div className="text-xs text-slate-400">Fans activos: {summary.packs.welcome.activeFans}</div>
                  <div className="text-xs text-slate-400 mt-1">Ingresos 30d: {formatCurrency(summary.packs.welcome.revenue30)}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
                  <div className="text-sm font-semibold">Mensual</div>
                  <div className="text-xs text-slate-400">Fans activos: {summary.packs.monthly.activeFans}</div>
                  <div className="text-xs text-slate-400">Renovaciones ≤7d: {summary.packs.monthly.renewalsIn7Days}</div>
                  <div className="text-xs text-slate-400">Churn 30d: {summary.packs.monthly.churn30}</div>
                  <div className="text-xs text-slate-400">Ingresos 30d: {formatCurrency(summary.packs.monthly.revenue30)}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-sm font-semibold">Especial</div>
                  <div className="text-xs text-slate-400">Fans activos: {summary.packs.special.activeFans}</div>
                  <div className="text-xs text-slate-400 mt-1">Ingresos 30d: {formatCurrency(summary.packs.special.revenue30)}</div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Segmentos</h2>
                <Info
                  text={
                    "Segmentos\nNOVSY clasifica a tus fans según su salud y su historial de compras.\nSirve para saber con quién hablar antes cuando tienes poco tiempo."
                  }
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-200">
                <button
                  type="button"
                  className="text-left hover:text-emerald-200"
                  onClick={() => navigateToChats({ tierFilter: "new" })}
                >
                  Fans nuevos: {summary.segments.newFans}{" "}
                  <Info
                    text={
                      "Se han unido en los últimos días y casi no tienen historial contigo.\nBuen momento para un mensaje de bienvenida y entender qué buscan."
                    }
                  />
                </button>
                <div className="flex items-center gap-1">
                  <span>Habitual: {summary.segments.habitual}</span>
                  <Info
                    text={
                      "Tiene un pack activo y suele responder.\nGenera ingresos estables; cuida la relación sin forzar ventas cada día."
                    }
                  />
                </div>
                <button
                  type="button"
                  className="text-left hover:text-emerald-200"
                  onClick={() => navigateToChats({ tierFilter: "vip" })}
                >
                  VIP: {summary.segments.vip}{" "}
                  <Info
                    text={"Top fans por gasto total y buena respuesta.\nMerecen trato más personal, extras exclusivos y atención rápida."}
                  />
                </button>
                <button
                  type="button"
                  className="text-left hover:text-emerald-200"
                  onClick={() => navigateToChats({ followUpFilter: "expired" })}
                >
                  En riesgo: {summary.segments.atRisk}{" "}
                  <Info
                    text={
                      "Ha gastado dinero contigo, pero su salud ha bajado: lleva tiempo sin escribir o su pack está a punto de caducar.\nSi no le escribes ahora, es fácil que se pierda."
                    }
                  />
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Acciones sugeridas hoy</h2>
                <Info
                  text={
                    "Acciones sugeridas hoy\nSon bloques de trabajo. Cada acción abre una lista de fans que encajan con ese patrón (en riesgo, VIP, nuevos…).\nSirve para trabajar por tandas cuando tienes poco tiempo."
                  }
                />
              </div>
              <ul className="list-disc pl-5 text-sm text-slate-200 space-y-1">
                {summary.suggestions.map((s, idx) => (
                  <li key={`${s.label}-${idx}`} className="space-y-0.5">
                    <button
                      type="button"
                      className="text-left hover:text-emerald-200"
                      onClick={() => {
                        if (s.filter?.segment === "VIP") navigateToChats({ tierFilter: "vip", segment: "VIP" });
                        else if (s.filter?.segment === "EN_RIESGO") navigateToChats({ followUpFilter: "expired", segment: "EN_RIESGO" });
                        else if (s.filter?.segment === "NUEVO") navigateToChats({ tierFilter: "new", segment: "NUEVO" });
                        else navigateToChats({ followUpFilter: "all" });
                      }}
                    >
                      {s.label}
                    </button>
                    {s.description && <p className="text-[11px] text-slate-400">{s.description}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Cola de fans priorizados (hoy)</h2>
                <Info
                  text={
                    "Cola de fans priorizados\nOrdenamos tus fans de más urgentes a menos.\nPrimero verás a los que están en riesgo o a punto de caducar,\nluego al resto según su salud y valor."
                  }
                />
              </div>
              {queueError && <div className="text-sm text-amber-300">{queueError}</div>}
              {!queueError && queue.length === 0 && <div className="text-sm text-slate-300">Sin datos todavía.</div>}
              {!queueError && queue.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-slate-200">
                    <thead>
                      <tr className="text-xs text-slate-400">
                        <th className="text-left py-1 pr-3">
                          <div className="flex items-center gap-1">
                            Fan <Info text={"Nombre del fan. Haz clic en “Abrir chat” para ir directo a la conversación."} />
                          </div>
                        </th>
                        <th className="text-left py-1 pr-3">
                          <div className="flex items-center gap-1">
                            Segmento{" "}
                            <Info
                              text={
                                "Tipo de relación actual con este fan (Nuevo, Habitual, En riesgo, VIP, Ligero, Dormido).\nSe recalcula cada día según chat, compras y caducidad."
                              }
                            />
                          </div>
                        </th>
                        <th className="text-left py-1 pr-3">
                          <div className="flex items-center gap-1">
                            Health{" "}
                            <Info
                              text={
                                "Indicador 0–100 de la salud de la relación con este fan.\nCombina recencia de chat, compras y días para caducar.\n0–30: riesgo alto · 30–60: vigilar · 60–100: estable/bien."
                              }
                            />
                          </div>
                        </th>
                        <th className="text-left py-1 pr-3">
                          <div className="flex items-center gap-1">
                            Caduca <Info text={"Días que le quedan de acceso a su pack mensual/especial.\n“0” o “—” significa que ahora mismo no tiene pack activo."} />
                          </div>
                        </th>
                        <th className="text-left py-1 pr-3">
                          <div className="flex items-center gap-1">
                            Gasto 30d{" "}
                            <Info text={"Lo que ha gastado en los últimos 30 días entre packs y extras.\nSirve para distinguir riesgo “barato” de riesgo “alto valor”."} />
                          </div>
                        </th>
                        <th className="text-left py-1 pr-3">
                          <div className="flex items-center gap-1">
                            Acción{" "}
                            <Info
                              text={
                                "Abre el chat con este fan.\nEmpieza siempre por la parte alta de la cola: son las conversaciones que el Manager IA considera más urgentes hoy."
                              }
                            />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800">
                          <td className="py-2 pr-3">{row.displayName}</td>
                          <td className="py-2 pr-3">
                            <span className="inline-flex rounded-full border border-slate-700 px-2 py-[2px] text-[11px]">
                              {row.segment}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={
                                row.riskLevel === "HIGH"
                                  ? "text-rose-200"
                                  : row.riskLevel === "MEDIUM"
                                  ? "text-amber-200"
                                  : "text-emerald-200"
                              }
                            >
                              {row.healthScore}
                            </span>
                          </td>
                          <td className="py-2 pr-3">{row.daysToExpiry ?? "—"}</td>
                          <td className="py-2 pr-3">{Math.round(row.recent30dSpend ?? 0)} €</td>
                          <td className="py-2 pr-3">
                            <button
                              type="button"
                              className="text-xs text-emerald-200 hover:underline"
                              onClick={() => {
                                if (row.segment === "VIP") navigateToChats({ tierFilter: "vip", segment: "VIP" });
                                else if (row.segment === "EN_RIESGO") navigateToChats({ followUpFilter: "expired", segment: "EN_RIESGO" });
                                else if (row.segment === "NUEVO") navigateToChats({ tierFilter: "new", segment: "NUEVO" });
                                else navigateToChats({ followUpFilter: "all" });
                              }}
                            >
                              Abrir chat
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
