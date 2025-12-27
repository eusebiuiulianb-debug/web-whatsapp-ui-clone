import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { getCreatorManagerSummary } from "../../../lib/creatorManager";
import { buildActiveManagerQueue, type ActiveManagerQueueItem } from "../../../server/manager/buildQueue";

const DEFAULT_CREATOR_ID = "creator-1";

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
  newFans30d?: number;
  fansNew30d?: number;
  archivedCount?: number;
  blockedCount?: number;
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
    const summary = await getCreatorManagerSummary(creatorId, { prismaClient: prisma });
    const { activeQueue, archivedCount, blockedCount } = await buildActiveManagerQueue(creatorId, prisma);

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
    const stats: ManagerQueueStats = {
      todayCount: queueItems.length,
      queueCount: queueItems.length,
      atRiskCount: queueItems.filter((item) => item.flags.atRisk7d).length,
      activePacksCount:
        (summary.packs?.welcome?.activeFans ?? 0) +
        (summary.packs?.monthly?.activeFans ?? 0) +
        (summary.packs?.special?.activeFans ?? 0),
      activeExtrasCount: summary.kpis?.last30?.extras ?? 0,
      revenue7d: summary.kpis?.last7?.revenue ?? 0,
      revenue30d: summary.kpis?.last30?.revenue ?? 0,
      newFans30d,
      fansNew30d: newFans30d,
      archivedCount,
      blockedCount,
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
