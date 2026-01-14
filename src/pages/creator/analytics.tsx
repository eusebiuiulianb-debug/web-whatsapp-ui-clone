import Head from "next/head";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import clsx from "clsx";
import { normalizeCreatorPlatforms, CreatorPlatforms, CREATOR_PLATFORM_KEYS, formatPlatformLabel } from "../../lib/creatorPlatforms";
import { EmptyState } from "../../components/ui/EmptyState";
import { KpiCard } from "../../components/ui/KpiCard";
import { SectionCard } from "../../components/ui/SectionCard";
import { Skeleton } from "../../components/ui/Skeleton";

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

type CampaignRollup = {
  utmCampaign: string;
  viewSessions: number;
  ctaSessions: number;
  openChatSessions: number;
  sendMessageSessions: number;
  purchaseSessions: number;
  fansNew: number;
};

type CampaignMeta = {
  id: string;
  utmCampaign: string;
  title: string;
  objective: string;
  platform: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
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
  campaigns: CampaignMeta[];
  campaignRollups: CampaignRollup[];
  campaignLastLinks: CampaignLink[];
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
  const [handle, setHandle] = useState("creator");
  const [savingLink, setSavingLink] = useState(false);
  const [platforms, setPlatforms] = useState<CreatorPlatforms | null>(null);
  const [savingPlatforms, setSavingPlatforms] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignMeta[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignDeleting, setCampaignDeleting] = useState(false);
  const [campaignFormError, setCampaignFormError] = useState("");
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignTouched, setCampaignTouched] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    utmCampaign: "",
    platform: "tiktok",
    status: "draft",
    objective: "",
    notes: "",
  });
  const [builder, setBuilder] = useState<BuilderState>({
    platform: "tiktok",
    utmMedium: "social",
    utmCampaign: "",
    utmContent: "",
    utmTerm: "",
  });
  const [activeLinkCampaignId, setActiveLinkCampaignId] = useState<string | null>(null);

  useEffect(() => {
    void loadData(range);
  }, [range]);

  useEffect(() => {
    void loadHandle();
    void loadPlatforms();
    void loadCampaigns();
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
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
      const res = await fetch("/api/creator/ai-settings", { cache: "no-store" });
      const json = await res.json();
      const settingsPayload = json?.data?.settings ?? json?.settings;
      setPlatforms(normalizeCreatorPlatforms(settingsPayload?.platforms));
    } catch (_err) {
      setPlatforms(null);
    }
  }

  async function loadCampaigns() {
    try {
      setCampaignsLoading(true);
      setCampaignsError("");
      const res = await fetch("/api/campaigns");
      if (!res.ok) throw new Error("Error fetching campaigns");
      const payload = await res.json();
      setCampaigns(Array.isArray(payload?.campaigns) ? payload.campaigns : []);
    } catch (err) {
      console.error(err);
      setCampaignsError("No se pudieron cargar las campañas.");
      setCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3005";

  const utmSource = builder.platform.trim().toLowerCase();
  const utmMedium = builder.utmMedium.trim().toLowerCase() || "social";
  const utmCampaignInput = builder.utmCampaign.trim();
  const utmContentInput = builder.utmContent.trim();
  const utmCampaign = utmCampaignInput || "sin_campaña";
  const utmContent = utmContentInput || "sin_creativo";
  const utmTerm = builder.utmTerm.trim();
  const linkPreview = `${origin}/link/${handle}?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(
    utmMedium
  )}&utm_campaign=${encodeURIComponent(utmCampaign)}&utm_content=${encodeURIComponent(utmContent)}${
    utmTerm ? `&utm_term=${encodeURIComponent(utmTerm)}` : ""
  }`;

  const builderValid = Boolean(utmSource && utmMedium && utmCampaignInput && utmContentInput);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(""), 2000);
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast("Link copiado");
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
        utmCampaign: utmCampaignInput,
        utmContent: utmContentInput,
        utmTerm: utmTerm || undefined,
        }),
      });
      if (!res.ok) throw new Error("Error saving link");
      setBuilder((prev) => ({ ...prev, utmContent: "", utmTerm: "" }));
      setActiveLinkCampaignId(null);
      showToast("Link UTM guardado");
      void loadData(range);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingLink(false);
    }
  }

  const campaignMetricsByKey = useMemo(() => {
    const map = new Map<string, CampaignRollup>();
    (data?.campaignRollups ?? []).forEach((row) => {
      map.set(normalizeCampaignKey(row.utmCampaign), row);
    });
    return map;
  }, [data?.campaignRollups]);

  const campaignLastLinksByKey = useMemo(() => {
    const map = new Map<string, CampaignLink>();
    (data?.campaignLastLinks ?? []).forEach((link) => {
      map.set(normalizeCampaignKey(link.utmCampaign), link);
    });
    return map;
  }, [data?.campaignLastLinks]);

  function openCampaignModal() {
    setEditingCampaignId(null);
    setCampaignTouched(false);
    setCampaignFormError("");
    setCampaignForm({
      title: "",
      utmCampaign: "",
      platform: "tiktok",
      status: "draft",
      objective: "",
      notes: "",
    });
    setCampaignModalOpen(true);
  }

  function openCampaignEditor(campaign: CampaignMeta) {
    setEditingCampaignId(campaign.id);
    setCampaignTouched(true);
    setCampaignFormError("");
    setCampaignForm({
      title: campaign.title || "",
      utmCampaign: campaign.utmCampaign || "",
      platform: normalizePlatformKey(campaign.platform),
      status: normalizeStatusKey(campaign.status),
      objective: campaign.objective || "",
      notes: campaign.notes || "",
    });
    setCampaignModalOpen(true);
  }

  async function handleSaveCampaign() {
    const title = campaignForm.title.trim();
    const objective = campaignForm.objective.trim();
    const utmCampaignValue = slugifyCampaign(campaignForm.utmCampaign);
    if (!title || !objective || !utmCampaignValue) {
      setCampaignFormError("Completa título, objetivo y utm_campaign.");
      return;
    }
    try {
      setCampaignSaving(true);
      setCampaignFormError("");
      const payload = {
        title,
        objective,
        utmCampaign: utmCampaignValue,
        platform: campaignForm.platform,
        status: campaignForm.status,
        notes: campaignForm.notes?.trim() || null,
      };
      const res = await fetch(editingCampaignId ? `/api/campaigns/${editingCampaignId}` : "/api/campaigns", {
        method: editingCampaignId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCampaignFormError(json?.error || "No se pudo guardar la campaña.");
        return;
      }
      setCampaignModalOpen(false);
      showToast("Campaña guardada");
      void loadCampaigns();
      void loadData(range);
    } catch (err) {
      console.error(err);
      setCampaignFormError("No se pudo guardar la campaña.");
    } finally {
      setCampaignSaving(false);
    }
  }

  async function handleDeleteCampaign() {
    if (!editingCampaignId) return;
    try {
      setCampaignDeleting(true);
      setCampaignFormError("");
      const res = await fetch(`/api/campaigns/${editingCampaignId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCampaignFormError(json?.error || "No se pudo eliminar la campaña.");
        return;
      }
      setCampaignModalOpen(false);
      void loadCampaigns();
      void loadData(range);
    } catch (err) {
      console.error(err);
      setCampaignFormError("No se pudo eliminar la campaña.");
    } finally {
      setCampaignDeleting(false);
    }
  }

  function handleCampaignTitleChange(value: string) {
    setCampaignForm((prev) => {
      const nextTitle = value;
      if (campaignTouched) {
        return { ...prev, title: nextTitle };
      }
      return {
        ...prev,
        title: nextTitle,
        utmCampaign: slugifyCampaign(nextTitle),
      };
    });
  }

  function handleCampaignUtmChange(value: string) {
    setCampaignTouched(true);
    setCampaignForm((prev) => ({ ...prev, utmCampaign: value }));
  }

  function openBuilderForCampaign(campaign: CampaignMeta) {
    setBuilder((prev) => ({
      ...prev,
      platform: normalizePlatformKey(campaign.platform),
      utmMedium: prev.utmMedium?.trim() ? prev.utmMedium : "social",
      utmCampaign: campaign.utmCampaign,
      utmContent: "",
      utmTerm: "",
    }));
    setActiveLinkCampaignId(campaign.id);
  }

  async function handleDeleteCampaignRow(campaign: CampaignMeta) {
    const confirmDelete = window.confirm(`¿Eliminar la campaña "${campaign.title}"?`);
    if (!confirmDelete) return;
    try {
      setCampaignsError("");
      const res = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCampaignsError(json?.error || "No se pudo eliminar la campaña.");
        return;
      }
      void loadCampaigns();
      void loadData(range);
    } catch (err) {
      console.error(err);
      setCampaignsError("No se pudo eliminar la campaña.");
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
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
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
            <p className="text-sm text-[color:var(--muted)]">Atribución de bio-link y embudo al chat.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-1">
              {[7, 30, 90].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRange(value as 7 | 30 | 90)}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-semibold rounded-full",
                    range === value
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)]"
                      : "text-[color:var(--text)] hover:text-[color:var(--text)]"
                  )}
                >
                  Últimos {value} días
                </button>
              ))}
            </div>
          </div>
        </div>

        {toast && <div className="text-sm text-[color:var(--brand)]">{toast}</div>}
        {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}
        {loading && (
          <div className="space-y-2">
            <div className="text-sm text-[color:var(--muted)]">Cargando...</div>
            <Skeleton className="h-4 w-40" />
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <SectionCard
              title="Redes (manual)"
              subtitle="Configuración de perfiles para ideas de crecimiento. No genera links UTM."
              actions={
                <button
                  type="button"
                  onClick={savePlatforms}
                  disabled={savingPlatforms}
                  className={clsx(
                    "rounded-full px-3 py-2 text-sm font-semibold",
                    savingPlatforms
                      ? "bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                      : "bg-[color:var(--brand-strong)] text-[color:var(--text)] hover:bg-[color:var(--brand)]"
                  )}
                >
                  {savingPlatforms ? "Guardando..." : "Guardar redes"}
                </button>
              }
              bodyClassName="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREATOR_PLATFORM_KEYS.map((key) => {
                  const item = platforms?.[key] ?? { enabled: false, handle: "" };
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-[color:var(--surface-border)] bg-[var(--surface-2)] p-3 flex flex-col gap-2"
                    >
                      <label className="flex items-center gap-2 text-[13px] text-[color:var(--text)]">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) => updatePlatform(key, { enabled: e.target.checked })}
                          className="h-5 w-5 rounded border-[color:var(--surface-border)] bg-[color:var(--surface-2)] accent-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--ring)]"
                        />
                        {formatPlatformLabel(key)}
                      </label>
                      <input
                        type="text"
                        value={item.handle}
                        onChange={(e) => updatePlatform(key, { handle: e.target.value })}
                        placeholder="@usuario"
                        disabled={!item.enabled}
                        className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] disabled:opacity-60 focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                      />
                      <p className="text-[10px] text-[color:var(--muted)]">
                        {item.enabled ? "Se usa para personalizar ideas de crecimiento." : "Activa la casilla para usar esta red."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {funnelRows.every((row) => row.events === 0) ? (
              <EmptyState
                title="Aún no hay eventos registrados"
                description="Crea un link UTM y prueba el flujo completo: visita → click CTA → abrir chat → enviar mensaje."
              />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <KpiCard title="Sesiones" value={data.metrics.sessions} hint="Visitas = sesiones únicas (session_id)" size="sm" />
                  <KpiCard title="CTR CTA" value={`${data.metrics.ctr}%`} hint="cta_click_enter_chat / bio_link_view" size="sm" />
                  <KpiCard title="Chats abiertos" value={data.funnel.openChat.sessions} hint="Fans únicos que abren chat" size="sm" />
                  <KpiCard title="Mensajes" value={data.funnel.sendMessage.events} hint="Eventos send_message (conteo total)" size="sm" />
                  <KpiCard title="Fans nuevos" value={data.funnelFans.newFans} hint="distinct fanId" size="sm" />
                </div>

                <SectionCard
                  title="Embudo"
                  subtitle="Sesiones únicas (o fans únicos) y eventos por paso"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    {funnelRows.map((row) => (
                      <div key={row.label} className="rounded-xl border border-[color:var(--surface-border)] bg-[var(--surface-2)] p-3">
                        <div className="text-[10px] text-[color:var(--muted)]">{row.label}</div>
                        <div className="text-2xl font-semibold text-[color:var(--text)] tracking-tight tabular-nums leading-tight">{row.sessions}</div>
                        <div className="text-[10px] text-[color:var(--muted)]">{row.events} eventos</div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Embudo (fans reales)"
                  subtitle="Fans únicos por paso (fanId)"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {fanFunnelRows.map((row) => (
                      <div key={row.label} className="rounded-xl border border-[color:var(--surface-border)] bg-[var(--surface-2)] p-3">
                        <div className="text-[10px] text-[color:var(--muted)]">{row.label}</div>
                        <div className="text-2xl font-semibold text-[color:var(--text)] tracking-tight tabular-nums leading-tight">{row.value}</div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </>
            )}

            <SectionCard
              title="Campañas (UTM)"
              subtitle="Esto mide tráfico hacia BioLink/Chat."
              actions={
                <button
                  type="button"
                  onClick={openCampaignModal}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.16)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)]"
                >
                  <PlusIconInline />
                  Nueva campaña
                </button>
              }
              bodyClassName="space-y-4"
            >
              {campaignsError && <div className="text-sm text-[color:var(--danger)]">{campaignsError}</div>}
              {campaignsLoading && <div className="text-sm text-[color:var(--muted)]">Cargando campañas...</div>}
              {!campaignsLoading && campaigns.length === 0 && (
                <div className="text-sm text-[color:var(--muted)]">Crea tu primera campaña para ver métricas aquí.</div>
              )}
              {!campaignsLoading && campaigns.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] bg-[var(--surface-2)] border-b border-[color:var(--surface-border)]">
                        <th className="px-3 py-2.5">Título</th>
                        <th className="px-3 py-2.5">utm_campaign</th>
                        <th className="px-3 py-2.5">Plataforma</th>
                        <th className="px-3 py-2.5">Estado</th>
                        <th className="px-3 py-2.5">Objetivo</th>
                        <th className="px-3 py-2.5 text-right">Visitas</th>
                        <th className="px-3 py-2.5 text-right">CTA</th>
                        <th className="px-3 py-2.5 text-right">Chats</th>
                        <th className="px-3 py-2.5 text-right">Mensajes</th>
                        <th className="px-3 py-2.5 text-right">Fans nuevos</th>
                        <th className="px-3 py-2.5 text-right">Compras</th>
                        <th className="px-3 py-2.5">Último link</th>
                        <th className="px-3 py-2.5">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => {
                        const metrics =
                          campaignMetricsByKey.get(normalizeCampaignKey(campaign.utmCampaign)) ||
                          {
                            viewSessions: 0,
                            ctaSessions: 0,
                            openChatSessions: 0,
                            sendMessageSessions: 0,
                            purchaseSessions: 0,
                            fansNew: 0,
                            utmCampaign: campaign.utmCampaign,
                          };
                        const lastLink = campaignLastLinksByKey.get(normalizeCampaignKey(campaign.utmCampaign));
                        const lastLinkUrl = lastLink ? buildLinkFromRow(lastLink, handle) : "";
                        const isActiveLinkBuilder = activeLinkCampaignId === campaign.id;
                        return (
                          <Fragment key={campaign.id}>
                            <tr className="border-b border-[color:var(--surface-border)] align-top transition hover:bg-[color:var(--surface-2)]">
                              <td className="px-3 py-2.5 text-[color:var(--text)] font-semibold">{campaign.title}</td>
                              <td className="px-3 py-2.5 text-[color:var(--text)]">{campaign.utmCampaign}</td>
                              <td className="px-3 py-2.5">
                                <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--text)]">
                                  {formatCampaignPlatform(campaign.platform)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", statusBadgeClass(campaign.status))}>
                                  {formatStatusLabel(campaign.status)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-[color:var(--text)] min-w-[200px]">
                                <div>{campaign.objective}</div>
                                {campaign.notes && <div className="text-xs text-[color:var(--muted)]">{campaign.notes}</div>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-[color:var(--brand)] font-semibold tabular-nums">{metrics.viewSessions}</td>
                              <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{metrics.ctaSessions}</td>
                              <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{metrics.openChatSessions}</td>
                              <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{metrics.sendMessageSessions}</td>
                              <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{metrics.fansNew}</td>
                            <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{metrics.purchaseSessions}</td>
                            <td className="px-3 py-2.5 text-[color:var(--text)] min-w-[180px]">
                              {lastLink ? (
                                <div className="flex flex-col gap-2">
                                  <span className="text-xs text-[color:var(--muted)]">{truncateLink(lastLinkUrl, 38)}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(lastLinkUrl)}
                                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)] w-fit"
                                  >
                                    <ClipboardCopyIconInline />
                                    Copiar link
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-[color:var(--muted)]">Sin link</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openBuilderForCampaign(campaign)}
                                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]"
                                >
                                  <LinkIconInline />
                                  Generar link
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCampaignEditor(campaign)}
                                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCampaignRow(campaign)}
                                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--danger)] px-3 py-1.5 text-xs font-semibold text-[color:var(--danger)] hover:bg-[color:rgba(244,63,94,0.18)]"
                                  >
                                    Borrar
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isActiveLinkBuilder && (
                              <tr className="border-b border-[color:var(--surface-border)]">
                                <td colSpan={13} className="px-3 py-3">
                                  <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface-2)] p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-semibold text-[color:var(--text)]">Link UTM (campaña)</div>
                                        <div className="text-xs text-[color:var(--muted)]">Esto mide tráfico hacia BioLink/Chat.</div>
                                      </div>
                                      <button
                                        type="button"
                                        className="text-xs text-[color:var(--muted)] hover:text-[color:var(--text)]"
                                        onClick={() => setActiveLinkCampaignId(null)}
                                      >
                                        Cerrar
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-[color:var(--muted)]">utm_source</label>
                                        <input
                                          value={utmSource}
                                          readOnly
                                          className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)]"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-[color:var(--muted)]">utm_medium</label>
                                        <input
                                          value={builder.utmMedium}
                                          onChange={(e) => setBuilder((prev) => ({ ...prev, utmMedium: e.target.value }))}
                                          className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)]"
                                          placeholder="social"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-[color:var(--muted)]">utm_campaign</label>
                                        <input
                                          value={builder.utmCampaign}
                                          readOnly
                                          className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)]"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-[color:var(--muted)]">utm_content *</label>
                                        <input
                                          value={builder.utmContent}
                                          onChange={(e) => setBuilder((prev) => ({ ...prev, utmContent: e.target.value }))}
                                          className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)]"
                                          placeholder="video_023"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-[color:var(--muted)]">utm_term (opcional)</label>
                                        <input
                                          value={builder.utmTerm}
                                          onChange={(e) => setBuilder((prev) => ({ ...prev, utmTerm: e.target.value }))}
                                          className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)]"
                                          placeholder="vip"
                                        />
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] break-all flex items-center gap-2">
                                      <LinkIconInline />
                                      <span>{linkPreview}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(linkPreview)}
                                        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] px-3 py-1.5 text-xs text-[color:var(--text)] hover:border-[color:var(--brand)]"
                                      >
                                        <ClipboardCopyIconInline />
                                        Copiar link
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!builderValid || savingLink}
                                        onClick={handleSaveLink}
                                        className={clsx(
                                          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                                          builderValid
                                            ? "bg-[color:var(--brand-strong)] text-[color:var(--text)] hover:bg-[color:var(--brand)]"
                                            : "bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                                        )}
                                      >
                                        {savingLink ? "Guardando..." : "Guardar link"}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {!funnelRows.every((row) => row.events === 0) && (
              <>
                <AggregatedTable title="Top campañas" subtitle="utm_campaign + utm_source" rows={data.topCampaigns} />
                <AggregatedTable title="Top creativos" subtitle="utm_content" rows={data.topCreatives} />
              </>
            )}

            <SectionCard title="Últimos links UTM" subtitle="Copiar y usar en tus campañas" bodyClassName="space-y-3">
              {data.latestLinks.length === 0 ? (
                <div className="text-sm text-[color:var(--muted)]">Aún no hay links guardados.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] bg-[var(--surface-2)] border-b border-[color:var(--surface-border)]">
                        <th className="px-3 py-2.5">Plataforma</th>
                        <th className="px-3 py-2.5">Campaña</th>
                        <th className="px-3 py-2.5">Contenido</th>
                        <th className="px-3 py-2.5">Medium</th>
                        <th className="px-3 py-2.5">Term</th>
                        <th className="px-3 py-2.5">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.latestLinks.map((row) => (
                        <tr key={row.id} className="border-b border-[color:var(--surface-border)] transition hover:bg-[color:var(--surface-2)]">
                          <td className="px-3 py-2.5 text-[color:var(--text)] capitalize">{row.platform}</td>
                          <td className="px-3 py-2.5 text-[color:var(--text)]">{row.utmCampaign}</td>
                          <td className="px-3 py-2.5 text-[color:var(--text)]">{row.utmContent}</td>
                          <td className="px-3 py-2.5 text-[color:var(--text)]">{row.utmMedium}</td>
                          <td className="px-3 py-2.5 text-[color:var(--muted)]">{row.utmTerm || "—"}</td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => handleCopy(buildLinkFromRow(row, handle))}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs text-[color:var(--text)] hover:border-[color:var(--brand)]"
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
            </SectionCard>
          </div>
        )}
      </div>

      {campaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-overlay)] px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--text)]">
                  {editingCampaignId ? "Editar campaña" : "Nueva campaña"}
                </h2>
                <p className="text-sm text-[color:var(--muted)]">Guarda el utm_campaign para comparar resultados.</p>
              </div>
              <button className="text-sm text-[color:var(--muted)] hover:text-[color:var(--text)]" onClick={() => setCampaignModalOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs text-[color:var(--muted)]">Título *</label>
                <input
                  value={campaignForm.title}
                  onChange={(e) => handleCampaignTitleChange(e.target.value)}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-sm text-[color:var(--text)]"
                  placeholder="Lanzamiento septiembre"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs text-[color:var(--muted)]">utm_campaign *</label>
                <input
                  value={campaignForm.utmCampaign}
                  onChange={(e) => handleCampaignUtmChange(e.target.value)}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-sm text-[color:var(--text)]"
                  placeholder="lanzamiento_sep"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[color:var(--muted)]">Plataforma *</label>
                <select
                  value={campaignForm.platform}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, platform: e.target.value }))}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-sm text-[color:var(--text)]"
                >
                  {["tiktok", "instagram", "youtube", "x", "other"].map((p) => (
                    <option key={p} value={p}>
                      {formatCampaignPlatform(p)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[color:var(--muted)]">Estado *</label>
                <select
                  value={campaignForm.status}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-sm text-[color:var(--text)]"
                >
                  {["draft", "active", "paused", "ended"].map((s) => (
                    <option key={s} value={s}>
                      {formatStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs text-[color:var(--muted)]">Objetivo *</label>
                <input
                  value={campaignForm.objective}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, objective: e.target.value }))}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-sm text-[color:var(--text)]"
                  placeholder="Llevar tráfico al CTA de chat"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs text-[color:var(--muted)]">Notas (opcional)</label>
                <textarea
                  value={campaignForm.notes}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-sm text-[color:var(--text)]"
                  placeholder="Notas internas para esta campaña"
                  rows={3}
                />
              </div>
            </div>

            {campaignFormError && <div className="text-sm text-[color:var(--danger)]">{campaignFormError}</div>}

            <div className="flex items-center justify-between gap-3">
              {editingCampaignId ? (
                <button
                  type="button"
                  disabled={campaignDeleting}
                  onClick={handleDeleteCampaign}
                  className={clsx(
                    "rounded-full border px-3 py-2 text-sm font-semibold",
                    campaignDeleting
                      ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
                      : "border-[color:var(--danger)] bg-[color:rgba(244,63,94,0.16)] text-[color:var(--danger)] hover:bg-[color:rgba(244,63,94,0.24)]"
                  )}
                >
                  {campaignDeleting ? "Eliminando..." : "Eliminar"}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCampaignModalOpen(false)}
                  className="rounded-full border border-[color:var(--surface-border)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={campaignSaving}
                  onClick={handleSaveCampaign}
                  className={clsx(
                    "rounded-full px-3 py-2 text-sm font-semibold",
                    campaignSaving
                      ? "bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                      : "bg-[color:var(--brand-strong)] text-[color:var(--text)] hover:bg-[color:var(--brand)]"
                  )}
                >
                  {campaignSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AggregatedTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: TableRow[] }) {
  return (
    <SectionCard title={title} subtitle={subtitle} bodyClassName="space-y-3">
      {rows.length === 0 ? (
        <div className="text-sm text-[color:var(--muted)]">Aún no hay datos.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] bg-[var(--surface-2)] border-b border-[color:var(--surface-border)]">
                {subtitle.includes("campaign") ? (
                  <>
                    <th className="px-3 py-2.5">Campaña</th>
                    <th className="px-3 py-2.5">Fuente</th>
                  </>
                ) : (
                  <th className="px-3 py-2.5">Contenido</th>
                )}
                <th className="px-3 py-2.5 text-right">Visitas</th>
                <th className="px-3 py-2.5 text-right">CTA</th>
                <th className="px-3 py-2.5 text-right">Chats</th>
                <th className="px-3 py-2.5 text-right">Mensajes</th>
                <th className="px-3 py-2.5 text-right">Fans nuevos</th>
                <th className="px-3 py-2.5 text-right">Compras</th>
                <th className="px-3 py-2.5 text-right">Conv. a mensaje</th>
                <th className="px-3 py-2.5 text-right">Conv. a compra</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[color:var(--surface-border)] transition hover:bg-[color:var(--surface-2)]">
                  {subtitle.includes("campaign") ? (
                    <>
                      <td className="px-3 py-2.5 text-[color:var(--text)]">{row.utmCampaign}</td>
                      <td className="px-3 py-2.5 text-[color:var(--text)]">{row.utmSource}</td>
                    </>
                  ) : (
                    <td className="px-3 py-2.5 text-[color:var(--text)]">{row.utmContent}</td>
                  )}
                  <td className="px-3 py-2.5 text-right text-[color:var(--brand)] font-semibold tabular-nums">{row.viewSessions}</td>
                  <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{row.ctaSessions}</td>
                  <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{row.openChatSessions}</td>
                  <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{row.sendMessageSessions}</td>
                  <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{row.fansNew}</td>
                  <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">{row.purchaseSessions}</td>
                  <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">
                    {row.openChatSessions ? `${((row.sendMessageSessions / row.openChatSessions) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[color:var(--text)] tabular-nums">
                    {row.openChatSessions ? `${((row.purchaseSessions / row.openChatSessions) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function CampaignMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[var(--surface-2)] p-3">
      <div className="text-[10px] text-[color:var(--muted)]">{label}</div>
      <div className="text-lg font-semibold text-[color:var(--text)] tracking-tight tabular-nums leading-tight">{value}</div>
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
    <svg className="h-4 w-4 text-[color:var(--brand)]" viewBox="0 0 24 24" fill="currentColor">
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

function truncateLink(value: string, max = 40) {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function slugifyCampaign(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeCampaignKey(value: string): string {
  return (value || "").trim().toLowerCase();
}

function normalizePlatformKey(value: string): string {
  const key = (value || "").trim().toLowerCase();
  if (key === "ig" || key === "instagram") return "instagram";
  if (key === "yt" || key === "youtube") return "youtube";
  if (key === "tiktok") return "tiktok";
  if (key === "x") return "x";
  return "other";
}

function normalizeStatusKey(value: string): string {
  const key = (value || "").trim().toLowerCase();
  if (key === "active" || key === "paused" || key === "ended") return key;
  return "draft";
}

function formatCampaignPlatform(value: string): string {
  const key = normalizePlatformKey(value);
  if (key === "tiktok") return "TikTok";
  if (key === "instagram") return "Instagram";
  if (key === "youtube") return "YouTube";
  if (key === "x") return "X";
  return "Otro";
}

function formatStatusLabel(value: string): string {
  const key = normalizeStatusKey(value);
  if (key === "active") return "Activa";
  if (key === "paused") return "Pausada";
  if (key === "ended") return "Finalizada";
  return "Borrador";
}

function statusBadgeClass(value: string): string {
  const key = normalizeStatusKey(value);
  if (key === "active")
    return "border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]";
  if (key === "paused") return "border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.12)] text-[color:var(--text)]";
  if (key === "ended") return "border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]/70 text-[color:var(--muted)]";
  return "border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)]";
}
