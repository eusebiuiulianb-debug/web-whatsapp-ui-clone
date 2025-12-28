import Head from "next/head";
import type { GetServerSideProps } from "next";
import PublicProfileView from "../../components/public-profile/PublicProfileView";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../../lib/publicProfileCopy";
import type { PublicCatalogItem, PublicPopClip, PublicProfileCopy, PublicProfileStats } from "../../types/publicProfile";
import { getPublicProfileStats } from "../../lib/publicProfileStats";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

type Props = {
  notFound?: boolean;
  copy?: PublicProfileCopy;
  creatorName?: string;
  subtitle?: string;
  avatarUrl?: string | null;
  creatorInitial?: string;
  stats?: PublicProfileStats;
  catalogItems?: PublicCatalogItem[];
  popClips?: PublicPopClip[];
  creatorHandle?: string;
};

type CatalogItemRow = {
  id: string;
  type: "EXTRA" | "BUNDLE" | "PACK";
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  includes: unknown;
};

type PopClipRow = {
  id: string;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  durationSec: number | null;
  sortOrder: number;
  catalogItem: {
    id: string;
    title: string;
    description: string | null;
    priceCents: number;
    currency: string;
    type: "EXTRA" | "BUNDLE" | "PACK";
    isPublic: boolean;
    isActive: boolean;
  };
};

export default function PublicCreatorByHandle({
  notFound,
  copy,
  creatorName,
  subtitle,
  avatarUrl,
  creatorInitial,
  stats,
  catalogItems,
  popClips,
  creatorHandle,
}: Props) {
  if (notFound || !copy || !creatorName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Perfil no disponible</h1>
          <p className="text-sm text-slate-400">El creador aún no ha activado su perfil público.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{String(creatorName || "Perfil público")}</title>
      </Head>
      <div className="min-h-screen bg-slate-950 text-white">
        <PublicProfileView
          copy={copy}
          creatorName={creatorName}
          creatorInitial={creatorInitial || "C"}
          subtitle={subtitle || ""}
          avatarUrl={avatarUrl || undefined}
          stats={stats}
          catalogItems={catalogItems}
          popClips={popClips}
          creatorHandle={creatorHandle}
        />
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

  const stats = await getSafeStats(match.id);
  const catalogItems = await getPublicCatalogItems(match.id);
  const creatorHandle = slugify(match.name);
  const popClips = await getPublicPopClips(match.id, creatorHandle);
  const packs = [
    { id: "welcome", name: "Pack bienvenida", price: "9 €" },
    { id: "monthly", name: "Suscripción mensual", price: "25 €" },
    { id: "special", name: "Pack especial", price: "49 €" },
  ];

  const baseCopy = mapToPublicProfileCopy(PROFILE_COPY["fanclub"], "fanclub", { packs });
  const profile = await prisma.creatorProfile.findUnique({ where: { creatorId: match.id } });
  const coverUrl =
    profile?.coverUrl && profile.coverUrl.trim().length > 0 ? normalizeImageSrc(profile.coverUrl) : null;
  const copy: PublicProfileCopy = {
    ...baseCopy,
    hero: {
      ...baseCopy.hero,
      coverImageUrl: coverUrl || baseCopy.hero.coverImageUrl || null,
    },
  };
  const avatarUrl = normalizeImageSrc(match.bioLinkAvatarUrl || "");

  return {
    props: {
      copy,
      creatorName: match.name || "Creador",
      subtitle: match.subtitle || "",
      avatarUrl,
      creatorInitial: (match.name || "C").charAt(0),
      stats,
      catalogItems,
      popClips,
      creatorHandle,
    },
  };
};

async function getSafeStats(creatorId: string): Promise<PublicProfileStats> {
  try {
    return await getPublicProfileStats(creatorId);
  } catch (_err) {
    return { activeMembers: 0, images: 0, videos: 0, audios: 0 };
  }
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
      type: item.type,
      title: item.title,
      description: item.description,
      priceCents: item.priceCents,
      currency: item.currency,
      includes,
    };
  });
}

async function getPublicPopClips(creatorId: string, creatorHandle: string): Promise<PublicPopClip[]> {
  const prisma = (await import("../../lib/prisma.server")).default;
  const clips = (await prisma.popClip.findMany({
    where: {
      creatorId,
      isActive: true,
      catalogItem: {
        isActive: true,
        isPublic: true,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      catalogItem: {
        select: {
          id: true,
          title: true,
          description: true,
          priceCents: true,
          currency: true,
          type: true,
          isPublic: true,
          isActive: true,
        },
      },
    },
  })) as PopClipRow[];

  return clips
    .filter((clip) => clip.catalogItem?.type === "PACK" && clip.videoUrl.trim().length > 0)
    .map((clip) => ({
      id: clip.id,
      title: clip.title ?? null,
      videoUrl: clip.videoUrl,
      posterUrl: clip.posterUrl ?? null,
      durationSec: clip.durationSec ?? null,
      sortOrder: clip.sortOrder,
      pack: {
        id: clip.catalogItem.id,
        title: clip.catalogItem.title,
        description: clip.catalogItem.description,
        priceCents: clip.catalogItem.priceCents,
        currency: clip.catalogItem.currency,
        type: clip.catalogItem.type,
        slug: slugify(clip.catalogItem.title),
        route: buildPackRoute(creatorHandle, clip.catalogItem.id),
        coverUrl: clip.posterUrl ?? null,
      },
    }));
}

function buildPackRoute(handle: string, packId: string) {
  return `/p/${handle}/${packId}`;
}
