import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import ConversationDetails from "../components/ConversationDetails";
import SideBar from "../components/SideBar";
import { CreatorShell } from "../components/creator/CreatorShell";
import { HomeSectionCard } from "../components/home/HomeSectionCard";
import { PublicCatalogCard, type PublicCatalogCardItem } from "../components/public-profile/PublicCatalogCard";
import { IconGlyph } from "../components/ui/IconGlyph";
import { Skeleton } from "../components/ui/Skeleton";
import { ConversationContext } from "../context/ConversationContext";
import { useCreatorConfig } from "../context/CreatorConfigContext";
import { useRouter } from "next/router";
import { track } from "../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../lib/analyticsEvents";
import { AI_ENABLED } from "../lib/features";
import { getFanIdFromQuery } from "../lib/navigation/openCreatorChat";
import type { PublicPopClip } from "../types/publicProfile";
import { normalizeImageSrc } from "../utils/normalizeImageSrc";

const POPCLIP_PREVIEW_LIMIT = 4;
const HERO_FILTERS_BASE = ["Nuevos", "Top", "Online", "18+ OK"];

type RecommendedCreator = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
  availability: string;
  responseSla: string;
  location?: string;
};

const MOCK_RECOMMENDED_CREATORS: RecommendedCreator[] = [
  {
    id: "demo-1",
    name: "Luna V.",
    handle: "luna-v",
    availability: "Disponible",
    responseSla: "Responde <24h",
    location: "Madrid (aprox.)",
  },
  {
    id: "demo-2",
    name: "Sofia M.",
    handle: "sofia-m",
    availability: "Solo VIP",
    responseSla: "Responde al momento",
    location: "Valencia (aprox.)",
  },
  {
    id: "demo-3",
    name: "Bruno S.",
    handle: "bruno-s",
    availability: "Disponible",
    responseSla: "Responde <72h",
    location: "Sevilla (aprox.)",
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    id: "recharge",
    title: "Recarga",
    description: "Recarga saldo para desbloquear packs y chats.",
    icon: "coin" as const,
  },
  {
    id: "pack",
    title: "Compra un pack",
    description: "Accede a contenido y beneficios exclusivos.",
    icon: "gift" as const,
  },
  {
    id: "chat",
    title: "Chat privado",
    description: "Inicia conversaciones 1:1 con tus creadores.",
    icon: "send" as const,
  },
];

export default function Home() {
  const { conversation, openManagerPanel } = useContext(ConversationContext);
  const aiEnabled = AI_ENABLED;
  const hasConversation = Boolean(conversation?.id);
  const hasContactName = Boolean(conversation?.contactName);
  const router = useRouter();
  const queryFan = router.query.fan;
  const queryFanId = router.query.fanId;
  const [ mobileView, setMobileView ] = useState<"board" | "chat">("board");
  const conversationSectionRef = useRef<HTMLDivElement>(null!);
  const lastTrackedFanRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasConversation) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) return;
    setMobileView("chat");
    conversationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasConversation]);

  useEffect(() => {
    if (!aiEnabled) return;
    if (typeof window === "undefined") return;
    const handleOpenInternalPanel = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as
        | { fanId?: string; source?: string }
        | undefined;
      const targetFanId = detail?.fanId ?? null;
      openManagerPanel({
        tab: "manager",
        targetFanId: targetFanId ?? null,
        source: detail?.source ?? "event",
      });
    };
    window.addEventListener("novsy:openInternalPanel", handleOpenInternalPanel as EventListener);
    return () => {
      window.removeEventListener("novsy:openInternalPanel", handleOpenInternalPanel as EventListener);
    };
  }, [aiEnabled, openManagerPanel]);

  useEffect(() => {
    if (!hasConversation || !conversation?.id) return;
    if (lastTrackedFanRef.current === conversation.id) return;
    lastTrackedFanRef.current = conversation.id;
    track(ANALYTICS_EVENTS.OPEN_CHAT, { fanId: conversation.id });
  }, [hasConversation, conversation?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fanIdFromQuery = getFanIdFromQuery({ fan: queryFan, fanId: queryFanId });
    if (!fanIdFromQuery) return;
    if (window.innerWidth < 1024) {
      setMobileView("chat");
      conversationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [queryFan, queryFanId]);

  useEffect(() => {
    if (hasConversation) return;
    setMobileView("board");
  }, [hasConversation]);

  return (
    <>
      <Head>
        <title>NOVSY – Chat privado</title>
      </Head>
      <CreatorShell
        mobileView={mobileView}
        onBackToBoard={() => setMobileView("board")}
        sidebar={<SideBar />}
        showChat={hasContactName}
        renderChat={({ onBackToBoard }) => (
          <ConversationDetails onBackToBoard={onBackToBoard} />
        )}
        fallback={<HomeFallback />}
        conversationSectionRef={conversationSectionRef}
      />
    </>
  );
}

function HomeFallback() {
  const { config } = useCreatorConfig();
  const creatorHandle = (config.creatorHandle || "").trim();
  const creatorName = (config.creatorName || "").trim();
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState<string>("Top");
  const [popclips, setPopclips] = useState<PublicPopClip[]>([]);
  const [popclipsLoading, setPopclipsLoading] = useState(false);
  const [popclipsError, setPopclipsError] = useState("");
  const [showNearbyChip, setShowNearbyChip] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowNearbyChip(Boolean(navigator?.geolocation));
  }, []);

  useEffect(() => {
    if (!creatorHandle) {
      setPopclips([]);
      setPopclipsLoading(false);
      return;
    }
    const controller = new AbortController();
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}&limit=6`;
    setPopclipsLoading(true);
    setPopclipsError("");
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as
          | { popclips?: PublicPopClip[] }
          | null;
        if (!res.ok || !payload || !Array.isArray(payload.popclips)) {
          setPopclips([]);
          setPopclipsError("No se pudieron cargar los PopClips.");
          return;
        }
        setPopclips(payload.popclips);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPopclips([]);
        setPopclipsError("No se pudieron cargar los PopClips.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPopclipsLoading(false);
      });
    return () => controller.abort();
  }, [creatorHandle]);

  const heroFilters = useMemo(() => {
    const base = [...HERO_FILTERS_BASE];
    if (showNearbyChip) base.unshift("Cerca de ti");
    return base;
  }, [showNearbyChip]);

  const popclipItems = useMemo<PublicCatalogCardItem[]>(() => {
    return popclips.slice(0, POPCLIP_PREVIEW_LIMIT).map((clip) => ({
      id: clip.id,
      kind: "popclip",
      title: clip.title?.trim() || "PopClip",
      priceCents: clip.pack?.priceCents,
      currency: clip.pack?.currency,
      thumbUrl: clip.posterUrl || clip.pack?.coverUrl || null,
    }));
  }, [popclips]);

  const encodedHandle = creatorHandle ? encodeURIComponent(creatorHandle) : "";
  const popclipsBaseHref = encodedHandle ? `/c/${encodedHandle}` : "/discover";
  const popclipOpenHref = (clipId: string) =>
    encodedHandle ? `/c/${encodedHandle}?popclip=${encodeURIComponent(clipId)}` : "/discover";

  const heroTitle = creatorName ? `Hola ${creatorName}` : "Bienvenido a NOVSY";
  const packsHref = "/creator/catalog";
  const showPopclipEmpty = !popclipsLoading && !popclipsError && popclipItems.length === 0;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <HomeSectionCard className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(var(--brand-rgb), 0.12), transparent 40%), radial-gradient(circle at 80% 0%, rgba(59,130,246,0.18), transparent 45%), linear-gradient(135deg, var(--surface-1) 0%, var(--surface-2) 100%)",
            }}
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  NOVSY HOME
                </p>
                <h1 className="text-3xl font-semibold text-[color:var(--text)]">{heroTitle}</h1>
                <p className="text-sm text-[color:var(--muted)]">
                  Gestiona chats privados, PopClips y packs desde una sola vista.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <label className="sr-only" htmlFor="home-search">
                    Buscar
                  </label>
                  <input
                    id="home-search"
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar PopClips, packs o fans"
                    className="h-11 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:var(--surface-2)]"
                  aria-label="Abrir filtros"
                >
                  Filtros
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {heroFilters.map((label) => (
                  <FilterChip
                    key={label}
                    label={label}
                    active={activeChip === label}
                    onClick={() => setActiveChip((prev) => (prev === label ? "" : label))}
                  />
                ))}
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-col">
              <Link
                href="/discover"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)] sm:w-auto"
              >
                Abrir asistente
              </Link>
              <Link
                href={popclipsBaseHref}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[color:rgba(59,130,246,0.6)] bg-[color:rgba(59,130,246,0.12)] px-4 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:rgba(59,130,246,0.2)] sm:w-auto"
              >
                Ver PopClips
              </Link>
            </div>
          </div>
        </HomeSectionCard>

        <HomeSectionCard
          title="PopClips"
          rightSlot={
            <Link
              href={popclipsBaseHref}
              className="text-sm font-semibold text-[color:var(--brand)] hover:text-[color:var(--brand-strong)]"
            >
              Ver todo
            </Link>
          }
        >
          {popclipsLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: POPCLIP_PREVIEW_LIMIT }).map((_, idx) => (
                <Skeleton key={`popclip-skeleton-${idx}`} className="h-[240px] w-full rounded-2xl" />
              ))}
            </div>
          ) : popclipsError ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              {popclipsError}
            </div>
          ) : showPopclipEmpty ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              Aun no hay PopClips publicados.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {popclipItems.map((item) => (
                <Link
                  key={item.id}
                  href={popclipOpenHref(item.id)}
                  className="group block focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)] rounded-2xl"
                  aria-label={`Abrir ${item.title}`}
                >
                  <PublicCatalogCard item={item} />
                </Link>
              ))}
            </div>
          )}
        </HomeSectionCard>

        <HomeSectionCard title="Creadores recomendados">
          <div className="flex flex-col gap-3">
            {/* TODO: replace with a public creators feed when available. */}
            {MOCK_RECOMMENDED_CREATORS.map((creator) => (
              <HomeCreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
        </HomeSectionCard>

        <HomeSectionCard
          title="Como funciona"
          rightSlot={
            <Link
              href={packsHref}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              Ver packs
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div
                key={step.id}
                className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)]">
                    <IconGlyph name={step.icon} ariaHidden />
                  </span>
                  {step.title}
                </div>
                <p className="mt-2 text-xs text-[color:var(--muted)]">{step.description}</p>
              </div>
            ))}
          </div>
        </HomeSectionCard>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
          : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
      )}
    >
      {label}
    </button>
  );
}

function HomeCreatorCard({ creator }: { creator: RecommendedCreator }) {
  const initial = creator.name?.trim()?.[0]?.toUpperCase() || "C";

  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
            {creator.avatarUrl ? (
              <Image
                src={normalizeImageSrc(creator.avatarUrl)}
                alt={creator.name}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--text)]">
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[color:var(--text)] truncate">{creator.name}</div>
            <div className="text-xs text-[color:var(--muted)] truncate">@{creator.handle}</div>
          </div>
        </div>
        <Link
          href={`/c/${creator.handle}`}
          className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          Ver perfil
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
          {creator.availability}
        </span>
        <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
          {creator.responseSla}
        </span>
        {creator.location ? (
          <span className="inline-flex min-w-0 max-w-full items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            <span className="truncate">{creator.location}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
