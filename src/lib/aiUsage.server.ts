import { AiUsageOrigin, AiUsageType, type AiTurnMode as PrismaAiTurnMode } from "@prisma/client";
import prisma from "./prisma.server";
import type { AiTurnMode } from "./aiSettings";
import { normalizeAiTurnMode } from "./aiSettings";
import { createDefaultCreatorPlatforms } from "./creatorPlatforms";

export async function logAiUsage(params: {
  creatorId: string;
  fanId?: string;
  actionType: string;
  contextSummary?: string;
  suggestedText: string;
  outcome: "accepted" | "edited" | "rejected" | "suggested";
  finalText?: string;
  creditsUsed?: number;
  turnMode?: AiTurnMode | null;
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
    turnMode,
  } = params;

  const settings =
    (await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
    })) ||
    (await prisma.creatorAiSettings.create({
      data: { creatorId, platforms: createDefaultCreatorPlatforms() },
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

  const modeToUse: AiTurnMode = normalizeAiTurnMode(
    (turnMode as PrismaAiTurnMode | string | null) ?? (settings.turnMode as PrismaAiTurnMode | string | null) ?? "auto"
  );

  await prisma.creatorAiSettings.update({
    where: { id: settings.id },
    data: { creditsAvailable: settings.creditsAvailable - creditsUsed },
  });

  return prisma.aiUsageLog.create({
    data: {
      creatorId,
      fanId,
      type: AiUsageType.FAN_ASSISTANT,
      origin: AiUsageOrigin.FAN_ASSISTANT,
      actionType,
      contextSummary,
      suggestedText,
      outcome,
      finalText,
      creditsUsed,
      turnMode: modeToUse as any,
    },
  });
}

export async function logCortexLlmUsage(params: {
  creatorId: string;
  fanId?: string | null;
  endpoint: string;
  provider: string;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  ok: boolean;
  errorCode?: string | null;
  actionType?: string | null;
  context?: Record<string, unknown> | null;
}) {
  const {
    creatorId,
    fanId,
    endpoint,
    provider,
    model,
    tokensIn,
    tokensOut,
    latencyMs,
    ok,
    errorCode,
    actionType,
    context,
  } = params;

  return prisma.aiUsageLog.create({
    data: {
      creatorId,
      fanId: fanId ?? undefined,
      type: AiUsageType.MANAGER,
      origin: AiUsageOrigin.MANAGER_STRATEGY,
      creditsUsed: 0,
      endpoint,
      provider,
      model: model ?? null,
      tokensIn: tokensIn ?? null,
      tokensOut: tokensOut ?? null,
      latencyMs: latencyMs ?? null,
      ok,
      errorCode: errorCode ?? null,
      actionType: actionType ?? undefined,
      context: context ?? undefined,
    },
  });
}
