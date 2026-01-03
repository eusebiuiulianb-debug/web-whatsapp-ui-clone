import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { getCreatorManagerSummary } from "../../../lib/creatorManager";
import { buildActiveManagerQueue, type ActiveManagerQueueItem } from "../../../server/manager/buildQueue";

const DEFAULT_CREATOR_ID = "creator-1";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NO_RESPONSE_DAYS = 3;

function startOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number, now: Date) {
  const d = startOfDay(now);
  d.setDate(d.getDate() - days);
  return d;
}

function extractMessageIdTimestamp(messageId?: string | null): number | null {
  if (!messageId) return null;
  const lastDash = messageId.lastIndexOf("-");
  if (lastDash < 0 || lastDash === messageId.length - 1) return null;
  const raw = messageId.slice(lastDash + 1);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

type ManagerQueueFlags = {
  expiredSoon: boolean;
  expired: boolean;
  atRisk7d: boolean;
  followUpToday: boolean;
  isNew30d: boolean;
};

type ManagerQueueItem = {
  fanId: string;
  handle: string | null;
  displayName: string;
  flags: ManagerQueueFlags;
  nextReason: string;
  expiresInDays?: number | null;
  lastActivityAt: string | null;
  quickNote?: string | null;
  attendedAt?: string | null;
};

type ManagerQueueStats = {
  todayCount: number;
  queueCount: number;
  atRiskCount: number;
  activePacksCount?: number;
  activeExtrasCount?: number;
  revenue7d?: number;
  revenue30d?: number;
  newFans7d?: number;
  newFans30d?: number;
  fansNew30d?: number;
  archivedCount?: number;
  blockedCount?: number;
  conversationsStarted7d?: number;
  conversationsStarted30d?: number;
  firstPurchase30d?: number;
  noResponseCount?: number;
  noResponseDays?: number;
};

type ManagerQueueNextAction = {
  fan: ManagerQueueItem | null;
  reason: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const creatorId = DEFAULT_CREATOR_ID;
    const now = new Date();
    const start7 = daysAgo(7, now);
    const start30 = daysAgo(30, now);

    const [
      summary,
      queueResult,
      fanMessages,
      paidGrants,
      extraPurchases,
      fansForNoResponse,
    ] = await Promise.all([
      getCreatorManagerSummary(creatorId, { prismaClient: prisma }),
      buildActiveManagerQueue(creatorId, prisma),
      prisma.message.findMany({
        where: { fan: { creatorId }, from: "fan" },
        select: { id: true, fanId: true },
      }),
      prisma.accessGrant.findMany({
        where: {
          fan: { creatorId },
          type: { in: ["monthly", "special", "single"] },
        },
        select: { fanId: true, createdAt: true },
      }),
      prisma.extraPurchase.findMany({
        where: { fan: { creatorId } },
        select: { fanId: true, createdAt: true },
      }),
      prisma.fan.findMany({
        where: { creatorId },
        select: { id: true, lastCreatorMessageAt: true },
      }),
    ]);
    const { activeQueue, archivedCount, blockedCount } = queueResult;

    const fanMetaRows = await prisma.fan.findMany({
      where: { id: { in: activeQueue.map((item) => item.id) } },
      select: {
        id: true,
        handle: true,
        name: true,
        displayName: true,
        lastMessageAt: true,
        lastPurchaseAt: true,
        quickNote: true,
        attendedAt: true,
      },
    });
    const fanMetaMap = new Map<
      string,
      {
        handle: string | null;
        displayName: string;
        lastActivityAt: string | null;
        quickNote: string | null;
        attendedAt: string | null;
      }
    >();
    fanMetaRows.forEach((row) => {
      const lastActivityCandidates = [row.lastMessageAt, row.lastPurchaseAt].filter(Boolean) as Date[];
      const lastActivityAt =
        lastActivityCandidates.length > 0
          ? lastActivityCandidates.sort((a, b) => b.getTime() - a.getTime())[0].toISOString()
          : null;
      fanMetaMap.set(row.id, {
        handle: row.handle ?? null,
        displayName: row.displayName || row.name || "Fan",
        lastActivityAt,
        quickNote: row.quickNote ?? null,
        attendedAt: row.attendedAt ? row.attendedAt.toISOString() : null,
      });
    });

    const buildFlags = (item: ActiveManagerQueueItem): ManagerQueueFlags => {
      const expiresInDays = item.daysToExpiry ?? null;
      const expired = expiresInDays !== null && expiresInDays <= 0;
      const expiredSoon = expiresInDays !== null && expiresInDays > 0 && expiresInDays <= 3;
      const atRisk7d = item.segment === "EN_RIESGO" || (expiresInDays !== null && expiresInDays <= 7);
      const followUpToday = item.segment === "EN_RIESGO" || item.segment === "VIP" || (expiresInDays !== null && expiresInDays <= 1);
      const isNew30d = item.flags?.isNew30d === true;
      return { expiredSoon, expired, atRisk7d, followUpToday, isNew30d };
    };

    const buildNextReason = (item: ActiveManagerQueueItem, flags: ManagerQueueFlags, expiresInDays: number | null) => {
      if (flags.expired) return "Caducado";
      if (flags.expiredSoon && expiresInDays !== null) return `Caduca en ${expiresInDays}d`;
      if (item.segment === "EN_RIESGO") return "En riesgo";
      if (item.segment === "VIP") return "VIP activo";
      if (item.segment === "DORMIDO") return "Dormido";
      if (expiresInDays !== null) return `Renueva en ${expiresInDays}d`;
      return "Seguimiento";
    };

    const queueItems: ManagerQueueItem[] = activeQueue.map((item) => {
      const meta = fanMetaMap.get(item.id);
      const expiresInDays = item.daysToExpiry ?? null;
      const flags = buildFlags(item);
      return {
        fanId: item.id,
        handle: meta?.handle ?? null,
        displayName: meta?.displayName || item.displayName,
        flags,
        nextReason: buildNextReason(item, flags, expiresInDays),
        expiresInDays,
        lastActivityAt: meta?.lastActivityAt ?? null,
        quickNote: meta?.quickNote ?? null,
        attendedAt: meta?.attendedAt ?? null,
      };
    });

    const newFans30d = queueItems.filter((item) => item.flags.isNew30d).length;
    const newFans7d = summary.kpis?.last7?.newFans ?? 0;
    const newFans30dFromSummary = summary.kpis?.last30?.newFans ?? newFans30d;

    const firstMessageByFan = new Map<string, number>();
    const lastMessageByFan = new Map<string, number>();
    for (const message of fanMessages) {
      const ts = extractMessageIdTimestamp(message.id);
      if (!ts) continue;
      const currentFirst = firstMessageByFan.get(message.fanId);
      if (!currentFirst || ts < currentFirst) {
        firstMessageByFan.set(message.fanId, ts);
      }
      const currentLast = lastMessageByFan.get(message.fanId);
      if (!currentLast || ts > currentLast) {
        lastMessageByFan.set(message.fanId, ts);
      }
    }

    let conversationsStarted7d = 0;
    let conversationsStarted30d = 0;
    for (const firstTimestamp of firstMessageByFan.values()) {
      if (firstTimestamp >= start7.getTime()) conversationsStarted7d += 1;
      if (firstTimestamp >= start30.getTime()) conversationsStarted30d += 1;
    }

    const firstPurchaseByFan = new Map<string, Date>();
    for (const grant of paidGrants) {
      const current = firstPurchaseByFan.get(grant.fanId);
      if (!current || grant.createdAt < current) {
        firstPurchaseByFan.set(grant.fanId, grant.createdAt);
      }
    }
    for (const purchase of extraPurchases) {
      const current = firstPurchaseByFan.get(purchase.fanId);
      if (!current || purchase.createdAt < current) {
        firstPurchaseByFan.set(purchase.fanId, purchase.createdAt);
      }
    }
    let firstPurchase30d = 0;
    for (const date of firstPurchaseByFan.values()) {
      if (date >= start30) firstPurchase30d += 1;
    }

    const noResponseCutoff = now.getTime() - NO_RESPONSE_DAYS * MS_PER_DAY;
    let noResponseCount = 0;
    for (const fan of fansForNoResponse) {
      const lastFanTimestamp = lastMessageByFan.get(fan.id);
      if (!lastFanTimestamp || lastFanTimestamp > noResponseCutoff) continue;
      const lastCreatorTimestamp = fan.lastCreatorMessageAt ? fan.lastCreatorMessageAt.getTime() : null;
      if (!lastCreatorTimestamp || lastCreatorTimestamp < lastFanTimestamp) {
        noResponseCount += 1;
      }
    }

    const stats: ManagerQueueStats = {
      todayCount: queueItems.length,
      queueCount: queueItems.length,
      atRiskCount: queueItems.filter((item) => item.flags.atRisk7d).length,
      activePacksCount:
        (summary.packs?.welcome?.activeFans ?? 0) +
        (summary.packs?.monthly?.activeFans ?? 0) +
        (summary.packs?.special?.activeFans ?? 0),
      activeExtrasCount: summary.kpis?.extras?.last30?.count ?? summary.kpis?.last30?.extras ?? 0,
      revenue7d: summary.kpis?.last7?.revenue ?? 0,
      revenue30d: summary.kpis?.last30?.revenue ?? 0,
      newFans7d,
      newFans30d,
      fansNew30d: newFans30dFromSummary,
      archivedCount,
      blockedCount,
      conversationsStarted7d,
      conversationsStarted30d,
      firstPurchase30d,
      noResponseCount,
      noResponseDays: NO_RESPONSE_DAYS,
    };

    const top3 = queueItems.slice(0, 3);
    const nextAction: ManagerQueueNextAction = {
      fan: top3[0] ?? null,
      reason: top3[0]?.nextReason ?? null,
    };

    return res.status(200).json({
      summary,
      queue: queueItems,
      stats,
      top3,
      nextAction,
    });
  } catch (err) {
    console.error("Error loading manager overview", err);
    return res.status(500).json({ error: "Failed to load manager overview" });
  }
}
