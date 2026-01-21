import Head from "next/head";
import type { GetServerSideProps } from "next";
import { randomUUID } from "crypto";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/router";
import { Bell, BellRing, ThumbsUp } from "lucide-react";
import { PublicHero } from "../../components/public-profile/PublicHero";
import { PublicCatalogGrid } from "../../components/public-profile/PublicCatalogGrid";
import { type PublicCatalogCardItem } from "../../components/public-profile/PublicCatalogCard";
import { PublicProfileStatsRow } from "../../components/public-profile/PublicProfileStatsRow";
import { PublicStoriesRow } from "../../components/public-profile/PublicStoriesRow";
import { Skeleton } from "../../components/ui/Skeleton";
import type { PublicCatalogItem, PublicCreatorComment, PublicPopClip, PublicProfileStats } from "../../types/publicProfile";
import type { CreatorLocation } from "../../types/creatorLocation";
import { ensureAnalyticsCookie } from "../../lib/analyticsCookie";
import { track } from "../../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
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
  stats?: PublicProfileStats;
  followerCount?: number;
  isFollowing?: boolean;
  location?: CreatorLocation | null;
  catalogItems?: PublicCatalogItem[];
  catalogError?: string | null;
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

type CatalogFilter = "all" | "pack" | "sub" | "extra" | "popclip";

const CATALOG_FILTERS: Array<{ id: CatalogFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "pack", label: "Packs" },
  { id: "sub", label: "Suscripciones" },
  { id: "extra", label: "Extras" },
];

const POPCLIP_FILTERS: Array<{ id: CatalogFilter; label: string }> = [
  { id: "popclip", label: "PopClips" },
];

const POPCLIP_PAGE_SIZE = 12;
const POPCLIP_STORY_MAX = 8;
const CREATOR_COMMENT_PREVIEW = 3;
const CREATOR_COMMENT_MAX_LENGTH = 600;
const IS_DEV = process.env.NODE_ENV === "development";

export default function PublicCreatorByHandle({
  notFound,
  showPreviewBanner,
  creatorId,
  creatorName,
  bio,
  websiteUrl,
  subtitle,
  avatarUrl,
  creatorHandle,
  stats,
  followerCount,
  isFollowing,
  location,
  catalogItems,
  catalogError,
}: Props) {
  const router = useRouter();
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
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState("");
  const [requestedPopclipId, setRequestedPopclipId] = useState<string | null>(null);
  const [requestedPopclipItem, setRequestedPopclipItem] = useState<PublicCatalogCardItem | null>(null);
  const [creatorComments, setCreatorComments] = useState<PublicCreatorComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [commentsTotalCount, setCommentsTotalCount] = useState<number | null>(null);
  const [commentsAvgRating, setCommentsAvgRating] = useState<number | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [viewerComment, setViewerComment] = useState<{ rating: number; text: string } | null>(null);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentRating, setCommentRating] = useState(5);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [helpfulPending, setHelpfulPending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [isFollowingState, setIsFollowingState] = useState(Boolean(isFollowing));
  const [followersCount, setFollowersCount] = useState(
    typeof followerCount === "number" && Number.isFinite(followerCount) ? followerCount : 0
  );

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
    if (!creatorHandle) return;
    const controller = new AbortController();
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}&limit=${POPCLIP_PAGE_SIZE}`;
    let responseStatus: number | null = null;
    setPopClipsLoading(true);
    setStoryLoading(true);
    setPopClipsLoadingMore(false);
    setPopClipsError("");
    setStoryError("");
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
        setStoryError("No se pudieron cargar las historias.");
        setStoryClips([]);
        setPopclipsSectionCount(0);
      })
      .finally(() => {
        setPopClipsLoading(false);
        setStoryLoading(false);
      });
    return () => controller.abort();
  }, [creatorHandle]);

  useEffect(() => {
    if (!creatorHandle) return;
    const controller = new AbortController();
    const endpoint = `/api/public/creator/${encodeURIComponent(creatorHandle)}/comments?limit=${CREATOR_COMMENT_PREVIEW}`;
    let responseStatus: number | null = null;
    setCommentsLoading(true);
    setCommentsError("");
    setCommentsAvgRating(null);
    setHelpfulPending({});
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
        setCanComment(Boolean(payload?.canComment));
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

  const items = useMemo<PublicCatalogCardItem[]>(() => {
    const source = catalogItems ?? [];
    return source
      .filter((item) => item.isActive !== false)
      .map((item, index) => ({
        id: item.id || `${item.type}-${index}`,
        kind: resolveCatalogKind(item),
        title: item.title,
        priceCents: item.priceCents,
        currency: item.currency,
        thumbUrl: null,
      }));
  }, [catalogItems]);

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
  const trustLine = (subtitle || "Responde en menos de 24h").trim();
  const bioText = (bio || "").trim();
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const bioRef = useRef<HTMLParagraphElement | null>(null);
  const [bioHasOverflow, setBioHasOverflow] = useState(false);
  const resolvedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
  const websiteLabel = resolvedWebsiteUrl ? formatWebsiteLabel(resolvedWebsiteUrl) : "";
  const showLoading = !catalogItems && !catalogError;

  useEffect(() => {
    setCommentsTotalCount((prev) => (prev === null ? commentsCount : prev));
  }, [commentsCount]);
  const mapPopclipToCard = useCallback(
    (clip: PublicPopClip): PublicCatalogCardItem => ({
      id: clip.id,
      kind: "popclip" as const,
      title: clip.title?.trim() || clip.pack.title,
      priceCents: clip.pack.priceCents,
      currency: clip.pack.currency,
      thumbUrl: clip.posterUrl || null,
      likeCount: clip.likeCount ?? 0,
      commentCount: clip.commentCount ?? 0,
      liked: clip.liked ?? false,
      canInteract: clip.canInteract ?? false,
      canComment: clip.canComment ?? false,
    }),
    []
  );
  const popclipItems = popClips.map(mapPopclipToCard);
  const storyItems = storyClips.slice(0, POPCLIP_STORY_MAX).map((clip) => ({
    id: clip.id,
    title: clip.title?.trim() || clip.pack.title,
    thumbUrl: clip.posterUrl || null,
  }));
  const storyEmptyLabel = storyError ? "No se pudieron cargar las historias." : "Aún no hay historias";
  const popclipsHeaderCount =
    typeof popclipsSectionCount === "number" ? popclipsSectionCount : popClips.length;
  const hasStories = storyItems.length > 0;
  const hasPopclips = popclipsHeaderCount > 0;
  const showPopclipsSection =
    hasPopclips || Boolean(requestedPopclipId) || Boolean(requestedPopclipItem);
  const commentsHeaderCount =
    typeof commentsTotalCount === "number" ? commentsTotalCount : commentsCount;
  const commentsAverage =
    typeof commentsAvgRating === "number" && commentsAvgRating > 0 ? commentsAvgRating : null;
  const commentsHref = creatorHandle ? `/c/${creatorHandle}/comments` : "/c/creator/comments";

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2200);
  };

  const scrollToPopclips = (targetId?: string) => {
    if (typeof document === "undefined") return;
    const target = targetId ? document.getElementById(`popclip-${targetId}`) : null;
    const fallback = document.getElementById("popclips");
    (target || fallback)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const popclipId = typeof router.query.popclip === "string" ? router.query.popclip : "";
    if (!popclipId || !creatorHandle) return;
    const existingClip = popClips.find((clip) => clip.id === popclipId) || storyClips.find((clip) => clip.id === popclipId);
    if (existingClip) {
      setRequestedPopclipItem(mapPopclipToCard(existingClip));
      setRequestedPopclipId(popclipId);
      scrollToPopclips(popclipId);
      return;
    }
    const controller = new AbortController();
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}&id=${encodeURIComponent(popclipId)}`;
    let responseStatus: number | null = null;
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json()) as {
          clips?: PublicPopClip[];
          popclips?: PublicPopClip[];
          stories?: PublicPopClip[];
        };
        const clips = Array.isArray(payload?.clips)
          ? payload.clips
          : Array.isArray(payload?.popclips)
          ? payload.popclips
          : Array.isArray(payload?.stories)
          ? payload.stories
          : [];
        const clip = clips[0] ?? null;
        if (!clip) return;
        if (clip.isStory) {
          setStoryClips((prev) => {
            if (prev.some((item) => item.id === clip.id)) return prev;
            return [clip, ...prev].slice(0, POPCLIP_STORY_MAX);
          });
        } else {
          setPopClips((prev) => {
            if (prev.some((item) => item.id === clip.id)) return prev;
            return [clip, ...prev];
          });
        }
        setRequestedPopclipId(popclipId);
        setRequestedPopclipItem(mapPopclipToCard(clip));
        scrollToPopclips(popclipId);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logPublicFetchFailure(endpoint, responseStatus, err);
      });
    return () => controller.abort();
  }, [creatorHandle, mapPopclipToCard, popClips, router.query.popclip, storyClips]);

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
    const endpoint = `/api/public/creator/${encodeURIComponent(creatorHandle)}/comments`;
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
          showToast("Solo seguidores o clientes pueden comentar.");
          return;
        }
        throw new Error("request failed");
      }
      if (data.ok === false) {
        if (data.error === "NOT_ELIGIBLE" || data.error === "AUTH_REQUIRED") {
          showToast("Solo seguidores o clientes pueden comentar.");
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
    if (!creatorHandle || !canComment || helpfulPending[commentId]) return;
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
        if (res.status === 401 || res.status === 403) {
          showToast("Solo seguidores o clientes pueden marcar útil.");
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

  if (notFound || !creatorName || !creatorHandle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-0)] text-[color:var(--muted)] px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Perfil no disponible</h1>
          <p className="text-sm text-[color:var(--muted)]">El creador aún no ha activado su perfil público.</p>
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
            trustLine={trustLine}
            topEligible={topEligible}
            location={location}
            chips={[]}
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

          {hasStories && (
            <PublicStoriesRow
              items={storyItems}
              isLoading={storyLoading}
              emptyLabel={storyEmptyLabel}
              onSelect={(id) => {
                const storyClip = storyClips.find((clip) => clip.id === id);
                if (storyClip) {
                  setRequestedPopclipItem(mapPopclipToCard(storyClip));
                  setRequestedPopclipId(storyClip.id);
                }
                if (hasPopclips) {
                  scrollToPopclips(id);
                }
              }}
              onViewAll={() => {
                if (hasPopclips) scrollToPopclips();
              }}
            />
          )}

          <section className="space-y-3 min-w-0">
            <h2 className="text-base font-semibold text-[color:var(--text)]">Catálogo</h2>
            <PublicCatalogGrid
              items={items}
              chatHref={chatHref}
              onOpenChat={openChat}
              isLoading={showLoading}
              error={catalogError}
              filters={CATALOG_FILTERS}
            />
          </section>

          {showPopclipsSection && (
            <section id="popclips" className="space-y-3 min-w-0 scroll-mt-24">
              {hasPopclips && (
                <h2 className="text-base font-semibold text-[color:var(--text)]">PopClips ({popclipsHeaderCount})</h2>
              )}
              <PublicCatalogGrid
                items={[]}
                chatHref={chatHref}
                onOpenChat={openChat}
                filters={POPCLIP_FILTERS}
                defaultFilter="popclip"
                hideFilters
                popclipItems={popclipItems}
                popclipLoading={popClipsLoading}
                popclipError={popClipsError || undefined}
                openPopclipId={requestedPopclipId}
                openPopclipItem={requestedPopclipItem}
                onPopclipOpenHandled={() => {
                  setRequestedPopclipId(null);
                  setRequestedPopclipItem(null);
                }}
                sectionId="popclips-grid"
              />
              {hasPopclips && popClipsCursor && (
                <button
                  type="button"
                  onClick={handleLoadMorePopClips}
                  disabled={popClipsLoadingMore}
                  className="w-full rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)] disabled:opacity-60"
                >
                  {popClipsLoadingMore ? "Cargando..." : "Ver más"}
                </button>
              )}
            </section>
          )}
          {!hasPopclips && !popClipsLoading && !popClipsError && !showPopclipsSection && (
            <p className="text-xs text-[color:var(--muted)]">Aún no hay PopClips.</p>
          )}

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
                  Ver todo
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
                {creatorComments.map((comment) => (
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
                        disabled={!canComment || helpfulPending[comment.id]}
                        title={
                          canComment
                            ? "Marcar comentario como útil"
                            : "Solo seguidores o clientes pueden marcar útil."
                        }
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                          comment.viewerHasVoted
                            ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                            : "border-[color:var(--surface-border)] text-[color:var(--muted)]"
                        } ${!canComment || helpfulPending[comment.id] ? "opacity-60 cursor-not-allowed" : "hover:bg-[color:var(--surface-2)]"}`}
                        aria-label="Marcar útil"
                      >
                        <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                        <span>Útil</span>
                        <span className="tabular-nums">
                          {typeof comment.helpfulCount === "number" ? comment.helpfulCount : 0}
                        </span>
                      </button>
                    </div>
                    {comment.replyText && (
                      <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text)] space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                          Respuesta del creador
                        </div>
                        <p className="whitespace-pre-line line-clamp-2">{comment.replyText}</p>
                        {comment.repliedAt && (
                          <span className="block text-[10px] text-[color:var(--muted)]">
                            {formatCreatorCommentDate(comment.repliedAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
            ) : (
              <p className="text-xs text-[color:var(--muted)]">Solo seguidores o clientes pueden comentar.</p>
            )}
          </section>
        </main>
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
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const creators = await prisma.creator.findMany();
  const match = creators.find((c) => slugify(c.name) === handleParam) || creators[0];

  const previewHandle = readPreviewHandle(ctx.req?.headers?.cookie);
  const previewAllowed = Boolean(match && previewHandle && slugify(match.name) === previewHandle);
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

  const creatorHandle = slugify(match.name);
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

  return {
    props: {
      creatorId: match.id,
      creatorName: match.name || "Creador",
      bio,
      subtitle: trustLine,
      avatarUrl,
      creatorHandle,
      websiteUrl,
      stats,
      followerCount,
      isFollowing,
      location: mapLocation(profile),
      catalogItems,
      catalogError,
      showPreviewBanner,
    },
  };
};

function resolveCatalogKind(item: PublicCatalogItem): PublicCatalogCardItem["kind"] {
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
  return {
    visibility: profile.locationVisibility,
    label: profile.locationLabel ?? null,
    geohash: profile.locationGeohash ?? null,
    radiusKm: profile.locationRadiusKm ?? null,
    allowDiscoveryUseLocation: Boolean(profile.allowDiscoveryUseLocation),
  };
}

function resolveVisibilityMode(value: unknown): "INVISIBLE" | "SOLO_LINK" | "DISCOVERABLE" | "PUBLIC" {
  if (value === "INVISIBLE") return "INVISIBLE";
  if (value === "DISCOVERABLE") return "DISCOVERABLE";
  if (value === "PUBLIC") return "PUBLIC";
  return "SOLO_LINK";
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

function formatCreatorCommentDate(value: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
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
