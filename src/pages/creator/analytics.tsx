import Head from "next/head";
import { useEffect, useState } from "react";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import clsx from "clsx";
import { normalizeCreatorPlatforms, CreatorPlatforms, CREATOR_PLATFORM_KEYS, formatPlatformLabel } from "../../lib/creatorPlatforms";

type FunnelStep = { sessions: number; events: number };
type TableRow = {
  key: string;
  utmCampaign?: string;
  utmSource?: string;
  utmContent?: string;
  viewSessions: number;
  ctaSessions: number;
  openChatSessions: number;
  sendMessageSessions: number;
  purchaseSessions: number;
  fansNew: number;
};

type CampaignLink = {
  id: string;
  handle: string | null;
  platform: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string | null;
  slug: string | null;
  createdAt: string;
};

type Summary = {
  rangeDays: number;
  funnel: {
    view: FunnelStep;
    cta: FunnelStep;
    openChat: FunnelStep;
    sendMessage: FunnelStep;
    purchase: FunnelStep;
  };
  metrics: { sessions: number; ctr: number };
  funnelFans: {
    newFans: number;
    openChatFans: number;
    sendMessageFans: number;
  };
  topCampaigns: TableRow[];
  topCreatives: (TableRow & { utmContent: string })[];
  latestLinks: CampaignLink[];
};

type BuilderState = {
  platform: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
};

export default function CreatorAnalyticsPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "C";
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [handle, setHandle] = useState("creator");
  const [savingLink, setSavingLink] = useState(false);
  const [platforms, setPlatforms] = useState<CreatorPlatforms | null>(null);
  const [savingPlatforms, setSavingPlatforms] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>({
    platform: "tiktok",
    utmMedium: "social",
    utmCampaign: "",
    utmContent: "",
    utmTerm: "",
  });

  useEffect(() => {
    void loadData(range);
  }, [range]);

  useEffect(() => {
    void loadHandle();
    void loadPlatforms();
  }, []);

  async function loadData(nextRange: number) {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/analytics/summary?range=${nextRange}`);
      if (!res.ok) throw new Error("Error fetching analytics");
      const payload = (await res.json()) as Summary;
      setData(payload);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la analítica.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHandle() {
    try {
      const res = await fetch("/api/creator/bio-link");
      const json = await res.json();
      if (json?.config?.handle) setHandle(json.config.handle);
    } catch (_err) {
      // ignore
    }
  }

  async function loadPlatforms() {
    try {
      const res = await fetch("/api/creator/ai-settings");
      const json = await res.json();
      setPlatforms(normalizeCreatorPlatforms(json?.settings?.platforms));
    } catch (_err) {
      setPlatforms(null);
    }
  }

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3005";

  const utmSource = builder.platform.trim().toLowerCase();
  const utmMedium = builder.utmMedium.trim().toLowerCase() || "social";
  const utmCampaign = builder.utmCampaign.trim() || "sin_campaña";
  const utmContent = builder.utmContent.trim() || "sin_creativo";
  const utmTerm = builder.utmTerm.trim();
  const linkPreview = `${origin}/link/${handle}?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(
    utmMedium
  )}&utm_campaign=${encodeURIComponent(utmCampaign)}&utm_content=${encodeURIComponent(utmContent)}${
    utmTerm ? `&utm_term=${encodeURIComponent(utmTerm)}` : ""
  }`;

  const builderValid = Boolean(utmSource && utmMedium && builder.utmCampaign.trim() && builder.utmContent.trim());

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (_err) {
      // ignore
    }
  }

  async function handleSaveLink() {
    if (!builderValid) return;
    try {
      setSavingLink(true);
    const res = await fetch("/api/creator/campaign-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: builder.platform,
        handle,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm: utmTerm || undefined,
        }),
      });
      if (!res.ok) throw new Error("Error saving link");
      setBuilder((prev) => ({ ...prev, utmCampaign: "", utmContent: "", utmTerm: "" }));
      setBuilderOpen(false);
      void loadData(range);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingLink(false);
    }
  }

  function updatePlatform(key: keyof CreatorPlatforms, patch: { enabled?: boolean; handle?: string }) {
    setPlatforms((prev) => {
      const current = prev ?? normalizeCreatorPlatforms(null);
      const next = { ...current };
      const item = next[key];
      next[key] = {
        enabled: patch.enabled ?? item?.enabled ?? false,
        handle: patch.handle !== undefined ? patch.handle : item?.handle || "",
      };
      return next;
    });
  }

  async function savePlatforms() {
    if (!platforms) return;
    try {
      setSavingPlatforms(true);
      await fetch("/api/creator/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPlatforms(false);
    }
  }

  const funnelRows = data
    ? [
        { label: "Visitas bio-link", sessions: data.funnel.view.sessions, events: data.funnel.view.events },
        { label: "Click CTA", sessions: data.funnel.cta.sessions, events: data.funnel.cta.events },
        { label: "Chats abiertos", sessions: data.funnel.openChat.sessions, events: data.funnel.openChat.events },
        { label: "Mensajes enviados", sessions: data.funnel.sendMessage.sessions, events: data.funnel.sendMessage.events },
        { label: "Compras", sessions: data.funnel.purchase.sessions, events: data.funnel.purchase.events },
      ]
    : [];
  const fanFunnelRows =
    data && data.funnelFans
      ? [
          { label: "Fans nuevos", value: data.funnelFans.newFans },
          { label: "Fans abren chat", value: data.funnelFans.openChatFans },
          { label: "Fans envían mensaje", value: data.funnelFans.sendMessageFans },
        ]
      : [];

  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>Analítica – NOVSY</title>
      </Head>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <CreatorHeader
          name={config.creatorName}
          role="Analítica"
          subtitle={config.creatorSubtitle}
          initial={creatorInitial}
          avatarUrl={config.avatarUrl}
          onOpenSettings={() => {}}
        />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Analítica interna</h1>
            <p className="text-sm text-slate-300">Atribución de bio-link y embudo al chat.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBuilderOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <PlusIconInline />
              Crear link UTM
            </button>
            <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/70 p-1">
              {[7, 30, 90].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRange(value as 7 | 30 | 90)}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-semibold rounded-full",
                    range === value ? "bg-emerald-600 text-white" : "text-slate-200 hover:text-white"
                  )}
                >
                  Últimos {value} días
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-rose-300">{error}</div>}
        {loading && <div className="text-sm text-slate-300">Cargando...</div>}

        {data && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Redes (manual)</h2>
                  <p className="text-sm text-slate-300">Activa tus plataformas para personalizar las ideas de crecimiento.</p>
                </div>
                <button
                  type="button"
                  onClick={savePlatforms}
                  disabled={savingPlatforms}
                  className={clsx(
                    "rounded-full px-3 py-2 text-sm font-semibold",
                    savingPlatforms ? "bg-slate-700 text-slate-300" : "bg-emerald-600 text-white hover:bg-emerald-500"
                  )}
                >
                  {savingPlatforms ? "Guardando..." : "Guardar redes"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREATOR_PLATFORM_KEYS.map((key) => {
                  const item = platforms?.[key] ?? { enabled: false, handle: "" };
                  return (
                    <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) => updatePlatform(key, { enabled: e.target.checked })}
                          className="h-5 w-5 rounded border-slate-600 bg-slate-800 text-emerald-400 focus:ring-emerald-400"
                        />
                        {formatPlatformLabel(key)}
                      </label>
                      <input
                        type="text"
                        value={item.handle}
                        onChange={(e) => updatePlatform(key, { handle: e.target.value })}
                        placeholder="@usuario"
                        disabled={!item.enabled}
                        className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 disabled:opacity-60 focus:border-emerald-400"
                      />
                      <p className="text-[11px] text-slate-500">
                        {item.enabled ? "Se usa para personalizar ideas de crecimiento." : "Activa la casilla para usar esta red."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {funnelRows.every((row) => row.events === 0) ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-slate-200">
                <h2 className="text-lg font-semibold text-white mb-2">Aún no hay eventos registrados</h2>
                <p className="text-sm text-slate-300">
                  Crea un link UTM y prueba el flujo completo: visita → click CTA → abrir chat → enviar mensaje.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <MetricCard label="Sesiones" value={data.metrics.sessions} helper="bio_link_view (unique)" />
                  <MetricCard label="CTR CTA" value={`${data.metrics.ctr}%`} helper="cta_click_enter_chat / bio_link_view" />
                  <MetricCard label="Chats abiertos" value={data.funnel.openChat.sessions} helper="unique sessions" />
                  <MetricCard label="Mensajes" value={data.funnel.sendMessage.sessions} helper="unique sessions" />
                  <MetricCard label="Fans nuevos" value={data.funnelFans.newFans} helper="distinct fanId" />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Embudo</h2>
                      <p className="text-sm text-slate-300">Sesiones únicas y eventos por paso</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    {funnelRows.map((row) => (
                      <div key={row.label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <div className="text-xs text-slate-400">{row.label}</div>
                        <div className="text-xl font-semibold text-white">{row.sessions}</div>
                        <div className="text-[11px] text-slate-500">{row.events} eventos</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Embudo (fans reales)</h2>
                      <p className="text-sm text-slate-300">Fans únicos por paso (fanId)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {fanFunnelRows.map((row) => (
                      <div key={row.label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <div className="text-xs text-slate-400">{row.label}</div>
                        <div className="text-xl font-semibold text-white">{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <AggregatedTable title="Top campañas" subtitle="utm_campaign + utm_source" rows={data.topCampaigns} />
                <AggregatedTable title="Top creativos" subtitle="utm_content" rows={data.topCreatives} />
              </>
            )}

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Últimos links UTM</h2>
                  <p className="text-sm text-slate-300">Copiar y usar en tus campañas</p>
                </div>
              </div>
              {data.latestLinks.length === 0 ? (
                <div className="text-sm text-slate-400">Aún no hay links guardados.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-800">
                        <th className="py-2 pr-4">Plataforma</th>
                        <th className="py-2 pr-4">Campaña</th>
                        <th className="py-2 pr-4">Contenido</th>
                        <th className="py-2 pr-4">Medium</th>
                        <th className="py-2 pr-4">Term</th>
                        <th className="py-2 pr-4">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.latestLinks.map((row) => (
                        <tr key={row.id} className="border-b border-slate-800/60">
                          <td className="py-2 pr-4 text-white capitalize">{row.platform}</td>
                          <td className="py-2 pr-4 text-slate-200">{row.utmCampaign}</td>
                          <td className="py-2 pr-4 text-slate-200">{row.utmContent}</td>
                          <td className="py-2 pr-4 text-slate-200">{row.utmMedium}</td>
                          <td className="py-2 pr-4 text-slate-400">{row.utmTerm || "—"}</td>
                          <td className="py-2 pr-4">
                            <button
                              type="button"
                              onClick={() => handleCopy(buildLinkFromRow(row, handle))}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-emerald-500"
                            >
                              <ClipboardCopyIconInline />
                              Copiar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {builderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Crear link UTM</h2>
                <p className="text-sm text-slate-400">Define campaña y creativo para tu bio-link.</p>
              </div>
              <button className="text-sm text-slate-300 hover:text-white" onClick={() => setBuilderOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Plataforma</label>
                <select
                  value={builder.platform}
                  onChange={(e) => setBuilder((prev) => ({ ...prev, platform: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  {["tiktok", "instagram", "youtube", "x", "other"].map((p) => (
                    <option key={p} value={p}>
                      {p === "x" ? "X" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Medium</label>
                <input
                  value={builder.utmMedium}
                  onChange={(e) => setBuilder((prev) => ({ ...prev, utmMedium: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder="social"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Campaña *</label>
                <input
                  value={builder.utmCampaign}
                  onChange={(e) => setBuilder((prev) => ({ ...prev, utmCampaign: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder="launch_week1"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Contenido / Creative ID *</label>
                <input
                  value={builder.utmContent}
                  onChange={(e) => setBuilder((prev) => ({ ...prev, utmContent: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder="video_023"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Term (opcional)</label>
                <input
                  value={builder.utmTerm}
                  onChange={(e) => setBuilder((prev) => ({ ...prev, utmTerm: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder="vip"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-200 break-all flex items-center gap-2">
              <LinkIconInline />
              <span>{linkPreview}</span>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleCopy(linkPreview)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:border-emerald-500"
              >
                <ClipboardCopyIconInline />
                Copiar link
              </button>
              <button
                type="button"
                disabled={!builderValid || savingLink}
                onClick={handleSaveLink}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold",
                  builderValid ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-slate-700 text-slate-300"
                )}
              >
                {savingLink ? "Guardando..." : "Guardar campaña"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: number | string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-1">
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-3xl font-semibold text-white">{value}</div>
      {helper && <div className="text-[11px] uppercase tracking-wide text-slate-500">{helper}</div>}
    </div>
  );
}

function AggregatedTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: TableRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-300">{subtitle}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">Aún no hay datos.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                {subtitle.includes("campaign") ? (
                  <>
                    <th className="py-2 pr-4">Campaña</th>
                    <th className="py-2 pr-4">Fuente</th>
                  </>
                ) : (
                  <th className="py-2 pr-4">Contenido</th>
                )}
                <th className="py-2 pr-4">Visitas</th>
                <th className="py-2 pr-4">CTA</th>
                <th className="py-2 pr-4">Chats</th>
                <th className="py-2 pr-4">Mensajes</th>
                <th className="py-2 pr-4">Fans nuevos</th>
                <th className="py-2 pr-4">Compras</th>
                <th className="py-2 pr-4">Conv. a mensaje</th>
                <th className="py-2 pr-4">Conv. a compra</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-800/60">
                  {subtitle.includes("campaign") ? (
                    <>
                      <td className="py-2 pr-4 text-white">{row.utmCampaign}</td>
                      <td className="py-2 pr-4 text-slate-200">{row.utmSource}</td>
                    </>
                  ) : (
                    <td className="py-2 pr-4 text-white">{row.utmContent}</td>
                  )}
                  <td className="py-2 pr-4 text-emerald-200 font-semibold">{row.viewSessions}</td>
                  <td className="py-2 pr-4 text-slate-200">{row.ctaSessions}</td>
                  <td className="py-2 pr-4 text-slate-200">{row.openChatSessions}</td>
                  <td className="py-2 pr-4 text-slate-200">{row.sendMessageSessions}</td>
                  <td className="py-2 pr-4 text-slate-200">{row.fansNew}</td>
                  <td className="py-2 pr-4 text-slate-200">{row.purchaseSessions}</td>
                  <td className="py-2 pr-4 text-slate-200">
                    {row.openChatSessions ? `${((row.sendMessageSessions / row.openChatSessions) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-200">
                    {row.openChatSessions ? `${((row.purchaseSessions / row.openChatSessions) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlusIconInline() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M9 3.5a1 1 0 0 1 2 0V9h5.5a1 1 0 1 1 0 2H11v5.5a1 1 0 1 1-2 0V11H3.5a1 1 0 0 1 0-2H9V3.5Z" />
    </svg>
  );
}

function LinkIconInline() {
  return (
    <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.59 13.41a1 1 0 0 0 1.41 0l3-3a3 3 0 0 0-4.24-4.24l-1.82 1.82a1 1 0 1 0 1.42 1.42l1.82-1.82a1 1 0 0 1 1.42 1.42l-3 3a1 1 0 0 0 0 1.4ZM13.41 10.59a1 1 0 0 0-1.41 0l-3 3a3 3 0 1 0 4.24 4.24l1.82-1.82a1 1 0 1 0-1.42-1.42l-1.82 1.82a1 1 0 0 1-1.42-1.42l3-3a1 1 0 0 0 0-1.4Z" />
    </svg>
  );
}

function ClipboardCopyIconInline() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2h1.5A1.5 1.5 0 0 1 16 4.5v12A1.5 1.5 0 0 1 14.5 18h-9A1.5 1.5 0 0 1 4 16.5v-12A1.5 1.5 0 0 1 5.5 3H7Zm2 0h2V2H9v1ZM6 7.5A1.5 1.5 0 0 1 7.5 6h5A1.5 1.5 0 0 1 14 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 6 14.5v-7Z" />
    </svg>
  );
}

function buildLinkFromRow(row: CampaignLink, handle: string) {
  const base =
    (typeof window !== "undefined" && window.location?.origin) || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3005";
  if (row.slug) {
    return `${base}/u/${row.slug}`;
  }
  const params = new URLSearchParams({
    utm_source: row.utmSource,
    utm_medium: row.utmMedium,
    utm_campaign: row.utmCampaign,
    utm_content: row.utmContent,
  });
  if (row.utmTerm) params.append("utm_term", row.utmTerm);
  return `${base}/link/${row.handle || handle}?${params.toString()}`;
}
