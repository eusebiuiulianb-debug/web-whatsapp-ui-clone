import prisma from "../../prisma.server";
import { getCreatorBusinessSnapshot } from "../../creatorManager";
import { getCreatorContentSnapshot } from "../../creatorContentManager";
import { buildCreatorAiContext } from "../../../server/manager/managerService";
import { createDefaultCreatorPlatforms } from "../../creatorPlatforms";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function buildManagerContext(creatorId: string) {
  const [settings, usageAgg, businessSnapshot, contentSnapshot, creator, advisorContext] = await Promise.all([
    prisma.creatorAiSettings.upsert({
      where: { creatorId },
      update: {},
      create: { creatorId, platforms: createDefaultCreatorPlatforms() },
    }),
    prisma.aiUsageLog.aggregate({
      _sum: { creditsUsed: true },
      where: { creatorId, createdAt: { gte: startOfToday() } },
    }),
    getCreatorBusinessSnapshot(creatorId, { prismaClient: prisma }),
    getCreatorContentSnapshot(creatorId),
    prisma.creator.findUnique({ where: { id: creatorId } }),
    buildCreatorAiContext(creatorId, prisma).catch(() => null),
  ]);

  const creditsUsedToday = usageAgg._sum.creditsUsed ?? 0;
  const prioritizedFans = businessSnapshot?.prioritizedFansToday ?? [];

  const fansSummary = {
    prioritizedToday: prioritizedFans,
    topVip: prioritizedFans.filter((fan) => fan.segment === "VIP").slice(0, 5),
    topAtRisk: prioritizedFans.filter((fan) => fan.segment === "RIESGO").slice(0, 5),
    topNew: prioritizedFans.filter((fan) => fan.segment === "NUEVO").slice(0, 5),
  };

  const packs = (contentSnapshot?.packs ?? []).map((pack) => ({
    id: pack.id,
    name: pack.name,
    type: pack.type,
    price: pack.price ?? null,
  }));

  const bioLink = {
    enabled: Boolean(creator?.bioLinkEnabled),
    title: creator?.bioLinkTitle ?? creator?.name ?? "",
    tagline: creator?.bioLinkTagline ?? creator?.subtitle ?? "",
    tiktok: { last7dTopVideos: [] as any[] },
    youtube: { last28dTopVideos: [] as any[] },
  };

  return {
    settings,
    creditsToday: {
      used: creditsUsedToday,
      limit: settings.hardLimitPerDay ?? null,
      available: settings.creditsAvailable,
    },
    fansSummary,
    packs,
    bioLink,
    businessSnapshot,
    contentSnapshot,
    advisorContext,
  };
}
