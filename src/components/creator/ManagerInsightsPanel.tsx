import clsx from "clsx";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CreatorManagerSummary, PriorityItem } from "../../lib/creatorManager";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";

type Props = {
  open: boolean;
  onClose: () => void;
  summary: CreatorManagerSummary | null;
  priorityItems?: PriorityItem[];
  preview?: CreatorAiAdvisorInput["preview"];
  onPrompt?: (tab: "strategy" | "content" | "growth", text: string) => void;
  initialTab?: TabId;
};

type TabId = "sales" | "catalog" | "growth";

type CampaignRollup = {
  utmCampaign: string;
  openChatSessions: number;
  sendMessageSessions: number;
};

type CampaignMeta = {
  id: string;
  utmCampaign: string;
  title: string;
  platform: string;
  status: string;
};

type CampaignLink = {
  utmCampaign: string;
  createdAt: string;
};

export function ManagerInsightsPanel({ open, onClose, summary, priorityItems, preview, onPrompt, initialTab }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(initialTab ?? "sales");
  const [growthInput, setGrowthInput] = useState("");
  const [growthActions, setGrowthActions] = useState<string[] | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthError, setGrowthError] = useState<string | null>(null);
  const [priorityToast, setPriorityToast] = useState("");
  const priorityToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [campaignsMeta, setCampaignsMeta] = useState<CampaignMeta[]>([]);
  const [campaignsRollups, setCampaignsRollups] = useState<CampaignRollup[]>([]);
  const [campaignsLastLinks, setCampaignsLastLinks] = useState<CampaignLink[]>([]);
  const hasCampaigns = campaignsMeta.length > 0;

  const topPriorities = useMemo(() => {
    if (priorityItems && priorityItems.length > 0) return priorityItems.slice(0, 3);
    if (!summary) return [];
    const items = summary.topPriorities?.length ? summary.topPriorities : summary.priorityItems ?? [];
    return items.slice(0, 3);
  }, [priorityItems, summary]);

  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch (_err) {
      return value;
    }
  };

  const extractFanIdFromHref = (href?: string) => {
    if (!href) return "";
    const queryMatch = href.match(/[?&]fanId=([^&#]+)/i);
    if (queryMatch?.[1]) {
      return safeDecode(queryMatch[1]);
    }
    const pathMatch = href.match(/\/fan\/([^/?#]+)/i);
    if (pathMatch?.[1]) {
      return safeDecode(pathMatch[1]);
    }
    return "";
  };

  const buildCreatorChatHref = (fanKey: string) => `/?fanId=${encodeURIComponent(fanKey)}`;

  const resolveChatHref = (item: (typeof topPriorities)[number]) => {
    const fanKey = item.fanId || extractFanIdFromHref(item.href) || extractFanIdFromHref(item.primaryAction?.href);
    if (!fanKey) return "";
    return buildCreatorChatHref(fanKey);
  };

  const handlePriorityOpen = (item: (typeof topPriorities)[number]) => {
    if (item.kind === "INVITE_PENDING") return;
    const href = resolveChatHref(item);
    if (!href) return;
    onClose?.();
    void router.push(href);
  };

  const resolveInviteUrl = (value?: string) => {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    const base =
      (typeof window !== "undefined" && window.location?.origin) ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3005";
    if (value.startsWith("/")) return `${base}${value}`;
    return `${base}/${value}`;
  };

  const handlePriorityCopy = async (item: (typeof topPriorities)[number]) => {
    if (item.kind !== "INVITE_PENDING") return;
    const text = resolveInviteUrl(item.inviteUrl || item.primaryAction?.copyText);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setPriorityToast("Invitación copiada");
      if (priorityToastTimer.current) {
        clearTimeout(priorityToastTimer.current);
      }
      priorityToastTimer.current = setTimeout(() => setPriorityToast(""), 2000);
    } catch (error) {
      console.error("Error copying invite link", error);
    }
  };

  const metrics = useMemo(() => {
    const safeRevenue30 = Number.isFinite(summary?.kpis?.last30?.revenue) ? summary?.kpis?.last30?.revenue ?? 0 : 0;
    const safeRevenue7 = Number.isFinite(summary?.kpis?.last7?.revenue) ? summary?.kpis?.last7?.revenue ?? 0 : 0;
    const extrasRevenue30 =
      (summary?.kpis?.extras?.last30?.revenue ?? 0) + (summary?.kpis?.tips?.last30?.revenue ?? 0);
    const extrasRevenue7 =
      (summary?.kpis?.extras?.last7?.revenue ?? 0) + (summary?.kpis?.tips?.last7?.revenue ?? 0);
    const extrasCount30 =
      (summary?.kpis?.extras?.last30?.count ?? summary?.kpis?.last30?.extras ?? 0) +
      (summary?.kpis?.tips?.last30?.count ?? 0);
    const extrasCount7 =
      (summary?.kpis?.extras?.last7?.count ?? summary?.kpis?.last7?.extras ?? 0) +
      (summary?.kpis?.tips?.last7?.count ?? 0);
    const giftsCount30 = summary?.kpis?.gifts?.last30?.count ?? 0;
    const safeRisk = Number.isFinite(summary?.revenueAtRisk7d) ? summary?.revenueAtRisk7d ?? 0 : 0;
    return { safeRevenue30, safeRevenue7, extrasRevenue30, extrasRevenue7, extrasCount30, extrasCount7, giftsCount30, safeRisk };
  }, [summary]);
  const hasExtras = metrics.extrasCount30 > 0;

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? "sales");
    let alive = true;
    const loadCampaigns = async () => {
      try {
        setCampaignsLoading(true);
        setCampaignsError(null);
        const res = await fetch("/api/analytics/summary?range=7");
        if (!res.ok) throw new Error("Error loading campaigns");
        const data = await res.json();
        if (!alive) return;
        setCampaignsMeta(Array.isArray(data?.campaigns) ? data.campaigns : []);
        setCampaignsRollups(Array.isArray(data?.campaignRollups) ? data.campaignRollups : []);
        setCampaignsLastLinks(Array.isArray(data?.campaignLastLinks) ? data.campaignLastLinks : []);
      } catch (err) {
        if (!alive) return;
        console.error(err);
        setCampaignsError("No se pudieron cargar campañas.");
        setCampaignsMeta([]);
        setCampaignsRollups([]);
        setCampaignsLastLinks([]);
      } finally {
        if (alive) setCampaignsLoading(false);
      }
    };
    void loadCampaigns();
    return () => {
      alive = false;
    };
  }, [open, initialTab]);

  useEffect(() => {
    return () => {
      if (priorityToastTimer.current) {
        clearTimeout(priorityToastTimer.current);
      }
    };
  }, []);

  const campaignInsights = useMemo(() => {
    const rollupsMap = new Map<string, CampaignRollup>();
    campaignsRollups.forEach((row) => {
      rollupsMap.set((row.utmCampaign || "").toLowerCase(), row);
    });
    const lastLinksMap = new Map<string, CampaignLink>();
    campaignsLastLinks.forEach((link) => {
      lastLinksMap.set((link.utmCampaign || "").toLowerCase(), link);
    });
    const rows = campaignsMeta.map((campaign) => {
      const key = (campaign.utmCampaign || "").toLowerCase();
      const metrics = rollupsMap.get(key) || {
        utmCampaign: campaign.utmCampaign,
        openChatSessions: 0,
        sendMessageSessions: 0,
      };
      return {
        ...campaign,
        openChatSessions: metrics.openChatSessions,
        sendMessageSessions: metrics.sendMessageSessions,
        hasLink: lastLinksMap.has(key),
      };
    });
    const topByChats = rows
      .slice()
      .sort((a, b) => {
        if (b.openChatSessions !== a.openChatSessions) return b.openChatSessions - a.openChatSessions;
        return b.sendMessageSessions - a.sendMessageSessions;
      })
      .slice(0, 3);
    const activeCampaigns = rows.filter((c) => (c.status || "").toLowerCase() === "active");
    const campaignsMissingLink = rows.filter((c) => !c.hasLink);
    return { rows, topByChats, activeCampaigns, campaignsMissingLink };
  }, [campaignsMeta, campaignsRollups, campaignsLastLinks]);

  if (!open) return null;

  const handlePrompt = (targetTab: "strategy" | "content" | "growth", text: string) => {
    onPrompt?.(targetTab, text);
    onClose?.();
  };

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
            <InsightCard
              title="Extras 30d"
              value={formatCurrency(metrics.extrasRevenue30)}
              helper={
                metrics.giftsCount30 > 0 ? `Ventas + propinas · ${metrics.giftsCount30} regalos` : "Ventas + propinas"
              }
            />
            <InsightCard title="Extras 7d" value={formatCurrency(metrics.extrasRevenue7)} helper="Ventas + propinas" />
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
            <InsightCard title="Extras activos" value={metrics.extrasCount30} helper="Ventas extras 30d" />
            <InsightCard title="Huecos" value="2" helper="Upsell VIP · Reactivar riesgo" tone="muted" />
          </div>
          {!hasExtras && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <span className="text-xs text-slate-300">Aún no tienes extras activos</span>
              <button
                type="button"
                className="rounded-full border border-emerald-500/60 bg-emerald-600/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-600/20"
                onClick={() => handlePrompt("content", "Crea un extra…")}
              >
                Crea un extra…
              </button>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Huecos sugeridos</div>
            <ul className="space-y-2 text-sm text-slate-200">
              <li
                className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                onClick={() =>
                  handlePrompt(
                    "content",
                    "Diseña un upsell a VIP mensual con bonus limitado: nombre del upsell, qué incluye, por qué vale la pena, objeciones típicas y 2 plantillas de mensaje (suave y directa) para ofrecerlo."
                  )
                }
              >
                Upsell VIP mensual con bonus limitado.
              </li>
              <li
                className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                onClick={() =>
                  handlePrompt(
                    "content",
                    "Diseña un upsell a VIP mensual con bonus limitado: nombre del upsell, qué incluye, por qué vale la pena, objeciones típicas y 2 plantillas de mensaje (suave y directa) para ofrecerlo."
                  )
                }
              >
                Upsell VIP mensual con bonus limitado.
              </li>
              <li
                className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                onClick={() =>
                  handlePrompt(
                    "content",
                    "Crea el extra 'check-in' (7€) para fans en riesgo: título, descripción, 3 bullets, CTA y 2 plantillas de mensaje (prevención y última llamada elegante)."
                  )
                }
              >
                Extra “check-in” para fans en riesgo (7€).
              </li>
              <li
                className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                onClick={() =>
                  handlePrompt(
                    "content",
                    "Propón un pack de bienvenida con CTA a mensual: estructura del pack, contenido incluido, precio sugerido, y mensaje de transición a mensual (beneficios claros + llamada a acción simple)."
                  )
                }
              >
                Pack bienvenida con CTA a mensual.
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Acción</div>
            <button
              type="button"
              className="rounded-lg border border-emerald-500/60 bg-emerald-600/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/25"
              onClick={() =>
                handlePrompt(
                  "content",
                  "Crea un extra 'check-in' para fans en riesgo (7€): título, descripción, 3 bullets, CTA y plantilla de mensaje para enviar al fan. Tono directo, humano, cero humo."
                )
              }
            >
              Crear nuevo extra
            </button>
          </div>
        </div>
      )}

      {tab === "growth" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Top 3 prioridades (hoy)</p>
                <p className="text-xs text-slate-400">Acciones rápidas para ir al chat.</p>
              </div>
            </div>
            {priorityToast && <p className="text-xs text-emerald-200">{priorityToast}</p>}
            {topPriorities.length === 0 && <p className="text-xs text-slate-400">Sin prioridades por ahora.</p>}
            {topPriorities.length > 0 && (
              <div className="space-y-2 text-sm text-slate-200">
                {topPriorities.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{item.title}</div>
                      {item.subtitle && <div className="text-[11px] text-slate-400 line-clamp-2">{item.subtitle}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.kind === "INVITE_PENDING" ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-emerald-500/60 whitespace-nowrap"
                          onClick={() => handlePriorityCopy(item)}
                        >
                          Copiar invitación
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 hover:border-emerald-500/60 whitespace-nowrap"
                          onClick={() => handlePriorityOpen(item)}
                        >
                          Abrir chat
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Campañas (UTM)</p>
                <p className="text-xs text-slate-400">Top campañas por chats y mensajes.</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 hover:border-emerald-500/60"
                onClick={() => {
                  onClose?.();
                  void router.push("/creator/analytics");
                }}
              >
                Ver campañas
              </button>
            </div>
            {campaignsLoading && <p className="text-xs text-slate-400">Cargando campañas...</p>}
            {campaignsError && <p className="text-xs text-rose-300">{campaignsError}</p>}
            {!campaignsLoading && !campaignsError && !hasCampaigns && (
              <p className="text-xs text-slate-400">Sin campañas todavía</p>
            )}
            {!campaignsLoading && !campaignsError && hasCampaigns && campaignInsights.topByChats.length === 0 && (
              <p className="text-xs text-slate-400">Aún no hay campañas con datos.</p>
            )}
            {!campaignsLoading && !campaignsError && campaignInsights.topByChats.length > 0 && (
              <div className="space-y-2 text-sm text-slate-200">
                {campaignInsights.topByChats.map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-semibold text-white">{campaign.title}</span>
                      <span className="text-[11px] text-slate-400">{campaign.utmCampaign}</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Chats {campaign.openChatSessions} · Mensajes {campaign.sendMessageSessions}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!campaignsLoading && !campaignsError && hasCampaigns && campaignInsights.activeCampaigns.length === 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200">
                No hay campañas activas. Crea una campaña en Analítica → Campañas.
              </div>
            )}
            {!campaignsLoading && !campaignsError && hasCampaigns && campaignInsights.campaignsMissingLink.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200">
                Genera un link para:{" "}
                {campaignInsights.campaignsMissingLink
                  .slice(0, 3)
                  .map((c) => c.title)
                  .join(", ")}
                .
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
            <p className="text-sm font-semibold text-white">Crecimiento</p>
            <p className="text-xs text-slate-400">Conecta YouTube / TikTok / Instagram para ver métricas aquí.</p>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Acciones demo</div>
            <div className="space-y-2 text-sm text-slate-200">
              <button
                type="button"
                className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                onClick={() =>
                  handlePrompt(
                    "growth",
                    "Necesito 2 ideas de short/TikTok para empujar al pack mensual.\nDame para cada una:\n- Hook de 1 frase (0–2s)\n- Guion en 6–8 líneas (15–25s)\n- CTA final (2 variantes)\n- Texto para caption (2 variantes)\n- Qué métrica miro (retención 3s/10s, clicks a bio, etc.) y umbral simple.\nTono: directo, humano, cero humo."
                  )
                }
              >
                Publica 2 shorts/TikToks…
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                onClick={() =>
                  handlePrompt(
                    "growth",
                    "Escríbeme 3 mensajes cortos para VIP para ofrecer el extra que mejor rindió esta semana con cupón 24h.\nQuiero:\n- 1 versión suave, 1 directa, 1 “amigo cercano”\n- 1 follow-up si no responde en 12h\n- 1 cierre si dice “lo miro luego”\nTono: humano, sin presión."
                  )
                }
              >
                Escribe a tus VIP…
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                onClick={() =>
                  handlePrompt(
                    "growth",
                    "Diseña un story anclado (3 pantallas) para mi pack fuerte y añade prueba social.\nPara cada pantalla:\n- Texto grande (máx 2 líneas)\n- Texto pequeño (1 línea)\n- CTA\nAdemás: 3 ideas de prueba social (captura, testimonio, antes/después “suave”) sin prometer milagros."
                  )
                }
              >
                Haz un story anclado…
              </button>
            </div>
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
              onClick={() => {
                const metricsText = growthInput.trim() || "Sin métricas pegadas. Genera un plan genérico basado en buenas prácticas.";
                const prompt = `Analiza estas métricas semanales (YouTube/TikTok/Instagram) y dame un plan accionable para 7 días.\n\nMétricas:\n${metricsText}\n\nQuiero:\n1) Diagnóstico en 3 bullets (qué va bien / qué falla / qué atacar ya).\n2) 3 acciones concretas para crecer (contenido, CTA, distribución), cada una con:\n   - Qué hago hoy (pasos)\n   - Qué mido (métrica)\n   - Qué espero (umbral simple)\n3) 2 tests A/B de copy (titular + CTA) para empujar a pack mensual o extra.\n4) Un mensaje plantilla corto para llevar tráfico a mi bio-link / perfil NOVSY.\n\nTono: humano, directo, cero humo.`;
                handlePrompt("growth", prompt);
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
