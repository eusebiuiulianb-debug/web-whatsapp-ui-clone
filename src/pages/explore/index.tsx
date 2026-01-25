import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { Bookmark, BookmarkCheck, Clock, Search, X } from "lucide-react";
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
import { HomeFilterSheet } from "../../components/home/HomeFilterSheet";
import { HomeSectionCard } from "../../components/home/HomeSectionCard";
import { PopClipTile, type PopClipTileItem } from "../../components/popclips/PopClipTile";
import { IconGlyph } from "../../components/ui/IconGlyph";
import { ContextMenu } from "../../components/ui/ContextMenu";
import { PillButton } from "../../components/ui/PillButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { useRouter } from "next/router";
import { countActiveFilters, parseHomeFilters, toHomeFiltersQuery, type HomeFilters } from "../../lib/homeFilters";
import { subscribeCreatorStatusUpdates } from "../../lib/creatorStatusEvents";
import { subscribeFollowUpdates, type FollowUpdateDetail } from "../../lib/followEvents";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { SavedOrganizerSheet } from "../../components/saved/SavedOrganizerSheet";
import { SavedCollectionCreateSheet } from "../../components/saved/SavedCollectionCreateSheet";
import { SavedCollectionRenameSheet } from "../../components/saved/SavedCollectionRenameSheet";

const FEED_PAGE_SIZE = 24;
const FEED_SKELETON_COUNT = 12;
const LOAD_MORE_SKELETON_COUNT = 6;
type RecommendedCreator = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
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
  title?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  previewImageUrl?: string | null;
  durationSec?: number | null;
  createdAt: string;
  savesCount?: number | null;
  creator: {
    handle: string;
    displayName: string;
    avatarUrl?: string | null;
    vipEnabled?: boolean;
    isAvailable?: boolean;
    locationLabel?: string | null;
    allowLocation?: boolean;
    responseTime?: string | null;
  };
  stats?: {
    likeCount?: number;
    commentCount?: number;
  };
  distanceKm?: number | null;
};

type SavedItemType = "POPCLIP" | "PACK" | "CREATOR";

type SavedPreviewItem = {
  id: string;
  type: SavedItemType;
  entityId: string;
  collectionId: string | null;
  createdAt: string;
  title: string;
  subtitle: string | null;
  thumbUrl: string | null;
  href: string | null;
};

type SavedCollection = {
  id: string;
  name: string;
  count: number;
};

type ExploreIntent = "all" | "saved" | "popclips" | "packs" | "chat";

type SearchActionKind = "query" | "recent" | "shortcut" | "category";

type SearchAction = {
  id: string;
  label: string;
  kind: SearchActionKind;
  index: number;
  icon?: "search" | "clock";
  onSelect: () => void;
};

const FILTER_QUERY_KEYS = ["km", "lat", "lng", "loc", "avail", "r24", "vip"] as const;
const DEFAULT_FILTER_KM = 25;
const RECENT_SEARCH_KEY = "ip_recent_searches_v1";
const MAX_RECENT_SEARCHES = 6;

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
  const feedRequestKeyRef = useRef(0);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const loadMorePendingRef = useRef(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedKey, setSeedKey] = useState(0);
  const [savedItemsAll, setSavedItemsAll] = useState<SavedPreviewItem[]>([]);
  const [savedItemsLoading, setSavedItemsLoading] = useState(false);
  const [savedItemsError, setSavedItemsError] = useState("");
  const [savedPopclips, setSavedPopclips] = useState<PopClipFeedItem[]>([]);
  const [savedPopclipsLoading, setSavedPopclipsLoading] = useState(false);
  const [savedPopclipsError, setSavedPopclipsError] = useState("");
  const [savedCollections, setSavedCollections] = useState<SavedCollection[]>([]);
  const [savedCollectionsLoading, setSavedCollectionsLoading] = useState(false);
  const [savedCollectionsError, setSavedCollectionsError] = useState("");
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [renameCollection, setRenameCollection] = useState<{ id: string; name: string } | null>(null);
  const [deleteCollection, setDeleteCollection] = useState<{ id: string; name: string } | null>(null);
  const [deleteCollectionPending, setDeleteCollectionPending] = useState(false);
  const [deleteCollectionError, setDeleteCollectionError] = useState("");
  const [savedView, setSavedView] = useState<"all" | "collections">("all");
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [collectionItems, setCollectionItems] = useState<SavedPreviewItem[]>([]);
  const [collectionItemsLoading, setCollectionItemsLoading] = useState(false);
  const [collectionItemsError, setCollectionItemsError] = useState("");
  const [savedItemRemovingId, setSavedItemRemovingId] = useState<string | null>(null);
  const [followingTotal, setFollowingTotal] = useState<number | null>(null);
  const [followingCreatorIds, setFollowingCreatorIds] = useState<string[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [exploreIntent, setExploreIntent] = useState<ExploreIntent>("all");
  const [hydrated, setHydrated] = useState(false);
  const [captionSheetClip, setCaptionSheetClip] = useState<PopClipTileItem | null>(null);
  const [captionSheetOpen, setCaptionSheetOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedQueryRef = useRef(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [organizerItemId, setOrganizerItemId] = useState<string | null>(null);
  const [organizerCollectionId, setOrganizerCollectionId] = useState<string | null>(null);
  const heroSearchWrapperRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchWrapperRef = useRef<HTMLDivElement | null>(null);
  const stickySearchWrapperRef = useRef<HTMLDivElement | null>(null);
  const heroSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const stickySearchInputRef = useRef<HTMLInputElement | null>(null);
  const popclipsRef = useRef<HTMLDivElement | null>(null);
  const packsRef = useRef<HTMLElement | null>(null);
  const suppressSearchOpenRef = useRef(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showStickySearch, setShowStickySearch] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isMac, setIsMac] = useState(false);
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
  const savedPopclipIds = useMemo(
    () => savedItemsAll.filter((item) => item.type === "POPCLIP").map((item) => item.entityId),
    [savedItemsAll]
  );
  const savedPopclipSet = useMemo(() => new Set(savedPopclipIds), [savedPopclipIds]);
  const followingSet = useMemo(() => new Set(followingCreatorIds), [followingCreatorIds]);
  const savedPopclipPreviewMap = useMemo(() => {
    const map = new Map<string, SavedPreviewItem>();
    savedItemsAll.forEach((item) => {
      if (item.type !== "POPCLIP") return;
      map.set(item.entityId, item);
    });
    return map;
  }, [savedItemsAll]);
  const savedOtherItems = useMemo(
    () => savedItemsAll.filter((item) => item.type !== "POPCLIP"),
    [savedItemsAll]
  );
  const savedCollectionCoverMap = useMemo(() => {
    const map = new Map<string, SavedPreviewItem>();
    savedItemsAll.forEach((item) => {
      if (!item.collectionId) return;
      if (map.has(item.collectionId)) return;
      map.set(item.collectionId, item);
    });
    return map;
  }, [savedItemsAll]);
  const activeCollection = useMemo(
    () => savedCollections.find((collection) => collection.id === activeCollectionId) ?? null,
    [activeCollectionId, savedCollections]
  );
  const savedCreatorSet = useMemo(() => {
    const ids = savedItemsAll.filter((item) => item.type === "CREATOR").map((item) => item.entityId);
    return new Set(ids);
  }, [savedItemsAll]);
  const hasLocation = useMemo(
    () => Number.isFinite(filters.lat ?? NaN) && Number.isFinite(filters.lng ?? NaN),
    [filters.lat, filters.lng]
  );
  const searchTerm = search.trim();
  const hasSearchValue = search.length > 0;
  const showSearchPanel = isSearchOpen;

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
      const stickyInput = stickySearchInputRef.current;
      const mobileInput = mobileSearchInputRef.current;
      const heroInput = heroSearchInputRef.current;
      const isVisible = (input: HTMLInputElement | null) =>
        Boolean(input && input.getClientRects().length > 0);
      const input =
        (showStickySearch && isVisible(stickyInput) && stickyInput) ||
        (isVisible(mobileInput) && mobileInput) ||
        (isVisible(heroInput) && heroInput) ||
        stickyInput ||
        mobileInput ||
        heroInput;
      if (!input) return;
      input.focus();
      if (options?.select) input.select();
    },
    [showStickySearch]
  );

  const applyFilters = useCallback(
    (nextFilters: HomeFilters) => {
      const baseQuery = sanitizeQuery(router.query);
      FILTER_QUERY_KEYS.forEach((key) => {
        delete baseQuery[key];
      });
      const mergedQuery = { ...baseQuery, ...toHomeFiltersQuery(nextFilters) };
      void router.push({ pathname: router.pathname, query: mergedQuery }, undefined, { shallow: true });
    },
    [router]
  );

  const clearQueryFilters = useCallback(() => {
    const baseQuery = sanitizeQuery(router.query);
    FILTER_QUERY_KEYS.forEach((key) => {
      delete baseQuery[key];
    });
    void router.push({ pathname: router.pathname, query: baseQuery }, undefined, { shallow: true });
  }, [router]);

  const resetAllFilters = useCallback(() => {
    setSearch("");
    setSelectedCategoryId(null);
    clearQueryFilters();
  }, [clearQueryFilters]);

  const updateSavedQuery = useCallback(
    (options: { saved: boolean; view?: "all" | "collections"; collectionId?: string | null }) => {
      const baseQuery = sanitizeQuery(router.query);
      if (!options.saved) {
        delete baseQuery.saved;
        delete baseQuery.view;
        delete baseQuery.collectionId;
        void router.push({ pathname: "/explore", query: baseQuery }, undefined, { shallow: true });
        return;
      }
      baseQuery.saved = "1";
      if (options.view === "collections" || options.collectionId) {
        baseQuery.view = "collections";
      } else {
        delete baseQuery.view;
      }
      if (options.collectionId) {
        baseQuery.collectionId = options.collectionId;
      } else {
        delete baseQuery.collectionId;
      }
      void router.push({ pathname: "/explore", query: baseQuery }, undefined, { shallow: true });
    },
    [router]
  );

  const exitSavedView = useCallback(() => {
    setSavedOnly(false);
    setExploreIntent("all");
    setSavedView("all");
    setActiveCollectionId(null);
    updateSavedQuery({ saved: false });
  }, [updateSavedQuery]);

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

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.openFilters;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== "1" && value !== "true") return;
    setFilterSheetOpen(true);
    const nextQuery = sanitizeQuery(router.query);
    delete nextQuery.openFilters;
    void router.replace({ pathname: "/explore", query: nextQuery }, undefined, { shallow: true });
  }, [router, router.isReady, router.query.openFilters]);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.focusSearch;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== "1" && value !== "true") return;
    focusSearchInput({ select: true });
    const nextQuery = sanitizeQuery(router.query);
    delete nextQuery.focusSearch;
    void router.replace({ pathname: "/explore", query: nextQuery }, undefined, { shallow: true });
  }, [focusSearchInput, router, router.isReady, router.query.focusSearch]);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.mode;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== "popclips") return;
    setExploreIntent("popclips");
    setFollowingOnly(false);
    setSavedOnly(false);
    setSavedView("all");
    setActiveCollectionId(null);
    scrollToPopclips();
    const nextQuery = sanitizeQuery(router.query);
    delete nextQuery.mode;
    void router.replace({ pathname: "/explore", query: nextQuery }, undefined, { shallow: true });
  }, [router, router.isReady, router.query.mode, scrollToPopclips]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 320);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    setFollowingLoading(true);
    fetch("/api/fan/follows", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          setFollowingTotal(0);
          setFollowingCreatorIds([]);
          return;
        }
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json().catch(() => null)) as
          | { creatorIds?: unknown; count?: unknown }
          | null;
        const creatorIds = Array.isArray(payload?.creatorIds)
          ? payload.creatorIds.filter(
              (id): id is string => typeof id === "string" && id.trim().length > 0
            )
          : [];
        const count = typeof payload?.count === "number" && Number.isFinite(payload.count)
          ? payload.count
          : creatorIds.length;
        setFollowingCreatorIds(creatorIds);
        setFollowingTotal(count);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFollowingTotal(0);
        setFollowingCreatorIds([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setFollowingLoading(false);
      });
    return () => controller.abort();
  }, [hydrated]);

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
    if (!router.isReady) return;
    const savedValue = pickQueryValue(router.query.saved);
    const savedByQuery = savedValue === "1" || savedValue === "true";
    if (savedByQuery) {
      savedQueryRef.current = true;
      setFollowingOnly(false);
      const viewValue = pickQueryValue(router.query.view);
      const collectionValue = pickQueryValue(router.query.collectionId);
      const nextView = viewValue === "collections" || collectionValue ? "collections" : "all";
      setSavedOnly(true);
      setExploreIntent("saved");
      setSavedView(nextView);
      setActiveCollectionId(collectionValue || null);
      return;
    }
    if (savedQueryRef.current) {
      savedQueryRef.current = false;
      setSavedOnly(false);
      setExploreIntent("all");
      setSavedView("all");
      setActiveCollectionId(null);
    }
  }, [router.isReady, router.query.collectionId, router.query.saved, router.query.view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!target || !(target instanceof Node)) return;
      const insideHero = heroSearchWrapperRef.current?.contains(target) ?? false;
      const insideMobile = mobileSearchWrapperRef.current?.contains(target) ?? false;
      const insideSticky = stickySearchWrapperRef.current?.contains(target) ?? false;
      if (insideHero || insideMobile || insideSticky) return;
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
    const threshold = 180;
    let ticking = false;
    const update = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      setShowStickySearch(scrollTop > threshold);
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
      if (filterSheetOpen || categorySheetOpen || captionSheetOpen) return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      focusSearchInput({ select: true });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [captionSheetOpen, categorySheetOpen, filterSheetOpen, focusSearchInput]);

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

  const handleFollowChange = useCallback((creatorId: string, isFollowing: boolean) => {
    const normalized = creatorId.trim();
    if (!normalized) return;
    setFollowingCreatorIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) {
        next.add(normalized);
      } else {
        next.delete(normalized);
      }
      const nextList = Array.from(next);
      setFollowingTotal(nextList.length);
      return nextList;
    });
  }, []);

  const handleFollowUpdate = useCallback((detail?: FollowUpdateDetail) => {
    const normalized = typeof detail?.creatorId === "string" ? detail.creatorId.trim() : "";
    if (!normalized || typeof detail?.isFollowing !== "boolean") return;
    setFollowingCreatorIds((prev) => {
      const next = new Set(prev);
      if (detail.isFollowing) {
        next.add(normalized);
      } else {
        next.delete(normalized);
      }
      const nextList = Array.from(next);
      setFollowingTotal(nextList.length);
      return nextList;
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    return subscribeFollowUpdates(handleFollowUpdate);
  }, [handleFollowUpdate, hydrated]);

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
      setExploreIntent(intent);
      if (intent === "saved") {
        setFollowingOnly(false);
        setSavedOnly(true);
        setSavedView("all");
        setActiveCollectionId(null);
        updateSavedQuery({ saved: true, view: "all" });
        scrollToPopclips();
      } else if (intent === "popclips") {
        setSavedOnly(false);
        setSavedView("all");
        setActiveCollectionId(null);
        if (savedOnly) {
          updateSavedQuery({ saved: false });
        }
        scrollToPopclips();
      } else if (intent === "chat") {
        setSavedOnly(false);
        setSavedView("all");
        setActiveCollectionId(null);
        if (savedOnly) {
          updateSavedQuery({ saved: false });
        }
        setSearch("chat");
        scrollToPopclips();
      } else if (intent === "packs") {
        setSavedOnly(false);
        setSavedView("all");
        setActiveCollectionId(null);
        if (savedOnly) {
          updateSavedQuery({ saved: false });
        }
        const scrolled = scrollToPacks();
        if (!scrolled) {
          void navigateToPacks().then((navigated) => {
            if (navigated) return;
            setSearch("packs");
            scrollToPopclips();
          });
        }
      } else {
        setSavedView("all");
        setActiveCollectionId(null);
        scrollToTop();
      }
      closeSearchPanel();
      focusSearchInput({ suppressOpen: true });
    },
    [
      closeSearchPanel,
      focusSearchInput,
      navigateToPacks,
      savedOnly,
      scrollToPacks,
      scrollToPopclips,
      scrollToTop,
      updateSavedQuery,
    ]
  );

  const runSearchAction = useCallback((action: SearchAction, options?: { focus?: boolean }) => {
    action.onSelect();
    closeSearchPanel();
    if (options?.focus === false) return;
    focusSearchInput({ suppressOpen: true });
  }, [closeSearchPanel, focusSearchInput]);

  const openOrganizer = useCallback((savedItemId: string | null, collectionId: string | null) => {
    if (!savedItemId) return;
    setOrganizerItemId(savedItemId);
    setOrganizerCollectionId(collectionId ?? null);
    setOrganizerOpen(true);
  }, []);

  const refreshSavedItems = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setSavedItemsLoading(true);
    }
    setSavedItemsError("");
    try {
      const res = await fetch("/api/saved/items");
      if (res.status === 401) {
        setSavedItemsAll([]);
        return;
      }
      const payload = (await res.json().catch(() => null)) as { items?: SavedPreviewItem[] } | null;
      if (!res.ok || !payload || !Array.isArray(payload.items)) {
        setSavedItemsAll([]);
        setSavedItemsError("No se pudieron cargar tus guardados.");
        return;
      }
      setSavedItemsAll(payload.items);
    } catch (_err) {
      setSavedItemsAll([]);
      setSavedItemsError("No se pudieron cargar tus guardados.");
    } finally {
      if (!options?.silent) {
        setSavedItemsLoading(false);
      }
    }
  }, []);

  const refreshSavedPopclips = useCallback(async (ids: string[], options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setSavedPopclipsLoading(true);
    }
    setSavedPopclipsError("");
    if (ids.length === 0) {
      setSavedPopclips([]);
      if (!options?.silent) {
        setSavedPopclipsLoading(false);
      }
      return;
    }
    try {
      const res = await fetch("/api/public/popclips/by-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = (await res.json().catch(() => null)) as { items?: PopClipFeedItem[] } | null;
      if (!res.ok || !payload || !Array.isArray(payload.items)) {
        setSavedPopclips([]);
        setSavedPopclipsError("No se pudieron cargar tus PopClips guardados.");
        return;
      }
      setSavedPopclips(payload.items);
    } catch (_err) {
      setSavedPopclips([]);
      setSavedPopclipsError("No se pudieron cargar tus PopClips guardados.");
    } finally {
      if (!options?.silent) {
        setSavedPopclipsLoading(false);
      }
    }
  }, []);

  const refreshSavedCollections = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setSavedCollectionsLoading(true);
    }
    setSavedCollectionsError("");
    try {
      const res = await fetch("/api/saved/collections");
      if (res.status === 401) {
        setSavedCollections([]);
        return;
      }
      const payload = (await res.json().catch(() => null)) as { items?: SavedCollection[] } | null;
      if (!res.ok || !payload || !Array.isArray(payload.items)) {
        setSavedCollections([]);
        setSavedCollectionsError("No se pudieron cargar las colecciones.");
        return;
      }
      setSavedCollections(payload.items);
    } catch (_err) {
      setSavedCollections([]);
      setSavedCollectionsError("No se pudieron cargar las colecciones.");
    } finally {
      if (!options?.silent) {
        setSavedCollectionsLoading(false);
      }
    }
  }, []);

  const loadCollectionItems = useCallback(
    async (collectionId: string | null, options?: { silent?: boolean }) => {
      if (!collectionId) {
        setCollectionItems([]);
        setCollectionItemsError("");
        return;
      }
      if (!options?.silent) {
        setCollectionItemsLoading(true);
      }
      setCollectionItemsError("");
      try {
        const res = await fetch(`/api/saved/items?collectionId=${encodeURIComponent(collectionId)}`);
        if (res.status === 401) {
          setCollectionItems([]);
          return;
        }
        const payload = (await res.json().catch(() => null)) as { items?: SavedPreviewItem[] } | null;
        if (!res.ok || !payload || !Array.isArray(payload.items)) {
          setCollectionItems([]);
          setCollectionItemsError("No se pudieron cargar los guardados.");
          return;
        }
        setCollectionItems(payload.items);
      } catch (_err) {
        setCollectionItems([]);
        setCollectionItemsError("No se pudieron cargar los guardados.");
      } finally {
        if (!options?.silent) {
          setCollectionItemsLoading(false);
        }
      }
    },
    []
  );

  const handleOrganizerMoved = useCallback(
    (collectionId: string | null) => {
      if (!organizerItemId) return;
      setSavedItemsAll((prev) =>
        prev.map((item) => (item.id === organizerItemId ? { ...item, collectionId } : item))
      );
      void refreshSavedCollections({ silent: true });
      if (savedView === "collections" && activeCollectionId) {
        void loadCollectionItems(activeCollectionId, { silent: true });
      }
    },
    [activeCollectionId, organizerItemId, refreshSavedCollections, loadCollectionItems, savedView]
  );

  const handleCollectionCreated = useCallback(
    (collection: SavedCollection) => {
      setSavedCollections((prev) => {
        if (prev.some((item) => item.id === collection.id)) return prev;
        return [{ ...collection }, ...prev];
      });
      setFollowingOnly(false);
      setSavedOnly(true);
      setExploreIntent("saved");
      setSavedView("collections");
      setActiveCollectionId(collection.id);
      updateSavedQuery({ saved: true, view: "collections", collectionId: collection.id });
    },
    [updateSavedQuery]
  );

  const handleCollectionRenamed = useCallback(
    (payload: { id: string; name: string }) => {
      setSavedCollections((prev) =>
        prev.map((collection) => (collection.id === payload.id ? { ...collection, name: payload.name } : collection))
      );
      showToast("Colección renombrada.");
    },
    [showToast]
  );

  const handleDeleteCollection = useCallback(async () => {
    if (!deleteCollection || deleteCollectionPending) return;
    setDeleteCollectionPending(true);
    setDeleteCollectionError("");
    try {
      const res = await fetch(`/api/saved/collections/${encodeURIComponent(deleteCollection.id)}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        setDeleteCollectionError("Inicia sesion para borrar.");
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setSavedCollections((prev) => prev.filter((collection) => collection.id !== deleteCollection.id));
      setSavedItemsAll((prev) =>
        prev.map((item) =>
          item.collectionId === deleteCollection.id ? { ...item, collectionId: null } : item
        )
      );
      if (activeCollectionId === deleteCollection.id) {
        setActiveCollectionId(null);
        setCollectionItems([]);
        updateSavedQuery({ saved: true, view: "collections" });
      }
      void refreshSavedCollections({ silent: true });
      showToast("Colección borrada.");
      setDeleteCollection(null);
    } catch (_err) {
      setDeleteCollectionError("No se pudo borrar la colección.");
    } finally {
      setDeleteCollectionPending(false);
    }
  }, [
    activeCollectionId,
    deleteCollection,
    deleteCollectionPending,
    refreshSavedCollections,
    showToast,
    updateSavedQuery,
  ]);

  const handleRemoveSavedItem = useCallback(
    async (savedItemId: string) => {
      if (savedItemRemovingId) return;
      setSavedItemRemovingId(savedItemId);
      try {
        const res = await fetch(`/api/saved/items/${encodeURIComponent(savedItemId)}`, {
          method: "DELETE",
        });
        if (res.status === 401) {
          showToast("Inicia sesion para quitar guardados.");
          return;
        }
        if (!res.ok) throw new Error("request failed");
        setSavedItemsAll((prev) => prev.filter((item) => item.id !== savedItemId));
        setCollectionItems((prev) => prev.filter((item) => item.id !== savedItemId));
        void refreshSavedCollections({ silent: true });
        showToast("Quitado de guardados.");
      } catch (_err) {
        showToast("No se pudo quitar el guardado.");
      } finally {
        setSavedItemRemovingId(null);
      }
    },
    [refreshSavedCollections, savedItemRemovingId, showToast]
  );

  useEffect(() => {
    if (!hydrated) return;
    void refreshSavedItems();
  }, [hydrated, refreshSavedItems]);

  useEffect(() => {
    if (!hydrated || !savedOnly) return;
    void refreshSavedItems({ silent: true });
  }, [hydrated, refreshSavedItems, savedOnly]);

  useEffect(() => {
    if (!hydrated || !savedOnly || savedView !== "all") return;
    void refreshSavedPopclips(savedPopclipIds);
  }, [hydrated, refreshSavedPopclips, savedOnly, savedPopclipIds, savedView]);

  useEffect(() => {
    if (!hydrated || !savedOnly || savedView !== "collections") return;
    void refreshSavedCollections();
  }, [hydrated, refreshSavedCollections, savedOnly, savedView]);

  useEffect(() => {
    if (!hydrated || !savedOnly || savedView !== "collections") return;
    void loadCollectionItems(activeCollectionId);
  }, [activeCollectionId, hydrated, loadCollectionItems, savedOnly, savedView]);

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

  const updateFeedSaveCount = useCallback((clipId: string, delta: number) => {
    setFeedItems((prev) =>
      prev.map((item) => {
        if (item.id !== clipId) return item;
        const currentCount = Number.isFinite(item.savesCount ?? NaN) ? (item.savesCount as number) : 0;
        const nextCount = Math.max(0, currentCount + delta);
        return { ...item, savesCount: nextCount };
      })
    );
  }, []);

  const handleToggleSave = useCallback(
    async (item: PopClipTileItem) => {
      const wasSaved = savedPopclipSet.has(item.id);
      const nextSaved = !wasSaved;
      const delta = nextSaved ? 1 : -1;
      const tempId = `temp-popclip-${item.id}`;

      setSavedItemsAll((prev) => {
        if (nextSaved) {
          const preview: SavedPreviewItem = {
            id: tempId,
            type: "POPCLIP",
            entityId: item.id,
            collectionId: null,
            createdAt: new Date().toISOString(),
            title: (item.title || item.caption || "PopClip").trim() || "PopClip",
            subtitle: `@${item.creator.handle}`,
            thumbUrl: item.posterUrl ?? item.thumbnailUrl ?? item.creator.avatarUrl ?? null,
            href: `/c/${encodeURIComponent(item.creator.handle)}?popclip=${encodeURIComponent(item.id)}`,
          };
          return [preview, ...prev];
        }
        return prev.filter((entry) => !(entry.type === "POPCLIP" && entry.entityId === item.id));
      });
      updateFeedSaveCount(item.id, delta);

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
          if (res.status === 401) {
            throw new Error("auth_required");
          }
          throw new Error("save_failed");
        }
        if (payload.saved !== nextSaved) {
          await refreshSavedItems({ silent: true });
        } else if (payload.saved && payload.savedItemId) {
          setSavedItemsAll((prev) =>
            prev.map((entry) =>
              entry.id === tempId ? { ...entry, id: payload.savedItemId as string, collectionId: payload.collectionId ?? null } : entry
            )
          );
        } else if (!payload.saved) {
          showToast("Quitado de guardados");
        }
      } catch (err) {
        setSavedItemsAll((prev) => {
          if (nextSaved) {
            return prev.filter((entry) => !(entry.type === "POPCLIP" && entry.entityId === item.id));
          }
          const preview: SavedPreviewItem = {
            id: tempId,
            type: "POPCLIP",
            entityId: item.id,
            collectionId: null,
            createdAt: new Date().toISOString(),
            title: (item.title || item.caption || "PopClip").trim() || "PopClip",
            subtitle: `@${item.creator.handle}`,
            thumbUrl: item.posterUrl ?? item.thumbnailUrl ?? item.creator.avatarUrl ?? null,
            href: `/c/${encodeURIComponent(item.creator.handle)}?popclip=${encodeURIComponent(item.id)}`,
          };
          return [preview, ...prev];
        });
        updateFeedSaveCount(item.id, -delta);
        if (err instanceof Error && err.message === "auth_required") {
          showToast("Inicia sesion para guardar.");
        } else {
          showToast("No se pudo actualizar guardados.");
        }
      }
    },
    [refreshSavedItems, savedPopclipSet, showToast, updateFeedSaveCount]
  );

  const handleToggleCreatorSave = useCallback(
    async (creator: RecommendedCreator) => {
      const wasSaved = savedCreatorSet.has(creator.id);
      const nextSaved = !wasSaved;
      const tempId = `temp-creator-${creator.id}`;

      setSavedItemsAll((prev) => {
        if (nextSaved) {
          const preview: SavedPreviewItem = {
            id: tempId,
            type: "CREATOR",
            entityId: creator.id,
            collectionId: null,
            createdAt: new Date().toISOString(),
            title: creator.displayName || "Creador",
            subtitle: `@${creator.handle}`,
            thumbUrl: creator.avatarUrl ?? null,
            href: `/c/${encodeURIComponent(creator.handle)}`,
          };
          return [preview, ...prev];
        }
        return prev.filter((entry) => !(entry.type === "CREATOR" && entry.entityId === creator.id));
      });

      try {
        const res = await fetch("/api/saved/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "CREATOR", entityId: creator.id }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { saved?: boolean; savedItemId?: string; collectionId?: string | null }
          | null;
        if (!res.ok || !payload || typeof payload.saved !== "boolean") {
          if (res.status === 401) {
            throw new Error("auth_required");
          }
          throw new Error("save_failed");
        }
        if (payload.saved !== nextSaved) {
          await refreshSavedItems({ silent: true });
        } else if (payload.saved && payload.savedItemId) {
          setSavedItemsAll((prev) =>
            prev.map((entry) =>
              entry.id === tempId
                ? { ...entry, id: payload.savedItemId as string, collectionId: payload.collectionId ?? null }
                : entry
            )
          );
        } else if (!payload.saved) {
          showToast("Quitado de guardados");
        }
      } catch (err) {
        setSavedItemsAll((prev) => {
          if (nextSaved) {
            return prev.filter((entry) => !(entry.type === "CREATOR" && entry.entityId === creator.id));
          }
          const preview: SavedPreviewItem = {
            id: tempId,
            type: "CREATOR",
            entityId: creator.id,
            collectionId: null,
            createdAt: new Date().toISOString(),
            title: creator.displayName || "Creador",
            subtitle: `@${creator.handle}`,
            thumbUrl: creator.avatarUrl ?? null,
            href: `/c/${encodeURIComponent(creator.handle)}`,
          };
          return [preview, ...prev];
        });
        if (err instanceof Error && err.message === "auth_required") {
          showToast("Inicia sesion para guardar.");
        } else {
          showToast("No se pudo actualizar guardados.");
        }
      }
    },
    [refreshSavedItems, savedCreatorSet, showToast]
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
  }, [filterQueryString, seedKey]);

  const selectedCategory = useMemo(
    () => HOME_CATEGORIES.find((category) => category.id === selectedCategoryId) ?? null,
    [selectedCategoryId]
  );
  const normalizedSearch = debouncedSearch.toLowerCase();
  const filterClips = useCallback(
    (items: PopClipFeedItem[]) => {
      if (!selectedCategory && !normalizedSearch) return items;
      return items.filter((item) => {
        const haystack = `${item.title || ""} ${item.caption || ""} ${item.creator.displayName} ${
          item.creator.handle
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
  const filteredFeedItems = useMemo(() => {
    const filtered = filterClips(feedItems);
    if (!followingOnly) return filtered;
    return filtered.filter((item) => followingSet.has(item.creatorId));
  }, [feedItems, filterClips, followingOnly, followingSet]);
  const filteredSavedPopclips = useMemo(() => {
    if (!normalizedSearch) return savedPopclips;
    return savedPopclips.filter((item) => {
      const haystack = `${item.title || ""} ${item.caption || ""} ${item.creator.displayName} ${
        item.creator.handle
      } ${item.creator.locationLabel || ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, savedPopclips]);
  const filteredSavedOtherItems = useMemo(() => {
    if (!normalizedSearch) return savedOtherItems;
    return savedOtherItems.filter((item) => {
      const haystack = `${item.title} ${item.subtitle || ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, savedOtherItems]);
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

  const savedCount = savedItemsAll.length;
  const savedMatchesCount = filteredSavedPopclips.length + filteredSavedOtherItems.length;
  const showFeedEmpty = !savedOnly && !followingOnly && !feedLoading && !feedError && filteredFeedItems.length === 0;
  const showFollowingEmpty =
    followingOnly && !feedLoading && !feedError && !followingLoading && filteredFeedItems.length === 0;
  const showFollowingLoading = followingOnly && followingLoading;
  const followingEmptyCopy =
    typeof followingTotal === "number" && followingTotal === 0
      ? "Aún no sigues a nadie."
      : "No hay PopClips de tus seguidos con estos filtros.";
  const savedEmpty = savedOnly && savedView === "all" && !savedItemsLoading && !savedItemsError && savedCount === 0;
  const savedNoMatch =
    savedOnly &&
    savedView === "all" &&
    !savedItemsLoading &&
    !savedItemsError &&
    !savedPopclipsLoading &&
    !savedPopclipsError &&
    savedCount > 0 &&
    savedMatchesCount === 0;
  const showSavedCount = hydrated && (savedOnly || savedCount > 0);
  const savedLabel = showSavedCount ? `Guardados · ${savedCount}` : "Guardados";
  const followingLabel =
    typeof followingTotal === "number" ? `Siguiendo (${followingTotal})` : "Siguiendo";
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
        id: "shortcut:saved",
        label: "Guardados",
        kind: "shortcut",
        index: index++,
        onSelect: () => runQuickAction("saved"),
      },
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
    <div className="flex flex-wrap items-center gap-2">
      <PillButton intent="secondary" size="sm" onClick={() => setCategorySheetOpen(true)}>
        Categorías
      </PillButton>
      <PillButton intent="secondary" size="sm" onClick={() => setFilterSheetOpen(true)} className="gap-2">
        <span>Filtros</span>
        {activeFilterCount > 0 ? (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[color:rgba(var(--brand-rgb),0.2)] px-1.5 text-[11px] font-semibold text-[color:var(--text)]">
            {activeFilterCount}
          </span>
        ) : null}
      </PillButton>
      <PillButton
        intent={savedOnly ? "primary" : "secondary"}
        size="sm"
        aria-pressed={savedOnly}
        onClick={() => {
          if (savedOnly) {
            exitSavedView();
            return;
          }
          setFollowingOnly(false);
          setSavedOnly(true);
          setExploreIntent("saved");
          setSavedView("all");
          setActiveCollectionId(null);
          updateSavedQuery({ saved: true, view: "all" });
        }}
      >
        {savedLabel}
      </PillButton>
      <PillButton
        intent={followingOnly ? "primary" : "secondary"}
        size="sm"
        aria-pressed={followingOnly}
        onClick={() => {
          if (followingOnly) {
            setFollowingOnly(false);
            return;
          }
          if (savedOnly) {
            exitSavedView();
          }
          setExploreIntent("all");
          setFollowingOnly(true);
          scrollToPopclips();
        }}
      >
        {followingLabel}
      </PillButton>
    </div>
  );

  const handleSeedDemo = useCallback(async () => {
    if (!isDev || seedLoading) return;
    setSeedLoading(true);
    setSeedError("");
    try {
      const res = await fetch("/api/dev/seed-popclips", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; created?: number; createdIds?: string[] }
        | null;
      if (!res.ok || !payload?.ok) {
        setSeedError("No se pudieron generar los clips demo.");
        return;
      }
      const createdIds = Array.isArray(payload.createdIds) ? payload.createdIds : [];
      if (createdIds.length > 0) {
        const autoSaveIds = createdIds.slice(0, 3);
        await Promise.all(
          autoSaveIds.map((id) =>
            fetch("/api/saved/toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "POPCLIP", entityId: id }),
            })
          )
        );
        await refreshSavedItems({ silent: true });
      }
      setSeedKey((prev) => prev + 1);
    } catch (_err) {
      setSeedError("No se pudieron generar los clips demo.");
    } finally {
      setSeedLoading(false);
    }
  }, [isDev, refreshSavedItems, seedLoading]);

  const loadMoreFeed = useCallback(async () => {
    if (!feedCursor || loadMorePendingRef.current) return;
    loadMorePendingRef.current = true;
    const requestKey = feedRequestKeyRef.current;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
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
  }, [feedCursor, filterQueryString]);

  const openPopclip = useCallback(
    (item: PopClipTileItem) => {
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
  }, [filterQueryString, seedKey]);

  return (
    <>
      <Head>
        <title>IntimiPop - Explorar</title>
      </Head>
      <div className="flex min-h-screen w-full flex-col">
        <div
          className={clsx(
            "fixed left-0 right-0 top-0 z-40 hidden transition-all md:block",
            showStickySearch ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
          )}
        >
          <div className="border-b border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/80 backdrop-blur-xl">
            <div className="mx-auto w-full max-w-6xl px-4 py-2 md:px-6 lg:px-8">
              <div ref={stickySearchWrapperRef} className="relative">
                <label className="sr-only" htmlFor="sticky-search">
                  Buscar
                </label>
                <div className="group flex h-9 items-center gap-3 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-[color:var(--text)] transition-colors hover:border-[color:var(--surface-border-hover)] focus-within:border-[color:var(--surface-border-hover)] focus-within:ring-1 focus-within:ring-[color:var(--surface-ring)]">
                  <Search className="h-4 w-4 flex-none text-[color:var(--muted)]" aria-hidden="true" />
                  <input
                    id="sticky-search"
                    ref={stickySearchInputRef}
                    type="text"
                    value={search}
                    onChange={handleSearchChange}
                    onFocus={handleSearchFocus}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar creadores, packs o PopClips"
                    aria-controls="search-suggestions"
                    className="h-6 w-full bg-transparent text-xs text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none"
                  />
                  {hasSearchValue ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearSearchValue();
                        focusSearchInput({ suppressOpen: true });
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--muted)] hover:text-[color:var(--text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                  <kbd
                    className="hidden flex-none rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted)] sm:inline-flex"
                    aria-hidden="true"
                  >
                    {isMac ? "⌘ K" : "Ctrl K"}
                  </kbd>
                </div>
                {showStickySearch ? renderSearchDropdown() : null}
              </div>
            </div>
          </div>
        </div>
        <div className="sticky top-0 z-40 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/90 backdrop-blur-xl md:hidden">
          <div className="mx-auto w-full max-w-6xl px-4 pt-[env(safe-area-inset-top)] pb-3">
            <div className="flex items-center justify-between">
              <Link href="/explore" legacyBehavior passHref>
                <a
                  onClick={(event) => {
                    event.preventDefault();
                    setSearch("");
                    setSelectedCategoryId(null);
                    setFollowingOnly(false);
                    setSavedOnly(false);
                    setExploreIntent("all");
                    setSavedView("all");
                    setActiveCollectionId(null);
                    closeSearchPanel();
                    scrollToTop();
                    void router.push("/explore");
                  }}
                  className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]"
                >
                  IntimiPop
                </a>
              </Link>
            </div>
            <div ref={mobileSearchWrapperRef} className="relative mt-3">
              <label className="sr-only" htmlFor="mobile-search">
                Buscar
              </label>
              <div className="group flex h-10 items-center gap-3 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-[color:var(--text)] transition-colors hover:border-[color:var(--surface-border-hover)] focus-within:border-[color:var(--surface-border-hover)] focus-within:ring-1 focus-within:ring-[color:var(--surface-ring)]">
                <Search className="h-4 w-4 flex-none text-[color:var(--muted)]" aria-hidden="true" />
                <input
                  id="mobile-search"
                  ref={mobileSearchInputRef}
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
              </div>
              {renderSearchDropdown()}
            </div>
            <div className="mt-3">{renderFilterChips()}</div>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 overflow-x-hidden">
          <HomeSectionCard className="relative">
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl opacity-70"
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

              <div className="hidden md:block">
                <div className="space-y-3">
                  <div ref={heroSearchWrapperRef} className="relative">
                    <label className="sr-only" htmlFor="home-search">
                      Buscar
                    </label>
                    <div className="group flex h-11 items-center gap-3 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-[color:var(--text)] transition-colors hover:border-[color:var(--surface-border-hover)] focus-within:border-[color:var(--surface-border-hover)] focus-within:ring-1 focus-within:ring-[color:var(--surface-ring)]">
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
                        className="flex-none rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--muted)]"
                        aria-hidden="true"
                      >
                        {isMac ? "⌘ K" : "Ctrl K"}
                      </kbd>
                    </div>
                    {!showStickySearch ? renderSearchDropdown() : null}
                  </div>
                  {renderFilterChips()}
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
            {savedOnly ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PillButton
                    intent={savedView === "all" ? "primary" : "secondary"}
                    size="sm"
                    aria-pressed={savedView === "all"}
                    onClick={() => {
                      setSavedView("all");
                      setActiveCollectionId(null);
                      updateSavedQuery({ saved: true, view: "all" });
                    }}
                  >
                    Todo
                  </PillButton>
                  <PillButton
                    intent={savedView === "collections" ? "primary" : "secondary"}
                    size="sm"
                    aria-pressed={savedView === "collections"}
                    onClick={() => {
                      setSavedView("collections");
                      setActiveCollectionId(null);
                      updateSavedQuery({ saved: true, view: "collections" });
                      void refreshSavedCollections();
                    }}
                  >
                    Colecciones
                  </PillButton>
                </div>

                {savedView === "all" ? (
                  savedItemsLoading ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <Skeleton key={`saved-skeleton-${idx}`} className="h-20 w-full rounded-2xl" />
                      ))}
                    </div>
                  ) : savedItemsError ? (
                    <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                      {savedItemsError}
                    </div>
                  ) : savedEmpty ? (
                    <div className="mx-auto w-full max-w-md rounded-2xl border border-[color:var(--surface-border)] bg-[color:rgba(17,24,39,0.75)] p-6 text-[color:var(--muted)] shadow-lg shadow-black/20 backdrop-blur-sm sm:p-8">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.3)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]">
                          <Bookmark className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-[color:var(--text)]">
                            No tienes guardados todavía.
                          </div>
                          <div className="text-xs text-[color:var(--muted)]">
                            Guarda clips, packs o creadores para volver rápido cuando te encajen.
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={exitSavedView}
                          aria-label="Ver todo"
                          className="inline-flex items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold text-white hover:bg-[color:var(--brand)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                        >
                          Ver todo
                        </button>
                        <button
                          type="button"
                          onClick={exitSavedView}
                          aria-label="Quitar filtro"
                          className="inline-flex items-center justify-center text-xs font-semibold text-[color:var(--muted)] underline-offset-2 hover:text-[color:var(--text)] hover:underline focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                        >
                          Quitar filtro
                        </button>
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
                        {seedError ? <span className="text-[color:var(--danger)]">{seedError}</span> : null}
                      </div>
                    </div>
                  ) : savedNoMatch ? (
                    <div className="flex flex-col items-start gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-[color:var(--muted)]">
                      <span className="text-sm">No hay guardados con estos filtros.</span>
                      <button
                        type="button"
                        onClick={exitSavedView}
                        className="inline-flex items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold text-white hover:bg-[color:var(--brand)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                      >
                        Ver todo
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {savedPopclipIds.length > 0 ? (
                        <div className="space-y-3">
                          {savedPopclipsLoading ? (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
                              {Array.from({ length: 6 }).map((_, idx) => (
                                <div
                                  key={`saved-popclip-skeleton-${idx}`}
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
                              ))}
                            </div>
                          ) : savedPopclipsError ? (
                            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                              {savedPopclipsError}
                            </div>
                          ) : filteredSavedPopclips.length === 0 ? (
                            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                              No hay PopClips guardados.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
                              {filteredSavedPopclips.map((item) => {
                                const savedPreview = savedPopclipPreviewMap.get(item.id);
                                const organizerItemId =
                                  savedPreview && !savedPreview.id.startsWith("temp-popclip-")
                                    ? savedPreview.id
                                    : null;
                                const organizerCollectionId = organizerItemId
                                  ? savedPreview?.collectionId ?? null
                                  : null;
                                return (
                                  <PopClipTile
                                    key={item.id}
                                    item={item}
                                    onOpen={openPopclip}
                                    profileHref={`/c/${encodeURIComponent(item.creator.handle)}`}
                                    chatHref={appendReturnTo(
                                      `/go/${encodeURIComponent(item.creator.handle)}`,
                                      router.asPath
                                    )}
                                    isFollowing={followingSet.has(item.creatorId)}
                                    onFollowChange={handleFollowChange}
                                    onFollowError={showToast}
                                    isSaved={savedPopclipSet.has(item.id)}
                                    onToggleSave={handleToggleSave}
                                    onOrganize={openOrganizer}
                                    organizerItemId={organizerItemId}
                                    organizerCollectionId={organizerCollectionId}
                                    onOpenCaption={openCaptionSheet}
                                    onCopyLink={handleCopyLink}
                                    onShare={handleShareLink}
                                    onReport={handleReportClip}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                      {filteredSavedOtherItems.length > 0 ? (
                        <div className="space-y-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                            Otros guardados
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {filteredSavedOtherItems.map((item) => (
                              <SavedItemCard
                                key={item.id}
                                item={item}
                                onMove={() => openOrganizer(item.id, item.collectionId ?? null)}
                                onRemove={() => void handleRemoveSavedItem(item.id)}
                                removing={savedItemRemovingId === item.id}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {activeCollectionId ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveCollectionId(null);
                            updateSavedQuery({ saved: true, view: "collections" });
                          }}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                        >
                          ← Colecciones
                        </button>
                        <div className="text-sm font-semibold text-[color:var(--text)]">
                          {activeCollection?.name ?? "Colección"}
                        </div>
                        {collectionItemsLoading ? (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {Array.from({ length: 3 }).map((_, idx) => (
                              <Skeleton key={`collection-item-${idx}`} className="h-20 w-full rounded-2xl" />
                            ))}
                          </div>
                        ) : collectionItemsError ? (
                          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                            {collectionItemsError}
                          </div>
                        ) : collectionItems.length === 0 ? (
                          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                            Esta colección está vacía.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {collectionItems.map((item) => (
                              <SavedItemCard
                                key={item.id}
                                item={item}
                                onMove={() => openOrganizer(item.id, item.collectionId ?? null)}
                                onRemove={() => void handleRemoveSavedItem(item.id)}
                                removing={savedItemRemovingId === item.id}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : savedCollectionsLoading ? (
                      <div className="space-y-2 text-xs text-[color:var(--muted)]">Cargando colecciones...</div>
                    ) : savedCollectionsError ? (
                      <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                        {savedCollectionsError}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {savedCollections.length === 0 ? (
                          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                            Aún no tienes colecciones.
                          </div>
                        ) : null}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setCreateCollectionOpen(true)}
                            className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-6 text-center text-xs font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
                          >
                            <span className="text-2xl font-semibold">+</span>
                            <span>Nueva colección</span>
                          </button>
                          {savedCollections.map((collection) => {
                            const cover = savedCollectionCoverMap.get(collection.id);
                            const fallback =
                              cover?.title?.trim()?.[0]?.toUpperCase() ||
                              collection.name?.trim()?.[0]?.toUpperCase() ||
                              "C";
                            return (
                              <div key={collection.id} className="relative">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCollectionId(collection.id);
                                    updateSavedQuery({
                                      saved: true,
                                      view: "collections",
                                      collectionId: collection.id,
                                    });
                                  }}
                                  className="group flex w-full flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 text-left transition hover:bg-[color:var(--surface-1)]"
                                >
                                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
                                    {cover?.thumbUrl ? (
                                      <Image
                                        src={normalizeImageSrc(cover.thumbUrl)}
                                        alt={cover.title || collection.name}
                                        width={320}
                                        height={240}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[color:var(--muted)]">
                                        {fallback}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-[color:var(--text)]">
                                      {collection.name}
                                    </span>
                                    <span className="text-xs text-[color:var(--muted)]">{collection.count}</span>
                                  </div>
                                </button>
                                <div className="absolute right-3 top-3">
                                  <ContextMenu
                                    buttonAriaLabel="Acciones de colección"
                                    buttonIcon="dots"
                                    buttonClassName="h-8 w-8 bg-[color:var(--surface-1)]"
                                    items={[
                                      {
                                        label: "Renombrar",
                                        icon: "edit",
                                        onClick: () => setRenameCollection({ id: collection.id, name: collection.name }),
                                        disabled: deleteCollectionPending,
                                      },
                                      {
                                        label: "Borrar",
                                        icon: "alert",
                                        danger: true,
                                        onClick: () => {
                                          setDeleteCollection({ id: collection.id, name: collection.name });
                                          setDeleteCollectionError("");
                                        },
                                        disabled: deleteCollectionPending,
                                      },
                                    ]}
                                    menuClassName="min-w-[170px]"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : feedLoading && feedItems.length === 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
                {Array.from({ length: FEED_SKELETON_COUNT }).map((_, idx) => (
                  <div
                    key={`feed-skeleton-${idx}`}
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
                ))}
              </div>
            ) : feedError ? (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                {feedError}
              </div>
            ) : showFollowingLoading ? (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
                Cargando seguidos...
              </div>
            ) : showFollowingEmpty ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-[color:var(--muted)]">
                <div className="space-y-1">
                  <span className="block text-sm">{followingEmptyCopy}</span>
                  {typeof followingTotal === "number" && followingTotal === 0 ? (
                    <span className="block text-xs">Sigue un creador y verás aquí sus clips.</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setFollowingOnly(false)}
                  className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                >
                  Explorar
                </button>
              </div>
            ) : showFeedEmpty ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-[color:var(--muted)]">
                <span className="text-sm">Aún no hay PopClips. Prueba a quitar filtros o vuelve más tarde.</span>
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
                  {filteredFeedItems.map((item) => {
                    const savedPreview = savedPopclipPreviewMap.get(item.id);
                    const organizerItemId =
                      savedPreview && !savedPreview.id.startsWith("temp-popclip-")
                        ? savedPreview.id
                        : null;
                    const organizerCollectionId = organizerItemId
                      ? savedPreview?.collectionId ?? null
                      : null;
                    return (
                      <PopClipTile
                        key={item.id}
                        item={item}
                        onOpen={openPopclip}
                        profileHref={`/c/${encodeURIComponent(item.creator.handle)}`}
                        chatHref={appendReturnTo(`/go/${encodeURIComponent(item.creator.handle)}`, router.asPath)}
                        isFollowing={followingSet.has(item.creatorId)}
                        onFollowChange={handleFollowChange}
                        onFollowError={showToast}
                        isSaved={savedPopclipSet.has(item.id)}
                        onToggleSave={handleToggleSave}
                        onOrganize={openOrganizer}
                        organizerItemId={organizerItemId}
                        organizerCollectionId={organizerCollectionId}
                        onOpenCaption={openCaptionSheet}
                        onCopyLink={handleCopyLink}
                        onShare={handleShareLink}
                        onReport={handleReportClip}
                      />
                    );
                  })}
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

          {(showFeedEmpty || feedError) && !savedOnly && !followingOnly ? (
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
                    <HomeCreatorCard
                      key={creator.handle}
                      creator={creator}
                      isSaved={savedCreatorSet.has(creator.id)}
                      onToggleSave={() => void handleToggleCreatorSave(creator)}
                    />
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
            <p className="mt-3 text-xs text-[color:var(--muted)]">Tip: toca … para organizar guardados.</p>
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

        <HomeCategorySheet
          open={categorySheetOpen}
          categories={HOME_CATEGORIES}
          selectedId={selectedCategoryId}
          onSelect={(category) => setSelectedCategoryId(category.id)}
          onClear={() => setSelectedCategoryId(null)}
          onClose={() => setCategorySheetOpen(false)}
        />
        <SavedOrganizerSheet
          open={organizerOpen}
          savedItemId={organizerItemId}
          currentCollectionId={organizerCollectionId}
          onClose={() => {
            setOrganizerOpen(false);
            setOrganizerItemId(null);
            setOrganizerCollectionId(null);
          }}
          onMoved={handleOrganizerMoved}
        />
        <SavedCollectionCreateSheet
          open={createCollectionOpen}
          onClose={() => setCreateCollectionOpen(false)}
          onCreated={handleCollectionCreated}
        />
        <SavedCollectionRenameSheet
          open={Boolean(renameCollection)}
          collectionId={renameCollection?.id ?? null}
          initialName={renameCollection?.name ?? ""}
          onClose={() => setRenameCollection(null)}
          onRenamed={handleCollectionRenamed}
        />
        <ConfirmDialog
          open={Boolean(deleteCollection)}
          title="Borrar colección"
          description={
            deleteCollection ? `¿Borrar "${deleteCollection.name}"? Sus guardados pasarán a "Todo".` : ""
          }
          confirmLabel={deleteCollectionPending ? "Borrando..." : "Borrar"}
          confirmDisabled={deleteCollectionPending}
          error={deleteCollectionError}
          onConfirm={handleDeleteCollection}
          onClose={() => {
            if (deleteCollectionPending) return;
            setDeleteCollection(null);
            setDeleteCollectionError("");
          }}
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

function pickQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
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

function SavedItemCard({
  item,
  onMove,
  onRemove,
  removing,
}: {
  item: SavedPreviewItem;
  onMove: () => void;
  onRemove: () => void;
  removing?: boolean;
}) {
  const router = useRouter();
  const typeLabel =
    item.type === "POPCLIP" ? "PopClip" : item.type === "PACK" ? "Pack" : "Creador";
  const thumbLabel = item.title?.trim()?.[0]?.toUpperCase() || "•";
  const isClickable = Boolean(item.href);
  const actionItems = [
    { label: "Mover a...", icon: "folder", onClick: onMove, disabled: Boolean(removing) },
    { label: "Quitar de guardados", icon: "alert", danger: true, onClick: onRemove, disabled: Boolean(removing) },
  ];
  const handleOpen = () => {
    if (!item.href) return;
    void router.push(item.href);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!item.href) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void router.push(item.href);
    }
  };

  return (
    <div
      className={clsx(
        "flex min-w-0 items-center gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3",
        isClickable &&
          "cursor-pointer transition hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-2)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]"
      )}
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleOpen : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
        {item.thumbUrl ? (
          <Image
            src={normalizeImageSrc(item.thumbUrl)}
            alt={item.title}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--muted)]">
            {thumbLabel}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--text)]">{item.title}</span>
          <span className="inline-flex shrink-0 rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
            {typeLabel}
          </span>
        </div>
        {item.subtitle ? (
          <div className="truncate text-xs text-[color:var(--muted)]">{item.subtitle}</div>
        ) : null}
        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
          <ContextMenu
            buttonAriaLabel="Acciones de guardado"
            buttonIcon="dots"
            buttonClassName="relative z-20 h-9 w-9 bg-[color:var(--surface-2)] pointer-events-auto"
            items={actionItems}
            menuClassName="min-w-[180px]"
          />
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmDisabled,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar confirmación"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="mx-auto w-full max-w-lg rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">Confirmación</p>
              <p className="text-sm font-semibold text-[color:var(--text)]">{title}</p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
            >
              ✕
            </button>
          </div>
          <div className="px-4 py-4 space-y-3">
            {description ? <p className="text-xs text-[color:var(--muted)]">{description}</p> : null}
            {error ? <div className="text-xs text-[color:var(--danger)]">{error}</div> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-3)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmDisabled}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-[color:var(--danger)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeCreatorCard({
  creator,
  isSaved,
  onToggleSave,
}: {
  creator: RecommendedCreator;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
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
            <div className="text-xs text-[color:var(--muted)] truncate">@{creator.handle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={isSaved ? "Quitar guardado" : "Guardar creador"}
            aria-pressed={isSaved}
            onClick={onToggleSave}
            className={clsx(
              "inline-flex h-9 w-9 items-center justify-center rounded-full border bg-[color:var(--surface-1)] text-[color:var(--text)] transition hover:bg-[color:var(--surface-2)]",
              isSaved
                ? "border-[color:rgba(var(--brand-rgb),0.6)]"
                : "border-[color:var(--surface-border)]"
            )}
          >
            {isSaved ? <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
          </button>
          <Link
            href={`/c/${creator.handle}`}
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
          >
            Ver perfil
          </Link>
        </div>
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
        aria-hidden={!open}
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
