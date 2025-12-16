import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { ANALYTICS_EVENTS } from "../../../lib/analyticsEvents";

type FunnelStep = {
  sessions: number;
  events: number;
};

type FunnelFans = {
  newFans: number;
  openChatFans: number;
  sendMessageFans: number;
};

type AggregatedRow = {
  key: string;
  utmCampaign: string;
  utmSource: string;
  viewSessions: number;
  ctaSessions: number;
  openChatSessions: number;
  sendMessageSessions: number;
  purchaseSessions: number;
  fansNew: number;
};

type AnalyticsSummaryResponse = {
  rangeDays: number;
  funnel: {
    view: FunnelStep;
    cta: FunnelStep;
    openChat: FunnelStep;
    sendMessage: FunnelStep;
    purchase: FunnelStep;
  };
  funnelFans: FunnelFans;
  metrics: {
    sessions: number;
    ctr: number;
  };
  topCampaigns: AggregatedRow[];
  topCreatives: Omit<AggregatedRow, "utmCampaign" | "utmSource"> & { utmContent: string };
  latestLinks: Array<{
    id: string;
    platform: string;
    handle: string | null;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string | null;
    slug: string | null;
    createdAt: string;
  }>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const rangeParam = Array.isArray(req.query.range) ? req.query.range[0] : req.query.range;
    const rangeDays = Number(rangeParam) === 30 ? 30 : Number(rangeParam) === 90 ? 90 : 7;
    const creatorId = process.env.CREATOR_ID ?? "creator-1";
    const since = new Date();
    since.setDate(since.getDate() - rangeDays + 1);

    const [events, latestLinks] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: { creatorId, createdAt: { gte: since } },
        select: { sessionId: true, eventName: true, fanId: true, utmCampaign: true, utmSource: true, utmContent: true },
      }),
      prisma.campaignLink.findMany({
        where: { creatorId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          platform: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          utmContent: true,
          utmTerm: true,
          handle: true,
          slug: true,
          createdAt: true,
        },
      }),
    ]);

    const viewSessions = new Set<string>();
    const ctaSessions = new Set<string>();
    const openChatSessions = new Set<string>();
    const sendMessageSessions = new Set<string>();
    const purchaseSessions = new Set<string>();
    const newFans = new Set<string>();
    const openChatFans = new Set<string>();
    const sendMessageFans = new Set<string>();

    const aggregatedCampaigns = new Map<
      string,
      { utmCampaign: string; utmSource: string; events: Record<string, Set<string>>; newFans: Set<string> }
    >();
    const aggregatedCreatives = new Map<string, { utmContent: string; events: Record<string, Set<string>>; newFans: Set<string> }>();

    const ensureCampaign = (campaign: string, source: string) => {
      const key = `${campaign}||${source}`;
      if (!aggregatedCampaigns.has(key)) {
        aggregatedCampaigns.set(key, {
          utmCampaign: campaign,
          utmSource: source,
          events: {
            [ANALYTICS_EVENTS.BIO_LINK_VIEW]: new Set<string>(),
            [ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT]: new Set<string>(),
            [ANALYTICS_EVENTS.OPEN_CHAT]: new Set<string>(),
            [ANALYTICS_EVENTS.SEND_MESSAGE]: new Set<string>(),
            [ANALYTICS_EVENTS.PURCHASE_SUCCESS]: new Set<string>(),
          },
          newFans: new Set<string>(),
        });
      }
      return aggregatedCampaigns.get(key)!;
    };

    const ensureCreative = (content: string) => {
      const key = content;
      if (!aggregatedCreatives.has(key)) {
        aggregatedCreatives.set(key, {
          utmContent: content,
          events: {
            [ANALYTICS_EVENTS.BIO_LINK_VIEW]: new Set<string>(),
            [ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT]: new Set<string>(),
            [ANALYTICS_EVENTS.OPEN_CHAT]: new Set<string>(),
            [ANALYTICS_EVENTS.SEND_MESSAGE]: new Set<string>(),
            [ANALYTICS_EVENTS.PURCHASE_SUCCESS]: new Set<string>(),
          },
          newFans: new Set<string>(),
        });
      }
      return aggregatedCreatives.get(key)!;
    };

    for (const evt of events) {
      const session = evt.sessionId;
      const name = evt.eventName;
      const fanId = evt.fanId || null;
      if (name === ANALYTICS_EVENTS.BIO_LINK_VIEW) viewSessions.add(session);
      if (name === ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT) ctaSessions.add(session);
      if (name === ANALYTICS_EVENTS.OPEN_CHAT) openChatSessions.add(session);
      if (name === ANALYTICS_EVENTS.SEND_MESSAGE) sendMessageSessions.add(session);
      if (name === ANALYTICS_EVENTS.PURCHASE_SUCCESS) purchaseSessions.add(session);
      if (name === ANALYTICS_EVENTS.NEW_FAN && fanId) newFans.add(fanId);
      if (name === ANALYTICS_EVENTS.OPEN_CHAT && fanId) openChatFans.add(fanId);
      if (name === ANALYTICS_EVENTS.SEND_MESSAGE && fanId) sendMessageFans.add(fanId);

      const campaign = (evt.utmCampaign || "sin_campaña").trim() || "sin_campaña";
      const source = (evt.utmSource || "sin_fuente").trim() || "sin_fuente";
      const creative = (evt.utmContent || "sin_creativo").trim() || "sin_creativo";

      const campaignRow = ensureCampaign(campaign, source);
      if (campaignRow.events[name]) {
        campaignRow.events[name].add(session);
      }
      if (name === ANALYTICS_EVENTS.NEW_FAN && fanId) {
        campaignRow.newFans.add(fanId);
      }
      const creativeRow = ensureCreative(creative);
      if (creativeRow.events[name]) {
        creativeRow.events[name].add(session);
      }
      if (name === ANALYTICS_EVENTS.NEW_FAN && fanId) {
        creativeRow.newFans.add(fanId);
      }
    }

    const topCampaigns = Array.from(aggregatedCampaigns.values())
      .map((row) => ({
        key: `${row.utmCampaign}||${row.utmSource}`,
        utmCampaign: row.utmCampaign,
        utmSource: row.utmSource,
        viewSessions: row.events[ANALYTICS_EVENTS.BIO_LINK_VIEW].size,
        ctaSessions: row.events[ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT].size,
        openChatSessions: row.events[ANALYTICS_EVENTS.OPEN_CHAT].size,
        sendMessageSessions: row.events[ANALYTICS_EVENTS.SEND_MESSAGE].size,
        purchaseSessions: row.events[ANALYTICS_EVENTS.PURCHASE_SUCCESS].size,
        fansNew: row.newFans.size,
      }))
      .sort((a, b) => b.viewSessions - a.viewSessions)
      .slice(0, 20);

    const topCreatives = Array.from(aggregatedCreatives.values())
      .map((row) => ({
        key: row.utmContent,
        utmContent: row.utmContent,
        viewSessions: row.events[ANALYTICS_EVENTS.BIO_LINK_VIEW].size,
        ctaSessions: row.events[ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT].size,
        openChatSessions: row.events[ANALYTICS_EVENTS.OPEN_CHAT].size,
        sendMessageSessions: row.events[ANALYTICS_EVENTS.SEND_MESSAGE].size,
        purchaseSessions: row.events[ANALYTICS_EVENTS.PURCHASE_SUCCESS].size,
        fansNew: row.newFans.size,
      }))
      .sort((a, b) => b.viewSessions - a.viewSessions)
      .slice(0, 20);

    const funnel = {
      view: { sessions: viewSessions.size, events: events.filter((e) => e.eventName === ANALYTICS_EVENTS.BIO_LINK_VIEW).length },
      cta: {
        sessions: ctaSessions.size,
        events: events.filter((e) => e.eventName === ANALYTICS_EVENTS.CTA_CLICK_ENTER_CHAT).length,
      },
      openChat: {
        sessions: openChatSessions.size,
        events: events.filter((e) => e.eventName === ANALYTICS_EVENTS.OPEN_CHAT).length,
      },
      sendMessage: {
        sessions: sendMessageSessions.size,
        events: events.filter((e) => e.eventName === ANALYTICS_EVENTS.SEND_MESSAGE).length,
      },
      purchase: {
        sessions: purchaseSessions.size,
        events: events.filter((e) => e.eventName === ANALYTICS_EVENTS.PURCHASE_SUCCESS).length,
      },
    };

    const funnelFans = {
      newFans: newFans.size,
      openChatFans: openChatFans.size,
      sendMessageFans: sendMessageFans.size,
    };

    const metrics = {
      sessions: viewSessions.size,
      ctr: viewSessions.size ? Number(((ctaSessions.size / viewSessions.size) * 100).toFixed(1)) : 0,
    };

    const payload: AnalyticsSummaryResponse = {
      rangeDays,
      funnel,
      funnelFans,
      metrics,
      topCampaigns,
      topCreatives: topCreatives as any,
      latestLinks: latestLinks.map((link) => ({
        ...link,
        utmTerm: link.utmTerm ?? null,
        slug: link.slug ?? null,
        handle: link.handle ?? null,
        createdAt: link.createdAt.toISOString(),
      })),
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Error loading analytics summary", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
