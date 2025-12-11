import prisma from "./prisma";
import { AiUsageOrigin, AiUsageType, type AiTurnMode as PrismaAiTurnMode } from "@prisma/client";
import type { AiTurnMode } from "./aiSettings";
import { normalizeAiTurnMode } from "./aiSettings";

type AiUsageLogLite = {
  createdAt: string;
};

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

export function buildDailyUsageFromLogs(
  logs: AiUsageLogLite[],
  days: number = 30
): { date: string; label: string; suggestionsCount: number }[] {
  if (!Array.isArray(logs)) return [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - (days - 1));
  const counts: Record<string, number> = {};
  logs.forEach((log) => {
    const d = new Date(log.createdAt);
    if (Number.isNaN(d.getTime())) return;
    if (d < startDate || d > now) return;
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  });

  const result: { date: string; label: string; suggestionsCount: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = counts[key] || 0;
    const label = d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    result.push({ date: key, label, suggestionsCount: count });
  }
  return result;
}
