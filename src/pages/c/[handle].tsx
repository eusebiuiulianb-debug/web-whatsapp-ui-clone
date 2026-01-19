import Head from "next/head";
import type { GetServerSideProps } from "next";
import { randomUUID } from "crypto";
import { useEffect, useMemo, useState } from "react";
import { PublicHero } from "../../components/public-profile/PublicHero";
import { PublicCatalogGrid } from "../../components/public-profile/PublicCatalogGrid";
import { PublicCatalogCard, type PublicCatalogCardItem } from "../../components/public-profile/PublicCatalogCard";
import { PublicProfileStatsRow } from "../../components/public-profile/PublicProfileStatsRow";
import type { PublicCatalogItem, PublicPopClip, PublicProfileStats } from "../../types/publicProfile";
import type { CreatorLocation } from "../../types/creatorLocation";
import { ensureAnalyticsCookie } from "../../lib/analyticsCookie";
import { track } from "../../lib/analyticsClient";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { getPublicProfileStats } from "../../lib/publicProfileStats";

type Props = {
  notFound?: boolean;
  creatorId?: string;
  creatorName?: string;
  bio?: string;
  subtitle?: string;
  avatarUrl?: string | null;
  creatorHandle?: string;
  stats?: PublicProfileStats;
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
  { id: "popclip", label: "PopClips" },
];

export default function PublicCreatorByHandle({
  notFound,
  creatorId,
  creatorName,
  bio,
  subtitle,
  avatarUrl,
  creatorHandle,
  stats,
  location,
  catalogItems,
  catalogError,
}: Props) {
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

  const baseChatHref = `/go/${creatorHandle}`;
  const [searchParams, setSearchParams] = useState("");
  const [popClips, setPopClips] = useState<PublicPopClip[]>([]);
  const [popClipsLoading, setPopClipsLoading] = useState(false);
  const [popClipsError, setPopClipsError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSearchParams(window.location.search || "");
  }, []);

  useEffect(() => {
    if (!creatorHandle) return;
    const controller = new AbortController();
    setPopClipsLoading(true);
    setPopClipsError("");
    fetch(`/api/public/popclips?handle=${encodeURIComponent(creatorHandle)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json()) as { clips?: PublicPopClip[] };
        setPopClips(Array.isArray(payload?.clips) ? payload.clips : []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPopClipsError("No se pudieron cargar los PopClips.");
        setPopClips([]);
      })
      .finally(() => setPopClipsLoading(false));
    return () => controller.abort();
  }, [creatorHandle]);

  const chatHref = appendSearchIfRelative(baseChatHref, searchParams);
  const followDraft = "Quiero seguirte gratis.";
  const followHref = appendSearchIfRelative(`${baseChatHref}?draft=${encodeURIComponent(followDraft)}`, searchParams);

  useEffect(() => {
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

  const salesCount = stats?.salesCount ?? 0;
  const ratingsCount = stats?.ratingsCount ?? 0;
  const topEligible = salesCount >= 10 || ratingsCount >= 10;
  const tagline = (bio || "").trim();
  const trustLine = (subtitle || "Responde en menos de 24h").trim();
  const showLoading = !catalogItems && !catalogError;
  const featuredItems = items.slice(0, 3);
  const featuredIds = featuredItems.map((item) => item.id);
  const popclipItems = popClips.map((clip) => ({
    id: clip.id,
    kind: "popclip",
    title: clip.title?.trim() || clip.pack.title,
    priceCents: clip.pack.priceCents,
    currency: clip.pack.currency,
    thumbUrl: clip.posterUrl || null,
    likeCount: clip.likeCount ?? 0,
    commentCount: clip.commentCount ?? 0,
    liked: clip.liked ?? false,
  }));

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
            secondaryCtaLabel="Seguir gratis"
            secondaryHref={followHref}
          />
          <PublicProfileStatsRow
            salesCount={salesCount}
            ratingsCount={ratingsCount}
          />

          {featuredItems.length > 0 && (
            <section className="space-y-3 min-w-0">
              <div className="flex items-center justify-between min-w-0">
                <h2 className="text-base font-semibold text-[color:var(--text)]">Destacados</h2>
                <span className="text-xs text-[color:var(--muted)]">Máximo 3</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:snap-none">
                {featuredItems.map((item) => (
                  <div key={item.id} className="snap-start shrink-0 w-[72%] max-w-[260px] sm:w-auto sm:max-w-none">
                    <div className="block min-w-0">
                      <PublicCatalogCard item={item} variant="featured" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 min-w-0">
            <h2 className="text-base font-semibold text-[color:var(--text)]">Catálogo</h2>
          <PublicCatalogGrid
            items={items}
            featuredIds={featuredIds}
            chatHref={chatHref}
            isLoading={showLoading}
            error={catalogError}
            filters={CATALOG_FILTERS}
            popclipItems={popclipItems}
            popclipLoading={popClipsLoading}
            popclipError={popClipsError || undefined}
          />
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

  if (!match || match.bioLinkEnabled === false) {
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

  const profile = await prisma.creatorProfile.findUnique({ where: { creatorId: match.id } });

  const avatarUrl = normalizeImageSrc(match.bioLinkAvatarUrl || "");
  const creatorHandle = slugify(match.name);
  const trustLine = match.bioLinkTagline ?? match.subtitle ?? "";
  const bio = match.bioLinkDescription ?? match.description ?? "";

  return {
    props: {
      creatorId: match.id,
      creatorName: match.name || "Creador",
      bio,
      subtitle: trustLine,
      avatarUrl,
      creatorHandle,
      stats,
      location: mapLocation(profile),
      catalogItems,
      catalogError,
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

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
