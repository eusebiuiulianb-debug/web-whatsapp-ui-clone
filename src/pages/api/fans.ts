import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { getFollowUpTag, shouldFollowUpToday } from "../../utils/followUp";
import { sendBadRequest, sendServerError } from "../../lib/apiError";
import { HIGH_PRIORITY_LIMIT } from "../../config/customers";
import { getExtraLadderStatusForFan, type ExtraLadderStatus } from "../../lib/extraLadder";

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

const MAX_LIMIT = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { limit: limitParam, cursor, filter = "all", q } = req.query;
  const parsedLimit = Number(limitParam);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIMIT) : 30;
  if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
    return sendBadRequest(res, "limit must be a positive number");
  }

  const cursorId = typeof cursor === "string" ? cursor : undefined;
  const search = typeof q === "string" && q.trim().length > 0 ? q.trim() : null;

  try {
    const where: Prisma.FanWhereInput = {};

    if (filter === "notes") {
      where.notes = { some: {} };
    } else if (filter === "nextAction") {
      where.nextAction = { not: null, not: "" };
    } else if (filter === "new") {
      where.isNew = true;
    } else if (filter === "expired") {
      where.accessGrants = { some: { expiresAt: { lte: new Date() } } };
    }

    if (search) {
      where.OR = [
        ...(where.OR ?? []),
        { name: { contains: search } },
        { nextAction: { contains: search } },
        { notes: { some: { content: { contains: search } } } },
      ];
    }

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
      orderBy: { id: "asc" },
      take: limit + 1,
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
      where,
    });

    const now = new Date();

    const fanIds = fans.map((fan) => fan.id);
    const creatorId = fans[0]?.creatorId || "creator-1";
    type ExtraStats = { count: number; totalAmount: number; maxTier: string | null };
    const extrasByFan = new Map<string, ExtraStats>();

    if (fanIds.length > 0) {
      try {
        const extras = await prisma.extraPurchase.findMany({
          where: { fanId: { in: fanIds } },
          select: { fanId: true, amount: true, tier: true },
        });
        const tierPriority: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
        for (const purchase of extras) {
          const current = extrasByFan.get(purchase.fanId) ?? { count: 0, totalAmount: 0, maxTier: null };
          const nextCount = current.count + 1;
          const nextTotal = current.totalAmount + (purchase.amount ?? 0);
          const shouldUpdateTier =
            current.maxTier === null || (tierPriority[purchase.tier] ?? 0) > (tierPriority[current.maxTier] ?? 0);
          const nextTier = shouldUpdateTier ? purchase.tier : current.maxTier;
          extrasByFan.set(purchase.fanId, { count: nextCount, totalAmount: nextTotal, maxTier: nextTier });
        }
      } catch (err) {
        console.error("Error calculating extra metrics", err);
      }
    }

    const extrasCatalog = await prisma.contentItem.findMany({
      where: { creatorId, OR: [{ isExtra: true }, { visibility: "EXTRA" }] },
      select: { id: true, title: true, extraTier: true },
    });

    type LadderStatusResponse = (Omit<ExtraLadderStatus, "lastPurchaseAt"> & { lastPurchaseAt: string | null }) | null;
    const ladderByFan = new Map<string, LadderStatusResponse>();
    try {
      await Promise.all(
        fanIds.map(async (fid) => {
          const status = await getExtraLadderStatusForFan(prisma, creatorId, fid, extrasCatalog);
          const serialized =
            status && status.totalSpent > 0
              ? { ...status, lastPurchaseAt: status.lastPurchaseAt ? status.lastPurchaseAt.toISOString() : null }
              : null;
          ladderByFan.set(fid, serialized);
        })
      );
    } catch (err) {
      console.error("Error computing ladder status", err);
    }

    let mappedFans = fans.map((fan) => {
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
      const subscriptionSpend = fan.accessGrants.reduce((acc, grant) => acc + getGrantAmount(grant.type), 0);
      const extrasInfo = extrasByFan.get(fan.id) ?? { count: 0, totalAmount: 0, maxTier: null };
      const extrasTotal = extrasInfo.totalAmount ?? (extrasInfo as any).spent ?? 0;
      const totalSpend = subscriptionSpend + (extrasTotal ?? 0);
      // Tiers por gasto total acumulado: <50 nuevo, 50-199 habitual, >=200 vip (alta prioridad)
      let customerTier: "new" | "regular" | "vip";
      if (totalSpend >= 200) {
        customerTier = "vip";
      } else if (totalSpend >= 50) {
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
      const hasMonthly = activeGrantTypes.includes("monthly");
      const hasSpecial = activeGrantTypes.includes("special");
      const NOVSY_EXTRA_THRESHOLD = 30;
      const isNovsy = hasMonthly || hasSpecial || (extrasTotal ?? 0) >= NOVSY_EXTRA_THRESHOLD;
      const novsyStatus: "NOVSY" | null = isNovsy ? "NOVSY" : null;
      const isHighPriority = totalSpend >= HIGH_PRIORITY_LIMIT;

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
        lifetimeValue: totalSpend, // mantenemos compatibilidad pero usando el gasto total real
        lifetimeSpend: totalSpend,
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
        extrasCount: extrasInfo.count,
        extrasSpentTotal: extrasTotal,
        maxExtraTier: extrasInfo.maxTier,
        novsyStatus,
        isHighPriority,
        extraLadderStatus: ladderByFan.get(fan.id) ?? null,
      };
    });

    // Filtros adicionales que requieren cálculo (se aplican tras mapear)
    if (filter === "today") {
      mappedFans = mappedFans.filter((fan) =>
        shouldFollowUpToday({
          membershipStatus: fan.membershipStatus,
          daysLeft: fan.daysLeft,
          followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
        })
      );
    }

    if (filter === "followup") {
      mappedFans = mappedFans.filter((fan) => fan.followUpTag && fan.followUpTag !== "none");
    }

    if (filter === "highPriority" && mappedFans.length) {
      mappedFans = mappedFans.filter((fan) => fan.isHighPriority === true);
    }

    const hasMore = mappedFans.length > limit;
    const items = mappedFans.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return res.status(200).json({ ok: true, items, fans: items, nextCursor, hasMore });
  } catch (error) {
    console.error("Error loading fans data", error);
    return sendServerError(res, "Error loading fans data");
  }
}
