import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { daysAgoInTimeZone } from "../../../../lib/timezone";
import { ANALYTICS_EVENTS } from "../../../../lib/analyticsEvents";
import { PACKS } from "../../../../config/packs";

type CampaignRange = "7d" | "30d" | "90d";

type CampaignRow = {
  campaign: string;
  visits: number;
  chatsStarted: number;
  purchases: number;
  revenue: number;
  convVisitToChat: number;
  convChatToPurchase: number;
};

type CampaignStats = {
  visits: Set<string>;
  chats: Set<string>;
  purchases: number;
  revenue: number;
};

function normalizeRange(value: unknown): CampaignRange | null {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return null;
}

function getRangeStart(range: CampaignRange): Date {
  if (range === "30d") return daysAgoInTimeZone(30);
  if (range === "90d") return daysAgoInTimeZone(90);
  return daysAgoInTimeZone(7);
}

function normalizeCampaign(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "sin_campaña";
}

function normalizeGrantType(raw: string | null | undefined): "monthly" | "special" | "trial" | "welcome" | "unknown" {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "monthly") return "monthly";
  if (normalized === "special") return "special";
  if (normalized === "trial") return "trial";
  if (normalized === "welcome") return "welcome";
  if (normalized === "single") return "special";
  return "unknown";
}

function getGrantAmount(type: string): number {
  if (type === "monthly") return PACKS.monthly.price;
  if (type === "special") return PACKS.special.price;
  if (type === "trial") return PACKS.trial.price;
  return 0;
}

function ensureStats(map: Map<string, CampaignStats>, campaign: string): CampaignStats {
  const existing = map.get(campaign);
  if (existing) return existing;
  const next = {
    visits: new Set<string>(),
    chats: new Set<string>(),
    purchases: 0,
    revenue: 0,
  };
  map.set(campaign, next);
  return next;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CampaignRow[] | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const range = normalizeRange(req.query.range);
  if (!range) {
    return sendBadRequest(res, "range must be 7d, 30d, or 90d");
  }

  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();
  const from = getRangeStart(range);

  try {
    const [events, fanCampaignEvents, purchases, grants] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: {
          creatorId,
          createdAt: { gte: from, lte: now },
          eventName: { in: [ANALYTICS_EVENTS.BIO_LINK_VIEW, ANALYTICS_EVENTS.OPEN_CHAT] },
        },
        select: {
          sessionId: true,
          fanId: true,
          eventName: true,
          utmCampaign: true,
        },
      }),
      prisma.analyticsEvent.findMany({
        where: {
          creatorId,
          createdAt: { gte: from, lte: now },
          fanId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: {
          fanId: true,
          utmCampaign: true,
          createdAt: true,
        },
      }),
      prisma.extraPurchase.findMany({
        where: {
          fan: { creatorId },
          createdAt: { gte: from, lte: now },
          amount: { gt: 0 },
          isArchived: false,
        },
        select: { fanId: true, amount: true },
      }),
      prisma.accessGrant.findMany({
        where: {
          fan: { creatorId },
          createdAt: { gte: from, lte: now },
        },
        select: { fanId: true, type: true },
      }),
    ]);

    const statsByCampaign = new Map<string, CampaignStats>();

    events.forEach((event) => {
      const campaign = normalizeCampaign(event.utmCampaign);
      const stats = ensureStats(statsByCampaign, campaign);
      if (event.eventName === ANALYTICS_EVENTS.BIO_LINK_VIEW && event.sessionId) {
        stats.visits.add(event.sessionId);
      }
      if (event.eventName === ANALYTICS_EVENTS.OPEN_CHAT) {
        const key = event.fanId || (event.sessionId ? `session:${event.sessionId}` : "");
        if (key) stats.chats.add(key);
      }
    });

    const latestCampaignByFan = new Map<string, string>();
    fanCampaignEvents.forEach((event) => {
      const fanId = event.fanId ?? "";
      if (!fanId || latestCampaignByFan.has(fanId)) return;
      const campaign = normalizeCampaign(event.utmCampaign);
      if (campaign === "sin_campaña") return;
      latestCampaignByFan.set(fanId, campaign);
    });

    purchases.forEach((purchase) => {
      const campaign = latestCampaignByFan.get(purchase.fanId) || "sin_campaña";
      const stats = ensureStats(statsByCampaign, campaign);
      stats.purchases += 1;
      stats.revenue += Number(purchase.amount) || 0;
    });

    grants.forEach((grant) => {
      const amount = getGrantAmount(normalizeGrantType(grant.type));
      if (amount <= 0) return;
      const campaign = latestCampaignByFan.get(grant.fanId) || "sin_campaña";
      const stats = ensureStats(statsByCampaign, campaign);
      stats.purchases += 1;
      stats.revenue += amount;
    });

    const rows: CampaignRow[] = Array.from(statsByCampaign.entries()).map(([campaign, stats]) => {
      const visits = stats.visits.size;
      const chatsStarted = stats.chats.size;
      const purchasesCount = stats.purchases;
      const convVisitToChat = visits > 0 ? chatsStarted / visits : 0;
      const convChatToPurchase = chatsStarted > 0 ? purchasesCount / chatsStarted : 0;
      return {
        campaign,
        visits,
        chatsStarted,
        purchases: purchasesCount,
        revenue: stats.revenue,
        convVisitToChat,
        convChatToPurchase,
      };
    });

    rows.sort((a, b) => {
      if (b.visits !== a.visits) return b.visits - a.visits;
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return a.campaign.localeCompare(b.campaign);
    });

    return res.status(200).json(rows);
  } catch (err) {
    console.error("Error building utm campaign analytics", err);
    return sendServerError(res, "No se pudo cargar la atribucion de campañas");
  }
}
