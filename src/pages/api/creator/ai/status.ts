import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { normalizeAiTurnMode } from "../../../../lib/aiSettings";
import { createDefaultCreatorPlatforms } from "../../../../lib/creatorPlatforms";
import { getTranslateConfig } from "../../../../lib/ai/translateProvider";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const creatorId = "creator-1";

    const settings =
      (await prisma.creatorAiSettings.findUnique({ where: { creatorId } })) ||
      (await prisma.creatorAiSettings.create({ data: { creatorId, platforms: createDefaultCreatorPlatforms() } }));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const usageToday = await prisma.aiUsageLog.aggregate({
      _sum: { creditsUsed: true },
      where: { creatorId, createdAt: { gte: startOfToday } },
    });

    const usedToday = usageToday._sum.creditsUsed ?? 0;
    const hardLimitPerDay = settings.hardLimitPerDay;
    const remainingToday =
      hardLimitPerDay === null || hardLimitPerDay === undefined
        ? null
        : Math.max(0, hardLimitPerDay - usedToday);
    const limitReached =
      (typeof hardLimitPerDay === "number" && hardLimitPerDay >= 0 && usedToday >= hardLimitPerDay) ||
      settings.creditsAvailable <= 0;

    const translateConfig = await getTranslateConfig(creatorId);

    return res.status(200).json({
      creditsAvailable: settings.creditsAvailable,
      hardLimitPerDay,
      usedToday,
      remainingToday,
      limitReached,
      turnMode: normalizeAiTurnMode(settings.turnMode as string | null | undefined),
      translateConfigured: translateConfig.configured,
      translateProvider: translateConfig.provider,
      translateMissingVars: translateConfig.missingVars,
      creatorLang: translateConfig.creatorLang,
    });
  } catch (err) {
    console.error("Error fetching AI status", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
