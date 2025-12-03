import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma";
import { sendServerError } from "../../../lib/apiError";
import type { ExtrasSummary } from "../../../types/extras";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse<ExtrasSummary | { error: string }>) {
  if (_req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const todayStart = startOfToday();
  const weekStart = daysAgo(7);

  try {
    const [todayAgg, last7Agg] = await Promise.all([
      prisma.extraPurchase.aggregate({
        where: { createdAt: { gte: todayStart } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.extraPurchase.aggregate({
        where: { createdAt: { gte: weekStart } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const summary: ExtrasSummary = {
      today: {
        count: todayAgg._count?._all ?? 0,
        amount: todayAgg._sum?.amount ?? 0,
      },
      last7Days: {
        count: last7Agg._count?._all ?? 0,
        amount: last7Agg._sum?.amount ?? 0,
      },
    };

    return res.status(200).json(summary);
  } catch (error) {
    console.error("Error calculating extras summary", error);
    return sendServerError(res, "Failed to load extras summary");
  }
}
