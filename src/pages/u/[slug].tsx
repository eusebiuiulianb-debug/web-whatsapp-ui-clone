import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = typeof ctx.params?.slug === "string" ? ctx.params.slug : "";
  const prisma = (await import("../../lib/prisma.server")).default;

  let destination = "/link/creator";

  if (slug) {
    try {
      const link = await prisma.campaignLink.findUnique({ where: { slug } });
      if (link) {
        const handle = slugify(link.handle || "creator");
        const params = new URLSearchParams({
          utm_source: link.utmSource,
          utm_medium: link.utmMedium,
          utm_campaign: link.utmCampaign,
          utm_content: link.utmContent,
        });
        if (link.utmTerm) params.set("utm_term", link.utmTerm);
        destination = `/link/${handle}?${params.toString()}`;
      }
    } catch (err) {
      console.error("Error resolving shortlink", err);
    }
  }

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};

export default function ShortLinkRedirect() {
  return null;
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
