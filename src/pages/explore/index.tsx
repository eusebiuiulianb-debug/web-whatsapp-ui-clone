import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeCategorySheet, type HomeCategory } from "../../components/home/HomeCategorySheet";
import { HomeFilterSheet } from "../../components/home/HomeFilterSheet";
import { HomeSectionCard } from "../../components/home/HomeSectionCard";
import { CategoryTiles, type CategoryTile } from "../../components/explore/CategoryTiles";
import { PopClipTile } from "../../components/popclips/PopClipTile";
import { IconGlyph } from "../../components/ui/IconGlyph";
import { PillButton } from "../../components/ui/PillButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { useRouter } from "next/router";
import { countActiveFilters, parseHomeFilters, toHomeFiltersQuery, type HomeFilters } from "../../lib/homeFilters";
import { getLikedClips, toggleClipLike } from "../../lib/likes";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

const FEED_PAGE_SIZE = 24;
const FEED_SKELETON_COUNT = 12;
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

type PopClipFeedItem = {
  id: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  previewImageUrl?: string | null;
  durationSec?: number | null;
  createdAt: string;
  creator: {
    handle: string;
    displayName: string;
    avatarUrl?: string | null;
    vipEnabled?: boolean;
    avgResponseHours?: number | null;
    isAvailable?: boolean;
    locationLabel?: string | null;
  };
  stats?: {
    likeCount?: number;
    commentCount?: number;
  };
  distanceKm?: number | null;
};

const FILTER_QUERY_KEYS = ["km", "lat", "lng", "loc", "avail", "r24", "vip"] as const;
const DEFAULT_FILTER_KM = 25;

const CATEGORY_TILES: CategoryTile[] = [
  { id: "chat", label: "Chat privado", icon: "send", kind: "search", searchValue: "chat" },
  { id: "popclips", label: "PopClips", icon: "video", kind: "scroll" },
  { id: "packs", label: "Packs", icon: "gift", kind: "search", searchValue: "packs" },
  { id: "audio", label: "Audio personalizado", icon: "audio", kind: "search", searchValue: "audio" },
  { id: "asmr", label: "ASMR", icon: "spark", kind: "search", searchValue: "asmr" },
  { id: "roleplay", label: "Roleplay", icon: "flame", kind: "search", searchValue: "roleplay" },
  { id: "filters", label: "Más filtros", icon: "settings", kind: "filters" },
];

const HOME_CATEGORIES: HomeCategory[] = [
  {
    id: "chat",
    label: "Chat y compañía",
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
    description: "Experiencias temáticas",
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
    description: "Rutinas y motivación",
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
    description: "Guarda clips que te gustan para volver rápido cuando quieras.",
    icon: "gift" as const,
  },
  {
    id: "chat",
    title: "Abre chat",
    description: "Entra al chat privado cuando te encaje.",
    icon: "send" as const,
  },
];

export default function Explore() {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === "development";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [openLocationPicker, setOpenLocationPicker] = useState(false);
  const [feedItems, setFeedItems] = useState<PopClipFeedItem[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedKey, setSeedKey] = useState(0);
  const [likedClips, setLikedClips] = useState<string[]>([]);
  const [likesOnly, setLikesOnly] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    [
      router.query.avail,
      router.query.km,
      router.query.lat,
      router.query.lng,
      router.query.loc,
      router.query.r24,
      router.query.vip,
    ]
  );
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams(toHomeFiltersQuery(filters));
    return params.toString();
  }, [filters]);
  const likedClipSet = useMemo(() => new Set(likedClips), [likedClips]);
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
    setLikedClips(getLikedClips());
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage("");
    }, 2000);
  }, []);

  const handleToggleLike = useCallback(
    (clipId: string) => {
      const isNowLiked = toggleClipLike(clipId);
      setLikedClips(getLikedClips());
      showToast(isNowLiked ? "Te gusta este clip" : "Ya no te gusta");
    },
    [showToast]
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(filterQueryString);
    params.set("take", String(FEED_PAGE_SIZE));
    const endpoint = `/api/public/popclips/feed?${params.toString()}`;
    setFeedLoading(true);
    setFeedError("");
    setFeedItems([]);
    setFeedCursor(null);
    setSeedError("");
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as
          | { items?: PopClipFeedItem[]; nextCursor?: string | null }
          | null;
        if (!res.ok || !payload || !Array.isArray(payload.items)) {
          setFeedItems([]);
          setFeedError("No se pudieron cargar los PopClips.");
          return;
        }
        setFeedItems(payload.items);
        setFeedCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFeedItems([]);
        setFeedError("No se pudieron cargar los PopClips.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setFeedLoading(false);
      });
    return () => controller.abort();
  }, [filterQueryString, seedKey]);

  const selectedCategory = useMemo(
    () => HOME_CATEGORIES.find((category) => category.id === selectedCategoryId) ?? null,
    [selectedCategoryId]
  );
  const normalizedSearch = debouncedSearch.toLowerCase();
  const filteredFeedItems = useMemo(() => {
    if (!selectedCategory && !normalizedSearch && !likesOnly) return feedItems;
    return feedItems.filter((item) => {
      if (likesOnly && !likedClipSet.has(item.id)) return false;
      const haystack = `${item.title || ""} ${item.creator.displayName} ${item.creator.handle} ${
        item.creator.locationLabel || ""
      }`.toLowerCase();
      if (selectedCategory) {
        const keywords = selectedCategory.keywords.map((word) => word.toLowerCase());
        if (!keywords.some((keyword) => haystack.includes(keyword))) return false;
      }
      if (!normalizedSearch) return true;
      return haystack.includes(normalizedSearch);
    });
  }, [feedItems, selectedCategory, normalizedSearch, likesOnly, likedClipSet]);
  const filteredCreators = useMemo(() => {
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
  }, [recommendedCreators, selectedCategory, normalizedSearch]);

  const showFeedEmpty = !feedLoading && !feedError && filteredFeedItems.length === 0;
  const likesEmpty = likesOnly && likedClips.length === 0;
  const likesNoMatch = likesOnly && likedClips.length > 0;
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

  const scrollToPopclips = () => {
    if (typeof window === "undefined") return;
    const target = document.getElementById("popclips");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCategorySelect = (item: CategoryTile) => {
    if (item.kind === "search") {
      setSearch(item.searchValue || item.label);
      scrollToPopclips();
      return;
    }
    if (item.kind === "filter" && item.filterKey) {
      applyFilters({ ...filters, [item.filterKey]: !filters[item.filterKey] });
      scrollToPopclips();
      return;
    }
    if (item.kind === "filters") {
      setFilterSheetOpen(true);
      return;
    }
    if (item.kind === "near") {
      if (!hasLocation) {
        setOpenLocationPicker(true);
        setFilterSheetOpen(true);
        scrollToPopclips();
        return;
      }
      applyFilters({ ...filters, km: DEFAULT_FILTER_KM });
      scrollToPopclips();
      return;
    }
    if (item.kind === "scroll") {
      scrollToPopclips();
    }
  };

  const handleSeedDemo = useCallback(async () => {
    if (!isDev || seedLoading) return;
    setSeedLoading(true);
    setSeedError("");
    try {
      const res = await fetch("/api/dev/seed-popclips", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; created?: number } | null;
      if (!res.ok || !payload?.ok) {
        setSeedError("No se pudieron generar los clips demo.");
        return;
      }
      setSeedKey((prev) => prev + 1);
    } catch (_err) {
      setSeedError("No se pudieron generar los clips demo.");
    } finally {
      setSeedLoading(false);
    }
  }, [isDev, seedLoading]);

  const loadMoreFeed = useCallback(async () => {
    if (!feedCursor || feedLoadingMore) return;
    const controller = new AbortController();
    const params = new URLSearchParams(filterQueryString);
    params.set("take", String(FEED_PAGE_SIZE));
    params.set("cursor", feedCursor);
    const endpoint = `/api/public/popclips/feed?${params.toString()}`;
    setFeedLoadingMore(true);
    try {
      const res = await fetch(endpoint, { signal: controller.signal });
      const payload = (await res.json().catch(() => null)) as
        | { items?: PopClipFeedItem[]; nextCursor?: string | null }
        | null;
      if (!res.ok || !payload || !Array.isArray(payload.items)) {
        setFeedError("No se pudieron cargar mas PopClips.");
        return;
      }
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setFeedItems((prev) => mergeUniqueFeedItems([...prev, ...nextItems]));
      setFeedCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setFeedError("No se pudieron cargar mas PopClips.");
    } finally {
      setFeedLoadingMore(false);
    }
  }, [feedCursor, feedLoadingMore, filterQueryString]);

  const openPopclip = useCallback(
    (item: PopClipFeedItem) => {
      const baseQuery = sanitizeQuery(router.query);
      baseQuery.popclip = item.id;
      void router.push(
        { pathname: `/c/${encodeURIComponent(item.creator.handle)}`, query: baseQuery },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

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
    <>
      <Head>
        <title>IntimiPop - Explorar</title>
      </Head>
      <div className="flex min-h-screen w-full flex-col overflow-y-auto">
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
                    intent={likesOnly ? "primary" : "secondary"}
                    size="sm"
                    aria-pressed={likesOnly}
                    onClick={() => setLikesOnly((prev) => !prev)}
                  >
                    Me gusta
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

              {selectedCategory ? (
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip
                    label={selectedCategory.label}
                    active
                    onClick={() => setSelectedCategoryId(null)}
                  />
                </div>
              ) : null}
            </div>
          </HomeSectionCard>

          <HomeSectionCard title="Explora por" subtitle="Atajos rápidos para afinar tu feed.">
            <CategoryTiles
              items={CATEGORY_TILES}
              filters={filters}
              activeSearch={search}
              hasLocation={hasLocation}
              hasActiveFilters={activeFilterCount > 0}
              onSelect={handleCategorySelect}
            />
          </HomeSectionCard>

          <div id="popclips" className="scroll-mt-24">
          <HomeSectionCard
            title="PopClips"
            subtitle="Explora clips y entra al chat cuando te encaje."
          >
            {feedLoading && feedItems.length === 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
                {Array.from({ length: FEED_SKELETON_COUNT }).map((_, idx) => (
                  <div
                    key={`feed-skeleton-${idx}`}
                    className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3"
                  >
                    <Skeleton className="aspect-[4/5] w-full rounded-xl" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-9 flex-1 rounded-full" />
                      <Skeleton className="h-9 flex-1 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : feedError ? (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                {feedError}
              </div>
            ) : showFeedEmpty ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                {likesEmpty ? (
                  <>
                    <span className="text-sm font-semibold text-[color:var(--text)]">
                      Aún no te gusta ningún clip
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      Explora y toca el corazón para guardar tus likes aquí.
                    </span>
                  </>
                ) : likesNoMatch ? (
                  <span>No hay clips con me gusta y estos filtros.</span>
                ) : (
                  <span>Aún no hay PopClips. Prueba a quitar filtros o vuelve más tarde.</span>
                )}
                {likesOnly ? (
                  <button
                    type="button"
                    onClick={() => setLikesOnly(false)}
                    className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  >
                    Ver todo
                  </button>
                ) : null}
                {seedError ? <span className="text-[color:var(--danger)]">{seedError}</span> : null}
                {isDev ? (
                  <button
                    type="button"
                    onClick={handleSeedDemo}
                    disabled={seedLoading}
                    className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                  >
                    {seedLoading ? "Generando..." : "Generar clips demo"}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
                  {filteredFeedItems.map((item) => (
                    <PopClipTile
                      key={item.id}
                      item={item}
                      onOpen={() => openPopclip(item)}
                      profileHref={`/c/${encodeURIComponent(item.creator.handle)}`}
                      chatHref={appendReturnTo(`/go/${encodeURIComponent(item.creator.handle)}`, router.asPath)}
                      isLiked={likedClipSet.has(item.id)}
                      onToggleLike={() => handleToggleLike(item.id)}
                    />
                  ))}
                </div>
                {feedCursor ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadMoreFeed()}
                      disabled={feedLoadingMore}
                      className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                    >
                      {feedLoadingMore ? "Cargando..." : "Cargar mas"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </HomeSectionCard>
          </div>

          {(showFeedEmpty || feedError) && !likesOnly ? (
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
          ) : null}

          <HomeSectionCard title="Cómo funciona">
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

        {toastMessage ? (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 w-[min(90vw,360px)] -translate-x-1/2">
            <div className="rounded-full border border-[color:var(--surface-border)] bg-[color:rgba(17,24,39,0.8)] px-4 py-2 text-center text-xs font-semibold text-white shadow-lg backdrop-blur-md">
              {toastMessage}
            </div>
          </div>
        ) : null}

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
    </>
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

function sanitizeQuery(query: Record<string, string | string[] | undefined>) {
  const cleaned: Record<string, string | string[]> = {};
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) return;
    cleaned[key] = value;
  });
  return cleaned;
}

function mergeUniqueFeedItems(items: PopClipFeedItem[]) {
  const seen = new Set<string>();
  const merged: PopClipFeedItem[] = [];
  items.forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });
  return merged;
}

function appendReturnTo(url: string, returnTo: string) {
  if (!url) return url;
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return url;
  if (url.includes("returnTo=")) return url;
  const encoded = encodeURIComponent(returnTo);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}returnTo=${encoded}`;
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
