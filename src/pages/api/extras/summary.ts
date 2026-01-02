import type { NextApiRequest, NextApiResponse } from "next";
import { sendServerError } from "../../../lib/apiError";
import { getCreatorRevenueSummary } from "../../../lib/analytics/revenue";
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
  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();

  try {
    const [todaySummary, last7Summary] = await Promise.all([
      getCreatorRevenueSummary({ creatorId, from: todayStart, to: now }),
      getCreatorRevenueSummary({ creatorId, from: weekStart, to: now }),
    ]);

    const summary: ExtrasSummary = {
      incomeToday: {
        count: todaySummary.counts.total,
        amount: todaySummary.totals.amount,
      },
      extrasToday: {
        count: todaySummary.extras.count,
        amount: todaySummary.extras.amount,
      },
      tipsToday: {
        count: todaySummary.tips.count,
        amount: todaySummary.tips.amount,
      },
      today: {
        count: todaySummary.extras.count,
        amount: todaySummary.extras.amount,
      },
      last7Days: {
        count: last7Summary.extras.count,
        amount: last7Summary.extras.amount,
      },
    };

    return res.status(200).json(summary);
  } catch (error) {
    console.error("Error calculating extras summary", error);
    return sendServerError(res, "Failed to load extras summary");
  }
}
