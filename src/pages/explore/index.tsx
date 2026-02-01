import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { Clock, Search, X } from "lucide-react";
import useSWR from "swr";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { HomeCategorySheet, type HomeCategory } from "../../components/home/HomeCategorySheet";
import { HomeSectionCard } from "../../components/home/HomeSectionCard";
import { LocationFilterModal } from "../../components/location/LocationFilterModal";
import { DesktopMenuNav } from "../../components/navigation/DesktopMenuNav";
import { PublicStickyHeader } from "../../components/navigation/PublicStickyHeader";
import { PopClipViewer } from "../../components/popclips/PopClipViewer";
import { PopClipTile, type PopClipTileItem } from "../../components/popclips/PopClipTile";
import { PopClipFeedProvider, usePopClipFeedContext } from "../../components/popclips/PopClipFeedContext";
import {
  ExploreSkeleton,
  ExploreSkeletonChips,
  ExploreSkeletonSearch,
} from "../../components/skeletons/ExploreSkeleton";
import { IconGlyph } from "../../components/ui/IconGlyph";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { PillButton } from "../../components/ui/PillButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { VerifiedInlineBadge } from "../../components/ui/VerifiedInlineBadge";
import { useRouter } from "next/router";
import { AuthModal } from "../../components/auth/AuthModal";
import { subscribeCreatorStatusUpdates } from "../../lib/creatorStatusEvents";
import { consumePendingAction, setPendingAction } from "../../lib/auth/pendingAction";
import {
  SAVED_POPCLIPS_KEY,
  buildSavedPopclipMap,
  fetchSavedPopclips,
  removeSavedPopclip,
  upsertSavedPopclip,
} from "../../lib/savedPopclips";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

const FEED_PAGE_SIZE = 24;
const FEED_SKELETON_COUNT = 12;
const LOAD_MORE_SKELETON_COUNT = 6;
type RecommendedCreator = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isPro?: boolean;
  availability?: string;
  responseTime?: string;
  locationLabel?: string | null;
  allowLocation?: boolean;
  vipEnabled?: boolean;
  hasPopClips?: boolean;
  distanceKm?: number | null;
  bioShort?: string | null;
};

type PopClipFeedItem = {
  id: string;
  creatorId: string;
  packId?: string | null;
  title?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  previewImageUrl?: string | null;
  videoUrl?: string | null;
  mediaType?: string | null;
  assetType?: string | null;
  durationSec?: number | null;
  createdAt: string;
  savesCount?: number | null;
  commentCount?: number;
  creatorRating?: number | null;
  creatorReviewCount?: number | null;
  creator: {
    handle: string;
    displayName: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    isPro?: boolean;
    vipEnabled?: boolean;
    isAvailable?: boolean;
    locationLabel?: string | null;
    allowLocation?: boolean;
    responseTime?: string | null;
    popclipPreviewLimit?: number;
    ratingAvg?: number | null;
    ratingCount?: number | null;
    offerTags?: string[] | null;
  };
  stats?: {
    likeCount?: number;
    commentCount?: number;
  };
  distanceKm?: number | null;
};

type ExplorePlace = {
  label: string;
  lat: number;
  lng: number;
  placeId?: string | null;
};

type ExploreFilters = {
  location?: {
    place: ExplorePlace;
    radiusKm: number;
  };
};

type ExploreIntent = "popclips" | "packs" | "chat";

type SearchActionKind = "query" | "recent" | "shortcut" | "category";

type SearchAction = {
  id: string;
  label: string;
  kind: SearchActionKind;
  index: number;
  icon?: "search" | "clock";
  onSelect: () => void;
};

const DEFAULT_FILTER_KM = 25;
const MIN_FILTER_KM = 1;
const MAX_FILTER_KM = 200;
const RECENT_SEARCH_KEY = "ip_recent_searches_v1";
const MAX_RECENT_SEARCHES = 6;
const STORAGE_KEY = "explore:appliedFilters:v1";

function cloneExploreFilters(filters: ExploreFilters): ExploreFilters {
  if (!filters.location?.place) return {};
  const place = filters.location.place;
  const radiusKm = Number.isFinite(filters.location.radiusKm ?? NaN)
    ? filters.location.radiusKm
    : DEFAULT_FILTER_KM;
  return {
    location: {
      place: { ...place },
      radiusKm,
    },
  };
}

function isValidExploreFilters(value: unknown): value is ExploreFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!("location" in record)) return true;
  if (record.location == null) return true;
  if (typeof record.location !== "object" || Array.isArray(record.location)) return false;
  const location = record.location as Record<string, unknown>;
  if (typeof location.radiusKm !== "number" || !Number.isFinite(location.radiusKm)) return false;
  if (typeof location.place !== "object" || location.place === null || Array.isArray(location.place)) return false;
  const place = location.place as Record<string, unknown>;
  if (typeof place.label !== "string") return false;
  if (typeof place.lat !== "number" || !Number.isFinite(place.lat)) return false;
  if (typeof place.lng !== "number" || !Number.isFinite(place.lng)) return false;
  if (place.placeId != null && typeof place.placeId !== "string") return false;
  return true;
}

const readRecentSearches = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: string[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(trimmed);
      if (items.length >= MAX_RECENT_SEARCHES) break;
    }
    return items;
  } catch (_err) {
    return [];
  }
};

const writeRecentSearches = (items: string[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(items));
};

const buildRecentSearches = (term: string, current: string[]) => {
  const trimmed = term.trim();
  if (!trimmed) return current;
  const key = trimmed.toLowerCase();
  const next = [trimmed, ...current.filter((item) => item.trim().toLowerCase() !== key)];
  return next.slice(0, MAX_RECENT_SEARCHES);
};

const SEARCH_PANEL_CATEGORIES = [
  { id: "asmr", label: "ASMR", categoryId: "asmr" },
  { id: "roleplay", label: "Roleplay", categoryId: "roleplay" },
  { id: "audio", label: "Audio personalizado", categoryId: "audio" },
  { id: "packs", label: "Packs", categoryId: "packs" },
] as const;

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
    id: "audio",
    label: "Audio personalizado",
    description: "Mensajes a medida y personalizados",
    keywords: ["audio", "voz", "personalizado", "mensaje"],
  },
  {
    id: "roleplay",
    label: "Roleplay",
    description: "Experiencias temáticas",
    keywords: ["roleplay", "historia", "rol", "fantasia"],
  },
  {
    id: "packs",
    label: "Packs",
    description: "Colecciones y contenidos destacados",
    keywords: ["pack", "packs", "suscripcion", "contenido"],
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
    description: "Guarda clips para volver rápido cuando te encajen.",
    icon: "gift" as const,
  },
  {
    id: "chat",
    title: "Abre chat",
    description: "Entra al chat privado cuando te encaje.",
    icon: "send" as const,
  },
];

const ExploreContentNoSSR = dynamic(() => Promise.resolve(ExploreContent), { ssr: false });

export default function Explore() {
  return (
    <PopClipFeedProvider>
      <ExploreContentNoSSR />
    </PopClipFeedProvider>
  );
}

function ExploreContent() {
  const router = useRouter();
  const feedContext = usePopClipFeedContext();
  const isDev = process.env.NODE_ENV === "development";
  const debugExplore = process.env.NEXT_PUBLIC_DEBUG_EXPLORE === "1";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<ExploreFilters>({});
  const [draftFilters, setDraftFilters] = useState<ExploreFilters>({});
  const [feedItems, setFeedItems] = useState<PopClipFeedItem[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const feedRequestKeyRef = useRef(0);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const loadMorePendingRef = useRef(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedKey, setSeedKey] = useState(0);
  const [captionSheetClip, setCaptionSheetClip] = useState<PopClipTileItem | null>(null);
  const [captionSheetOpen, setCaptionSheetOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<PopClipTileItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<string | null>(null);
  const heroSearchWrapperRef = useRef<HTMLDivElement | null>(null);
  const heroSearchInputRef = useRef<HTMLInputElement | null>(null);
  const popclipsRef = useRef<HTMLDivElement | null>(null);
  const packsRef = useRef<HTMLElement | null>(null);
  const suppressSearchOpenRef = useRef(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [recommendedCreators, setRecommendedCreators] = useState<RecommendedCreator[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorsError, setCreatorsError] = useState("");
  const lastExploreDebugRef = useRef("");
  const { data: savedPopclipsData, mutate: mutateSavedPopclips } = useSWR(
    SAVED_POPCLIPS_KEY,
    fetchSavedPopclips,
    { revalidateOnFocus: false }
  );
  const savedPopclips = savedPopclipsData?.items;
  const savedPopclipMap = useMemo(
    () => buildSavedPopclipMap(savedPopclips ?? []),
    [savedPopclips]
  );
  const savedUnauth = Boolean(savedPopclipsData?.unauth);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!isValidExploreFilters(parsed)) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      setAppliedFilters(parsed);
    } catch (_err) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasLocation = Boolean(appliedFilters.location?.place);
    if (!hasLocation) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(appliedFilters));
    } catch (_err) {
      // Ignore storage quota errors.
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (viewerOpen) return;
    setViewerItems([]);
    setViewerIndex(-1);
  }, [viewerOpen]);

  useEffect(() => {
    if (viewerOpen) return;
    feedContext?.clear();
  }, [feedContext, viewerOpen]);

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    const location = appliedFilters.location;
    if (location?.place) {
      const lat = Number(location.place.lat);
      const lng = Number(location.place.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        if (Number.isFinite(location.radiusKm ?? NaN)) {
          params.set("radiusKm", String(Math.round(location.radiusKm)));
        }
      }
    }
    return params.toString();
  }, [appliedFilters]);
  const activeFilterCount = appliedFilters.location?.place ? 1 : 0;
  const referenceLocation = useMemo(() => {
    const location = appliedFilters.location;
    if (!location?.place) return null;
    const lat = Number(location.place.lat);
    const lng = Number(location.place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [appliedFilters]);
  const hasLocation = Boolean(referenceLocation);
  const radiusKm = useMemo(() => {
    const raw = Number.isFinite(appliedFilters.location?.radiusKm ?? NaN)
      ? (appliedFilters.location?.radiusKm as number)
      : DEFAULT_FILTER_KM;
    const rounded = Math.round(raw);
    if (rounded < MIN_FILTER_KM) return MIN_FILTER_KM;
    if (rounded > MAX_FILTER_KM) return MAX_FILTER_KM;
    return rounded;
  }, [appliedFilters]);
  const locationCenterLabel = useMemo(() => {
    if (!hasLocation) return "";
    const label = appliedFilters.location?.place?.label?.trim() || "";
    return label || "Mi ubicación";
  }, [appliedFilters, hasLocation]);
  const searchTerm = search.trim();
  const hasSearchValue = search.length > 0;
  const showSearchPanel = isSearchOpen;
  const returnToPath = "/explore";

  useEffect(() => {
    if (!debugExplore) return;
    const feedParams = new URLSearchParams(apiQuery);
    feedParams.set("take", String(FEED_PAGE_SIZE));
    const feedEndpoint = `/api/public/popclips/feed?${feedParams.toString()}`;
    const creatorsParams = new URLSearchParams(apiQuery);
    creatorsParams.set("limit", "12");
    const creatorsQuery = creatorsParams.toString();
    const creatorsEndpoint = creatorsQuery
      ? `/api/public/creators/recommended?${creatorsQuery}`
      : "/api/public/creators/recommended";
    const debugKey = `${apiQuery}|${feedEndpoint}|${creatorsEndpoint}`;
    if (debugKey === lastExploreDebugRef.current) return;
    lastExploreDebugRef.current = debugKey;
    console.debug("[explore]", {
      filters: appliedFilters,
    });
    console.debug("[explore] feed", feedEndpoint);
    console.debug("[explore] recommended", creatorsEndpoint);
  }, [apiQuery, appliedFilters, debugExplore]);

  useEffect(() => {
    return subscribeCreatorStatusUpdates(() => {
      setSeedKey((prev) => prev + 1);
    });
  }, []);

  const closeSearchPanel = useCallback(() => {
    setIsSearchOpen(false);
    setActiveSearchIndex(-1);
  }, []);

  const focusSearchInput = useCallback(
    (options?: { select?: boolean; suppressOpen?: boolean }) => {
      if (options?.suppressOpen) {
        suppressSearchOpenRef.current = true;
      }
      const heroInput = heroSearchInputRef.current;
      if (!heroInput) return;
      heroInput.focus();
      if (options?.select) heroInput.select();
    },
    []
  );

  const openFilters = useCallback(() => {
    setDraftFilters(cloneExploreFilters(appliedFilters));
    setFiltersOpen(true);
  }, [appliedFilters]);

  const handleApplyLocation = useCallback(
    (payload: { lat: number; lng: number; label: string; radiusKm: number; placeId?: string | null } | null) => {
      if (!payload) {
        setAppliedFilters((prev) => (prev.location ? { ...prev, location: undefined } : prev));
        setDraftFilters((prev) => (prev.location ? { ...prev, location: undefined } : prev));
        return;
      }
      const nextFilters: ExploreFilters = {
        location: {
          place: {
            label: payload.label,
            lat: payload.lat,
            lng: payload.lng,
            placeId: payload.placeId ?? null,
          },
          radiusKm: payload.radiusKm,
        },
      };
      setAppliedFilters(nextFilters);
      setDraftFilters(cloneExploreFilters(nextFilters));
    },
    []
  );

  const handleClearLocation = useCallback(() => {
    setAppliedFilters((prev) => (prev.location ? { ...prev, location: undefined } : prev));
    setDraftFilters((prev) => (prev.location ? { ...prev, location: undefined } : prev));
  }, []);

  const resetAllFilters = useCallback(() => {
    setSearch("");
    setSelectedCategoryId(null);
    setFiltersOpen(false);
    setCategorySheetOpen(false);
    setAppliedFilters({});
    setDraftFilters({});
  }, []);

  const scrollToPopclips = useCallback(() => {
    if (typeof window === "undefined") return;
    const target = popclipsRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [popclipsRef]);

  const scrollToPacks = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (!packsRef.current) {
      packsRef.current = document.getElementById("packs");
    }
    const target = packsRef.current;
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }, [packsRef]);

  const scrollToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openLocationPicker = useCallback(() => {
    setDraftFilters(cloneExploreFilters(appliedFilters));
    setFiltersOpen(true);
  }, [appliedFilters]);

  const closeLocationPicker = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const handleRequestLocation = useCallback(() => {
    openLocationPicker();
  }, [openLocationPicker]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 320);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const platform = navigator.platform || navigator.userAgent || "";
    setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!target || !(target instanceof Node)) return;
      const insideHero = heroSearchWrapperRef.current?.contains(target) ?? false;
      if (insideHero) return;
      closeSearchPanel();
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("touchstart", handlePointer);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("touchstart", handlePointer);
    };
  }, [closeSearchPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let ticking = false;
    const update = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const popclipsEl = popclipsRef.current;
      if (popclipsEl) {
        const offset = popclipsEl.getBoundingClientRect().top + scrollTop;
        setShowBackToTop(scrollTop > offset - 120);
      } else {
        setShowBackToTop(false);
      }
      ticking = false;
    };
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (typeof event.key !== "string") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (filtersOpen || categorySheetOpen || captionSheetOpen) return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      focusSearchInput({ select: true });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [captionSheetOpen, categorySheetOpen, filtersOpen, focusSearchInput]);

  useEffect(() => {
    const handleRouteChange = () => closeSearchPanel();
    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [closeSearchPanel, router.events]);

  const showToast = useCallback(
    (message: string, options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) => {
      setToast({ message, actionLabel: options?.actionLabel, onAction: options?.onAction });
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      const duration = options?.durationMs ?? 2400;
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
      }, duration);
    },
    []
  );

  const openAuthModal = useCallback((popclipId: string) => {
    setPendingAction({ type: "SAVE_POPCLIP", popclipId });
    setAuthModalOpen(true);
  }, []);

  useEffect(() => {
    if (!savedPopclipsData || savedPopclipsData.unauth) return;
    if (pendingSaveRef.current) return;
    const pending = consumePendingAction();
    if (!pending || pending.type !== "SAVE_POPCLIP") return;
    const popclipId = pending.popclipId;
    pendingSaveRef.current = popclipId;

    if (savedPopclipMap[popclipId]) {
      showToast("Guardado");
      pendingSaveRef.current = null;
      return;
    }

    const executePendingSave = async () => {
      try {
        const res = await fetch("/api/saved/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "POPCLIP", entityId: popclipId }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { saved?: boolean; savedItemId?: string; collectionId?: string | null }
          | null;
        if (!res.ok || !payload || typeof payload.saved !== "boolean") {
          throw new Error("SAVE_FAILED");
        }
        if (payload.saved && payload.savedItemId) {
          mutateSavedPopclips(
            (prev) => {
              const items = prev?.items ?? [];
              return {
                items: upsertSavedPopclip(items, {
                  id: payload.savedItemId as string,
                  entityId: popclipId,
                  collectionId: payload.collectionId ?? null,
                }),
              };
            },
            false
          );
        } else {
          await mutateSavedPopclips();
        }
        if (payload.saved) {
          showToast("Guardado");
        } else {
          showToast("No se pudo guardar.");
        }
      } catch (_err) {
        showToast("No se pudo actualizar guardados.");
      } finally {
        pendingSaveRef.current = null;
      }
    };

    void executePendingSave();
  }, [mutateSavedPopclips, savedPopclipMap, savedPopclipsData, showToast]);

  const handleToggleSave = useCallback(
    async (item: PopClipTileItem) => {
      const current = savedPopclipMap[item.id];
      const wasSaved = Boolean(current);
      const nextSaved = !wasSaved;
      if (nextSaved && savedUnauth) {
        openAuthModal(item.id);
        return;
      }
      const tempId = `temp-popclip-${item.id}`;
      mutateSavedPopclips(
        (prev) => {
          const items = prev?.items ?? [];
          if (nextSaved) {
            return {
              items: upsertSavedPopclip(items, {
                id: tempId,
                entityId: item.id,
                collectionId: null,
              }),
            };
          }
          return { items: removeSavedPopclip(items, item.id) };
        },
        false
      );

      try {
        const res = await fetch("/api/saved/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "POPCLIP", entityId: item.id }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { saved?: boolean; savedItemId?: string; collectionId?: string | null }
          | null;
        if (!res.ok || !payload || typeof payload.saved !== "boolean") {
          if (res.status === 401) throw new Error("AUTH_REQUIRED");
          throw new Error("SAVE_FAILED");
        }
        if (payload.saved !== nextSaved) {
          await mutateSavedPopclips();
        } else if (payload.saved && payload.savedItemId) {
          mutateSavedPopclips(
            (prev) => {
              const items = prev?.items ?? [];
              return {
                items: upsertSavedPopclip(items, {
                  id: payload.savedItemId as string,
                  entityId: item.id,
                  collectionId: payload.collectionId ?? null,
                }),
              };
            },
            false
          );
        } else if (!payload.saved) {
          showToast("Quitado de guardados");
        }
      } catch (err) {
        mutateSavedPopclips(
          (prev) => {
            const items = prev?.items ?? [];
            if (nextSaved) {
              return { items: removeSavedPopclip(items, item.id) };
            }
            return {
              items: upsertSavedPopclip(items, {
                id: current?.savedItemId ?? tempId,
                entityId: item.id,
                collectionId: current?.collectionId ?? null,
              }),
            };
          },
          false
        );
        if (err instanceof Error && err.message === "AUTH_REQUIRED") {
          openAuthModal(item.id);
        } else {
          showToast("No se pudo actualizar guardados.");
        }
      }
    },
    [mutateSavedPopclips, openAuthModal, savedPopclipMap, savedUnauth, showToast]
  );

  const isPopclipSaved = useCallback(
    (item: PopClipTileItem) => Boolean(savedPopclipMap[item.id]),
    [savedPopclipMap]
  );

  const persistRecentSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = readRecentSearches();
    const next = buildRecentSearches(trimmed, current);
    writeRecentSearches(next);
    setRecentSearches(next);
  }, []);

  const clearRecentSearches = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RECENT_SEARCH_KEY);
    }
    setRecentSearches([]);
  }, []);

  const handleSearchFocus = useCallback(() => {
    if (suppressSearchOpenRef.current) {
      suppressSearchOpenRef.current = false;
      return;
    }
    setIsSearchOpen(true);
    setActiveSearchIndex(-1);
  }, []);

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  const clearSearchValue = useCallback(() => {
    setSearch("");
    setActiveSearchIndex(-1);
  }, []);

  const clearSearchAndScrollTop = useCallback(() => {
    resetAllFilters();
    closeSearchPanel();
    scrollToTop();
  }, [closeSearchPanel, resetAllFilters, scrollToTop]);

  const executeSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSearch(trimmed);
    persistRecentSearch(trimmed);
    scrollToPopclips();
  }, [persistRecentSearch, scrollToPopclips]);

  const navigateToPacks = useCallback(async () => {
    if (typeof window === "undefined") return false;
    try {
      await router.prefetch("/packs");
      await router.push("/packs");
      return true;
    } catch (_err) {
      return false;
    }
  }, [router]);

  const runQuickAction = useCallback(
    (intent: ExploreIntent) => {
      if (intent === "popclips") {
        scrollToPopclips();
      } else if (intent === "chat") {
        setSearch("chat");
        scrollToPopclips();
      } else if (intent === "packs") {
        const scrolled = scrollToPacks();
        if (!scrolled) {
          void navigateToPacks().then((navigated) => {
            if (navigated) return;
            setSearch("packs");
            scrollToPopclips();
          });
        }
      } else {
        scrollToTop();
      }
      closeSearchPanel();
      focusSearchInput({ suppressOpen: true });
    },
    [
      closeSearchPanel,
      focusSearchInput,
      navigateToPacks,
      scrollToPacks,
      scrollToPopclips,
      scrollToTop,
    ]
  );

  const runSearchAction = useCallback((action: SearchAction, options?: { focus?: boolean }) => {
    action.onSelect();
    closeSearchPanel();
    if (options?.focus === false) return;
    focusSearchInput({ suppressOpen: true });
  }, [closeSearchPanel, focusSearchInput]);

  const copyToClipboard = useCallback(async (value: string) => {
    if (typeof navigator === "undefined") return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
      if (typeof document === "undefined") return false;
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch (_err) {
      return false;
    }
  }, []);

  const buildClipShareUrl = useCallback((item: PopClipTileItem) => {
    const path = `/c/${encodeURIComponent(item.creator.handle)}?popclip=${encodeURIComponent(item.id)}`;
    if (typeof window === "undefined") return path;
    return new URL(path, window.location.origin).toString();
  }, []);

  const handleCopyLink = useCallback(
    async (item: PopClipTileItem) => {
      const url = buildClipShareUrl(item);
      const copied = await copyToClipboard(url);
      showToast(copied ? "Link copiado" : "No se pudo copiar el link.");
    },
    [buildClipShareUrl, copyToClipboard, showToast]
  );

  const handleShareLink = useCallback(
    async (item: PopClipTileItem) => {
      const url = buildClipShareUrl(item);
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: item.title?.trim() || "PopClip",
            text: `PopClip de @${item.creator.handle}`,
            url,
          });
          showToast("Compartido");
          return;
        } catch (_err) {
          // fallback to copy
        }
      }
      const copied = await copyToClipboard(url);
      showToast(copied ? "Link copiado" : "No se pudo compartir.");
    },
    [buildClipShareUrl, copyToClipboard, showToast]
  );

  const handleReportClip = useCallback(
    async (item: PopClipTileItem) => {
      try {
        const res = await fetch(`/api/public/popclips/${item.id}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { retryAfterMs?: number } | null;
          if (res.status === 429) {
            showToast("Espera un momento antes de reportar.");
            return;
          }
          if (payload?.retryAfterMs) {
            showToast("Espera un momento antes de reportar.");
            return;
          }
          showToast("No se pudo enviar el reporte.");
          return;
        }
        showToast("Gracias, lo revisaremos.");
      } catch (_err) {
        showToast("No se pudo enviar el reporte.");
      }
    },
    [showToast]
  );

  const buildViewerMenuItems = useCallback(
    (item: PopClipTileItem) => {
      const items: ContextMenuItem[] = [
        { label: "Copiar link", icon: "link", onClick: () => handleCopyLink(item) },
        { label: "Compartir", icon: "send", onClick: () => handleShareLink(item) },
        { label: "Reportar", icon: "alert", danger: true, onClick: () => handleReportClip(item) },
      ];
      return items;
    },
    [handleCopyLink, handleReportClip, handleShareLink]
  );


  const openCaptionSheet = useCallback((item: PopClipTileItem) => {
    setCaptionSheetClip(item);
    setCaptionSheetOpen(true);
  }, []);

  const closeCaptionSheet = useCallback(() => {
    setCaptionSheetOpen(false);
    setCaptionSheetClip(null);
  }, []);

  useEffect(() => {
    const requestKey = feedRequestKeyRef.current + 1;
    feedRequestKeyRef.current = requestKey;
    loadMoreAbortRef.current?.abort();
    loadMorePendingRef.current = false;
    setFeedLoadingMore(false);
    const controller = new AbortController();
    const apiParams = new URLSearchParams(apiQuery);
    apiParams.set("take", String(FEED_PAGE_SIZE));
    const endpoint = `/api/public/popclips/feed?${apiParams.toString()}`;
    console.log("[EXPLORE-LOC] Feed API endpoint:", endpoint);
    if (debugExplore) {
      console.debug("[explore] fetch feed", endpoint);
    }
    setFeedLoading(true);
    setFeedError("");
    setFeedItems([]);
    setFeedCursor(null);
    setSeedError("");
    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as
          | { items?: PopClipFeedItem[]; nextCursor?: string | null }
          | null;
        if (requestKey !== feedRequestKeyRef.current) return;
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
        if (requestKey !== feedRequestKeyRef.current) return;
        setFeedItems([]);
        setFeedError("No se pudieron cargar los PopClips.");
      })
      .finally(() => {
        if (requestKey === feedRequestKeyRef.current && !controller.signal.aborted) {
          setFeedLoading(false);
        }
      });
    return () => controller.abort();
  }, [apiQuery, debugExplore, seedKey]);

  const selectedCategory = useMemo(
    () => HOME_CATEGORIES.find((category) => category.id === selectedCategoryId) ?? null,
    [selectedCategoryId]
  );
  const normalizedSearch = debouncedSearch.toLowerCase();
  const filterClips = useCallback(
    (items: PopClipFeedItem[]) => {
      if (!selectedCategory && !normalizedSearch) return items;
      return items.filter((item) => {
        const haystack = `${item.title || ""} ${item.caption || ""} ${item.creator.displayName} ${item.creator.handle
          } ${item.creator.locationLabel || ""}`.toLowerCase();
        if (selectedCategory) {
          const keywords = selectedCategory.keywords.map((word) => word.toLowerCase());
          if (!keywords.some((keyword) => haystack.includes(keyword))) return false;
        }
        if (!normalizedSearch) return true;
        return haystack.includes(normalizedSearch);
      });
    },
    [normalizedSearch, selectedCategory]
  );
  const filteredFeedItems = useMemo(() => filterClips(feedItems), [feedItems, filterClips]);

  useEffect(() => {
    if (!feedContext || viewerOpen) return;
    feedContext.setIds(filteredFeedItems.map((item) => item.id));
  }, [feedContext, filteredFeedItems, viewerOpen]);
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
  const loadMoreSkeletons = useMemo(
    () => Array.from({ length: LOAD_MORE_SKELETON_COUNT }),
    []
  );

  const showExploreSkeleton = feedLoading && feedItems.length === 0;
  const showFeedEmpty = !feedLoading && !feedError && filteredFeedItems.length === 0;
  const showLocationBanner = hasLocation;
  const showCreatorsEmpty =
    !creatorsLoading && !creatorsError && filteredCreators.length === 0;

  const applyCategoryFilter = useCallback(
    (categoryId: string) => {
      setSelectedCategoryId(categoryId);
      scrollToPopclips();
    },
    [scrollToPopclips]
  );

  const { searchQueryActions, recentActions, shortcutActions, categoryActions, searchActions } = useMemo(() => {
    let index = 0;
    const queryActions: SearchAction[] = [];
    const recentItems: SearchAction[] = [];
    const shortcutItems: SearchAction[] = [];
    const categoryItems: SearchAction[] = [];

    if (searchTerm) {
      queryActions.push({
        id: `search:${searchTerm.toLowerCase()}`,
        label: `Buscar '${searchTerm}'`,
        kind: "query",
        icon: "search",
        index: index++,
        onSelect: () => executeSearch(searchTerm),
      });
    }

    if (recentSearches.length > 0) {
      recentSearches.forEach((term) => {
        recentItems.push({
          id: `recent:${term.toLowerCase()}`,
          label: term,
          kind: "recent",
          icon: "clock",
          index: index++,
          onSelect: () => executeSearch(term),
        });
      });
    }

    shortcutItems.push(
      {
        id: "shortcut:popclips",
        label: "PopClips",
        kind: "shortcut",
        index: index++,
        onSelect: () => runQuickAction("popclips"),
      },
      {
        id: "shortcut:packs",
        label: "Packs",
        kind: "shortcut",
        index: index++,
        onSelect: () => runQuickAction("packs"),
      },
      {
        id: "shortcut:chat",
        label: "Chat privado",
        kind: "shortcut",
        index: index++,
        onSelect: () => runQuickAction("chat"),
      }
    );

    SEARCH_PANEL_CATEGORIES.forEach((category) => {
      categoryItems.push({
        id: `category:${category.id}`,
        label: category.label,
        kind: "category",
        index: index++,
        onSelect: () => applyCategoryFilter(category.categoryId),
      });
    });

    const actions = [...queryActions, ...recentItems, ...shortcutItems, ...categoryItems];
    return {
      searchQueryActions: queryActions,
      recentActions: recentItems,
      shortcutActions: shortcutItems,
      categoryActions: categoryItems,
      searchActions: actions,
    };
  }, [
    applyCategoryFilter,
    executeSearch,
    recentSearches,
    runQuickAction,
    searchTerm,
  ]);

  useEffect(() => {
    setActiveSearchIndex((prev) => {
      if (!showSearchPanel || searchActions.length === 0) return -1;
      if (prev >= searchActions.length) return searchActions.length - 1;
      return prev;
    });
  }, [searchActions.length, showSearchPanel]);

  const hasQueryActions = searchQueryActions.length > 0;
  const hasRecentActions = recentActions.length > 0;

  const handleSearchKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      closeSearchPanel();
      return;
    }
    if (showSearchPanel && searchActions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSearchIndex((prev) => {
          if (prev < 0) return 0;
          return Math.min(prev + 1, searchActions.length - 1);
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSearchIndex((prev) => {
          if (prev < 0) return searchActions.length - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }
    }
    if (event.key !== "Enter") return;
    if (showSearchPanel && activeSearchIndex >= 0) {
      event.preventDefault();
      const action = searchActions[activeSearchIndex];
      if (action) {
        runSearchAction(action, { focus: false });
      }
      event.currentTarget.blur();
      return;
    }
    const term = event.currentTarget.value.trim();
    if (!term) {
      closeSearchPanel();
      event.currentTarget.blur();
      return;
    }
    executeSearch(term);
    closeSearchPanel();
    event.currentTarget.blur();
  }, [
    activeSearchIndex,
    closeSearchPanel,
    executeSearch,
    runSearchAction,
    searchActions,
    showSearchPanel,
  ]);

  const renderSearchDropdown = () => {
    if (!showSearchPanel) return null;
    return (
      <div className="absolute left-0 right-0 z-30 mt-2">
        <div
          id="search-suggestions"
          role="dialog"
          aria-label="Sugerencias de búsqueda"
          className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-lg backdrop-blur-xl"
        >
          <div className="space-y-4">
            {hasQueryActions ? (
              <div
                className={clsx(
                  "space-y-2",
                  (hasRecentActions || shortcutActions.length > 0 || categoryActions.length > 0) &&
                  "border-b border-[color:var(--surface-border)] pb-3"
                )}
              >
                {searchQueryActions.map((action) => {
                  const isActive = activeSearchIndex === action.index;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => runSearchAction(action)}
                      className={clsx(
                        "flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]",
                        isActive && "bg-[color:var(--surface-2)]"
                      )}
                    >
                      <Search className="h-4 w-4 flex-none text-[color:var(--muted)]" aria-hidden="true" />
                      <span className="truncate">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {hasRecentActions ? (
              <div
                className={clsx(
                  "space-y-2",
                  (shortcutActions.length > 0 || categoryActions.length > 0) &&
                  "border-b border-[color:var(--surface-border)] pb-3"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Recientes
                  </p>
                  <button
                    type="button"
                    onClick={clearRecentSearches}
                    className="text-[11px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="grid gap-1">
                  {recentActions.map((action) => {
                    const isActive = activeSearchIndex === action.index;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => runSearchAction(action)}
                        className={clsx(
                          "flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]",
                          isActive && "bg-[color:var(--surface-2)]"
                        )}
                      >
                        <Clock className="h-4 w-4 flex-none text-[color:var(--muted)]" aria-hidden="true" />
                        <span className="truncate">{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Atajos
              </p>
              <div className="flex flex-wrap gap-2">
                {shortcutActions.map((action) => {
                  const isActive = activeSearchIndex === action.index;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => runSearchAction(action)}
                      className={clsx(
                        "inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]",
                        isActive && "bg-[color:var(--surface-2)]"
                      )}
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 border-t border-[color:var(--surface-border)] pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Categorías
              </p>
              <div className="flex flex-wrap gap-2">
                {categoryActions.map((action) => {
                  const isActive = activeSearchIndex === action.index;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => runSearchAction(action)}
                      className={clsx(
                        "inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]",
                        isActive && "bg-[color:var(--surface-2)]"
                      )}
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFilterChips = () => (
    <div className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto xl:flex-wrap xl:overflow-visible">
      <PillButton intent="secondary" size="sm" onClick={() => setCategorySheetOpen(true)}>
        Categorías
      </PillButton>
      <PillButton intent="secondary" size="sm" onClick={openFilters} className="gap-2">
        <span>Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
      </PillButton>
      {hasLocation && appliedFilters.location?.place ? (
        <button
          type="button"
          onClick={handleClearLocation}
          aria-label="Quitar filtro de ubicación"
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          <span className="max-w-[160px] truncate">
            {appliedFilters.location.place.label} · {radiusKm} km
          </span>
          <X className="h-3.5 w-3.5 text-[color:var(--muted)]" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  const handleSeedDemo = useCallback(async () => {
    if (!isDev || seedLoading) return;
    setSeedLoading(true);
    setSeedError("");
    try {
      const seedEndpoint = apiQuery
        ? `/api/dev/seed-popclips?${apiQuery}`
        : "/api/dev/seed-popclips";
      const res = await fetch(seedEndpoint, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; count?: number; createdIds?: string[]; error?: string }
        | null;
      if (!res.ok || !payload?.ok) {
        const message = payload?.error || "No se pudieron generar los clips demo.";
        setSeedError(message);
        showToast(message);
        return;
      }
      const createdIds = Array.isArray(payload.createdIds) ? payload.createdIds : [];
      const count = typeof payload.count === "number" && Number.isFinite(payload.count) ? payload.count : createdIds.length;
      setSeedError("");
      // Force feed refresh
      setFeedItems([]);
      setFeedCursor(null);
      setFeedError("");
      setSeedKey((prev) => prev + 1);
      if (feedContext) feedContext.clear();
      showToast(count > 0 ? `Clips demo generados (${count}).` : "Clips demo listos.");
    } catch (_err) {
      const message = "No se pudieron generar los clips demo.";
      setSeedError(message);
      showToast(message);
    } finally {
      setSeedLoading(false);
    }
  }, [apiQuery, feedContext, isDev, seedLoading, showToast]);

  const loadMoreFeed = useCallback(async () => {
    if (!feedCursor || loadMorePendingRef.current) return;
    loadMorePendingRef.current = true;
    const requestKey = feedRequestKeyRef.current;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const apiParams = new URLSearchParams(apiQuery);
    apiParams.set("take", String(FEED_PAGE_SIZE));
    apiParams.set("cursor", feedCursor);
    const endpoint = `/api/public/popclips/feed?${apiParams.toString()}`;
    console.log("[EXPLORE-LOC] LoadMore API endpoint:", endpoint);
    setFeedLoadingMore(true);
    try {
      const res = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { items?: PopClipFeedItem[]; nextCursor?: string | null }
        | null;
      if (requestKey !== feedRequestKeyRef.current) return;
      if (!res.ok || !payload || !Array.isArray(payload.items)) {
        setFeedError("No se pudieron cargar mas PopClips.");
        return;
      }
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setFeedItems((prev) => mergeUniqueFeedItems([...prev, ...nextItems]));
      setFeedCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (requestKey !== feedRequestKeyRef.current) return;
      setFeedError("No se pudieron cargar mas PopClips.");
    } finally {
      if (requestKey === feedRequestKeyRef.current) {
        setFeedLoadingMore(false);
      }
      if (loadMoreAbortRef.current === controller) {
        loadMoreAbortRef.current = null;
      }
      loadMorePendingRef.current = false;
    }
  }, [apiQuery, feedCursor]);

  const handleViewerNavigate = useCallback(
    (nextIndex: number) => {
      setViewerIndex(nextIndex);
      feedContext?.setCurrentIndex(nextIndex);
    },
    [feedContext]
  );

  const openPopclipWithItems = useCallback((items: PopClipTileItem[], item: PopClipTileItem) => {
    const resolvedItems = items.length > 0 ? items : [item];
    const nextIndex = resolvedItems.findIndex((entry) => entry.id === item.id);
    setViewerItems(resolvedItems);
    const resolvedIndex = nextIndex >= 0 ? nextIndex : 0;
    setViewerIndex(resolvedIndex);
    setViewerOpen(true);
    if (feedContext) {
      feedContext.setFeed(
        resolvedItems.map((entry) => entry.id),
        resolvedIndex
      );
    }
  }, [feedContext]);

  const openPopclip = useCallback(
    (item: PopClipTileItem) => {
      openPopclipWithItems(filteredFeedItems, item);
    },
    [filteredFeedItems, openPopclipWithItems]
  );

  useEffect(() => {
    const apiParams = new URLSearchParams(apiQuery);
    apiParams.set("limit", "12");
    const queryString = apiParams.toString();
    const endpoint = queryString
      ? `/api/public/creators/recommended?${queryString}`
      : "/api/public/creators/recommended";
    console.log("[EXPLORE-LOC] Creators API endpoint:", endpoint);
    if (debugExplore) {
      console.debug("[explore] fetch recommended", endpoint);
    }
    const controller = new AbortController();
    setCreatorsLoading(true);
    setCreatorsError("");
    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
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
  }, [apiQuery, debugExplore, seedKey]);

  return (
    <>
      <Head>
        <title>IntimiPop - Explorar</title>
      </Head>
      <div className="flex min-h-[100dvh] min-h-screen w-full flex-col">
        <PublicStickyHeader
          title="Explora creadores"
          compactTitle="Explora"
          subtitle="Filtra por ubicación, disponibilidad y estilo. Abre chat cuando te encaje."
          brand={
            <Link href="/explore" legacyBehavior passHref>
              <a
                onClick={(event) => {
                  event.preventDefault();
                  resetAllFilters();
                  closeSearchPanel();
                  scrollToTop();
                }}
              >
                IntimiPop
              </a>
            </Link>
          }
          actions={
            <div className="hidden xl:flex">
              <DesktopMenuNav className="inline-flex" />
            </div>
          }
          search={
            showExploreSkeleton ? (
              <ExploreSkeletonSearch />
            ) : (
              <div ref={heroSearchWrapperRef} className="relative">
                <label className="sr-only" htmlFor="home-search">
                  Buscar
                </label>
                <div className="group flex h-10 items-center gap-3 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-[color:var(--text)] transition-colors hover:border-[color:var(--surface-border-hover)] focus-within:border-[color:var(--surface-border-hover)] focus-within:ring-1 focus-within:ring-[color:var(--surface-ring)] sm:h-11">
                  <Search className="h-4 w-4 flex-none text-[color:var(--muted)]" aria-hidden="true" />
                  <input
                    id="home-search"
                    ref={heroSearchInputRef}
                    type="text"
                    value={search}
                    onChange={handleSearchChange}
                    onFocus={handleSearchFocus}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar creadores, packs o PopClips"
                    aria-controls="search-suggestions"
                    className="h-7 w-full bg-transparent text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none"
                  />
                  {hasSearchValue ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearSearchValue();
                        focusSearchInput({ suppressOpen: true });
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--muted)] hover:text-[color:var(--text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                  <kbd
                    className="hidden flex-none rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--muted)] sm:inline-flex"
                    aria-hidden="true"
                  >
                    {isMac ? "⌘ K" : "Ctrl K"}
                  </kbd>
                </div>
                {renderSearchDropdown()}
              </div>
            )
          }
          chips={
            showExploreSkeleton ? (
              <ExploreSkeletonChips />
            ) : (
              <div className="flex flex-col gap-2">
                {renderFilterChips()}
                {selectedCategory ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <FilterChip
                      label={selectedCategory.label}
                      active
                      onClick={() => {
                        setSelectedCategoryId(null);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )
          }
        />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 overflow-x-hidden [--bottom-nav-h:72px] pb-[calc(var(--bottom-nav-h,72px)+env(safe-area-inset-bottom))] xl:[--bottom-nav-h:0px]">
          {searchTerm ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs text-[color:var(--muted)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[color:var(--text)]">Resultados para:</span>
                <span className="truncate text-[color:var(--text)]">&quot;{searchTerm}&quot;</span>
              </div>
              <button
                type="button"
                onClick={clearSearchAndScrollTop}
                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-3)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Limpiar
              </button>
            </div>
          ) : null}

          <div id="popclips" ref={popclipsRef} className="scroll-mt-24">
            <HomeSectionCard
              title="PopClips"
              subtitle="Explora clips y entra al chat cuando te encaje."
            >
              {showLocationBanner ? (
                <div className="mb-4 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 text-[color:var(--text)]">
                  <p className="text-xs font-semibold">
                    Cerca de {locationCenterLabel} (aprox.) · Radio {radiusKm} km
                  </p>
                  <p className="mt-1 text-[11px] text-[color:var(--muted)]">
                    Distancias aproximadas por privacidad.
                  </p>
                </div>
              ) : null}
              {showExploreSkeleton ? (
                <ExploreSkeleton cardCount={FEED_SKELETON_COUNT} variant="grid" />
              ) : feedError ? (
                <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                  {feedError}
                </div>
              ) : showFeedEmpty ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-[color:var(--muted)]">
                  <span className="text-sm">
                    {hasLocation
                      ? `No hay resultados cerca de ${locationCenterLabel}. Prueba ampliar el radio.`
                      : "Aún no hay PopClips. Prueba a quitar filtros o vuelve más tarde."}
                  </span>
                  {hasLocation ? (
                    <button
                      type="button"
                      onClick={handleClearLocation}
                      className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                    >
                      Quitar ubicación
                    </button>
                  ) : null}
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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
                    {filteredFeedItems.map((item) => (
                      <PopClipTile
                        key={item.id}
                        item={item}
                        onOpen={openPopclip}
                        profileHref={`/c/${encodeURIComponent(item.creator.handle)}`}
                        chatHref={appendReturnTo(`/go/${encodeURIComponent(item.creator.handle)}`, returnToPath)}
                        isSaved={Boolean(savedPopclipMap[item.id])}
                        onToggleSave={handleToggleSave}
                        hasLocationCenter={hasLocation}
                        referenceLocation={referenceLocation}
                        onRequestLocation={handleRequestLocation}
                        onOpenCaption={openCaptionSheet}
                        onCopyLink={handleCopyLink}
                        onShare={handleShareLink}
                        onReport={handleReportClip}
                      />
                    ))}
                    {feedLoadingMore
                      ? loadMoreSkeletons.map((_, idx) => (
                        <div
                          key={`feed-more-skeleton-${idx}`}
                          className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3"
                        >
                          <Skeleton className="aspect-[10/13] w-full rounded-xl sm:aspect-[3/4] md:aspect-[4/5]" />
                          <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-5 w-16 rounded-full" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </div>
                          <div className="flex gap-2">
                            <Skeleton className="h-9 flex-1 rounded-full" />
                            <Skeleton className="h-9 flex-1 rounded-full" />
                          </div>
                        </div>
                      ))
                      : null}
                  </div>
                  {feedCursor ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={loadMoreFeed}
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

          {(showFeedEmpty || feedError) ? (
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
                  <div className="space-y-1">
                    <span className="block text-[color:var(--text)]">No hay creadores con estos filtros.</span>
                    <span className="block text-xs">Prueba aumentando la distancia.</span>
                  </div>
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    aria-label="Reiniciar filtros"
                    className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  >
                    Reiniciar filtros
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

        <div
          className={clsx(
            "fixed bottom-6 right-6 z-40 transition-all duration-200",
            showBackToTop ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2"
          )}
        >
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Volver arriba"
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] shadow-lg hover:bg-[color:var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
          >
            ↑ Volver arriba
          </button>
        </div>

        {toast ? (
          <div className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:rgba(17,24,39,0.85)] px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
              <span>{toast.message}</span>
              {toast.actionLabel ? (
                <button
                  type="button"
                  onClick={() => {
                    const action = toast.onAction;
                    setToast(null);
                    if (toastTimerRef.current) {
                      clearTimeout(toastTimerRef.current);
                    }
                    action?.();
                  }}
                  className="inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-semibold text-white hover:border-white/40"
                >
                  {toast.actionLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} returnTo={returnToPath} />
        <HomeCategorySheet
          open={categorySheetOpen}
          categories={HOME_CATEGORIES}
          selectedId={selectedCategoryId}
          onSelect={(category) => applyCategoryFilter(category.id)}
          onClear={() => {
            setSelectedCategoryId(null);
          }}
          onClose={() => setCategorySheetOpen(false)}
        />
        <LocationFilterModal
          open={filtersOpen}
          initialValue={{
            lat: draftFilters.location?.place?.lat ?? null,
            lng: draftFilters.location?.place?.lng ?? null,
            label: draftFilters.location?.place?.label ?? null,
            radiusKm: draftFilters.location?.radiusKm ?? DEFAULT_FILTER_KM,
            placeId: draftFilters.location?.place?.placeId ?? null,
          }}
          minRadiusKm={MIN_FILTER_KM}
          maxRadiusKm={MAX_FILTER_KM}
          onApply={handleApplyLocation}
          onClose={closeLocationPicker}
        />
        <PopClipViewer
          open={viewerOpen}
          items={viewerItems}
          activeIndex={viewerIndex}
          onOpenChange={setViewerOpen}
          onNavigate={handleViewerNavigate}
          onToggleSave={handleToggleSave}
          isSaved={isPopclipSaved}
          menuItems={buildViewerMenuItems}
          buildChatHref={(item) =>
            appendReturnTo(`/go/${encodeURIComponent(item.creator.handle)}`, returnToPath)
          }
          buildProfileHref={(item) => `/c/${encodeURIComponent(item.creator.handle)}#popclips`}
        />
        <CaptionSheet
          open={captionSheetOpen}
          clip={captionSheetClip}
          onClose={closeCaptionSheet}
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
      aria-pressed={active ? "true" : "false"}
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

function mergePopclipMeta(fetched: PopClipFeedItem, fallback?: PopClipFeedItem | null): PopClipFeedItem {
  if (!fallback) return fetched;
  const resolveDistance = (value?: number | null) =>
    Number.isFinite(value ?? NaN) ? (value as number) : null;
  const resolveRating = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const resolveReviewCount = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const fetchedCreator = fetched.creator;
  const fallbackCreator = fallback.creator;
  const responseTime =
    typeof fetchedCreator.responseTime === "string" && fetchedCreator.responseTime.trim()
      ? fetchedCreator.responseTime
      : fallbackCreator.responseTime ?? null;
  const locationLabel =
    typeof fetchedCreator.locationLabel === "string" && fetchedCreator.locationLabel.trim()
      ? fetchedCreator.locationLabel
      : fallbackCreator.locationLabel ?? null;
  const allowLocation =
    typeof fetchedCreator.allowLocation === "boolean"
      ? fetchedCreator.allowLocation
      : fallbackCreator.allowLocation;
  const isAvailable =
    typeof fetchedCreator.isAvailable === "boolean" ? fetchedCreator.isAvailable : fallbackCreator.isAvailable;
  const offerTags =
    Array.isArray(fetchedCreator.offerTags) && fetchedCreator.offerTags.length > 0
      ? fetchedCreator.offerTags
      : Array.isArray(fallbackCreator.offerTags)
        ? fallbackCreator.offerTags
        : undefined;
  const resolvedDistance = resolveDistance(fetched.distanceKm) ?? resolveDistance(fallback.distanceKm) ?? null;
  const creatorRating =
    resolveRating(fetched.creatorRating) ?? resolveRating(fallback.creatorRating);
  const creatorReviewCount =
    resolveReviewCount(fetched.creatorReviewCount) ?? resolveReviewCount(fallback.creatorReviewCount) ?? 0;

  return {
    ...fetched,
    distanceKm: resolvedDistance,
    creatorRating,
    creatorReviewCount,
    creator: {
      ...fetchedCreator,
      responseTime,
      locationLabel,
      allowLocation,
      isAvailable,
      offerTags,
    },
  };
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
  const responseLabel = creator.responseTime || "";
  const allowLocation = creator.allowLocation !== false;
  const locationLabel = allowLocation ? creator.locationLabel?.trim() : "";
  const showLocation = Boolean(locationLabel);
  const distanceLabel =
    allowLocation && Number.isFinite(creator.distanceKm ?? NaN)
      ? `≈${Math.round(creator.distanceKm as number)} km`
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
            <div className="flex min-w-0 items-center gap-1 text-xs text-[color:var(--muted)]">
              <span className="truncate">@{creator.handle}</span>
              {creator.isVerified ? (
                <VerifiedInlineBadge collapseAt="lg" className="shrink-0" />
              ) : null}
            </div>
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
        ) : null}
        {showLocation ? (
          <span className="inline-flex min-w-0 max-w-full items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            <span className="truncate">📍 {locationLabel} (aprox.)</span>
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

function CaptionSheet({
  open,
  clip,
  onClose,
}: {
  open: boolean;
  clip: PopClipTileItem | null;
  onClose: () => void;
}) {
  const [isMounted, setIsMounted] = useState(open);
  const [activeClip, setActiveClip] = useState<PopClipTileItem | null>(clip);

  useEffect(() => {
    if (clip) setActiveClip(clip);
  }, [clip]);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setIsMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!isMounted || !activeClip) return null;
  const title = activeClip.title?.trim() || "PopClip";
  const caption = activeClip.caption?.trim() || "";

  return (
    <div className={clsx("fixed inset-0 z-50", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div
        className={clsx(
          "absolute inset-0 bg-[color:var(--surface-overlay)] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={open ? onClose : undefined}
        aria-hidden={open ? "false" : "true"}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Descripcion de ${title}`}
        className={clsx(
          "absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pb-6 pt-4 text-[color:var(--text)] shadow-2xl transition duration-200 sm:mx-auto sm:max-w-2xl",
          open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              @{activeClip.creator.handle}
            </div>
            <div className="mt-1 text-sm font-semibold text-[color:var(--text)]">{title}</div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-[color:var(--muted)]">{caption}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar descripcion"
            className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
          >
            X
          </button>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
