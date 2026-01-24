import Head from "next/head";
import Image from "next/image";
import type { GetServerSideProps } from "next";
import { randomUUID } from "crypto";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent, type WheelEvent } from "react";
import { useRouter } from "next/router";
import { Bell, BellRing, ChevronLeft, ChevronRight, Lock, Pencil, ThumbsUp } from "lucide-react";
import { PublicHero } from "../../components/public-profile/PublicHero";
import { PublicProfileStatsRow } from "../../components/public-profile/PublicProfileStatsRow";
import { Skeleton } from "../../components/ui/Skeleton";
import { PublicLocationBadge } from "../../components/public-profile/PublicLocationBadge";
import { LocationPickerDialog } from "../../components/location/LocationPickerDialog";
import type {
  PublicCatalogItem,
  PublicCommentReply,
  PublicCreatorComment,
  PublicPopClip,
  PublicProfileStats,
} from "../../types/publicProfile";
import type { CreatorLocation } from "../../types/creatorLocation";
import { ensureAnalyticsCookie } from "../../lib/analyticsCookie";
import { track } from "../../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { notifyCreatorStatusUpdated } from "../../lib/creatorStatusEvents";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { getPublicProfileStats } from "../../lib/publicProfileStats";

type Props = {
  notFound?: boolean;
  showPreviewBanner?: boolean;
  creatorId?: string;
  creatorName?: string;
  bio?: string;
  websiteUrl?: string | null;
  subtitle?: string;
  avatarUrl?: string | null;
  creatorHandle?: string;
  isCreatorViewer?: boolean;
  stats?: PublicProfileStats;
  followerCount?: number;
  isFollowing?: boolean;
  location?: CreatorLocation | null;
  catalogItems?: PublicCatalogItem[];
  catalogError?: string | null;
  responseSla?: string | null;
  availability?: string | null;
  locale?: "es" | "en";
};

type CatalogItemRow = {
  id: string;
  type: "EXTRA" | "BUNDLE" | "PACK";
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  includes: unknown;
  isActive: boolean;
};

const POPCLIP_PAGE_SIZE = 12;
const CREATOR_COMMENT_PREVIEW = 2;
const HIGHLIGHT_PREVIEW_MAX = 4;
const CREATOR_COMMENT_MAX_LENGTH = 600;
const MAX_REPLY_PARTICIPANTS = 10;
const IS_DEV = process.env.NODE_ENV === "development";
const DEFAULT_LOCATION_PRECISION_KM = 3;

type HighlightTab = "popclips" | "pack" | "sub" | "extra";

type HighlightItem = {
  id: string;
  kind: "popclip" | "pack" | "sub" | "extra";
  title: string;
  priceLabel?: string;
  thumbUrl?: string | null;
  videoUrl?: string | null;
  detailHref?: string;
  popclip?: PublicPopClip;
};

type CreatorAvailability = "AVAILABLE" | "OFFLINE" | "VIP_ONLY";
type CreatorResponseSla = "INSTANT" | "LT_24H" | "LT_72H";
type LocationDraft = { lat: number | null; lng: number | null; label: string; placeId: string | null };

type HighlightEmptyCta =
  | {
      label: string;
      href: string;
      onClick: (event: MouseEvent<HTMLAnchorElement>) => void | Promise<void>;
      disabled?: boolean;
    }
  | {
      label: string;
      onClick: () => void;
      disabled?: boolean;
    };

type CatalogHighlightKind = Exclude<HighlightItem["kind"], "popclip">;

type Locale = "es" | "en";

const COPY: Record<Locale, { highlights: string; seeAll: string }> = {
  es: { highlights: "Destacados", seeAll: "Ver todo" },
  en: { highlights: "Featured", seeAll: "See all" },
};

const HIGHLIGHT_TABS: Array<{ id: HighlightTab; label: string }> = [
  { id: "popclips", label: "PopClips" },
  { id: "pack", label: "Packs" },
  { id: "sub", label: "Suscripciones" },
  { id: "extra", label: "Extras" },
];

const CREATOR_AVAILABILITY_OPTIONS: Array<{ value: CreatorAvailability; label: string }> = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "OFFLINE", label: "No disponible" },
  { value: "VIP_ONLY", label: "Solo VIP" },
];
const CREATOR_SLA_OPTIONS: Array<{ value: CreatorResponseSla; label: string }> = [
  { value: "INSTANT", label: "Responde al momento" },
  { value: "LT_24H", label: "Responde <24h" },
  { value: "LT_72H", label: "Responde <72h" },
];

function normalizeCreatorAvailability(value?: string | null): CreatorAvailability {
  const normalized = (value || "").toUpperCase();
  if (normalized === "VIP_ONLY") return "VIP_ONLY";
  if (normalized === "NOT_AVAILABLE" || normalized === "OFFLINE") return "OFFLINE";
  if (normalized === "ONLINE" || normalized === "AVAILABLE") return "AVAILABLE";
  return "AVAILABLE";
}

function normalizeCreatorResponseSla(value?: string | null): CreatorResponseSla {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "INSTANT";
  if (normalized === "LT_72H" || normalized === "LT_48H") return "LT_72H";
  return "LT_24H";
}

function resolveLocationEnabled(location?: CreatorLocation | null) {
  if (!location || location.visibility === "OFF") return false;
  const rawEnabled = location?.enabled;
  return Boolean(typeof rawEnabled === "boolean" ? rawEnabled : location?.allowDiscoveryUseLocation);
}

function resolveLocationRadiusKm(location?: CreatorLocation | null) {
  const raw = location?.precisionKm ?? location?.radiusKm ?? DEFAULT_LOCATION_PRECISION_KM;
  if (!Number.isFinite(raw)) return DEFAULT_LOCATION_PRECISION_KM;
  return Math.round(raw as number);
}

function buildLocationDraft(location?: CreatorLocation | null): LocationDraft {
  const lat = typeof location?.lat === "number" && Number.isFinite(location.lat) ? location.lat : null;
  const lng = typeof location?.lng === "number" && Number.isFinite(location.lng) ? location.lng : null;
  const label = (location?.label ?? "").trim();
  const placeId = (location?.placeId ?? "").trim();
  return { lat, lng, label, placeId: placeId || null };
}

export default function PublicCreatorByHandle({
  notFound,
  showPreviewBanner,
  creatorId,
  creatorName,
  bio,
  websiteUrl,
  responseSla,
  availability,
  avatarUrl,
  creatorHandle,
  isCreatorViewer,
  stats,
  followerCount,
  isFollowing,
  location,
  catalogItems,
  locale: localeProp,
}: Props) {
  const router = useRouter();
  const locale: Locale = localeProp === "en" ? "en" : "es";
  const t = (key: keyof (typeof COPY)["es"]) => COPY[locale][key];
  const baseChatHref = creatorHandle ? `/go/${creatorHandle}` : "/go/creator";
  const [searchParams, setSearchParams] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [popClips, setPopClips] = useState<PublicPopClip[]>([]);
  const [popClipsCursor, setPopClipsCursor] = useState<string | null>(null);
  const [popClipsLoading, setPopClipsLoading] = useState(false);
  const [popClipsLoadingMore, setPopClipsLoadingMore] = useState(false);
  const [popClipsError, setPopClipsError] = useState("");
  const [popclipsSectionCount, setPopclipsSectionCount] = useState<number | null>(null);
  const [storyClips, setStoryClips] = useState<PublicPopClip[]>([]);
  const [creatorComments, setCreatorComments] = useState<PublicCreatorComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [commentsTotalCount, setCommentsTotalCount] = useState<number | null>(null);
  const [commentsAvgRating, setCommentsAvgRating] = useState<number | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [viewerIsLoggedIn, setViewerIsLoggedIn] = useState(false);
  const [viewerHasPurchased, setViewerHasPurchased] = useState(false);
  const [viewerComment, setViewerComment] = useState<{ rating: number; text: string } | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<HighlightTab>("popclips");
  const [highlightModalOpen, setHighlightModalOpen] = useState(false);
  const [activePopclip, setActivePopclip] = useState<PublicPopClip | null>(null);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentRating, setCommentRating] = useState(5);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [helpfulPending, setHelpfulPending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popclipVideoRef = useRef<HTMLVideoElement | null>(null);
  const popclipPreloadRef = useRef<HTMLVideoElement | null>(null);
  const popclipWheelLockRef = useRef(0);
  const popclipTouchStartRef = useRef<number | null>(null);
  const popclipTouchLastRef = useRef<number | null>(null);
  const popclipQueryHandledRef = useRef<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [isFollowingState, setIsFollowingState] = useState(Boolean(isFollowing));
  const [followersCount, setFollowersCount] = useState(
    typeof followerCount === "number" && Number.isFinite(followerCount) ? followerCount : 0
  );
  const popclipQueryId = typeof router.query.popclip === "string" ? router.query.popclip : "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search || "";
    setSearchParams(search);
    setReturnTo(`${window.location.pathname}${search}`);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!commentSheetOpen) return;
    if (viewerComment) {
      setCommentRating(viewerComment.rating);
      setCommentText(viewerComment.text);
      return;
    }
    setCommentRating(5);
    setCommentText("");
  }, [commentSheetOpen, viewerComment]);

  useEffect(() => {
    if (!activePopclip) return;
    const video = popclipVideoRef.current;
    if (!video) return;
    const startAtSec = Math.max(0, Number(activePopclip.startAtSec ?? 0));
    if (!Number.isFinite(startAtSec) || startAtSec <= 0) return;
    const seekToStart = () => {
      try {
        video.currentTime = startAtSec;
      } catch (_err) {
        // ignore seek errors on some browsers
      }
    };
    if (video.readyState >= 1) {
      seekToStart();
    } else {
      video.addEventListener("loadedmetadata", seekToStart, { once: true });
    }
  }, [activePopclip]);

  useEffect(() => {
    if (!activePopclip) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activePopclip]);

  useEffect(() => {
    if (!creatorHandle) return;
    const controller = new AbortController();
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}&limit=${POPCLIP_PAGE_SIZE}`;
    let responseStatus: number | null = null;
    setPopClipsLoading(true);
    setPopClipsLoadingMore(false);
    setPopClipsError("");
    setPopClipsCursor(null);
    setPopClips([]);
    setStoryClips([]);
    setPopclipsSectionCount(null);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json()) as {
          clips?: PublicPopClip[];
          popclips?: PublicPopClip[];
          stories?: PublicPopClip[];
          nextCursor?: string | null;
          popclipsCount?: number;
          storiesCount?: number;
        };
        const resolvedPopclips = Array.isArray(payload?.popclips)
          ? payload.popclips
          : Array.isArray(payload?.clips)
          ? payload.clips
          : [];
        const resolvedStories = Array.isArray(payload?.stories) ? payload.stories : [];
        setPopClips(resolvedPopclips);
        setStoryClips(resolvedStories);
        setPopClipsCursor(typeof payload?.nextCursor === "string" ? payload.nextCursor : null);
        if (typeof payload?.popclipsCount === "number") {
          setPopclipsSectionCount(payload.popclipsCount);
        } else {
          setPopclipsSectionCount(resolvedPopclips.length);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logPublicFetchFailure(endpoint, responseStatus, err);
        setPopClipsError("No se pudieron cargar los PopClips.");
        setPopClips([]);
        setPopClipsCursor(null);
        setStoryClips([]);
        setPopclipsSectionCount(0);
      })
      .finally(() => {
        setPopClipsLoading(false);
      });
    return () => controller.abort();
  }, [creatorHandle]);

  useEffect(() => {
    if (!popclipQueryId) return;
    if (popclipQueryHandledRef.current === popclipQueryId) return;
    const allClips = [...popClips, ...storyClips];
    const target = allClips.find((clip) => clip.id === popclipQueryId);
    if (!target) return;
    popclipQueryHandledRef.current = popclipQueryId;
    setActiveHighlight("popclips");
    setActivePopclip(target);
  }, [popclipQueryId, popClips, storyClips]);

  useEffect(() => {
    if (!creatorHandle) return;
    const controller = new AbortController();
    const endpoint = `/api/public/comments?handle=${encodeURIComponent(
      creatorHandle
    )}&limit=${CREATOR_COMMENT_PREVIEW}`;
    let responseStatus: number | null = null;
    setCommentsLoading(true);
    setCommentsError("");
    setCommentsAvgRating(null);
    setHelpfulPending({});
    setViewerIsLoggedIn(false);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json()) as {
          comments?: PublicCreatorComment[];
          totalCount?: number;
          avgRating?: number | null;
          stats?: { count?: number; avgRating?: number; distribution?: Record<number, number> };
          canComment?: boolean;
          viewerCanComment?: boolean;
          viewerIsLoggedIn?: boolean;
          viewerIsFollowing?: boolean;
          viewerHasPurchased?: boolean;
          creatorHasPacksOrCatalogItems?: boolean;
          viewerComment?: { rating: number; text: string } | null;
        };
        setCreatorComments(Array.isArray(payload?.comments) ? payload.comments : []);
        if (typeof payload?.stats?.count === "number") {
          setCommentsTotalCount(payload.stats.count);
        } else if (typeof payload?.totalCount === "number") {
          setCommentsTotalCount(payload.totalCount);
        }
        if (typeof payload?.stats?.avgRating === "number") {
          setCommentsAvgRating(payload.stats.avgRating);
        } else if (typeof payload?.avgRating === "number") {
          setCommentsAvgRating(payload.avgRating);
        }
        const resolvedCanComment =
          typeof payload?.viewerCanComment === "boolean" ? payload.viewerCanComment : Boolean(payload?.canComment);
        setCanComment(resolvedCanComment);
        setViewerIsLoggedIn(Boolean(payload?.viewerIsLoggedIn));
        if (typeof payload?.viewerIsFollowing === "boolean") {
          setIsFollowingState(payload.viewerIsFollowing);
        }
        setViewerHasPurchased(Boolean(payload?.viewerHasPurchased));
        setViewerComment(payload?.viewerComment ?? null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logPublicFetchFailure(endpoint, responseStatus, err);
        setCommentsError("No se pudieron cargar los comentarios.");
        setCreatorComments([]);
        setCanComment(false);
        setCommentsAvgRating(null);
      })
      .finally(() => setCommentsLoading(false));
    return () => controller.abort();
  }, [creatorHandle]);

  const chatHref = appendReturnTo(appendSearchIfRelative(baseChatHref, searchParams), returnTo);
  const followDraft = "Quiero seguirte gratis.";
  const followHref = appendReturnTo(
    appendSearchIfRelative(`${baseChatHref}?draft=${encodeURIComponent(followDraft)}`, searchParams),
    returnTo
  );
  const followLabel = isFollowingState ? "Avisos activados" : "Activar avisos";
  const followAriaLabel = followLabel;
  const followTitle = "Recibir novedades de este creador";
  const followContent = (
    <span className="inline-flex items-center gap-2">
      {isFollowingState ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      <span className="hidden sm:inline">{followLabel}</span>
    </span>
  );

  useEffect(() => {
    if (!creatorHandle) return;
    const utmMeta = readUtmMeta();
    track(ANALYTICS_EVENTS.BIO_LINK_VIEW, {
      creatorId: creatorId || "creator-1",
      meta: { handle: creatorHandle, ...utmMeta },
    });
  }, [creatorHandle, creatorId]);

  const buildDraftHref = (draft: string) =>
    appendReturnTo(appendSearchIfRelative(`${baseChatHref}?draft=${encodeURIComponent(draft)}`, searchParams), returnTo);

  const resolveCatalogDetailHref = (
    item: PublicCatalogItem,
    kind: CatalogHighlightKind,
    priceLabel: string
  ) => {
    if (creatorHandle && item.type === "PACK") {
      return `/p/${creatorHandle}/${item.id}`;
    }
    return buildDraftHref(buildPackDraft(kind, item.title, priceLabel));
  };

  const catalogHighlightItems: HighlightItem[] = (catalogItems ?? [])
    .filter((item) => item.isActive !== false)
    .map((item, index) => {
      const kind = resolveCatalogKind(item);
      const priceLabel = formatPriceCents(item.priceCents, item.currency);
      return {
        id: item.id || `${item.type}-${index}`,
        kind,
        title: item.title,
        priceLabel,
        thumbUrl: null,
        detailHref: resolveCatalogDetailHref(item, kind, priceLabel),
      };
    });

  const commentsCount =
    typeof commentsTotalCount === "number"
      ? commentsTotalCount
      : stats?.commentsCount ?? 0;
  const statsContentCount =
    stats?.contentCount ??
    (stats?.popclipsCount ?? 0) + (stats?.storiesCount ?? 0);
  const ratingsCount = stats?.ratingsCount ?? 0;
  const topEligible = commentsCount >= 10 || ratingsCount >= 10;
  const tagline = "";
  const [creatorAvailability, setCreatorAvailability] = useState<CreatorAvailability>(
    normalizeCreatorAvailability(availability)
  );
  const [creatorResponseSla, setCreatorResponseSla] = useState<CreatorResponseSla>(
    normalizeCreatorResponseSla(responseSla)
  );
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusDraftAvailability, setStatusDraftAvailability] = useState<CreatorAvailability>(
    normalizeCreatorAvailability(availability)
  );
  const [statusDraftSla, setStatusDraftSla] = useState<CreatorResponseSla>(
    normalizeCreatorResponseSla(responseSla)
  );
  const [creatorLocation, setCreatorLocation] = useState<CreatorLocation | null>(location ?? null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationEnabled, setLocationEnabled] = useState(resolveLocationEnabled(location));
  const [locationRadiusKm, setLocationRadiusKm] = useState(resolveLocationRadiusKm(location));
  const [locationDraft, setLocationDraft] = useState<LocationDraft>(buildLocationDraft(location));

  useEffect(() => {
    setCreatorAvailability(normalizeCreatorAvailability(availability));
    setCreatorResponseSla(normalizeCreatorResponseSla(responseSla));
  }, [availability, responseSla]);

  useEffect(() => {
    if (!statusSheetOpen) return;
    setStatusDraftAvailability(creatorAvailability);
    setStatusDraftSla(creatorResponseSla);
    setStatusError("");
  }, [creatorAvailability, creatorResponseSla, statusSheetOpen]);

  const applyLocationState = useCallback((next: CreatorLocation | null) => {
    setCreatorLocation(next);
    setLocationEnabled(resolveLocationEnabled(next));
    setLocationRadiusKm(resolveLocationRadiusKm(next));
    setLocationDraft(buildLocationDraft(next));
  }, []);

  useEffect(() => {
    applyLocationState(location ?? null);
  }, [applyLocationState, location]);

  useEffect(() => {
    if (!statusSheetOpen || !isCreatorViewer) return;
    let cancelled = false;
    const loadLocation = async () => {
      setLocationLoading(true);
      setLocationError("");
      try {
        const res = await fetch("/api/creator/location");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "No se pudo cargar la ubicación.");
        }
        if (!cancelled) {
          applyLocationState(data as CreatorLocation);
        }
      } catch (err) {
        console.error("Error loading creator location", err);
        if (!cancelled) {
          setLocationError("No se pudo cargar la ubicación.");
        }
      } finally {
        if (!cancelled) {
          setLocationLoading(false);
        }
      }
    };
    void loadLocation();
    return () => {
      cancelled = true;
    };
  }, [applyLocationState, isCreatorViewer, statusSheetOpen]);

  const responseSlaLabel = formatResponseSla(creatorResponseSla);
  const availabilityLabel = formatAvailability(creatorAvailability);
  const locationHasCoords =
    typeof creatorLocation?.lat === "number" &&
    Number.isFinite(creatorLocation.lat) &&
    typeof creatorLocation?.lng === "number" &&
    Number.isFinite(creatorLocation.lng);
  const locationSummaryLabel = (() => {
    const label = (creatorLocation?.label ?? "").trim();
    if (!label) return "Sin ubicación";
    return `${label} (aprox.) · ${resolveLocationRadiusKm(creatorLocation)} km`;
  })();
  const locationSummaryText = locationLoading ? "Cargando ubicación..." : locationSummaryLabel;
  const locationLabel = (creatorLocation?.label ?? "").trim();
  const hasPublicLocation = Boolean(
    creatorLocation &&
      resolveLocationEnabled(creatorLocation) &&
      creatorLocation.visibility !== "OFF" &&
      locationLabel
  );
  const privateLocationLabel = locationLabel || (locationHasCoords ? "Mi ubicación" : "");
  const hasPrivateLocation = Boolean(
    isCreatorViewer && creatorLocation && !hasPublicLocation && privateLocationLabel
  );
  const locationChip = hasPublicLocation ? (
    <PublicLocationBadge location={creatorLocation} variant="chip" />
  ) : hasPrivateLocation ? (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]"
      title="Ubicación privada"
    >
      <Lock className="h-3 w-3 text-[color:var(--muted)]" aria-hidden="true" />
      <span className="truncate">📍 {privateLocationLabel} (privado)</span>
    </span>
  ) : null;
  const creatorChips = [
    ...(availabilityLabel ? [{ label: availabilityLabel }] : []),
    ...(responseSlaLabel ? [{ label: responseSlaLabel }] : []),
    ...(locationChip
      ? [
          {
            key: hasPublicLocation ? "location" : "location-private",
            node: locationChip,
          },
        ]
      : []),
  ];
  const statusEditAction = isCreatorViewer ? (
    <button
      type="button"
      onClick={() => setStatusSheetOpen(true)}
      aria-label="Editar estado"
      title="Editar estado"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] transition hover:border-[color:var(--surface-border-hover)] hover:text-[color:var(--text)]"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  ) : null;
  const bioText = (bio || "").trim();
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const bioRef = useRef<HTMLParagraphElement | null>(null);
  const [bioHasOverflow, setBioHasOverflow] = useState(false);
  const resolvedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
  const websiteLabel = resolvedWebsiteUrl ? formatWebsiteLabel(resolvedWebsiteUrl) : "";
  useEffect(() => {
    setCommentsTotalCount((prev) => (prev === null ? commentsCount : prev));
  }, [commentsCount]);
  const popclipsHeaderCount =
    typeof popclipsSectionCount === "number" ? popclipsSectionCount : popClips.length;
  const commentsHeaderCount =
    typeof commentsTotalCount === "number" ? commentsTotalCount : commentsCount;
  const commentsAverage =
    typeof commentsAvgRating === "number" && commentsAvgRating > 0 ? commentsAvgRating : null;
  const commentsHref = creatorHandle ? `/c/${creatorHandle}/comments` : "/c/creator/comments";
  const highlightPopclipsSource = [...storyClips, ...popClips].filter((clip, index, list) => {
    if (!clip?.id) return false;
    return list.findIndex((entry) => entry.id === clip.id) === index;
  });
  const highlightPopclipsAll: HighlightItem[] = highlightPopclipsSource.map((clip) => ({
    id: clip.id,
    kind: "popclip",
    title: (clip.title?.trim() || clip.pack.title || "PopClip").trim(),
    priceLabel: formatPriceCents(clip.pack.priceCents, clip.pack.currency),
    thumbUrl: clip.posterUrl ?? null,
    videoUrl: clip.videoUrl,
    detailHref: clip.pack.route,
    popclip: clip,
  }));
  const highlightPacksAll: HighlightItem[] = catalogHighlightItems.filter((item) => item.kind === "pack");
  const highlightSubsAll: HighlightItem[] = catalogHighlightItems.filter((item) => item.kind === "sub");
  const highlightExtrasAll: HighlightItem[] = catalogHighlightItems.filter((item) => item.kind === "extra");
  const hasHighlightPacks = highlightPacksAll.length > 0;
  const highlightPopclips = highlightPopclipsAll.slice(0, HIGHLIGHT_PREVIEW_MAX);
  const highlightPacks = highlightPacksAll.slice(0, HIGHLIGHT_PREVIEW_MAX);
  const highlightSubs = highlightSubsAll.slice(0, HIGHLIGHT_PREVIEW_MAX);
  const highlightExtras = highlightExtrasAll.slice(0, HIGHLIGHT_PREVIEW_MAX);
  const highlightItemsByTab: Record<HighlightTab, HighlightItem[]> = {
    popclips: highlightPopclips,
    pack: highlightPacks,
    sub: highlightSubs,
    extra: highlightExtras,
  };
  const highlightAllByTab: Record<HighlightTab, HighlightItem[]> = {
    popclips: highlightPopclipsAll,
    pack: highlightPacksAll,
    sub: highlightSubsAll,
    extra: highlightExtrasAll,
  };
  const highlightPopclipsTotal = popclipsHeaderCount + storyClips.length;
  const highlightTotalsByTab: Record<HighlightTab, number> = {
    popclips: highlightPopclipsTotal,
    pack: highlightPacksAll.length,
    sub: highlightSubsAll.length,
    extra: highlightExtrasAll.length,
  };
  const activeHighlights = highlightItemsByTab[activeHighlight];
  const activeHighlightAll = highlightAllByTab[activeHighlight];
  const activeHighlightTotal = highlightTotalsByTab[activeHighlight];
  const highlightHasMore = activeHighlightTotal > activeHighlights.length;
  const activeHighlightLabel =
    HIGHLIGHT_TABS.find((tab) => tab.id === activeHighlight)?.label ?? t("highlights");
  const highlightModalCount = activeHighlightTotal > 0 ? activeHighlightTotal : activeHighlightAll.length;
  const showHighlightLoadMore = activeHighlight === "popclips" && Boolean(popClipsCursor);
  const highlightLoading = activeHighlight === "popclips" && popClipsLoading;
  const highlightModalLoading = highlightLoading && activeHighlightAll.length === 0;
  const highlightEmptyCopyByTab: Record<HighlightTab, string> = {
    popclips: "Aún no hay PopClips publicados.",
    pack: "Aún no hay packs publicados.",
    sub: "Aún no hay suscripciones publicadas.",
    extra: "Aún no hay extras publicados.",
  };
  const highlightFollowLabel = isFollowingState ? "Avisos activados" : "Activar avisos";
  const highlightFollowDisabled = isFollowingState || followPending;
  const activePopclipId = activePopclip?.id ?? null;
  const activePopclipTitle = activePopclip
    ? (activePopclip.title?.trim() || activePopclip.pack.title || "PopClip").trim()
    : "";
  const activePopclipPriceLabel = activePopclip
    ? formatPriceCents(activePopclip.pack.priceCents, activePopclip.pack.currency)
    : "";
  const activePopclipPackRoute = activePopclip?.pack?.route ?? "";
  const activePopclipPackTitle = activePopclip?.pack?.title ?? "";
  const activePopclipChatHref = activePopclip
    ? buildDraftHref(buildPopclipDraft(activePopclipTitle, activePopclipPackTitle))
    : "";
  const activePopclipIndex = activePopclip
    ? highlightPopclipsSource.findIndex((clip) => clip.id === activePopclip.id)
    : -1;
  const hasPrevPopclip = activePopclipIndex > 0;
  const hasNextPopclip =
    activePopclipIndex >= 0 && activePopclipIndex < highlightPopclipsSource.length - 1;

  const handlePopclipNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!highlightPopclipsSource.length || activePopclipIndex < 0) return;
      const delta = direction === "next" ? 1 : -1;
      const nextIndex = activePopclipIndex + delta;
      if (nextIndex < 0 || nextIndex >= highlightPopclipsSource.length) return;
      if (popclipVideoRef.current) {
        try {
          popclipVideoRef.current.pause();
        } catch (_err) {
          // ignore pause errors
        }
      }
      setActivePopclip(highlightPopclipsSource[nextIndex]);
    },
    [activePopclipIndex, highlightPopclipsSource]
  );

  useEffect(() => {
    if (!activePopclip) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        handlePopclipNavigate("prev");
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        handlePopclipNavigate("next");
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setActivePopclip(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePopclip, handlePopclipNavigate]);

  useEffect(() => {
    if (!activePopclipId) return;
    const video = popclipVideoRef.current;
    if (!video) return;
    try {
      video.load();
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch (_err) {
      // ignore autoplay errors
    }
  }, [activePopclipId]);

  useEffect(() => {
    if (activePopclipIndex < 0) {
      popclipPreloadRef.current = null;
      return;
    }
    const nextClip = highlightPopclipsSource[activePopclipIndex + 1];
    if (!nextClip?.videoUrl) {
      popclipPreloadRef.current = null;
      return;
    }
    const preload = document.createElement("video");
    preload.preload = "metadata";
    preload.src = nextClip.videoUrl;
    popclipPreloadRef.current = preload;
  }, [activePopclipIndex, highlightPopclipsSource]);

  const handlePopclipWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (activePopclipIndex < 0) return;
      const delta = event.deltaY;
      if (Math.abs(delta) < 24) return;
      const now = Date.now();
      if (now - popclipWheelLockRef.current < 450) return;
      popclipWheelLockRef.current = now;
      event.preventDefault();
      handlePopclipNavigate(delta > 0 ? "next" : "prev");
    },
    [activePopclipIndex, handlePopclipNavigate]
  );

  const handlePopclipTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (activePopclipIndex < 0) return;
      const touch = event.touches[0];
      if (!touch) return;
      popclipTouchStartRef.current = touch.clientY;
      popclipTouchLastRef.current = touch.clientY;
    },
    [activePopclipIndex]
  );

  const handlePopclipTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    popclipTouchLastRef.current = touch.clientY;
  }, []);

  const handlePopclipTouchEnd = useCallback(() => {
    if (activePopclipIndex < 0) return;
    const startY = popclipTouchStartRef.current;
    const endY = popclipTouchLastRef.current ?? startY;
    popclipTouchStartRef.current = null;
    popclipTouchLastRef.current = null;
    if (startY === null || endY === null) return;
    const delta = startY - endY;
    if (Math.abs(delta) < 40) return;
    const now = Date.now();
    if (now - popclipWheelLockRef.current < 450) return;
    popclipWheelLockRef.current = now;
    handlePopclipNavigate(delta > 0 ? "next" : "prev");
  }, [activePopclipIndex, handlePopclipNavigate]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2200);
  };

  const persistLocation = useCallback(
    async (draft: LocationDraft, precisionKm: number, enabled: boolean) => {
      setLocationSaving(true);
      setLocationError("");
      const hasCoords =
        typeof draft.lat === "number" &&
        Number.isFinite(draft.lat) &&
        typeof draft.lng === "number" &&
        Number.isFinite(draft.lng);
      const payload = {
        enabled: hasCoords ? enabled : false,
        lat: hasCoords ? draft.lat : null,
        lng: hasCoords ? draft.lng : null,
        label: hasCoords ? (draft.label || "").trim() : "",
        placeId: hasCoords ? (draft.placeId || "").trim() : "",
        precisionKm: Number.isFinite(precisionKm) ? Math.round(precisionKm) : DEFAULT_LOCATION_PRECISION_KM,
      };
      try {
        const res = await fetch("/api/creator/location", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "No se pudo guardar la ubicación.");
        }
        applyLocationState(data as CreatorLocation);
        return true;
      } catch (err) {
        console.error("Error saving creator location", err);
        setLocationError("No se pudo guardar la ubicación.");
        return false;
      } finally {
        setLocationSaving(false);
      }
    },
    [applyLocationState]
  );

  const handleOpenLocationDialog = () => {
    if (locationLoading || locationSaving) return;
    setLocationDraft(buildLocationDraft(creatorLocation));
    setLocationRadiusKm(resolveLocationRadiusKm(creatorLocation));
    setLocationDialogOpen(true);
    setLocationError("");
  };

  const handleCloseLocationDialog = () => {
    if (locationSaving) return;
    setLocationDialogOpen(false);
    setLocationDraft(buildLocationDraft(creatorLocation));
    setLocationRadiusKm(resolveLocationRadiusKm(creatorLocation));
  };

  const handleSaveLocation = async () => {
    const ok = await persistLocation(locationDraft, locationRadiusKm, locationEnabled);
    if (ok) {
      setLocationDialogOpen(false);
    }
  };

  const handleClearLocation = async () => {
    const ok = await persistLocation(
      { lat: null, lng: null, label: "", placeId: null },
      locationRadiusKm,
      false
    );
    if (ok) {
      setLocationDialogOpen(false);
    }
  };

  const handleToggleLocationEnabled = async (nextEnabled: boolean) => {
    const prev = locationEnabled;
    setLocationEnabled(nextEnabled);
    const current = creatorLocation;
    const hasCoords =
      typeof current?.lat === "number" &&
      Number.isFinite(current.lat) &&
      typeof current?.lng === "number" &&
      Number.isFinite(current.lng);
    if (!current || !hasCoords) return;
    const ok = await persistLocation(buildLocationDraft(current), resolveLocationRadiusKm(current), nextEnabled);
    if (!ok) {
      setLocationEnabled(prev);
    }
  };

  const handleSaveCreatorStatus = async () => {
    setStatusSaving(true);
    setStatusError("");
    try {
      const res = await fetch("/api/creator/profile/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability: statusDraftAvailability,
          responseSla: statusDraftSla,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.message || "No se pudo guardar el estado.");
      }
      setCreatorAvailability(normalizeCreatorAvailability(data?.availability ?? statusDraftAvailability));
      setCreatorResponseSla(normalizeCreatorResponseSla(data?.responseSla ?? statusDraftSla));
      notifyCreatorStatusUpdated();
      setStatusSheetOpen(false);
    } catch (err) {
      console.error("Error saving creator status", err);
      setStatusError("No se pudo guardar el estado.");
    } finally {
      setStatusSaving(false);
    }
  };

  const handleCloseStatusSheet = () => {
    if (statusSaving || locationSaving) return;
    setStatusSheetOpen(false);
    handleCloseLocationDialog();
  };

  const handleOpenHighlightModal = () => {
    if (activeHighlightAll.length === 0) return;
    setHighlightModalOpen(true);
  };

  const handleSelectHighlightItem = (item: HighlightItem) => {
    if (item.kind === "popclip") {
      if (item.popclip) {
        setActivePopclip(item.popclip);
      } else if (item.detailHref) {
        void router.push(item.detailHref);
      }
      setHighlightModalOpen(false);
      return;
    }
    if (item.detailHref) {
      setHighlightModalOpen(false);
      void router.push(item.detailHref);
    }
  };

  const renderHighlightCard = (item: HighlightItem, showAction = true) => (
    <div
      key={item.id}
      role="button"
      tabIndex={0}
      onClick={() => handleSelectHighlightItem(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelectHighlightItem(item);
        }
      }}
      className="snap-start rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand)] cursor-pointer"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
        {item.videoUrl ? (
          <video
            className="h-full w-full object-cover"
            src={item.videoUrl}
            poster={item.thumbUrl ? normalizeImageSrc(item.thumbUrl) : undefined}
            muted
            loop
            playsInline
            preload="metadata"
            autoPlay
          />
        ) : item.thumbUrl ? (
          <Image
            src={normalizeImageSrc(item.thumbUrl)}
            alt={item.title}
            width={320}
            height={240}
            sizes="(max-width: 640px) 50vw, 25vw"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[color:var(--surface-1)] to-[color:var(--surface-2)] text-[10px] text-[color:var(--muted)]">
            Sin preview
          </div>
        )}
        {item.priceLabel ? (
          <span className="absolute right-2 top-2 rounded-full border border-[color:rgba(15,23,42,0.4)] bg-[color:rgba(15,23,42,0.7)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
            {item.priceLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs font-semibold text-[color:var(--text)] line-clamp-2 min-h-[2.25rem]">
        {item.title}
      </p>
      {showAction && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleSelectHighlightItem(item);
          }}
          className="mt-2 inline-flex h-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] px-3 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          Ver
        </button>
      )}
    </div>
  );

  const handleClosePopclipViewer = () => {
    setActivePopclip(null);
  };

  const handlePopclipTimeUpdate = () => {
    if (!activePopclip || !popclipVideoRef.current) return;
    const startAtSec = Math.max(0, Number(activePopclip.startAtSec ?? 0));
    const durationSec = activePopclip.durationSec ?? null;
    if (!durationSec || durationSec <= 0) return;
    const endAtSec = startAtSec + durationSec;
    if (popclipVideoRef.current.currentTime >= endAtSec) {
      popclipVideoRef.current.pause();
      try {
        popclipVideoRef.current.currentTime = startAtSec;
      } catch (_err) {
        // ignore seek errors
      }
    }
  };


  const handleLoadMorePopClips = async () => {
    if (!creatorHandle || !popClipsCursor || popClipsLoadingMore) return;
    setPopClipsLoadingMore(true);
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}&limit=${POPCLIP_PAGE_SIZE}&cursor=${encodeURIComponent(
      popClipsCursor
    )}`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint);
      responseStatus = res.status;
      if (!res.ok) throw new Error("request failed");
      const payload = (await res.json()) as {
        clips?: PublicPopClip[];
        popclips?: PublicPopClip[];
        nextCursor?: string | null;
        popclipsCount?: number;
      };
      const newClips = Array.isArray(payload?.popclips)
        ? payload.popclips
        : Array.isArray(payload?.clips)
        ? payload.clips
        : [];
      setPopClips((prev) => {
        if (!newClips.length) return prev;
        const existing = new Set(prev.map((clip) => clip.id));
        return [...prev, ...newClips.filter((clip) => !existing.has(clip.id))];
      });
      setPopClipsCursor(typeof payload?.nextCursor === "string" ? payload.nextCursor : null);
      if (typeof payload?.popclipsCount === "number") {
        setPopclipsSectionCount(payload.popclipsCount);
      }
    } catch (_err) {
      logPublicFetchFailure(endpoint, responseStatus, _err);
      showToast("No se pudieron cargar más PopClips.");
    } finally {
      setPopClipsLoadingMore(false);
    }
  };

  const handleSubmitCreatorComment = async () => {
    if (!creatorHandle || commentSending) return;
    const trimmed = commentText.trim();
    if (!trimmed || trimmed.length > CREATOR_COMMENT_MAX_LENGTH) {
      showToast("Revisa el texto del comentario.");
      return;
    }
    setCommentSending(true);
    const endpoint = `/api/public/comments?handle=${encodeURIComponent(creatorHandle)}`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: commentRating, text: trimmed }),
      });
      responseStatus = res.status;
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; created?: boolean; comment?: PublicCreatorComment }
        | null;
      if (!res.ok || !data) {
        if (res.status === 401 || res.status === 403) {
          showToast("Solo compradores verificados pueden comentar.");
          return;
        }
        throw new Error("request failed");
      }
      if (data.ok === false) {
        if (data.error === "NOT_ELIGIBLE" || data.error === "NOT_VERIFIED" || data.error === "AUTH_REQUIRED") {
          showToast("Solo compradores verificados pueden comentar.");
          return;
        }
        throw new Error("request failed");
      }
      if (!data.comment) throw new Error("missing comment");
      const nextComment = data.comment;
      setViewerComment({ rating: nextComment.rating, text: nextComment.text });
      setCreatorComments((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === nextComment.id);
        const next =
          existingIndex >= 0
            ? [nextComment, ...prev.filter((item) => item.id !== nextComment.id)]
            : [nextComment, ...prev];
        return next.slice(0, CREATOR_COMMENT_PREVIEW);
      });
      if (data.created) {
        setCommentsTotalCount((prev) => (typeof prev === "number" ? prev + 1 : 1));
      }
      setCommentSheetOpen(false);
      showToast("Comentario enviado.");
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      showToast("No se pudo enviar el comentario.");
    } finally {
      setCommentSending(false);
    }
  };

  const handleToggleHelpful = async (commentId: string) => {
    if (!creatorHandle || helpfulPending[commentId] || !viewerIsLoggedIn || isCreatorViewer) return;
    const target = creatorComments.find((comment) => comment.id === commentId);
    if (!target) return;
    const prevHasVoted = Boolean(target.viewerHasVoted);
    const prevCount = typeof target.helpfulCount === "number" ? target.helpfulCount : 0;
    const nextHasVoted = !prevHasVoted;
    const nextCount = Math.max(0, prevCount + (nextHasVoted ? 1 : -1));

    setHelpfulPending((prev) => ({ ...prev, [commentId]: true }));
    setCreatorComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, viewerHasVoted: nextHasVoted, helpfulCount: nextCount }
          : comment
      )
    );

    const endpoint = `/api/creator/comments/${encodeURIComponent(commentId)}/helpful`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint, { method: "POST" });
      responseStatus = res.status;
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; voted?: boolean; helpfulCount?: number; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        if (res.status === 401) {
          setCreatorComments((prev) =>
            prev.map((comment) =>
              comment.id === commentId
                ? { ...comment, viewerHasVoted: prevHasVoted, helpfulCount: prevCount }
                : comment
            )
          );
          showToast("Inicia sesión para votar.");
          return;
        }
        if (res.status === 403) {
          setCreatorComments((prev) =>
            prev.map((comment) =>
              comment.id === commentId
                ? { ...comment, viewerHasVoted: prevHasVoted, helpfulCount: prevCount }
                : comment
            )
          );
          showToast("No puedes votar en tu propio perfil.");
          return;
        }
        throw new Error("request failed");
      }
      const updatedCount =
        typeof data.helpfulCount === "number" ? data.helpfulCount : nextCount;
      const voted = typeof data.voted === "boolean" ? data.voted : nextHasVoted;
      setCreatorComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, viewerHasVoted: voted, helpfulCount: updatedCount }
            : comment
        )
      );
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      setCreatorComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, viewerHasVoted: prevHasVoted, helpfulCount: prevCount }
            : comment
        )
      );
      showToast("No se pudo actualizar el voto.");
    } finally {
      setHelpfulPending((prev) => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
    }
  };

  useEffect(() => {
    if (isBioExpanded) return;
    const el = bioRef.current;
    if (!el) return;
    const check = () => {
      const hasOverflow = el.scrollHeight > el.clientHeight + 1;
      setBioHasOverflow(hasOverflow);
    };
    const raf = requestAnimationFrame(check);
    const handleResize = () => check();
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, [bioText, isBioExpanded]);

  const openChat = async () => {
    if (!creatorHandle || chatPending) return;
    const rawReturnTo =
      returnTo || (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "");
    const safeReturnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "";
    setChatPending(true);
    const endpoint = safeReturnTo
      ? `/api/public/chat/open?returnTo=${encodeURIComponent(safeReturnTo)}`
      : "/api/public/chat/open";
    let responseStatus: number | null = null;
    try {
      const payload = { creatorHandle };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      responseStatus = res.status;
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as { redirectUrl?: string };
      if (!data?.redirectUrl) throw new Error("missing redirect");
      await router.push(data.redirectUrl);
    } catch (_err) {
      logPublicFetchFailure(endpoint, responseStatus, _err);
      showToast("No se pudo abrir el chat.");
      setChatPending(false);
    }
  };

  const handleOpenChat = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    await openChat();
  };

  const handleFollow = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!creatorHandle || followPending) return;
    if (isFollowingState) {
      showToast("Ya sigues a este creador.");
      return;
    }
    const endpoint = `/api/public/creator/${encodeURIComponent(creatorHandle)}/follow`;
    let responseStatus: number | null = null;
    const prevFollowing = isFollowingState;
    const prevCount = followersCount;
    setIsFollowingState(true);
    setFollowersCount((count) => count + 1);
    setFollowPending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      responseStatus = res.status;
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as { followerCount?: number; following?: boolean };
      if (typeof data?.followerCount === "number") {
        setFollowersCount(data.followerCount);
      }
      if (typeof data?.following === "boolean") {
        setIsFollowingState(data.following);
      }
    } catch (_err) {
      logPublicFetchFailure(endpoint, responseStatus, _err);
      setIsFollowingState(prevFollowing);
      setFollowersCount(prevCount);
      showToast("No se pudo seguir.");
    } finally {
      setFollowPending(false);
    }
  };

  const highlightEmptyCta: HighlightEmptyCta = (() => {
    if (!viewerIsLoggedIn) {
      return {
        label: "Entrar al chat",
        href: chatHref,
        onClick: handleOpenChat,
        disabled: chatPending,
      };
    }
    if (!isFollowingState) {
      return {
        label: highlightFollowLabel,
        href: followHref,
        onClick: handleFollow,
        disabled: highlightFollowDisabled,
      };
    }
    if (hasHighlightPacks && !viewerHasPurchased && activeHighlight !== "pack") {
      return {
        label: "Ver packs",
        onClick: () => {
          setActiveHighlight("pack");
          setHighlightModalOpen(true);
        },
      };
    }
    return {
      label: "Entrar al chat",
      href: chatHref,
      onClick: handleOpenChat,
      disabled: chatPending,
    };
  })();

  if (notFound || !creatorName || !creatorHandle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-0)] text-[color:var(--muted)] px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Perfil no disponible</h1>
          <p className="text-sm text-[color:var(--muted)]">El creador aún no ha activado su perfil público.</p>
          <div className="flex justify-center pt-2">
            <a
              href="/explore"
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              Volver a explorar
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{String(creatorName || "Perfil público")}</title>
      </Head>
      <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)] overflow-x-hidden">
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 space-y-6 min-w-0">
          <PublicHero
            name={creatorName}
            avatarUrl={avatarUrl}
            tagline={tagline}
            topEligible={topEligible}
            chips={creatorChips}
            chipsPlacement="meta"
            chipsAction={statusEditAction}
            primaryCtaLabel="Entrar al chat privado"
            primaryHref={chatHref}
            primaryOnClick={handleOpenChat}
            primaryDisabled={chatPending}
            secondaryCtaLabel={followLabel}
            secondaryCtaContent={followContent}
            secondaryCtaAriaLabel={followAriaLabel}
            secondaryCtaTitle={followTitle}
            secondaryHref={followHref}
            secondaryOnClick={handleFollow}
            secondaryDisabled={followPending}
          />
          {showPreviewBanner && (
            <div className="rounded-xl border border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:var(--surface-1)] px-4 py-2 text-xs text-[color:var(--muted)]">
              Vista previa: tu perfil aún no está público.
            </div>
          )}
          {toast && <div className="text-xs text-[color:var(--brand)]">{toast}</div>}
          <PublicProfileStatsRow
            commentsCount={commentsCount}
            contentCount={statsContentCount}
            followersCount={followersCount}
          />
          {(bioText || resolvedWebsiteUrl) && (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 space-y-2">
              {bioText && (
                <div className="space-y-1">
                  <p
                    ref={bioRef}
                    className={`text-sm text-[color:var(--text)] whitespace-pre-line ${
                      isBioExpanded ? "" : "line-clamp-2"
                    }`}
                  >
                    {bioText}
                  </p>
                  {bioHasOverflow && (
                    <button
                      type="button"
                      onClick={() => setIsBioExpanded((prev) => !prev)}
                      className="text-xs font-semibold text-[color:var(--warning)] hover:text-[color:var(--text)]"
                    >
                      {isBioExpanded ? "Ver menos" : "Ver más"}
                    </button>
                  )}
                </div>
              )}
              {resolvedWebsiteUrl && (
                <a
                  href={resolvedWebsiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                >
                  Web · {websiteLabel}
                </a>
              )}
            </div>
          )}

          <section className="space-y-3 min-w-0">
            <div className="flex items-center justify-between min-w-0">
              <h2 className="text-base font-semibold text-[color:var(--text)]">{t("highlights")}</h2>
              {highlightHasMore && (
                <button
                  type="button"
                  onClick={handleOpenHighlightModal}
                  className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
                >
                  {t("seeAll")} ({activeHighlightTotal})
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {HIGHLIGHT_TABS.map((tab) => {
                const isActive = tab.id === activeHighlight;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveHighlight(tab.id)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                      isActive
                        ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                        : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            {activeHighlights.length === 0 ? (
              highlightLoading ? (
                <div className="grid grid-flow-col auto-cols-[minmax(140px,1fr)] gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid-flow-row sm:grid-cols-2 lg:grid-cols-3 sm:auto-cols-auto sm:overflow-visible">
                  {Array.from({ length: HIGHLIGHT_PREVIEW_MAX }).map((_, idx) => (
                    <Skeleton key={`highlight-skeleton-${idx}`} className="h-[180px] w-full rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-xs text-[color:var(--muted)] space-y-3">
                  <p>{highlightEmptyCopyByTab[activeHighlight]}</p>
                  <div className="flex flex-wrap gap-2">
                    {"href" in highlightEmptyCta ? (
                      <a
                        href={highlightEmptyCta.href}
                        onClick={highlightEmptyCta.onClick}
                        aria-disabled={highlightEmptyCta.disabled}
                        className={`inline-flex h-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] px-3 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]${
                          highlightEmptyCta.disabled ? " opacity-60 pointer-events-none" : ""
                        }`}
                      >
                        {highlightEmptyCta.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={highlightEmptyCta.onClick}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.5)] px-3 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.12)]"
                      >
                        {highlightEmptyCta.label}
                      </button>
                    )}
                  </div>
                </div>
              )
            ) : (
              <div className="grid grid-flow-col auto-cols-[minmax(140px,1fr)] gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid-flow-row sm:grid-cols-2 lg:grid-cols-3 sm:auto-cols-auto sm:overflow-visible">
                {activeHighlights.map((item) => renderHighlightCard(item))}
              </div>
            )}
          </section>

          <section className="space-y-3 min-w-0">
            <div className="flex items-center justify-between min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-base font-semibold text-[color:var(--text)]">Comentarios ({commentsHeaderCount})</h2>
                {commentsAverage !== null && commentsHeaderCount > 0 && (
                  <span className="text-xs font-semibold text-[color:var(--muted)]" title="Valoración media">
                    {commentsAverage.toFixed(1)} ★
                  </span>
                )}
              </div>
              {commentsHeaderCount > 0 && (
                <a
                  href={commentsHref}
                  className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
                >
                  {t("seeAll")}
                </a>
              )}
            </div>
            {commentsError ? (
              <div className="text-xs text-[color:var(--danger)]">{commentsError}</div>
            ) : commentsLoading ? (
              <div className="grid gap-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={`comment-skeleton-${idx}`} className="h-20 w-full" />
                ))}
              </div>
            ) : creatorComments.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">Aún no hay comentarios.</p>
            ) : (
              <div className="grid gap-3">
                {creatorComments.map((comment) => {
                  const helpfulDisabled = helpfulPending[comment.id] || !viewerIsLoggedIn || Boolean(isCreatorViewer);
                  const helpfulTitle = helpfulPending[comment.id]
                    ? "Actualizando voto..."
                    : isCreatorViewer
                    ? "No puedes votar en tu propio perfil"
                    : viewerIsLoggedIn
                    ? "Marcar comentario como útil"
                    : "Inicia sesión para votar";
                  const helpfulDisabledClass = helpfulDisabled
                    ? isCreatorViewer
                      ? "opacity-50 cursor-not-allowed"
                      : "opacity-60 cursor-not-allowed"
                    : "hover:bg-[color:var(--surface-2)]";
                  const previewReplies = resolvePreviewReplies(comment, creatorName);
                  const repliesLocked = Boolean(comment.repliesLocked);
                  const participantsCount =
                    typeof comment.replyParticipantsCount === "number" ? comment.replyParticipantsCount : 0;
                  const threadFull = participantsCount >= MAX_REPLY_PARTICIPANTS;
                  return (
                    <div
                      key={comment.id}
                      className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                        <span className="text-[color:var(--warning)]">{renderStars(comment.rating)}</span>
                        <span>{formatCreatorCommentDate(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[color:var(--text)] line-clamp-3">{comment.text}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[color:var(--muted)]">
                          <span>{comment.fanDisplayNameMasked}</span>
                          {comment.verified && (
                            <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                              Comprador verificado
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleHelpful(comment.id)}
                          disabled={helpfulDisabled}
                          title={helpfulTitle}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                            comment.viewerHasVoted
                              ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                              : "border-[color:var(--surface-border)] text-[color:var(--muted)]"
                          } ${helpfulDisabledClass}`}
                          aria-label={helpfulTitle}
                        >
                          <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                          <span>Útil</span>
                          <span className="tabular-nums">
                            {typeof comment.helpfulCount === "number" ? comment.helpfulCount : 0}
                          </span>
                        </button>
                      </div>
                      {previewReplies.length > 0 && (
                        <div className="space-y-2">
                          {previewReplies.map((reply) => (
                            <div
                              key={reply.id}
                              className="ml-8 rounded-xl border border-[color:var(--surface-border)] border-l-2 border-l-[color:rgba(var(--brand-rgb),0.35)] bg-[color:var(--surface-2)] px-3 py-2 text-[13px] text-[color:var(--text)] space-y-2"
                            >
                              <div className="flex flex-col gap-1 text-[10px] text-[color:var(--muted)] sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[11px] font-semibold text-[color:var(--text)]">
                                    {getInitial(reply.authorDisplayName)}
                                  </span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-semibold text-[color:var(--text)]">
                                      {reply.authorDisplayName}
                                    </span>
                                    <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                                      {reply.authorRole === "CREATOR" ? "Creador" : "Comprador verificado"}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] text-[color:var(--muted)]">
                                  {formatCreatorCommentDate(reply.createdAt)}
                                </span>
                              </div>
                              <p className="whitespace-pre-line line-clamp-2">{reply.body}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {(repliesLocked || threadFull) && (
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                          {repliesLocked && (
                            <span className="rounded-full border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                              Hilo cerrado
                            </span>
                          )}
                          {threadFull && (
                            <span className="rounded-full border border-[color:rgba(245,158,11,0.5)] bg-[color:rgba(245,158,11,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                              Hilo completo
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {canComment ? (
              <button
                type="button"
                onClick={() => setCommentSheetOpen(true)}
                className="inline-flex items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)] w-full sm:w-auto"
              >
                Escribir comentario
              </button>
            ) : !isCreatorViewer ? (
              <p className="text-xs text-[color:var(--muted)]">Solo compradores verificados pueden comentar.</p>
            ) : null}
          </section>
        </main>
        {highlightModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setHighlightModalOpen(false)}>
            <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Ver ${activeHighlightLabel}`}
                onClick={(event) => event.stopPropagation()}
                className="flex w-full sm:w-[720px] max-h-[85vh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
              >
                <div className="flex-1 overflow-y-auto">
                  <div className="sticky top-0 z-10 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pt-3 pb-3 sm:px-5 sm:pt-5 sm:pb-4">
                    <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                    <div className="flex items-start justify-between gap-3 pt-3 sm:pt-0">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[color:var(--text)]">
                          {activeHighlightLabel}{" "}
                          <span className="text-[color:var(--muted)]">({highlightModalCount})</span>
                        </p>
                        <p className="text-xs text-[color:var(--muted)]">Contenido destacado del creador.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHighlightModalOpen(false)}
                        aria-label="Cerrar"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                      >
                        X
                      </button>
                    </div>
                  </div>
                  <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                    {activeHighlight === "popclips" && popClipsError && (
                      <div className="mb-3 text-xs text-[color:var(--danger)]">{popClipsError}</div>
                    )}
                    {highlightModalLoading ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <Skeleton key={`highlight-modal-skeleton-${idx}`} className="h-[180px] w-full rounded-2xl" />
                        ))}
                      </div>
                    ) : activeHighlightAll.length === 0 ? (
                      <p className="text-xs text-[color:var(--muted)]">{highlightEmptyCopyByTab[activeHighlight]}</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {activeHighlightAll.map((item) => renderHighlightCard(item, true))}
                      </div>
                    )}
                    {showHighlightLoadMore && (
                      <button
                        type="button"
                        onClick={handleLoadMorePopClips}
                        disabled={popClipsLoadingMore}
                        className="mt-4 w-full rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                      >
                        {popClipsLoadingMore ? "Cargando..." : "Cargar más"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {statusSheetOpen && isCreatorViewer && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={handleCloseStatusSheet}>
            <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Editar estado del creador"
                onClick={(event) => event.stopPropagation()}
                className="flex w-full sm:w-[520px] max-h-[85vh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
              >
                <div className="flex-1 overflow-y-auto">
                  <div className="sticky top-0 z-10 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pt-3 pb-3 sm:px-5 sm:pt-5 sm:pb-4">
                    <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                    <div className="flex items-start justify-between gap-3 pt-3 sm:pt-0">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[color:var(--text)]">Estado del creador</p>
                        <p className="text-xs text-[color:var(--muted)]">
                          Configura tu disponibilidad y tiempo de respuesta.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseStatusSheet}
                        aria-label="Cerrar"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                      >
                        X
                      </button>
                    </div>
                  </div>
                  <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5 space-y-4">
                    {statusError && <div className="text-xs text-[color:var(--danger)]">{statusError}</div>}
                    <label className="flex flex-col gap-2 text-xs font-semibold text-[color:var(--muted)]">
                      Disponibilidad
                      <select
                        value={statusDraftAvailability}
                        onChange={(event) => setStatusDraftAvailability(event.target.value as CreatorAvailability)}
                        disabled={statusSaving}
                        className="h-9 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-[12px] font-semibold text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                      >
                        {CREATOR_AVAILABILITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold text-[color:var(--muted)]">
                      Tiempo de respuesta
                      <select
                        value={statusDraftSla}
                        onChange={(event) => setStatusDraftSla(event.target.value as CreatorResponseSla)}
                        disabled={statusSaving}
                        className="h-9 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-[12px] font-semibold text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                      >
                        {CREATOR_SLA_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-[color:var(--muted)]">Ubicación</p>
                          <p className="text-xs text-[color:var(--text)]">{locationSummaryText}</p>
                          <p className="text-[11px] text-[color:var(--muted)]">Zona aproximada por privacidad.</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={handleOpenLocationDialog}
                            disabled={locationLoading || locationSaving}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-3)] disabled:opacity-60"
                          >
                            {locationLoading ? "Cargando..." : "Editar ubicación"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleClearLocation()}
                            disabled={locationLoading || locationSaving || !locationHasCoords}
                            className="inline-flex h-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 text-[10px] font-semibold text-[color:var(--muted)] hover:bg-[color:var(--surface-3)] disabled:opacity-60"
                          >
                            Quitar ubicación
                          </button>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-[color:var(--text)]">
                        <input
                          type="checkbox"
                          checked={locationEnabled}
                          onChange={(event) => handleToggleLocationEnabled(event.target.checked)}
                          disabled={locationLoading || locationSaving || !locationHasCoords}
                        />
                        Mostrar en Discovery
                      </label>
                      {!locationHasCoords && !locationLoading ? (
                        <p className="text-[11px] text-[color:var(--muted)]">
                          Añade una ubicación para activarlo.
                        </p>
                      ) : null}
                      {locationError ? (
                        <p className="text-[11px] text-[color:var(--danger)]">{locationError}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCloseStatusSheet}
                        disabled={statusSaving}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] px-4 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCreatorStatus}
                        disabled={statusSaving}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.14)] px-4 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.2)] disabled:opacity-60"
                      >
                        {statusSaving ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <LocationPickerDialog
          open={locationDialogOpen}
          onClose={handleCloseLocationDialog}
          value={locationDraft}
          radiusKm={locationRadiusKm}
          onChange={(next) =>
            setLocationDraft({
              lat: typeof next.lat === "number" && Number.isFinite(next.lat) ? next.lat : null,
              lng: typeof next.lng === "number" && Number.isFinite(next.lng) ? next.lng : null,
              label: (next.label || "").trim(),
              placeId: typeof next.placeId === "string" ? next.placeId : null,
            })
          }
          onRadiusChange={(nextKm) => setLocationRadiusKm(nextKm)}
          minRadiusKm={1}
          maxRadiusKm={25}
          stepKm={1}
          primaryActionLabel={locationSaving ? "Guardando..." : "Guardar ubicación"}
          onPrimaryAction={handleSaveLocation}
          primaryActionDisabled={locationSaving}
          errorMessage={locationError}
        />
        {activePopclip && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={handleClosePopclipViewer}>
            <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Ver PopClip"
                onClick={(event) => event.stopPropagation()}
                onWheel={handlePopclipWheel}
                onTouchStart={handlePopclipTouchStart}
                onTouchMove={handlePopclipTouchMove}
                onTouchEnd={handlePopclipTouchEnd}
                className="flex w-full sm:w-[720px] max-h-[85vh] flex-col overflow-hidden overscroll-contain rounded-t-2xl sm:rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
              >
                <div className="sticky top-0 z-10 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pt-3 pb-3 sm:px-5 sm:pt-5 sm:pb-4">
                  <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                  <div className="flex items-start justify-between gap-3 pt-3 sm:pt-0 group">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{activePopclipTitle}</p>
                      {activePopclipPackTitle && (
                        <p className="text-xs text-[color:var(--muted)]">Pack: {activePopclipPackTitle}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePopclipNavigate("prev")}
                        disabled={!hasPrevPopclip}
                        aria-label="PopClip anterior"
                        title="Anterior"
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:transition-opacity ${
                          hasPrevPopclip
                            ? "border-[color:var(--surface-border)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                            : "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                        }`}
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePopclipNavigate("next")}
                        disabled={!hasNextPopclip}
                        aria-label="PopClip siguiente"
                        title="Siguiente"
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:transition-opacity ${
                          hasNextPopclip
                            ? "border-[color:var(--surface-border)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                            : "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                        }`}
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={handleClosePopclipViewer}
                        aria-label="Cerrar"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                      >
                        X
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-5 sm:pb-5 space-y-4">
                  <div className="mx-auto w-full max-w-sm sm:max-w-md">
                    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
                      <video
                        ref={popclipVideoRef}
                        src={activePopclip.videoUrl}
                        poster={activePopclip.posterUrl ? normalizeImageSrc(activePopclip.posterUrl) : undefined}
                        controls
                        playsInline
                        autoPlay
                        muted
                        loop={!activePopclip.durationSec}
                        preload="metadata"
                        onTimeUpdate={handlePopclipTimeUpdate}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--muted)]">
                    {activePopclipPriceLabel && <span>{activePopclipPriceLabel}</span>}
                    {activePopclipPackRoute ? (
                      <button
                        type="button"
                        onClick={() => {
                          handleClosePopclipViewer();
                          void router.push(activePopclipPackRoute);
                        }}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.5)] px-3 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.12)]"
                      >
                        Ver pack
                      </button>
                    ) : (
                      <a
                        href={activePopclipChatHref}
                        onClick={(event) => {
                          handleClosePopclipViewer();
                          handleOpenChat(event);
                        }}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] px-3 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Entrar al chat
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {commentSheetOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setCommentSheetOpen(false)}>
            <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Escribir comentario"
                onClick={(event) => event.stopPropagation()}
                className="w-full sm:w-[520px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
              >
                <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-5 sm:pb-5 space-y-4">
                  <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[color:var(--text)]">Escribir comentario</p>
                      <p className="text-xs text-[color:var(--muted)]">Tu opinión se mostrará en el perfil.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCommentSheetOpen(false)}
                      aria-label="Cerrar"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                    >
                      X
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {Array.from({ length: 5 }).map((_, idx) => {
                      const value = idx + 1;
                      const active = value <= commentRating;
                      return (
                        <button
                          key={`rating-${value}`}
                          type="button"
                          onClick={() => setCommentRating(value)}
                          aria-label={`Puntuación ${value}`}
                          aria-pressed={active}
                          className={`text-lg ${active ? "text-[color:var(--warning)]" : "text-[color:var(--muted)]"} hover:text-[color:var(--warning)]`}
                        >
                          ★
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    <textarea
                      className="min-h-[120px] w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                      placeholder="Escribe tu comentario..."
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      maxLength={CREATOR_COMMENT_MAX_LENGTH}
                    />
                    <div className="flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                      <span>Máx. {CREATOR_COMMENT_MAX_LENGTH} caracteres</span>
                      <span>{commentText.length}/{CREATOR_COMMENT_MAX_LENGTH}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmitCreatorComment}
                    disabled={commentSending || !commentText.trim()}
                    className="h-11 w-full rounded-xl bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)] disabled:opacity-60"
                  >
                    {commentSending ? "Enviando..." : "Enviar comentario"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const prisma = (await import("../../lib/prisma.server")).default;
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle.trim() : "";
  const locale = resolveLocale(ctx.req?.headers["accept-language"]);
  if (!handleParam) {
    return { notFound: true };
  }
  const normalizedHandle = handleParam.toLowerCase();
  const match = await prisma.creator.findUnique({ where: { handle: normalizedHandle } });

  const previewHandle = readPreviewHandle(ctx.req?.headers?.cookie);
  const creatorHandle = match?.handle || slugify(match?.name);
  const previewAllowed = Boolean(match && previewHandle && creatorHandle === previewHandle);
  const profile = match ? await prisma.creatorProfile.findUnique({ where: { creatorId: match.id } }) : null;
  const visibilityMode = resolveVisibilityMode(profile?.visibilityMode);
  const showPreviewBanner = Boolean(match && previewAllowed && visibilityMode === "INVISIBLE");

  if (!match) {
    return { props: { notFound: true } };
  }

  if (!previewAllowed && visibilityMode === "INVISIBLE") {
    console.info("Public profile hidden", { handle: handleParam, mode: visibilityMode });
    return { props: { notFound: true } };
  }

  const utmSource = typeof ctx.query.utm_source === "string" ? ctx.query.utm_source : undefined;
  const utmMedium = typeof ctx.query.utm_medium === "string" ? ctx.query.utm_medium : undefined;
  const utmCampaign = typeof ctx.query.utm_campaign === "string" ? ctx.query.utm_campaign : undefined;
  const utmContent = typeof ctx.query.utm_content === "string" ? ctx.query.utm_content : undefined;
  const utmTerm = typeof ctx.query.utm_term === "string" ? ctx.query.utm_term : undefined;
  const referrer = (ctx.req?.headers?.referer as string | undefined) || (ctx.req?.headers?.referrer as string | undefined);

  try {
    ensureAnalyticsCookie(
      ctx.req as any,
      ctx.res as any,
      {
        sessionId: randomUUID(),
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        referrer,
      }
    );
  } catch (_err) {
    // ignore cookie errors
  }

  let catalogItems: PublicCatalogItem[] = [];
  let catalogError: string | null = null;
  try {
    catalogItems = await getPublicCatalogItems(match.id);
  } catch (err) {
    console.error("Error loading public catalog", err);
    catalogError = "No se pudo cargar el catálogo.";
  }

  let stats: PublicProfileStats | undefined;
  try {
    stats = await getPublicProfileStats(match.id);
  } catch (err) {
    console.error("Error loading public stats", err);
  }

  let followerCount = 0;
  let isFollowing = false;
  try {
    followerCount = await prisma.fan.count({ where: { creatorId: match.id, isArchived: false } });
  } catch (err) {
    console.error("Error loading follower count", err);
  }

  try {
    const { readFanId } = await import("../../lib/fan/session");
    const fanIdFromCookie = readFanId({ headers: ctx.req.headers } as any, creatorHandle);
    if (fanIdFromCookie) {
      const viewerFan = await prisma.fan.findFirst({
        where: { id: fanIdFromCookie, creatorId: match.id, isArchived: false },
        select: { id: true },
      });
      isFollowing = Boolean(viewerFan?.id);
    }
  } catch (err) {
    console.error("Error resolving follower state", err);
  }

  const avatarUrl = normalizeImageSrc(match.bioLinkAvatarUrl || "");
  const trustLine = match.bioLinkTagline ?? match.subtitle ?? "";
  const bio = match.bioLinkDescription ?? match.description ?? "";
  const websiteUrl = profile?.websiteUrl ?? null;
  const profilePayload = {
    creatorId: match.id,
    creatorName: match.name || "Creador",
    creatorHandle,
    avatarUrl,
    bio,
    subtitle: trustLine,
    websiteUrl,
  };
  const contentPayload = {
    catalogItems,
    stats,
  };

  return {
    props: {
      ...profilePayload,
      ...contentPayload,
      isCreatorViewer: previewAllowed,
      followerCount,
      isFollowing,
      location: mapLocation(profile),
      catalogError,
      responseSla: profile?.responseSla ?? null,
      availability: profile?.availability ?? null,
      showPreviewBanner,
      locale,
    },
  };
};

function resolveCatalogKind(item: PublicCatalogItem): CatalogHighlightKind {
  if (item.type === "EXTRA") return "extra";
  if (item.type === "PACK") {
    const title = (item.title || "").toLowerCase();
    if (title.includes("suscrip") || title.includes("subscription") || title.includes("mensual") || title.includes("monthly")) {
      return "sub";
    }
  }
  return "pack";
}

function mapLocation(profile: any): CreatorLocation | null {
  if (!profile || profile.locationVisibility === "OFF") return null;
  const enabled =
    typeof profile.locationEnabled === "boolean"
      ? profile.locationEnabled
      : Boolean(profile.allowDiscoveryUseLocation);
  const lat =
    typeof profile.locationLat === "number" && Number.isFinite(profile.locationLat)
      ? profile.locationLat
      : null;
  const lng =
    typeof profile.locationLng === "number" && Number.isFinite(profile.locationLng)
      ? profile.locationLng
      : null;
  const precisionKm = profile.locationPrecisionKm ?? profile.locationRadiusKm ?? null;
  return {
    visibility: profile.locationVisibility,
    label: profile.locationLabel ?? null,
    placeId: profile.locationPlaceId ?? null,
    geohash: profile.locationGeohash ?? null,
    radiusKm: profile.locationRadiusKm ?? null,
    allowDiscoveryUseLocation: Boolean(profile.allowDiscoveryUseLocation),
    enabled,
    lat,
    lng,
    precisionKm,
  };
}

function resolveVisibilityMode(value: unknown): "INVISIBLE" | "SOLO_LINK" | "DISCOVERABLE" | "PUBLIC" {
  if (value === "INVISIBLE") return "INVISIBLE";
  if (value === "DISCOVERABLE") return "DISCOVERABLE";
  if (value === "PUBLIC") return "PUBLIC";
  return "SOLO_LINK";
}

function formatResponseSla(value?: string | null) {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "Responde al momento";
  if (normalized === "LT_24H") return "Responde en <24h";
  if (normalized === "LT_72H") return "Responde en <72h";
  if (normalized === "LT_1H") return "Responde en <1h";
  if (normalized === "LT_48H") return "Responde en <48h";
  return null;
}

function formatAvailability(value?: string | null) {
  const normalized = (value || "").toUpperCase();
  if (normalized === "AVAILABLE") return "Disponible";
  if (normalized === "NOT_AVAILABLE") return "No disponible";
  if (normalized === "VIP_ONLY") return "Solo VIP";
  if (normalized === "ONLINE") return "Disponible";
  if (normalized === "AWAY") return "Ausente";
  if (normalized === "DND") return "No molestar";
  if (normalized === "OFFLINE") return "No disponible";
  return null;
}

function normalizeWebsiteUrl(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function formatWebsiteLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

function renderStars(rating: number) {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  return "★★★★★".slice(0, safe) + "☆☆☆☆☆".slice(0, 5 - safe);
}

function getInitial(name?: string | null) {
  const trimmed = (name || "").trim();
  return (trimmed[0] || "C").toUpperCase();
}

function formatPriceCents(cents?: number, currency = "EUR") {
  if (!Number.isFinite(cents)) return "";
  const amount = (cents as number) / 100;
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function buildPackDraft(kind: "pack" | "sub" | "extra", title: string, priceLabel: string) {
  const typeLabel = kind === "sub" ? "suscripción" : kind === "extra" ? "extra" : "pack";
  const suffix = priceLabel ? ` (${priceLabel})` : "";
  return `Quiero el ${typeLabel} "${title}"${suffix}. ¿Me lo activas?`;
}

function buildPopclipDraft(title: string, packTitle: string) {
  const packLine = packTitle ? ` del pack "${packTitle}"` : "";
  return `Quiero ver el PopClip "${title}"${packLine}.`;
}

function formatCreatorCommentDate(value: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function resolvePreviewReplies(
  comment: PublicCreatorComment,
  creatorName?: string | null
): PublicCommentReply[] {
  if (Array.isArray(comment.replies) && comment.replies.length > 0) {
    return comment.replies;
  }
  const legacyBody = comment.replyText?.trim();
  if (!legacyBody) return [];
  return [
    {
      id: `legacy-${comment.id}`,
      body: legacyBody,
      createdAt: comment.repliedAt || comment.createdAt,
      authorRole: "CREATOR",
      authorDisplayName: creatorName || "Creador",
    },
  ];
}

function readUtmMeta() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search || "");
  const utmSource = params.get("utm_source") || "";
  const utmMedium = params.get("utm_medium") || "";
  const utmCampaign = params.get("utm_campaign") || "";
  const utmContent = params.get("utm_content") || "";
  const utmTerm = params.get("utm_term") || "";
  return {
    ...(utmSource ? { utm_source: utmSource } : {}),
    ...(utmMedium ? { utm_medium: utmMedium } : {}),
    ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
    ...(utmContent ? { utm_content: utmContent } : {}),
    ...(utmTerm ? { utm_term: utmTerm } : {}),
  };
}

function appendSearchIfRelative(url: string, search: string) {
  if (!search) return url;
  if (!url.startsWith("/")) return url;
  if (url.includes("?")) return `${url}&${search.replace(/^\?/, "")}`;
  return `${url}${search}`;
}

function appendReturnTo(url: string, returnTo: string) {
  if (!url.startsWith("/")) return url;
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return url;
  if (url.includes("returnTo=")) return url;
  const encoded = encodeURIComponent(returnTo);
  return `${url}${url.includes("?") ? "&" : "?"}returnTo=${encoded}`;
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function resolveLocale(headerValue: string | string[] | undefined): Locale {
  const raw = Array.isArray(headerValue) ? headerValue.join(",") : headerValue || "";
  return raw.toLowerCase().includes("en") ? "en" : "es";
}

function logPublicFetchFailure(endpoint: string, status?: number | null, error?: unknown) {
  if (!IS_DEV) return;
  const message = error instanceof Error ? error.message : error ? String(error) : "";
  console.warn("[public] fetch failed", {
    endpoint,
    status: status ?? null,
    error: message || undefined,
  });
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const entries = cookieHeader.split(";").map((part) => part.trim().split("="));
  for (const [rawKey, ...rest] of entries) {
    if (!rawKey) continue;
    const key = decodeURIComponent(rawKey);
    if (key !== "novsy_creator_preview") continue;
    return slugify(decodeURIComponent(rest.join("=")));
  }
  return "";
}

async function getPublicCatalogItems(creatorId: string): Promise<PublicCatalogItem[]> {
  const prisma = (await import("../../lib/prisma.server")).default;
  const items = (await (prisma.catalogItem as any).findMany({
    where: { creatorId, isActive: true, isPublic: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  })) as CatalogItemRow[];
  const extrasById = new Map(
    items
      .filter((item) => item.type === "EXTRA")
      .map((item) => [item.id, item.title] as const)
  );
  return items.map((item) => {
    const includesRaw = Array.isArray(item.includes) ? item.includes : [];
    const includes =
      item.type === "BUNDLE"
        ? includesRaw
            .map((id) => extrasById.get(String(id)))
            .filter((title): title is string => Boolean(title))
        : [];
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      priceCents: item.priceCents,
      currency: item.currency,
      includes,
      isActive: item.isActive,
    };
  });
}
