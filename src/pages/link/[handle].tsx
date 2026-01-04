import type { GetServerSideProps } from "next";
import Head from "next/head";
import { BioLinkPublicView } from "../../components/public-profile/BioLinkPublicView";
import type { BioLinkConfig } from "../../types/bioLink";
import type { BioLinkSecondaryLink } from "../../types/bioLink";
import { ensureAnalyticsCookie } from "../../lib/analyticsCookie";
import { randomUUID } from "crypto";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

type Props = { config: BioLinkConfig | null };

export default function PublicBioLinkPage({ config }: Props) {
  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-0)] text-[color:var(--muted)] px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Enlace no disponible</h1>
          <p className="text-sm text-[color:var(--muted)]">El creador aún no ha activado su bio-link.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{String(config.title || "Bio-link")}</title>
      </Head>
      <BioLinkPublicView config={config} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const prisma = (await import("../../lib/prisma.server")).default;
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const creators = await prisma.creator.findMany();
  const match = creators.find((c) => slugify(c.name) === handleParam) || creators[0];
  const handle = slugify(match?.name || handleParam || "creator");

  if (!match || match.bioLinkEnabled === false) {
    return { props: { config: null } };
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

  const config: BioLinkConfig = {
    enabled: true,
    title: match.name || match.bioLinkTitle || "Creador",
    tagline: match.bioLinkTagline ?? match.subtitle ?? "",
    description: match.bioLinkDescription ?? "",
    avatarUrl: normalizeImageSrc(match.bioLinkAvatarUrl || ""),
    primaryCtaLabel: match.bioLinkPrimaryCtaLabel || "Entrar a mi chat privado",
    primaryCtaUrl: match.bioLinkPrimaryCtaUrl || `/go/${handle}`,
    secondaryLinks: parseSecondaryLinks(match.bioLinkSecondaryLinks),
    faq: parseStringArray(match.bioLinkFaq),
    handle,
    creatorId: match.id,
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

function parseStringArray(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
      }
    } catch (_err) {
      return [];
    }
  }
  return [];
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
