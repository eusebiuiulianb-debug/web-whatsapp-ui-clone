import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import ChatPrivatePage from "./index";
import { useCreatorConfig } from "../context/CreatorConfigContext";
import { PublicProfileCopy, PublicProfileMode, PublicProfileStats, type PublicPopClip } from "../types/publicProfile";
import { getPublicProfileOverrides } from "../lib/publicProfileStorage";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../lib/publicProfileCopy";
import { getPublicProfileStats } from "../lib/publicProfileStats";
import { getFanIdFromQuery } from "../lib/navigation/openCreatorChat";
import { PublicHero } from "../components/public-profile/PublicHero";
import { PublicCatalogGrid } from "../components/public-profile/PublicCatalogGrid";
import { PublicCatalogCard, type PublicCatalogCardItem } from "../components/public-profile/PublicCatalogCard";
import { PublicProfileStatsRow } from "../components/public-profile/PublicProfileStatsRow";
import type { CreatorLocation } from "../types/creatorLocation";

const CREATOR_ID = "creator-1";

type Props = { stats: PublicProfileStats; fanQuery?: string | null };

type FilterId = "all" | "pack" | "sub" | "extra" | "popclip";

const CATALOG_FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "pack", label: "Packs" },
  { id: "sub", label: "Suscripciones" },
  { id: "extra", label: "Extras" },
  { id: "popclip", label: "PopClips" },
];

export default function CreatorPublicPage({ fanQuery, stats }: Props) {
  const router = useRouter();
  const profileMode: PublicProfileMode = "fanclub";
  const { config } = useCreatorConfig();
  const fanIdFromQuery = fanQuery ?? getFanIdFromQuery(router.query);

  const baseCopy = useMemo(
    () => mapToPublicProfileCopy(PROFILE_COPY[profileMode], profileMode, config),
    [profileMode, config]
  );

  const [resolvedCopy, setResolvedCopy] = useState<PublicProfileCopy>(baseCopy);
  const [searchParams, setSearchParams] = useState("");
  const [popClips, setPopClips] = useState<PublicPopClip[]>([]);
  const [popClipsLoading, setPopClipsLoading] = useState(false);
  const [popClipsError, setPopClipsError] = useState("");
  const [location, setLocation] = useState<CreatorLocation | null>(null);

  useEffect(() => {
    const overrides = getPublicProfileOverrides(CREATOR_ID);
    setResolvedCopy(overrides ?? baseCopy);
  }, [baseCopy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSearchParams(window.location.search || "");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/creator/location", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as CreatorLocation;
        setLocation(data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLocation(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handle = (config.creatorHandle || slugifyHandle(config.creatorName || "creator")).trim();
    if (!handle) return;
    const controller = new AbortController();
    setPopClipsLoading(true);
    setPopClipsError("");
    fetch(`/api/public/popclips?handle=${encodeURIComponent(handle)}`, { signal: controller.signal })
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
  }, [config.creatorHandle, config.creatorName]);

  if (fanIdFromQuery) {
    return <ChatPrivatePage />;
  }

  const creatorHandle =
    config.creatorHandle && config.creatorHandle !== "creator"
      ? config.creatorHandle
      : slugifyHandle(config.creatorName || "creator");
  const baseChatHref = creatorHandle ? `/go/${creatorHandle}` : "/go/creator";
  const chatHref = appendSearchIfRelative(baseChatHref, searchParams);
  const followDraft = "Quiero seguirte gratis.";
  const followHref = appendSearchIfRelative(`${baseChatHref}?draft=${encodeURIComponent(followDraft)}`, searchParams);

  const visibleChips = (resolvedCopy.hero.chips || []).filter((chip) => chip.visible !== false);
  const heroChips = visibleChips.map((chip) => chip.label).filter(Boolean);
  const trustLine = (config.creatorSubtitle || "Responde en menos de 24h").trim();
  const rawTagline = (resolvedCopy.hero.tagline || config.creatorDescription || "").trim();
  const tagline = rawTagline && rawTagline !== trustLine ? rawTagline : "";
  const salesCount = stats?.salesCount ?? 0;
  const ratingsCount = stats?.ratingsCount ?? 0;
  const topEligible = salesCount >= 10 || ratingsCount >= 10;
  const visiblePacks = resolvedCopy.packs.filter((pack) => pack.visible !== false);
  const featuredPacks = visiblePacks.slice(0, 3);

  const buildDraftHref = (draft: string) =>
    appendSearchIfRelative(`${baseChatHref}?draft=${encodeURIComponent(draft)}`, searchParams);

  const featuredItems = featuredPacks.map((pack) => {
    const kind = pack.id === "monthly" ? "sub" : "pack";
    return {
      id: pack.id,
      kind,
      title: pack.title,
      priceLabel: pack.price,
      thumbUrl: null,
      href: buildDraftHref(buildPackDraft(kind, pack.title, pack.price)),
    } as PublicCatalogCardItem;
  });

  const catalogItems = visiblePacks.map((pack) => {
    const kind = pack.id === "monthly" ? "sub" : "pack";
    return {
      id: pack.id,
      kind,
      title: pack.title,
      priceLabel: pack.price,
      thumbUrl: null,
      href: buildDraftHref(buildPackDraft(kind, pack.title, pack.price)),
    } as PublicCatalogCardItem;
  });

  const popclipItems = popClips.map((clip) => {
    const title = clip.title?.trim() || clip.pack?.title || "PopClip";
    const draft = buildPopclipDraft(title, clip.pack?.title || "");
    return {
      id: clip.id,
      kind: "popclip",
      title,
      priceCents: clip.pack?.priceCents,
      currency: clip.pack?.currency,
      thumbUrl: clip.posterUrl || null,
      likeCount: clip.likeCount ?? 0,
      commentCount: clip.commentCount ?? 0,
      liked: clip.liked ?? false,
      canInteract: clip.canInteract ?? false,
      href: buildDraftHref(draft),
    } as PublicCatalogCardItem;
  });

  return (
    <>
      <Head>
        <title>NOVSY - Perfil público</title>
      </Head>
      <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)] overflow-x-hidden">
        <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 space-y-6 min-w-0">
          <PublicHero
            name={config.creatorName || "Creador"}
            avatarUrl={config.avatarUrl}
            tagline={tagline}
            trustLine={trustLine}
            topEligible={topEligible}
            location={location}
            chips={heroChips}
            primaryCtaLabel={resolvedCopy.hero.primaryCtaLabel || "Entrar al chat privado"}
            primaryHref={chatHref}
            secondaryCtaLabel={resolvedCopy.hero.secondaryCtaLabel || "Seguir gratis"}
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
                    <a href={item.href} className="block min-w-0">
                      <PublicCatalogCard item={item} variant="featured" />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 min-w-0">
            <h2 className="text-base font-semibold text-[color:var(--text)]">Catálogo</h2>
            <PublicCatalogGrid
              items={catalogItems}
              featuredIds={featuredItems.map((item) => item.id)}
              popclipItems={popclipItems}
              popclipLoading={popClipsLoading}
              popclipError={popClipsError || undefined}
              chatHref={chatHref}
              filters={CATALOG_FILTERS}
            />
          </section>
        </main>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const creatorId = CREATOR_ID;
  let stats: PublicProfileStats = { activeMembers: 0, images: 0, videos: 0, audios: 0 };
  const fanQuery =
    typeof context.query.fan === "string"
      ? context.query.fan
      : typeof context.query.fanId === "string"
      ? context.query.fanId
      : null;
  try {
    stats = await getPublicProfileStats(creatorId);
  } catch (err) {
    console.error("Error fetching public profile stats", err);
  }
  return { props: { stats, fanQuery } };
};

function slugifyHandle(value?: string) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function appendSearchIfRelative(url: string, search: string) {
  if (!search) return url;
  if (!url.startsWith("/")) return url;
  if (url.includes("?")) return `${url}&${search.replace(/^\?/, "")}`;
  return `${url}${search}`;
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
