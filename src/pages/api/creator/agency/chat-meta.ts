import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { computeAgencyPriorityScore } from "../../../../lib/agency/priorityScore";
import {
  normalizeAgencyIntensity,
  normalizeAgencyObjective,
  normalizeAgencyStage,
  type AgencyIntensity,
  type AgencyObjective,
  type AgencyStage,
} from "../../../../lib/agency/types";
import { buildAccessStateFromGrants } from "../../../../lib/accessState";
import { isNewWithinDays } from "../../../../lib/fanNewness";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";
import { buildFanManagerSummary } from "../../../../server/manager/managerService";

type ChatAgencyMetaPayload = {
  id: string;
  creatorId: string;
  fanId: string;
  stage: AgencyStage;
  objective: AgencyObjective;
  intensity: AgencyIntensity;
  nextAction: string | null;
  notes: string | null;
  recommendedOfferId: string | null;
  lastTouchAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatMetaResponse =
  | {
      ok: true;
      meta: ChatAgencyMetaPayload;
      priorityScore: number;
      summary: { profile: string; recent: string; opportunity: string } | null;
    }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ChatMetaResponse>) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "PUT") {
    return handlePut(req, res);
  }
  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<ChatMetaResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const fanId = typeof req.query?.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const fan = await loadFanForPriority(creatorId, fanId);
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const meta = await prisma.chatAgencyMeta.upsert({
      where: { creatorId_fanId: { creatorId, fanId } },
      update: {},
      create: { creatorId, fanId },
    });

    const hydratedMeta = await ensureRecommendedOffer(creatorId, meta);
    const { priorityScore, summary } = await buildPriorityAndSummary({ creatorId, fan, meta: hydratedMeta });
    return res.status(200).json({
      ok: true,
      meta: serializeMeta(hydratedMeta),
      priorityScore,
      summary,
    });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error loading chat agency meta", error);
    return res.status(500).json({ ok: false, error: "Failed to load chat meta" });
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse<ChatMetaResponse>) {
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const fanId = typeof body.fanId === "string" ? body.fanId.trim() : "";
  if (!fanId) {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  const stageInput = normalizeAgencyStage(body.stage);
  if (Object.prototype.hasOwnProperty.call(body, "stage") && !stageInput) {
    return res.status(400).json({ ok: false, error: "Invalid stage" });
  }
  const objectiveInput = normalizeAgencyObjective(body.objective);
  if (Object.prototype.hasOwnProperty.call(body, "objective") && !objectiveInput) {
    return res.status(400).json({ ok: false, error: "Invalid objective" });
  }
  const intensityInput = normalizeAgencyIntensity(body.intensity);
  if (Object.prototype.hasOwnProperty.call(body, "intensity") && !intensityInput) {
    return res.status(400).json({ ok: false, error: "Invalid intensity" });
  }

  const nextAction = normalizeOptionalString(body.nextAction, 120);
  const notes = normalizeOptionalString(body.notes, 600);
  const recommendedOfferId = normalizeOptionalString(body.recommendedOfferId, 120);

  try {
    const creatorId = await resolveCreatorId();
    const fan = await loadFanForPriority(creatorId, fanId);
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const data: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "stage")) data.stage = stageInput;
    if (Object.prototype.hasOwnProperty.call(body, "objective")) data.objective = objectiveInput;
    if (Object.prototype.hasOwnProperty.call(body, "intensity")) data.intensity = intensityInput;
    if (Object.prototype.hasOwnProperty.call(body, "nextAction")) data.nextAction = nextAction;
    if (Object.prototype.hasOwnProperty.call(body, "notes")) data.notes = notes;
    const hasRecommendedOfferId = Object.prototype.hasOwnProperty.call(body, "recommendedOfferId");
    if (hasRecommendedOfferId) {
      if (recommendedOfferId) {
        const offer = await prisma.offer.findFirst({
          where: { id: recommendedOfferId, creatorId },
          select: { id: true },
        });
        if (!offer) {
          return res.status(400).json({ ok: false, error: "Invalid recommendedOfferId" });
        }
        data.recommendedOfferId = recommendedOfferId;
      } else {
        data.recommendedOfferId = null;
      }
    }

    const meta = await prisma.chatAgencyMeta.upsert({
      where: { creatorId_fanId: { creatorId, fanId } },
      update: data,
      create: {
        creatorId,
        fanId,
        stage: stageInput ?? undefined,
        objective: objectiveInput ?? undefined,
        intensity: intensityInput ?? undefined,
        nextAction,
        notes,
        recommendedOfferId: hasRecommendedOfferId ? recommendedOfferId : undefined,
      },
    });

    const hydratedMeta = await ensureRecommendedOffer(creatorId, meta);
    const { priorityScore, summary } = await buildPriorityAndSummary({ creatorId, fan, meta: hydratedMeta });
    return res.status(200).json({
      ok: true,
      meta: serializeMeta(hydratedMeta),
      priorityScore,
      summary,
    });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error updating chat agency meta", error);
    return res.status(500).json({ ok: false, error: "Failed to update chat meta" });
  }
}

function normalizeOptionalString(value: unknown, maxLen: number): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function serializeMeta(meta: {
  id: string;
  creatorId: string;
  fanId: string;
  stage: AgencyStage;
  objective: AgencyObjective;
  intensity: AgencyIntensity;
  nextAction: string | null;
  notes: string | null;
  recommendedOfferId: string | null;
  lastTouchAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ChatAgencyMetaPayload {
  return {
    id: meta.id,
    creatorId: meta.creatorId,
    fanId: meta.fanId,
    stage: meta.stage,
    objective: meta.objective,
    intensity: meta.intensity,
    nextAction: meta.nextAction ?? null,
    notes: meta.notes ?? null,
    recommendedOfferId: meta.recommendedOfferId ?? null,
    lastTouchAt: meta.lastTouchAt ? meta.lastTouchAt.toISOString() : null,
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
  };
}

const INTENSITY_RANK: Record<AgencyIntensity, number> = {
  SOFT: 0,
  MEDIUM: 1,
  INTENSE: 2,
};

const OFFER_TIER_RANK: Record<string, number> = {
  MICRO: 0,
  STANDARD: 1,
  PREMIUM: 2,
  MONTHLY: 3,
};

async function ensureRecommendedOffer(
  creatorId: string,
  meta: {
    id: string;
    stage: AgencyStage;
    intensity: AgencyIntensity;
    recommendedOfferId: string | null;
  }
) {
  if (meta.stage !== "OFFER" && meta.stage !== "CLOSE") {
    return meta;
  }
  const intensityRank = INTENSITY_RANK[meta.intensity] ?? 0;
  if (meta.recommendedOfferId) {
    const existing = await prisma.offer.findFirst({
      where: { id: meta.recommendedOfferId, creatorId, active: true },
      select: { id: true, intensityMin: true },
    });
    if (existing && (INTENSITY_RANK[existing.intensityMin] ?? 0) <= intensityRank) {
      return meta;
    }
  }

  const offers = await prisma.offer.findMany({
    where: { creatorId, active: true },
    select: { id: true, tier: true, intensityMin: true, createdAt: true },
  });
  const candidates = offers.filter(
    (offer) => (INTENSITY_RANK[offer.intensityMin] ?? 0) <= intensityRank
  );
  if (candidates.length === 0) {
    return meta;
  }

  const selected = candidates.sort((a, b) => {
    const tierDelta = (OFFER_TIER_RANK[String(b.tier)] ?? 0) - (OFFER_TIER_RANK[String(a.tier)] ?? 0);
    if (tierDelta !== 0) return tierDelta;
    const createdA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const createdB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return createdB - createdA;
  })[0];

  if (!selected || selected.id === meta.recommendedOfferId) {
    return meta;
  }

  const updated = await prisma.chatAgencyMeta.update({
    where: { id: meta.id },
    data: { recommendedOfferId: selected.id },
  });
  return updated;
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

async function loadFanForPriority(
  creatorId: string,
  fanId: string
): Promise<{
  id: string;
  creatorId: string;
  segment: string | null;
  riskLevel: string | null;
  isNew: boolean | null;
  inviteCreatedAt: Date | null;
  inviteUsedAt: Date | null;
  lastMessageAt: Date | null;
  lastCreatorMessageAt: Date | null;
  accessGrants: Array<{ expiresAt: Date; type: string }>;
} | null> {
  const fan = await prisma.fan.findUnique({
    where: { id: fanId },
    select: {
      id: true,
      creatorId: true,
      segment: true,
      riskLevel: true,
      isNew: true,
      inviteCreatedAt: true,
      inviteUsedAt: true,
      lastMessageAt: true,
      lastCreatorMessageAt: true,
      accessGrants: { select: { expiresAt: true, type: true } },
    },
  });
  if (!fan || fan.creatorId !== creatorId) return null;
  return fan;
}

async function buildPriorityAndSummary(args: {
  creatorId: string;
  fan: {
    id: string;
    segment: string | null;
    riskLevel: string | null;
    isNew: boolean | null;
    inviteCreatedAt: Date | null;
    inviteUsedAt: Date | null;
    lastMessageAt: Date | null;
    lastCreatorMessageAt: Date | null;
    accessGrants: Array<{ expiresAt: Date; type: string }>;
  };
  meta: {
    stage: AgencyStage;
    objective: AgencyObjective;
    intensity: AgencyIntensity;
  };
}) {
  const { creatorId, fan, meta } = args;
  const now = new Date();
  const purchases = await prisma.extraPurchase.findMany({
    where: { fanId: fan.id, amount: { gt: 0 }, isArchived: false },
    select: { amount: true, createdAt: true },
  });
  const spent7d = sumPurchasesSince(purchases, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const spent30d = sumPurchasesSince(purchases, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
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
    stage: meta.stage,
    objective: meta.objective,
    intensity: meta.intensity,
    flags: {
      vip: segmentLabel === "VIP" || spent30d >= 200,
      expired: accessSnapshot.accessState === "EXPIRED",
      atRisk: segmentLabel === "EN_RIESGO" || (riskValue && riskValue !== "LOW"),
      isNew: isNew30d,
    },
  });

  let summary: { profile: string; recent: string; opportunity: string } | null = null;
  try {
    const managerSummary = await buildFanManagerSummary(creatorId, fan.id, prisma);
    summary = managerSummary?.summary ?? null;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("agency meta summary unavailable", err);
    }
  }

  return { priorityScore, summary };
}

function sumPurchasesSince(purchases: Array<{ amount: number | null; createdAt: Date }>, since: Date): number {
  return purchases.reduce((sum, purchase) => {
    if (purchase.createdAt < since) return sum;
    return sum + (purchase.amount ?? 0);
  }, 0);
}
