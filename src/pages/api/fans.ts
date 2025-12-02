import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma";
import { getFollowUpTag } from "../../utils/followUp";

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
  if (type === "single") return 25;
  // trial y cualquier otro tipo se consideran sin coste para lifetimeSpend
  return 0;
}

function truncateSnippet(text: string | null | undefined, max = 80): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const fans = await prisma.fan.findMany({
      include: {
        accessGrants: true,
        notes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
        messages: {
          where: { from: "creator" },
          select: { id: true, time: true },
        },
        _count: { select: { notes: true } },
      },
    });

    const now = new Date();

    const mappedFans = fans.map((fan) => {
      // Grants con acceso vigente
      const activeGrants = fan.accessGrants.filter((grant) => grant.expiresAt > now);
      const hasAccessHistory = fan.accessGrants.length > 0;
      const activeGrantTypes = activeGrants.map((grant) => grant.type);

      // Usamos la expiración más lejana entre los grants activos para el contador de días
      const latestExpiry = activeGrants.reduce<Date | null>((acc, grant) => {
        if (!acc) return grant.expiresAt;
        return grant.expiresAt > acc ? grant.expiresAt : acc;
      }, null);

      const msPerDay = 1000 * 60 * 60 * 24;
      const daysLeft = latestExpiry
        ? Math.max(0, Math.ceil((latestExpiry.getTime() - now.getTime()) / msPerDay))
        : 0; // si no hay grants activos, devolvemos 0 para que el frontend pueda filtrar caducados

      let membershipStatus: "active" | "expired" | "none" = "none";
      if (activeGrants.length > 0) {
        membershipStatus = "active";
      } else if (hasAccessHistory) {
        membershipStatus = "expired";
      }

      const paidGrants = fan.accessGrants.filter((grant) => grant.type === "monthly" || grant.type === "special" || grant.type === "single");
      const paidGrantsCount = paidGrants.length;
      const lifetimeSpend = fan.accessGrants.reduce((acc, grant) => acc + getGrantAmount(grant.type), 0);
      // Tiers por gasto total acumulado: <50 nuevo, 50-199 habitual, >=200 vip (alta prioridad)
      let customerTier: "new" | "regular" | "vip";
      if (lifetimeSpend >= 200) {
        customerTier = "vip";
      } else if (lifetimeSpend >= 50) {
        customerTier = "regular";
      } else {
        customerTier = "new";
      }

      const followUpTag = getFollowUpTag(membershipStatus, daysLeft, activeGrantTypes);

      function computePriorityScore() {
        let urgencyScore = 0;
        const isExpiredToday = followUpTag === "expired" && (daysLeft ?? 0) === 0;
        switch (isExpiredToday ? "expired_today" : followUpTag) {
          case "trial_soon":
          case "monthly_soon":
            urgencyScore = 3;
            break;
          case "expired_today":
            urgencyScore = 2;
            break;
          default:
            urgencyScore = 0;
        }

        let tierScore = 0;
        if (customerTier === "vip") tierScore = 2;
        else if (customerTier === "regular") tierScore = 1;

        return urgencyScore * 10 + tierScore;
      }

      const priorityScore = computePriorityScore();

      const lastCreatorMessage = fan.messages
        .map((msg) => parseMessageTimestamp(msg.id))
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      const lastNoteSnippet = truncateSnippet(fan.notes?.[0]?.content);
      const nextActionSnippet = truncateSnippet(fan.nextAction);
      const lastNoteSummary = lastNoteSnippet;
      const nextActionSummary = nextActionSnippet;

      // Campos clave que consume el CRM:
      // - membershipStatus: "active" | "expired" | "none"
      // - daysLeft: días restantes derivados de expiresAt (nunca guardados en BD)
      // - followUpTag/urgencyLevel se calculan en el cliente con estos valores
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
        lifetimeValue: lifetimeSpend, // mantenemos compatibilidad pero usando el gasto total real
        lifetimeSpend,
        customerTier,
        nextAction: fan.nextAction || null,
        activeGrantTypes,
        hasAccessHistory,
        followUpTag,
        priorityScore,
        lastNoteSnippet,
        nextActionSnippet,
        lastNoteSummary,
        nextActionSummary,
      };
    });

    return res.status(200).json({ fans: mappedFans });
  } catch (error) {
    console.error("Error loading fans data", error);
    return res.status(500).json({ error: "Error loading fans data" });
  }
}
