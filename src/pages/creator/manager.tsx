import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import CreatorHeader from "../../components/CreatorHeader";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import type { CreatorBusinessSnapshot, CreatorManagerSummary } from "../../lib/creatorManager";
import { getCreatorBusinessSnapshot } from "../../lib/creatorManager";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { getCreatorContentSnapshot } from "../../lib/creatorContentManager";
import type { FanManagerRow } from "../../server/manager/managerService";
import type { CreatorAiAdvisorInput } from "../../server/manager/managerSchemas";
import { IaWorkspaceCard } from "../../components/creator/IaWorkspaceCard";
import type { PublicProfileCopy, PublicProfileMode } from "../../types/publicProfile";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../../lib/publicProfileCopy";
import { getPublicProfileOverrides } from "../../lib/publicProfileStorage";
import { openCreatorChat } from "../../lib/navigation/openCreatorChat";

type Props = {
  initialSnapshot: CreatorBusinessSnapshot | null;
  initialContentSnapshot: CreatorContentSnapshot | null;
};

const CREATOR_ID = "creator-1";

export default function CreatorManagerPage({ initialSnapshot, initialContentSnapshot }: Props) {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const [summary, setSummary] = useState<CreatorManagerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [queue, setQueue] = useState<FanManagerRow[]>([]);
  const [queueError, setQueueError] = useState("");
  const [advisorInput, setAdvisorInput] = useState<CreatorAiAdvisorInput | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [advisorError, setAdvisorError] = useState(false);
  const [profileCopy, setProfileCopy] = useState<PublicProfileCopy | null>(null);
  const [bioLinkEnabled, setBioLinkEnabled] = useState<boolean | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  const profileMode: PublicProfileMode = "fanclub";
  const baseProfileCopy = useMemo(
    () => mapToPublicProfileCopy(PROFILE_COPY[profileMode], profileMode, config),
    [profileMode, config]
  );

  useEffect(() => {
    fetchSummary();
    fetchQueue();
    fetchAdvisorInput();
    fetchBioLinkStatus();
    fetchAiSettingsStatus();
  }, []);

  useEffect(() => {
    setProfileCopy(baseProfileCopy);
    const overrides = getPublicProfileOverrides(CREATOR_ID);
    if (overrides) {
      setProfileCopy(overrides);
    }
  }, [baseProfileCopy]);

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

  async function fetchAdvisorInput() {
    try {
      setAdvisorLoading(true);
      setAdvisorError(false);
      const res = await fetch("/api/creator/ai-advisor-input");
      if (!res.ok) throw new Error("Error fetching advisor input");
      const data = (await res.json()) as CreatorAiAdvisorInput;
      setAdvisorInput(data);
    } catch (_err) {
      setAdvisorError(true);
      setAdvisorInput(null);
    } finally {
      setAdvisorLoading(false);
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

  async function fetchBioLinkStatus() {
    try {
      const res = await fetch("/api/creator/bio-link");
      if (!res.ok) throw new Error("Error fetching bio-link");
      const data = await res.json();
      setBioLinkEnabled(Boolean(data?.config?.enabled));
    } catch (_err) {
      setBioLinkEnabled(false);
    }
  }

  async function fetchAiSettingsStatus() {
    try {
      const res = await fetch("/api/creator/ai-settings");
      if (!res.ok) throw new Error("Error fetching AI settings");
      const data = await res.json();
      const settings = data?.settings || {};
      const hasConfiguredTone = typeof settings.tone === "string" && settings.tone.trim().length > 0;
      const hasRules = typeof settings.rulesManifest === "string" && settings.rulesManifest.trim().length > 0;
      const hasPriority =
        settings.priorityOrderJson &&
        typeof settings.priorityOrderJson === "object" &&
        Object.keys(settings.priorityOrderJson as Record<string, unknown>).length > 0;
      const hasCredits = typeof settings.creditsAvailable === "number" && settings.creditsAvailable > 0;
      const hasMode = typeof settings.turnMode === "string" && settings.turnMode.trim().length > 0;
      setAiConfigured(Boolean(hasConfiguredTone || hasRules || hasPriority || hasCredits || hasMode));
    } catch (_err) {
      setAiConfigured(false);
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

  function handleOpenFanChat(fanId: string) {
    if (!fanId) return;
    openCreatorChat(router, fanId);
  }

  const visiblePacksCount = (profileCopy?.packs || []).filter((p) => p.visible !== false).length;
  const profileTextsReady = Boolean(profileCopy?.hero?.tagline?.trim()) && Boolean(profileCopy?.hero?.description?.trim());

  const checklistItems = [
    { key: "packs", label: "Tienes al menos un pack activo", done: visiblePacksCount > 0 },
    {
      key: "bioLink",
      label: "Bio-link activado para traer tráfico de redes",
      done: bioLinkEnabled === true,
    },
    {
      key: "profile",
      label: "Perfil público configurado (texto y packs visibles)",
      done: profileTextsReady && visiblePacksCount > 0,
    },
    {
      key: "ai",
      label: "Manager IA configurado para ayudarte con las ventas",
      done: aiConfigured === true,
    },
  ];

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
        avatarUrl={config.avatarUrl}
        onOpenSettings={() => router.push("/creator/edit")}
      />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {loading && <div className="text-sm text-slate-300">Cargando panel...</div>}
        {error && !loading && <div className="text-sm text-rose-300">{error}</div>}
        {!loading && !error && summary && (
          <>
            <section className={`rounded-lg border border-slate-800 bg-slate-900/80 p-4 space-y-3 ${checklistItems.every((i) => i.done) ? "hidden md:block" : ""} order-2 lg:order-1`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Puesta en marcha de tu espacio</h2>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">Checklist rápido</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {checklistItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                  >
                    <span
                      className={`mt-0.5 inline-flex h-3 w-3 rounded-full ${item.done ? "bg-emerald-400" : "bg-amber-400"}`}
                      aria-hidden
                    />
                    <div className="flex flex-col">
                      <span className={`text-xs font-semibold ${item.done ? "text-emerald-100" : "text-amber-100"}`}>
                        {item.done ? "Hecho" : "Pendiente"}
                      </span>
                      <span className="text-sm text-slate-100">{item.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {checklistItems.every((i) => i.done) && (
              <section className="md:hidden rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200 order-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-50">Checklist completada</p>
                    <p className="text-[11px] text-slate-400">Tu espacio está listo. Puedes revisar los pasos cuando quieras.</p>
                  </div>
                  <span className="text-emerald-300">✅</span>
                </div>
              </section>
            )}

            <section className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 order-3 lg:order-2">
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

            <div className="mt-6 space-y-6">
              <IaWorkspaceCard
                businessSnapshot={initialSnapshot}
                contentSnapshot={initialContentSnapshot}
                summary={summary}
                queue={queue}
                queueError={queueError}
                advisorInput={advisorInput ?? undefined}
                advisorError={advisorError}
                advisorLoading={advisorLoading}
                onOpenFanChat={handleOpenFanChat}
              />

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  let initialSnapshot: CreatorBusinessSnapshot | null = null;
  let initialContentSnapshot: CreatorContentSnapshot | null = null;

  try {
    initialSnapshot = await getCreatorBusinessSnapshot(creatorId);
  } catch (err) {
    console.error("Error loading business snapshot for manager chat", err);
    initialSnapshot = null;
  }

  try {
    initialContentSnapshot = await getCreatorContentSnapshot(creatorId);
  } catch (err) {
    console.error("Error loading content snapshot for content manager chat", err);
    initialContentSnapshot = null;
  }

  return {
    props: {
      initialSnapshot,
      initialContentSnapshot,
    },
  };
};
