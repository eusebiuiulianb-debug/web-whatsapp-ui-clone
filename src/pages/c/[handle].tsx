import Head from "next/head";
import type { GetServerSideProps } from "next";
import PublicProfileView from "../../components/public-profile/PublicProfileView";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../../lib/publicProfileCopy";
import type { PublicProfileCopy, PublicProfileStats } from "../../types/publicProfile";
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
};

export default function PublicCreatorByHandle({ notFound, copy, creatorName, subtitle, avatarUrl, creatorInitial, stats }: Props) {
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
  const packs = [
    { id: "welcome", name: "Pack bienvenida", price: "9 €" },
    { id: "monthly", name: "Suscripción mensual", price: "25 €" },
    { id: "special", name: "Pack especial", price: "49 €" },
  ];

  const copy = mapToPublicProfileCopy(PROFILE_COPY["fanclub"], "fanclub", { packs });
  const avatarUrl = normalizeImageSrc(match.avatarUrl || match.bioLinkAvatarUrl || "");

  return {
    props: {
      copy,
      creatorName: match.name || "Creador",
      subtitle: match.subtitle || "",
      avatarUrl,
      creatorInitial: (match.name || "C").charAt(0),
      stats,
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
