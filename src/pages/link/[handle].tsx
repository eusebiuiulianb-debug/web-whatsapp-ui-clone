import type { GetServerSideProps } from "next";
import Head from "next/head";
import { BioLinkPublicView } from "../../components/public-profile/BioLinkPublicView";
import prisma from "../../lib/prisma";
import type { BioLinkConfig } from "../../types/bioLink";
import type { BioLinkSecondaryLink } from "../../types/bioLink";

type Props = { config: BioLinkConfig | null };

export default function PublicBioLinkPage({ config }: Props) {
  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Enlace no disponible</h1>
          <p className="text-sm text-slate-400">El creador aún no ha activado su bio-link.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{config.title}</title>
      </Head>
      <BioLinkPublicView config={config} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const creators = await prisma.creator.findMany();
  const match = creators.find((c) => slugify(c.name) === handleParam) || creators[0];

  if (!match || match.bioLinkEnabled === false) {
    return { props: { config: null } };
  }

  const config: BioLinkConfig = {
    enabled: true,
    title: match.name || match.bioLinkTitle || "Creador",
    tagline: match.subtitle || match.bioLinkTagline || "",
    avatarUrl: match.bioLinkAvatarUrl || "",
    primaryCtaLabel: match.bioLinkPrimaryCtaLabel || "Entrar a mi chat privado",
    primaryCtaUrl: match.bioLinkPrimaryCtaUrl || `/creator`,
    secondaryLinks: parseSecondaryLinks(match.bioLinkSecondaryLinks),
    handle: slugify(match.name || "creator"),
  };

  return { props: { config } };
};

function parseSecondaryLinks(raw: any): BioLinkSecondaryLink[] {
  if (Array.isArray(raw)) return raw as BioLinkSecondaryLink[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as BioLinkSecondaryLink[];
    } catch (_err) {
      return [];
    }
  }
  return [];
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
