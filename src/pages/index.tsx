import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import ConversationDetails from "../components/ConversationDetails";
import SideBar from "../components/SideBar";
import { CreatorShell } from "../components/creator/CreatorShell";
import { HomeCategorySheet, type HomeCategory } from "../components/home/HomeCategorySheet";
import { HomeFilterSheet } from "../components/home/HomeFilterSheet";
import { HomeSectionCard } from "../components/home/HomeSectionCard";
import { PublicCatalogCard, type PublicCatalogCardItem } from "../components/public-profile/PublicCatalogCard";
import { IconGlyph } from "../components/ui/IconGlyph";
import { PillButton } from "../components/ui/PillButton";
import { Skeleton } from "../components/ui/Skeleton";
import { ConversationContext } from "../context/ConversationContext";
import { useCreatorConfig } from "../context/CreatorConfigContext";
import { useRouter } from "next/router";
import { track } from "../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../lib/analyticsEvents";
import { AI_ENABLED } from "../lib/features";
import { countActiveFilters, parseHomeFilters, toHomeFiltersQuery, type HomeFilters } from "../lib/homeFilters";
import { getFanIdFromQuery } from "../lib/navigation/openCreatorChat";
import type { PublicPopClip } from "../types/publicProfile";
import { normalizeImageSrc } from "../utils/normalizeImageSrc";

const POPCLIP_PREVIEW_LIMIT = 4;
type RecommendedCreator = {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  availability?: string;
  responseTime?: string;
  locationLabel?: string | null;
  vipEnabled?: boolean;
  avgResponseHours?: number | null;
  hasPopClips?: boolean;
  distanceKm?: number | null;
  bioShort?: string | null;
};

type QuickFilter = {
  id: string;
  label: string;
  key: "avail" | "r24" | "vip";
};

type TrendingChipConfig = {
  id: string;
  label: string;
  kind: "search" | "filter" | "near";
  filterKey?: "avail" | "r24" | "vip";
};

const QUICK_FILTERS: QuickFilter[] = [
  { id: "available", label: "Disponible", key: "avail" },
  { id: "r24", label: "Responde <24h", key: "r24" },
  { id: "vip", label: "Solo VIP", key: "vip" },
];

const FILTER_QUERY_KEYS = ["km", "lat", "lng", "loc", "avail", "r24", "vip"] as const;
const DEFAULT_FILTER_KM = 25;

const TRENDING_CHIPS: TrendingChipConfig[] = [
  { id: "chat", label: "Chat privado", kind: "search" },
  { id: "popclips", label: "PopClips", kind: "search" },
  { id: "packs", label: "Packs", kind: "search" },
  { id: "audio", label: "Audio personalizado", kind: "search" },
  { id: "asmr", label: "ASMR", kind: "search" },
  { id: "roleplay", label: "Roleplay", kind: "search" },
  { id: "vip-search", label: "VIP", kind: "filter", filterKey: "vip" },
  { id: "available", label: "Disponible", kind: "filter", filterKey: "avail" },
  { id: "r24", label: "Responde <24h", kind: "filter", filterKey: "r24" },
  { id: "near", label: "Cerca de mí", kind: "near" },
];

const HOME_CATEGORIES: HomeCategory[] = [
  {
    id: "chat",
    label: "Chat y compania",
    description: "Conversaciones cercanas 1:1",
    keywords: ["chat", "compan", "conversacion", "amigos", "cercania"],
  },
  {
    id: "contenido",
    label: "Contenido creativo",
    description: "PopClips, packs y exclusivos",
    keywords: ["popclip", "clip", "contenido", "pack", "suscripcion"],
  },
  {
    id: "asmr",
    label: "ASMR y audio",
    description: "Audio personalizado y relax",
    keywords: ["asmr", "audio", "voz", "relax"],
  },
  {
    id: "roleplay",
    label: "Roleplay",
    description: "Experiencias tematicas",
    keywords: ["roleplay", "historia", "rol", "fantasia"],
  },
  {
    id: "gaming",
    label: "Gaming y directos",
    description: "Sesiones en vivo",
    keywords: ["gaming", "stream", "directo", "juego"],
  },
  {
    id: "fitness",
    label: "Fitness y bienestar",
    description: "Rutinas y motivacion",
    keywords: ["fitness", "bienestar", "rutina", "salud"],
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    id: "explore",
    title: "Explora",
    description: "Descubre perfiles y contenido que encajan contigo.",
    icon: "coin" as const,
  },
  {
    id: "save",
    title: "Guarda",
    description: "Marca favoritos para volver rápido cuando quieras.",
    icon: "gift" as const,
  },
  {
    id: "chat",
    title: "Abre chat",
    description: "Entra al chat privado cuando te encaje.",
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
        <title>IntimiPop – Inicio</title>
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
  const router = useRouter();
  const creatorHandle = (config.creatorHandle || "").trim();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [openLocationPicker, setOpenLocationPicker] = useState(false);
  const [popclips, setPopclips] = useState<PublicPopClip[]>([]);
  const [popclipsLoading, setPopclipsLoading] = useState(false);
  const [popclipsError, setPopclipsError] = useState("");
  const [recommendedCreators, setRecommendedCreators] = useState<RecommendedCreator[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorsError, setCreatorsError] = useState("");

  const filters = useMemo(
    () =>
      parseHomeFilters({
        km: router.query.km,
        lat: router.query.lat,
        lng: router.query.lng,
        loc: router.query.loc,
        avail: router.query.avail,
        r24: router.query.r24,
        vip: router.query.vip,
      }),
    [router.query.avail, router.query.km, router.query.lat, router.query.lng, router.query.loc, router.query.r24, router.query.vip]
  );
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams(toHomeFiltersQuery(filters));
    return params.toString();
  }, [filters]);
  const hasLocation = useMemo(
    () => Number.isFinite(filters.lat ?? NaN) && Number.isFinite(filters.lng ?? NaN),
    [filters.lat, filters.lng]
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 320);
    return () => clearTimeout(handle);
  }, [search]);

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

  const selectedCategory = useMemo(
    () => HOME_CATEGORIES.find((category) => category.id === selectedCategoryId) ?? null,
    [selectedCategoryId]
  );
  const filteredCreators = useMemo(() => {
    const normalizedSearch = debouncedSearch.toLowerCase();
    return recommendedCreators.filter((creator) => {
      if (selectedCategory) {
        const keywords = selectedCategory.keywords.map((word) => word.toLowerCase());
        const haystack = `${creator.displayName} ${creator.handle} ${creator.locationLabel || ""}`.toLowerCase();
        if (!keywords.some((keyword) => haystack.includes(keyword))) return false;
      }
      if (!normalizedSearch) return true;
      const haystack = `${creator.displayName} ${creator.handle} ${creator.locationLabel || ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [recommendedCreators, selectedCategory, debouncedSearch]);

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

  const packsHref = "/creator/catalog";
  const showPopclipEmpty = !popclipsLoading && !popclipsError && popclipItems.length === 0;
  const showCreatorsEmpty =
    !creatorsLoading && !creatorsError && filteredCreators.length === 0;

  const applyFilters = (nextFilters: HomeFilters) => {
    const baseQuery = sanitizeQuery(router.query);
    FILTER_QUERY_KEYS.forEach((key) => {
      delete baseQuery[key];
    });
    const mergedQuery = { ...baseQuery, ...toHomeFiltersQuery(nextFilters) };
    void router.push({ pathname: router.pathname, query: mergedQuery }, undefined, { shallow: true });
  };

  const clearQueryFilters = () => {
    const baseQuery = sanitizeQuery(router.query);
    FILTER_QUERY_KEYS.forEach((key) => {
      delete baseQuery[key];
    });
    void router.push({ pathname: router.pathname, query: baseQuery }, undefined, { shallow: true });
  };

  const resetAllFilters = () => {
    setSearch("");
    setSelectedCategoryId(null);
    clearQueryFilters();
  };

  useEffect(() => {
    const params = new URLSearchParams(filterQueryString);
    params.set("limit", "12");
    const queryString = params.toString();
    const endpoint = queryString
      ? `/api/public/creators/recommended?${queryString}`
      : "/api/public/creators/recommended";
    const controller = new AbortController();
    setCreatorsLoading(true);
    setCreatorsError("");
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as
          | { creators?: RecommendedCreator[]; items?: RecommendedCreator[] }
          | null;
        if (!res.ok || !payload) {
          setRecommendedCreators([]);
          setCreatorsError("No se pudieron cargar los creadores.");
          return;
        }
        const creators = Array.isArray(payload.creators)
          ? payload.creators
          : Array.isArray(payload.items)
          ? payload.items
          : [];
        setRecommendedCreators(creators);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setRecommendedCreators([]);
        setCreatorsError("No se pudieron cargar los creadores.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCreatorsLoading(false);
      });
    return () => controller.abort();
  }, [filterQueryString]);

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
          <div className="relative flex flex-col gap-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                INTIMIPOP
              </p>
              <h1 className="text-2xl font-semibold text-[color:var(--text)]">Explora creadores</h1>
              <p className="text-sm text-[color:var(--muted)]">
                Filtra por ubicación, disponibilidad y estilo. Abre chat cuando te encaje.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="sr-only" htmlFor="home-search">
                  Buscar
                </label>
                <input
                  id="home-search"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar creadores, packs o PopClips"
                  className="h-11 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PillButton
                  intent="secondary"
                  size="sm"
                  onClick={() => setCategorySheetOpen(true)}
                >
                  Categorías
                </PillButton>
                <PillButton
                  intent="secondary"
                  size="sm"
                  onClick={() => void router.push("/favorites")}
                >
                  Favoritos
                </PillButton>
                <PillButton
                  intent="secondary"
                  size="sm"
                  onClick={() => setFilterSheetOpen(true)}
                  className="gap-2"
                >
                  <span>Filtros</span>
                  {activeFilterCount > 0 ? (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[color:rgba(var(--brand-rgb),0.2)] px-1.5 text-[11px] font-semibold text-[color:var(--text)]">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </PillButton>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Búsquedas populares
              </p>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {TRENDING_CHIPS.map((chip) => (
                  <TrendingChip
                    key={chip.id}
                    label={chip.label}
                    onClick={() => {
                      if (chip.kind === "search") {
                        setSearch(chip.label);
                        return;
                      }
                      if (chip.kind === "filter" && chip.filterKey) {
                        applyFilters({ ...filters, [chip.filterKey]: !filters[chip.filterKey] });
                        return;
                      }
                      if (chip.kind === "near") {
                        if (!hasLocation) {
                          setOpenLocationPicker(true);
                          setFilterSheetOpen(true);
                          return;
                        }
                        applyFilters({ ...filters, km: DEFAULT_FILTER_KM });
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCategory ? (
                <FilterChip
                  label={selectedCategory.label}
                  active
                  onClick={() => setSelectedCategoryId(null)}
                />
              ) : null}
              {QUICK_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.id}
                  label={filter.label}
                  active={Boolean(filters[filter.key])}
                  onClick={() => {
                    const nextFilters: HomeFilters = {
                      ...filters,
                      [filter.key]: !filters[filter.key],
                    };
                    applyFilters(nextFilters);
                  }}
                />
              ))}
            </div>
          </div>
        </HomeSectionCard>

        <HomeSectionCard
          title="PopClips destacados"
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
              Aún no hay PopClips destacados.
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

        <HomeSectionCard
          title="Creadores recomendados"
          subtitle="Basado en actividad y señales públicas."
        >
          {creatorsLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={`creator-skeleton-${idx}`} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : creatorsError ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              {creatorsError}
            </div>
          ) : showCreatorsEmpty ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              <span>No hay resultados con estos filtros. Prueba a ampliar el radio o limpiar filtros.</span>
              <button
                type="button"
                onClick={resetAllFilters}
                aria-label="Limpiar filtros"
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredCreators.map((creator) => (
                <HomeCreatorCard key={creator.handle} creator={creator} />
              ))}
            </div>
          )}
        </HomeSectionCard>

        <HomeSectionCard
          title="Cómo funciona"
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

      <HomeCategorySheet
        open={categorySheetOpen}
        categories={HOME_CATEGORIES}
        selectedId={selectedCategoryId}
        onSelect={(category) => setSelectedCategoryId(category.id)}
        onClear={() => setSelectedCategoryId(null)}
        onClose={() => setCategorySheetOpen(false)}
      />
      <HomeFilterSheet
        open={filterSheetOpen}
        initialFilters={filters}
        onApply={applyFilters}
        onClear={clearQueryFilters}
        onClose={() => {
          setFilterSheetOpen(false);
          setOpenLocationPicker(false);
        }}
        openLocationOnMount={openLocationPicker}
      />
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
      aria-label={label}
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

function TrendingChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
    >
      {label}
    </button>
  );
}

function sanitizeQuery(query: Record<string, string | string[] | undefined>) {
  const cleaned: Record<string, string | string[]> = {};
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) return;
    cleaned[key] = value;
  });
  return cleaned;
}

function HomeCreatorCard({ creator }: { creator: RecommendedCreator }) {
  const initial = creator.displayName?.trim()?.[0]?.toUpperCase() || "C";
  const [avatarFailed, setAvatarFailed] = useState(false);
  const availabilityLabel = creator.availability || (creator.vipEnabled ? "Solo VIP" : "Disponible");
  const responseLabel = creator.responseTime || formatResponseHours(creator.avgResponseHours);
  const distanceLabel = Number.isFinite(creator.distanceKm ?? NaN)
    ? `A ${Math.round(creator.distanceKm as number)} km`
    : "";

  useEffect(() => {
    setAvatarFailed(false);
  }, [creator.avatarUrl]);

  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
            {creator.avatarUrl && !avatarFailed ? (
              <Image
                src={normalizeImageSrc(creator.avatarUrl)}
                alt={creator.displayName}
                width={48}
                height={48}
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--text)]">
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[color:var(--text)] truncate">{creator.displayName}</div>
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
        {availabilityLabel ? (
          <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            {availabilityLabel}
          </span>
        ) : null}
        {responseLabel ? (
          <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            {responseLabel}
          </span>
        ) : null}
        {distanceLabel ? (
          <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            {distanceLabel}
          </span>
        ) : creator.locationLabel ? (
          <span className="inline-flex min-w-0 max-w-full items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            <span className="truncate">{creator.locationLabel}</span>
          </span>
        ) : null}
        {creator.hasPopClips ? (
          <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            PopClips
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatResponseHours(hours?: number | null) {
  if (!Number.isFinite(hours ?? NaN)) return "";
  const rounded = Math.round(hours as number);
  if (rounded <= 24) return "Responde <24h";
  return `Resp. ~${rounded}h`;
}
