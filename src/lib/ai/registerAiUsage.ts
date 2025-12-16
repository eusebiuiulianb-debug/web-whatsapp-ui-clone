import type { AiUsageOrigin, AiUsageType } from "@prisma/client";
import prisma from "../prisma.server";
import { createDefaultCreatorPlatforms } from "../creatorPlatforms";

type RegisterAiUsageParams = {
  creatorId: string;
  fanId?: string | null;
  type: AiUsageType;
  origin: AiUsageOrigin;
  creditsUsed: number;
  context?: any;
};

/**
 * Registra un uso de IA y descuenta créditos disponibles del creador.
 * Permite que los créditos queden en negativo temporalmente si no hay saldo.
 */
export async function registerAiUsage(params: RegisterAiUsageParams) {
  const { creatorId, fanId, type, origin, creditsUsed, context } = params;
  const safeCredits = Number.isFinite(creditsUsed) ? Math.max(0, Math.round(creditsUsed)) : 0;

  const settings =
    (await prisma.creatorAiSettings.findUnique({ where: { creatorId } })) ??
    (await prisma.creatorAiSettings.create({ data: { creatorId, platforms: createDefaultCreatorPlatforms() } }));

  await prisma.aiUsageLog.create({
    data: {
      creatorId,
      fanId: fanId ?? undefined,
      type,
      origin,
      creditsUsed: safeCredits,
      context: context ?? undefined,
      turnMode: settings.turnMode,
    },
  });

  await prisma.creatorAiSettings.update({
    where: { id: settings.id },
    data: { creditsAvailable: settings.creditsAvailable - safeCredits },
  });
}
