import type { GetServerSideProps } from "next";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { ensureAnalyticsCookie, readAnalyticsCookie } from "../../lib/analyticsCookie";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const prisma = (await import("../../lib/prisma.server")).default;
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const query = ctx.query || {};
  const utmSource = typeof query.utm_source === "string" ? query.utm_source : undefined;
  const utmMedium = typeof query.utm_medium === "string" ? query.utm_medium : undefined;
  const utmCampaign = typeof query.utm_campaign === "string" ? query.utm_campaign : undefined;
  const utmContent = typeof query.utm_content === "string" ? query.utm_content : undefined;
  const utmTerm = typeof query.utm_term === "string" ? query.utm_term : undefined;

  const creators = await prisma.creator.findMany();
  const match = creators.find((c) => slugify(c.name) === handleParam) || creators[0];
  const referrer = (ctx.req?.headers?.referer as string | undefined) || (ctx.req?.headers?.referrer as string | undefined);

  const cookieData = readAnalyticsCookie(ctx.req as any);
  const merged = ensureAnalyticsCookie(ctx.req as any, ctx.res as any, {
    referrer: cookieData?.referrer || referrer || undefined,
    utmSource: utmSource ?? cookieData?.utmSource,
    utmMedium: utmMedium ?? cookieData?.utmMedium,
    utmCampaign: utmCampaign ?? cookieData?.utmCampaign,
    utmContent: utmContent ?? cookieData?.utmContent,
    utmTerm: utmTerm ?? cookieData?.utmTerm,
  });

  let destination = match?.bioLinkPrimaryCtaUrl || "/creator";
  const loopPath = `/link/${handleParam}`;
  if (destination === loopPath) {
    destination = "/";
  }

  const host = ctx.req?.headers?.host;
  const utmParams = buildUtmParams({
    utmSource: merged.utmSource,
    utmMedium: merged.utmMedium,
    utmCampaign: merged.utmCampaign,
    utmContent: merged.utmContent,
    utmTerm: merged.utmTerm,
  });
  destination = appendUtmsIfNeeded(destination, host, utmParams);

  try {
    await prisma.analyticsEvent.create({
      data: {
        creatorId: match?.id ?? "creator-1",
        fanId: null,
        sessionId: merged.sessionId,
        eventName: ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT,
        path: `/go/${handleParam}`,
        referrer: merged.referrer || referrer || null,
        utmSource: merged.utmSource || null,
        utmMedium: merged.utmMedium || null,
        utmCampaign: merged.utmCampaign || null,
        utmContent: merged.utmContent || null,
        utmTerm: merged.utmTerm || null,
        meta: { handle: handleParam },
      },
    });
  } catch (err) {
    console.error("Error tracking CTA click", err);
  }

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function buildUtmParams(params: { utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; utmContent?: string | null; utmTerm?: string | null }) {
  const searchParams = new URLSearchParams();
  if (params.utmSource) searchParams.set("utm_source", params.utmSource);
  if (params.utmMedium) searchParams.set("utm_medium", params.utmMedium);
  if (params.utmCampaign) searchParams.set("utm_campaign", params.utmCampaign);
  if (params.utmContent) searchParams.set("utm_content", params.utmContent);
  if (params.utmTerm) searchParams.set("utm_term", params.utmTerm);
  return searchParams;
}

function appendUtmsIfNeeded(destination: string, host?: string | string[], utmParams?: URLSearchParams) {
  if (!utmParams || Array.from(utmParams.keys()).length === 0) return destination;
  try {
    const hasHost = !!host;
    const destUrl = destination.startsWith("http") ? new URL(destination) : hasHost ? new URL(destination, `http://${Array.isArray(host) ? host[0] : host}`) : null;
    if (!destUrl) {
      return `${destination}${destination.includes("?") ? "&" : "?"}${utmParams.toString()}`;
    }
    const isSameOrigin = destUrl.host === (Array.isArray(host) ? host[0] : host);
    const hasUtm = Array.from(destUrl.searchParams.keys()).some((k) => k.startsWith("utm_"));
    if (isSameOrigin && !hasUtm) {
      utmParams.forEach((value, key) => {
        destUrl.searchParams.set(key, value);
      });
    }
    return destUrl.toString();
  } catch (_err) {
    return destination;
  }
}

export default function GoRedirectPage() {
  return null;
}
