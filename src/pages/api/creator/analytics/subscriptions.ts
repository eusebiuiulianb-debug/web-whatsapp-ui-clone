import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { PACKS } from "../../../../config/packs";
import { daysAgoInTimeZone } from "../../../../lib/timezone";

type SubscriptionsRange = "7d" | "30d" | "90d";
type SubscriptionStatus = "ACTIVE" | "EXPIRED";

type SubscriptionEntry = {
  fan: { id: string; name: string | null };
  planTitle: string;
  status: SubscriptionStatus;
  startedAt: string;
  endsAt: string;
  amountMonthly: number;
};

function normalizeRange(value: unknown): SubscriptionsRange | null {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return null;
}

function getRangeStart(range: SubscriptionsRange): Date {
  if (range === "30d") return daysAgoInTimeZone(30);
  if (range === "90d") return daysAgoInTimeZone(90);
  return daysAgoInTimeZone(7);
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

function getGrantTitle(type: string): string {
  if (type === "monthly") return PACKS.monthly.name;
  if (type === "special") return PACKS.special.name;
  if (type === "trial") return PACKS.trial.name;
  return "Pack";
}

function resolveFanName(fan?: { displayName?: string | null; name?: string | null }): string | null {
  const value = fan?.displayName?.trim() || fan?.name?.trim();
  return value || null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubscriptionEntry[] | { error: string }>
) {
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
    const grants = await prisma.accessGrant.findMany({
      where: {
        fan: { creatorId },
        OR: [{ createdAt: { gte: from } }, { expiresAt: { gte: now } }],
      },
      select: {
        id: true,
        fanId: true,
        type: true,
        createdAt: true,
        expiresAt: true,
        fan: { select: { displayName: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const entries: SubscriptionEntry[] = [];
    for (const grant of grants) {
      const grantType = normalizeGrantType(grant.type);
      const amount = getGrantAmount(grantType);
      if (amount <= 0) continue;
      entries.push({
        fan: { id: grant.fanId, name: resolveFanName(grant.fan) },
        planTitle: getGrantTitle(grantType),
        status: grant.expiresAt > now ? "ACTIVE" : "EXPIRED",
        startedAt: grant.createdAt.toISOString(),
        endsAt: grant.expiresAt.toISOString(),
        amountMonthly: amount,
      });
    }

    return res.status(200).json(entries);
  } catch (error) {
    console.error("Error loading subscriptions analytics", error);
    return sendServerError(res, "Failed to load subscriptions");
  }
}
