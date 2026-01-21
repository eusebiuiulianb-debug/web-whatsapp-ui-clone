import Head from "next/head";
import type { GetServerSideProps } from "next";
import { randomUUID } from "crypto";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/router";
import { PublicHero } from "../../components/public-profile/PublicHero";
import { PublicCatalogGrid } from "../../components/public-profile/PublicCatalogGrid";
import { type PublicCatalogCardItem } from "../../components/public-profile/PublicCatalogCard";
import { PublicProfileStatsRow } from "../../components/public-profile/PublicProfileStatsRow";
import { PublicStoriesRow } from "../../components/public-profile/PublicStoriesRow";
import type { PublicCatalogItem, PublicPopClip, PublicProfileStats } from "../../types/publicProfile";
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
  const [storyClips, setStoryClips] = useState<PublicPopClip[]>([]);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState("");
  const [requestedPopclipId, setRequestedPopclipId] = useState<string | null>(null);
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
    if (!creatorHandle) return;
    const controller = new AbortController();
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}&limit=${POPCLIP_PAGE_SIZE}`;
    let responseStatus: number | null = null;
    setPopClipsLoading(true);
    setPopClipsLoadingMore(false);
    setPopClipsError("");
    setPopClipsCursor(null);
    setPopClips([]);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json()) as { clips?: PublicPopClip[]; nextCursor?: string | null };
        setPopClips(Array.isArray(payload?.clips) ? payload.clips : []);
        setPopClipsCursor(typeof payload?.nextCursor === "string" ? payload.nextCursor : null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logPublicFetchFailure(endpoint, responseStatus, err);
        setPopClipsError("No se pudieron cargar los PopClips.");
        setPopClips([]);
        setPopClipsCursor(null);
      })
      .finally(() => setPopClipsLoading(false));
    return () => controller.abort();
  }, [creatorHandle]);

  useEffect(() => {
    if (!creatorHandle) return;
    const controller = new AbortController();
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}&limit=${POPCLIP_STORY_MAX}&story=1`;
    let responseStatus: number | null = null;
    setStoryLoading(true);
    setStoryError("");
    setStoryClips([]);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json()) as { clips?: PublicPopClip[] };
        setStoryClips(Array.isArray(payload?.clips) ? payload.clips : []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logPublicFetchFailure(endpoint, responseStatus, err);
        setStoryError("No se pudieron cargar las historias.");
        setStoryClips([]);
      })
      .finally(() => setStoryLoading(false));
    return () => controller.abort();
  }, [creatorHandle]);

  const chatHref = appendReturnTo(appendSearchIfRelative(baseChatHref, searchParams), returnTo);
  const followDraft = "Quiero seguirte gratis.";
  const followHref = appendReturnTo(
    appendSearchIfRelative(`${baseChatHref}?draft=${encodeURIComponent(followDraft)}`, searchParams),
    returnTo
  );
  const followLabel = isFollowingState ? "Siguiendo" : "Seguir gratis";

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

  const commentsCount = stats?.commentsCount ?? 0;
  const popclipsCount = stats?.popclipsCount ?? 0;
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
  const popclipItems = popClips.map((clip) => ({
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
  }));
  const storyItems = storyClips.slice(0, POPCLIP_STORY_MAX).map((clip) => ({
    id: clip.id,
    title: clip.title?.trim() || clip.pack.title,
    thumbUrl: clip.posterUrl || null,
  }));
  const storyEmptyLabel = storyError ? "No se pudieron cargar las historias." : "Aún no hay historias";

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
    if (popClips.some((clip) => clip.id === popclipId)) {
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
        const payload = (await res.json()) as { clips?: PublicPopClip[] };
        const clip = Array.isArray(payload?.clips) ? payload.clips[0] : null;
        if (!clip) return;
        setPopClips((prev) => {
          if (prev.some((item) => item.id === clip.id)) return prev;
          return [clip, ...prev];
        });
        setRequestedPopclipId(popclipId);
        scrollToPopclips(popclipId);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logPublicFetchFailure(endpoint, responseStatus, err);
      });
    return () => controller.abort();
  }, [creatorHandle, popClips, router.query.popclip]);

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
      const payload = (await res.json()) as { clips?: PublicPopClip[]; nextCursor?: string | null };
      const newClips = Array.isArray(payload?.clips) ? payload.clips : [];
      setPopClips((prev) => {
        if (!newClips.length) return prev;
        const existing = new Set(prev.map((clip) => clip.id));
        return [...prev, ...newClips.filter((clip) => !existing.has(clip.id))];
      });
      setPopClipsCursor(typeof payload?.nextCursor === "string" ? payload.nextCursor : null);
    } catch (_err) {
      logPublicFetchFailure(endpoint, responseStatus, _err);
      showToast("No se pudieron cargar más PopClips.");
    } finally {
      setPopClipsLoadingMore(false);
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
            popclipsCount={popclipsCount}
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

          <PublicStoriesRow
            items={storyItems}
            isLoading={storyLoading}
            emptyLabel={storyEmptyLabel}
            onSelect={(id) => {
              const storyClip = storyClips.find((clip) => clip.id === id);
              if (storyClip) {
                setPopClips((prev) => {
                  if (prev.some((clip) => clip.id === id)) return prev;
                  return [storyClip, ...prev];
                });
              }
              scrollToPopclips(id);
              setRequestedPopclipId(id);
            }}
            onViewAll={() => scrollToPopclips()}
          />

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

          <section id="popclips" className="space-y-3 min-w-0 scroll-mt-24">
            <h2 className="text-base font-semibold text-[color:var(--text)]">PopClips</h2>
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
              onPopclipOpenHandled={() => setRequestedPopclipId(null)}
              sectionId="popclips-grid"
            />
            {popClipsCursor && (
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
        </main>
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
