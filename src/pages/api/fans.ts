import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma";

function parseMessageTimestamp(messageId: string): Date | null {
  const parts = messageId.split("-");
  const last = parts[parts.length - 1];
  const ts = Number(last);
  if (Number.isFinite(ts) && last.length >= 10) {
    return new Date(ts);
  }
  return null;
}

function getGrantAmount(type: string) {
  if (type === "monthly") return 25;
  if (type === "special") return 49;
  return 0;
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const fans = await prisma.fan.findMany({
      include: {
        accessGrants: true,
        messages: {
          where: { from: "creator" },
          select: { id: true, time: true },
        },
        _count: { select: { notes: true } },
      },
    });

    const now = new Date();

    const mappedFans = fans.map((fan) => {
      // Estrategia: AccessGrant activo con expiración más lejana; si empata, el más reciente por createdAt
      const activeGrant = fan.accessGrants
        .filter((grant) => grant.expiresAt >= now)
        .sort(
          (a, b) =>
            b.expiresAt.getTime() - a.expiresAt.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime()
        )[0];
      const activeGrantTypes = fan.accessGrants
        .filter((grant) => grant.expiresAt >= now)
        .map((grant) => grant.type);

      let membershipStatus = fan.membershipStatus || "";
      let daysLeft = fan.daysLeft ?? 0;

      if (activeGrant) {
        const mapTypeToStatus: Record<string, string> = {
          trial: "Prueba 7 días",
          monthly: "Suscripción mensual",
          special: "Contenido individual",
          single: "Contenido individual",
        };
        membershipStatus = mapTypeToStatus[activeGrant.type] || fan.membershipStatus || "";

        const diffMs = activeGrant.expiresAt.getTime() - now.getTime();
        const msPerDay = 1000 * 60 * 60 * 24;
        const diffDays = Math.ceil(diffMs / msPerDay);
        daysLeft = diffDays > 0 ? diffDays : 0;
      }

      const paidGrants = fan.accessGrants.filter((grant) => grant.type === "monthly" || grant.type === "special");
      const paidGrantsCount = paidGrants.length;
      const lifetimeValue = fan.accessGrants.reduce((acc, grant) => acc + getGrantAmount(grant.type), 0);
      let customerTier: "new" | "regular" | "priority";
      if ((lifetimeValue ?? 0) === 0) {
        customerTier = "new";
      } else if ((lifetimeValue ?? 0) >= 75 || paidGrantsCount >= 3) {
        customerTier = "priority";
      } else {
        customerTier = "regular";
      }

      const lastCreatorMessage = fan.messages
        .map((msg) => parseMessageTimestamp(msg.id))
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        id: fan.id,
        name: fan.name,
        avatar: fan.avatar || "",
        preview: fan.preview || "",
        time: fan.time || "",
        unreadCount: fan.unreadCount ?? 0,
        isNew: fan.isNew ?? false,
        membershipStatus,
        daysLeft,
        lastSeen: fan.lastSeen || "",
        notesCount: fan._count?.notes ?? 0,
        lastCreatorMessageAt: lastCreatorMessage ? lastCreatorMessage.toISOString() : null,
        paidGrantsCount,
        lifetimeValue,
        customerTier,
        nextAction: fan.nextAction || null,
        activeGrantTypes,
      };
    });

    return res.status(200).json({ fans: mappedFans });
  } catch (error) {
    console.error("Error loading fans data", error);
    return res.status(500).json({ error: "Error loading fans data" });
  }
}
