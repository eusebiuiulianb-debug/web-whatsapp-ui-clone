import prisma from "./prisma";

export async function logAiUsage(params: {
  creatorId: string;
  fanId?: string;
  actionType: string;
  contextSummary?: string;
  suggestedText: string;
  outcome: "accepted" | "edited" | "rejected" | "suggested";
  finalText?: string;
  creditsUsed?: number;
}) {
  const {
    creatorId,
    fanId,
    actionType,
    contextSummary,
    suggestedText,
    outcome,
    finalText,
    creditsUsed = 1,
  } = params;

  const settings =
    (await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
    })) ||
    (await prisma.creatorAiSettings.create({
      data: { creatorId },
    }));

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const usageToday = await prisma.aiUsageLog.aggregate({
    _sum: { creditsUsed: true },
    where: { creatorId, createdAt: { gte: startOfToday } },
  });
  const creditsToday = usageToday._sum.creditsUsed ?? 0;

  if (settings.hardLimitPerDay !== null && settings.hardLimitPerDay !== undefined) {
    if (creditsToday + creditsUsed > settings.hardLimitPerDay) {
      throw new Error("AI_HARD_LIMIT_REACHED");
    }
  }

  if (settings.creditsAvailable < creditsUsed) {
    throw new Error("AI_NO_CREDITS_LEFT");
  }

  await prisma.creatorAiSettings.update({
    where: { id: settings.id },
    data: { creditsAvailable: settings.creditsAvailable - creditsUsed },
  });

  return prisma.aiUsageLog.create({
    data: {
      creatorId,
      fanId,
      actionType,
      contextSummary,
      suggestedText,
      outcome,
      finalText,
      creditsUsed,
    },
  });
}
