import type { GetServerSideProps } from "next";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { ensureAnalyticsCookie, readAnalyticsCookie } from "../../lib/analyticsCookie";
import { createOrResumeFanForHandle } from "../../lib/fanEntry";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const query = ctx.query || {};
  const utmSource = typeof query.utm_source === "string" ? query.utm_source : undefined;
  const utmMedium = typeof query.utm_medium === "string" ? query.utm_medium : undefined;
  const utmCampaign = typeof query.utm_campaign === "string" ? query.utm_campaign : undefined;
  const utmContent = typeof query.utm_content === "string" ? query.utm_content : undefined;
  const utmTerm = typeof query.utm_term === "string" ? query.utm_term : undefined;
  const rawDraft = Array.isArray(query.draft) ? query.draft[0] : query.draft;
  const draftValue = typeof rawDraft === "string" ? safeDecodeQueryParam(rawDraft) : "";
  const rawReturnTo = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  const returnToValue = typeof rawReturnTo === "string" ? safeDecodeQueryParam(rawReturnTo) : "";
  const safeReturnTo =
    returnToValue && returnToValue.startsWith("/") && !returnToValue.startsWith("//") ? returnToValue : "";

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

  let fanId = "";
  let creatorId = "creator-1";
  let resolvedHandle = "creator";
  try {
    const result = await createOrResumeFanForHandle({
      handle: handleParam,
      req: ctx.req as any,
      res: ctx.res as any,
      mode: "go",
    });
    fanId = result.fanId;
    creatorId = result.creatorId;
    resolvedHandle = result.handle;
  } catch (err) {
    console.error("Error resolving fan entry", err);
    return { notFound: true };
  }

  try {
    const prisma = (await import("../../lib/prisma.server")).default;
    await prisma.analyticsEvent.create({
      data: {
        creatorId,
        fanId,
        sessionId: merged.sessionId,
        eventName: ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT,
        path: `/go/${resolvedHandle}`,
        referrer: merged.referrer || referrer || null,
        utmSource: merged.utmSource || null,
        utmMedium: merged.utmMedium || null,
        utmCampaign: merged.utmCampaign || null,
        utmContent: merged.utmContent || null,
        utmTerm: merged.utmTerm || null,
        meta: { handle: resolvedHandle },
      },
    });
  } catch (err) {
    console.error("Error tracking CTA click", err);
  }

  const baseDestination = draftValue ? `/fan/${fanId}?draft=${encodeURIComponent(draftValue)}` : `/fan/${fanId}`;
  const destination = safeReturnTo
    ? `${baseDestination}${baseDestination.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(safeReturnTo)}`
    : baseDestination;

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};

export default function GoRedirectPage() {
  return null;
}

function safeDecodeQueryParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
}
