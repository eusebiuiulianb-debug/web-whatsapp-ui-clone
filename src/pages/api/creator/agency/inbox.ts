import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { computeAgencyPriorityScore } from "../../../../lib/agency/priorityScore";
import type { AgencyIntensity, AgencyStage } from "../../../../lib/agency/types";
import { resolveObjectiveForScoring } from "../../../../lib/agency/objectives";
import { buildAccessStateFromGrants } from "../../../../lib/accessState";
import { isNewWithinDays } from "../../../../lib/fanNewness";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";

type AgencyInboxItem = {
  fanId: string;
  displayName: string;
  stage: AgencyStage;
  objectiveCode: string;
  intensity: AgencyIntensity;
  priorityScore: number;
  lastIncomingAt: string | null;
  spent7d: number;
  spent30d: number;
  tags: string[];
};

type AgencyInboxResponse = { ok: true; items: AgencyInboxItem[] } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<AgencyInboxResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const fans = await prisma.fan.findMany({
      where: { creatorId, isArchived: false, isBlocked: false },
      select: {
        id: true,
        name: true,
        displayName: true,
        segment: true,
        riskLevel: true,
        isNew: true,
        inviteCreatedAt: true,
        inviteUsedAt: true,
        lastMessageAt: true,
        lastCreatorMessageAt: true,
        accessGrants: { select: { expiresAt: true, type: true, createdAt: true } },
      },
    });

    const fanIds = fans.map((fan) => fan.id);
  const metaByFan = new Map<
    string,
      { stage: AgencyStage; objectiveCode: string; intensity: AgencyIntensity }
    >();
    const purchasesByFan = new Map<string, Array<{ amount: number | null; createdAt: Date }>>();

    if (fanIds.length > 0) {
      const [metas, purchases] = await Promise.all([
        prisma.chatAgencyMeta.findMany({
          where: { creatorId, fanId: { in: fanIds } },
          select: { fanId: true, stage: true, objectiveCode: true, intensity: true },
        }),
        prisma.extraPurchase.findMany({
          where: { fanId: { in: fanIds }, amount: { gt: 0 }, isArchived: false },
          select: { fanId: true, amount: true, createdAt: true },
        }),
      ]);

      metas.forEach((meta) => {
        metaByFan.set(meta.fanId, {
          stage: meta.stage,
          objectiveCode: meta.objectiveCode,
          intensity: meta.intensity,
        });
      });

      purchases.forEach((purchase) => {
        const list = purchasesByFan.get(purchase.fanId) ?? [];
        list.push({ amount: purchase.amount, createdAt: purchase.createdAt });
        purchasesByFan.set(purchase.fanId, list);
      });
    }

    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const items: AgencyInboxItem[] = fans.map((fan) => {
      const meta = metaByFan.get(fan.id);
      const stage = (meta?.stage ?? "NEW") as AgencyStage;
      const objectiveCode = meta?.objectiveCode ?? "CONNECT";
      const intensity = (meta?.intensity ?? "MEDIUM") as AgencyIntensity;
      const purchases = purchasesByFan.get(fan.id) ?? [];
      const spent7d = sumPurchasesSince(purchases, since7d);
      const spent30d = sumPurchasesSince(purchases, since30d);
      const segmentLabel = (fan.segment ?? "").toUpperCase();
      const riskValue = (fan.riskLevel ?? "LOW").toUpperCase();
      const accessSnapshot = buildAccessStateFromGrants({
        accessGrants: fan.accessGrants,
        isNew: fan.isNew ?? false,
        now,
      });
      const isNew30d = isNewWithinDays(
        { id: fan.id, inviteCreatedAt: fan.inviteCreatedAt, inviteUsedAt: fan.inviteUsedAt },
        30,
        now
      );
      const priorityScore = computeAgencyPriorityScore({
        lastIncomingAt: fan.lastMessageAt,
        lastOutgoingAt: fan.lastCreatorMessageAt,
        spent7d,
        spent30d,
        stage,
        objective: resolveObjectiveForScoring(objectiveCode),
        intensity,
        flags: {
          vip: segmentLabel === "VIP" || spent30d >= 200,
          expired: accessSnapshot.accessState === "EXPIRED",
          atRisk: segmentLabel === "EN_RIESGO" || riskValue !== "LOW",
          isNew: isNew30d,
        },
      });

      const tags: string[] = [];
      if (segmentLabel === "VIP") tags.push("vip");
      if (segmentLabel === "EN_RIESGO" || riskValue !== "LOW") tags.push("en_riesgo");
      if (accessSnapshot.accessState === "EXPIRED") tags.push("caducado");
      if (isNew30d) tags.push("nuevo");

      return {
        fanId: fan.id,
        displayName: fan.displayName ?? fan.name,
        stage,
        objectiveCode,
        intensity,
        priorityScore,
        lastIncomingAt: fan.lastMessageAt ? fan.lastMessageAt.toISOString() : null,
        spent7d,
        spent30d,
        tags,
      };
    });

    items.sort((a, b) => b.priorityScore - a.priorityScore);
    return res.status(200).json({ ok: true, items });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error loading agency inbox", error);
    return res.status(500).json({ ok: false, error: "Failed to load agency inbox" });
  }
}

function sumPurchasesSince(purchases: Array<{ amount: number | null; createdAt: Date }>, since: Date): number {
  return purchases.reduce((sum, purchase) => {
    if (purchase.createdAt < since) return sum;
    return sum + (purchase.amount ?? 0);
  }, 0);
}

async function resolveCreatorId(): Promise<string> {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const defaultCreator = await prisma.creator.findUnique({
    where: { id: "creator-1" },
    select: { id: true },
  });
  if (defaultCreator?.id) return defaultCreator.id;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("Creator not found");
  }
  return creator.id;
}
