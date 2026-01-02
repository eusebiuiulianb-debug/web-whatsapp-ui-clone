import type { PrismaClient } from "@prisma/client";
import prisma from "./prisma.server";

export type AccessStatePayload = {
  hasActiveAccess: boolean;
  accessState: "ACTIVE" | "EXPIRED" | "NONE";
  accessType: string | null;
  accessLabel: string;
  membershipStatus: string | null;
  daysLeft: number | null;
  activeGrantTypes: string[];
  hasAccessHistory: boolean;
  lastGrantType: string | null;
};

type AccessGrantLike = {
  type: string;
  createdAt: Date;
  expiresAt: Date;
};

function mapAccessLabel({
  type,
  state,
  isNew,
}: {
  type?: string | null;
  state: "ACTIVE" | "EXPIRED" | "NONE";
  isNew?: boolean;
}) {
  if (state === "EXPIRED") return "Caducado";
  if (state === "NONE") return isNew ? "Nuevo" : "Sin acceso";
  const lower = (type || "").toLowerCase();
  if (lower === "trial" || lower === "welcome") return "Prueba 7 días";
  if (lower === "special" || lower === "single") return "Pack especial";
  if (lower === "monthly") return "Suscripción mensual";
  return type || "Acceso activo";
}

export function buildAccessStateFromGrants({
  accessGrants,
  isNew = false,
  now = new Date(),
}: {
  accessGrants: AccessGrantLike[];
  isNew?: boolean;
  now?: Date;
}): AccessStatePayload {
  const grants = accessGrants ?? [];
  const activeGrants = grants.filter((grant) => grant.expiresAt > now);
  const activeGrant =
    activeGrants.length > 0
      ? activeGrants.reduce<AccessGrantLike | null>((latest, grant) => {
          if (!latest) return grant;
          return grant.expiresAt > latest.expiresAt ? grant : latest;
        }, null)
      : null;
  const lastGrant =
    grants.length > 0
      ? grants.reduce<AccessGrantLike | null>((latest, grant) => {
          if (!latest) return grant;
          return grant.expiresAt > latest.expiresAt ? grant : latest;
        }, null)
      : null;
  const lastGrantType = lastGrant?.type ?? null;
  const hasAccessHistory = grants.length > 0;
  const activeGrantTypes = activeGrants.map((grant) => grant.type);
  const hasActiveAccess = Boolean(activeGrant);
  const accessState: "ACTIVE" | "EXPIRED" | "NONE" = hasActiveAccess
    ? "ACTIVE"
    : hasAccessHistory
    ? "EXPIRED"
    : "NONE";
  const accessType = activeGrant?.type ?? lastGrantType ?? null;

  const latestExpiry = activeGrants.reduce<Date | null>((acc, grant) => {
    if (!acc) return grant.expiresAt;
    return grant.expiresAt > acc ? grant.expiresAt : acc;
  }, null);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = latestExpiry
    ? Math.max(0, Math.ceil((latestExpiry.getTime() - now.getTime()) / msPerDay))
    : hasAccessHistory
    ? 0
    : null;

  let membershipStatus: string | null = null;
  if (accessState === "ACTIVE") {
    membershipStatus = (accessType || "active").toLowerCase();
  } else if (accessState === "EXPIRED") {
    membershipStatus = "expired";
  } else {
    membershipStatus = "none";
  }

  const accessLabel = mapAccessLabel({ type: accessType, state: accessState, isNew });

  return {
    hasActiveAccess,
    accessState,
    accessType,
    accessLabel,
    membershipStatus,
    daysLeft,
    activeGrantTypes,
    hasAccessHistory,
    lastGrantType,
  };
}

export async function getAccessState(
  fanId: string,
  creatorId?: string,
  prismaClient?: PrismaClient
): Promise<AccessStatePayload | null> {
  const client = prismaClient ?? prisma;
  const fan = await client.fan.findUnique({
    where: { id: fanId },
    include: { accessGrants: true },
  });
  if (!fan || (creatorId && fan.creatorId !== creatorId)) return null;
  return buildAccessStateFromGrants({
    accessGrants: fan.accessGrants,
    isNew: fan.isNew ?? false,
    now: new Date(),
  });
}
