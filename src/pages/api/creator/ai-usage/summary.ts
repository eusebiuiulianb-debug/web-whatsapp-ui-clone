import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { buildDailyUsageFromLogs } from "../../../../lib/aiUsage";
import { AI_ENABLED, sendAiDisabled } from "../../../../lib/features";

const DEFAULT_CREATOR_ID = "creator-1";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type ActionCount = { actionType: string; count: number };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!AI_ENABLED) {
    return sendAiDisabled(res);
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const now = new Date();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startLast7 = new Date(Date.now() - 7 * MS_PER_DAY);
    const startLast30 = new Date(Date.now() - 30 * MS_PER_DAY);

    const [totalToday, totalLast7Days] = await Promise.all([
      prisma.aiUsageLog.count({ where: { creatorId: DEFAULT_CREATOR_ID, createdAt: { gte: startToday } } }),
      prisma.aiUsageLog.count({ where: { creatorId: DEFAULT_CREATOR_ID, createdAt: { gte: startLast7 } } }),
    ]);

    const [creditsTodayAgg, creditsLast7Agg] = await Promise.all([
      prisma.aiUsageLog.aggregate({
        _sum: { creditsUsed: true },
        where: { creatorId: DEFAULT_CREATOR_ID, createdAt: { gte: startToday } },
      }),
      prisma.aiUsageLog.aggregate({
        _sum: { creditsUsed: true },
        where: { creatorId: DEFAULT_CREATOR_ID, createdAt: { gte: startLast7 } },
      }),
    ]);

    const creditsToday = creditsTodayAgg._sum.creditsUsed ?? 0;
    const creditsLast7Days = creditsLast7Agg._sum.creditsUsed ?? 0;

    const [logsToday, logsLast7] = await Promise.all([
      prisma.aiUsageLog.findMany({
        where: { creatorId: DEFAULT_CREATOR_ID, createdAt: { gte: startToday } },
        select: { actionType: true },
      }),
      prisma.aiUsageLog.findMany({
        where: { creatorId: DEFAULT_CREATOR_ID, createdAt: { gte: startLast7 } },
        select: { actionType: true },
      }),
    ]);

    const byActionTypeToday = aggregateByAction(logsToday);
    const byActionTypeLast7Days = aggregateByAction(logsLast7);

    const recentLogs = await prisma.aiUsageLog.findMany({
      where: { creatorId: DEFAULT_CREATOR_ID, createdAt: { gte: startLast30 } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        id: true,
        createdAt: true,
        fanId: true,
        actionType: true,
        creditsUsed: true,
        suggestedText: true,
        outcome: true,
        turnMode: true,
      },
    });

    const recentLogsNormalized = recentLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : (log.createdAt as any),
    }));

    const dailyUsage = buildDailyUsageFromLogs(recentLogsNormalized, 30).map((d) => ({
      date: d.date,
      count: d.suggestionsCount,
    }));
    console.log("DAILY_USAGE_DEBUG", dailyUsage.slice(-5));

    const settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId: DEFAULT_CREATOR_ID },
      select: {
        creditsAvailable: true,
        hardLimitPerDay: true,
      },
    });

    return res.status(200).json({
      summary: {
        totalToday,
        totalLast7Days,
        creditsToday,
        creditsLast7Days,
        byActionTypeToday,
        byActionTypeLast7Days,
      },
      settings: settings ?? null,
      recentLogs,
      dailyUsage,
    });
  } catch (err) {
    console.error("Error building AI usage summary", err);
    return res.status(200).json({
      summary: {
        totalToday: 0,
        totalLast7Days: 0,
        creditsToday: 0,
        creditsLast7Days: 0,
        byActionTypeToday: [] as ActionCount[],
        byActionTypeLast7Days: [] as ActionCount[],
      },
      settings: null,
      recentLogs: [],
      dailyUsage: [] as { date: string; count: number }[],
    });
  }
}

function aggregateByAction(logs: { actionType: string | null }[]): ActionCount[] {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (!log.actionType) continue;
    const current = counts.get(log.actionType) ?? 0;
    counts.set(log.actionType, current + 1);
  }
  return Array.from(counts.entries()).map(([actionType, count]) => ({ actionType, count }));
}
