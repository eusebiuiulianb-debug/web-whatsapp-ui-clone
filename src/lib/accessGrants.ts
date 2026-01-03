import type { PrismaClient } from "@prisma/client";
import { PACKS } from "../config/packs";
import prisma from "./prisma.server";

export const GRANT_TYPES = ["trial", "monthly", "special"] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const GRANT_DURATIONS: Record<GrantType, number> = {
  trial: PACKS.trial.durationDays,
  monthly: PACKS.monthly.durationDays,
  special: PACKS.special.durationDays,
};

export function isGrantType(value: unknown): value is GrantType {
  return typeof value === "string" && GRANT_TYPES.includes(value as GrantType);
}

export function getExpiresAtForGrantType(type: GrantType, from: Date = new Date()): Date {
  const durationDays = GRANT_DURATIONS[type] ?? 0;
  return new Date(from.getTime() + durationDays * MS_PER_DAY);
}

export async function upsertAccessGrant({
  fanId,
  type,
  prismaClient,
  now,
  extendIfActive = false,
}: {
  fanId: string;
  type: GrantType;
  prismaClient?: Pick<PrismaClient, "accessGrant">;
  now?: Date;
  extendIfActive?: boolean;
}) {
  const client = prismaClient ?? prisma;
  const current = now ?? new Date();
  const durationMs = (GRANT_DURATIONS[type] ?? 0) * MS_PER_DAY;

  if (extendIfActive) {
    const activeGrant = await client.accessGrant.findFirst({
      where: { fanId, type, expiresAt: { gt: current } },
      orderBy: { expiresAt: "desc" },
    });
    if (activeGrant) {
      const nextExpiresAt = new Date(activeGrant.expiresAt.getTime() + durationMs);
      return client.accessGrant.update({
        where: { id: activeGrant.id },
        data: { expiresAt: nextExpiresAt },
      });
    }
  } else {
    await client.accessGrant.deleteMany({ where: { fanId, type } });
  }

  const expiresAt = new Date(current.getTime() + durationMs);
  return client.accessGrant.create({
    data: { fanId, type, expiresAt },
  });
}
