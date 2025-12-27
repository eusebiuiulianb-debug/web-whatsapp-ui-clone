import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.server";
import { getFollowUpTag, shouldFollowUpToday } from "../../utils/followUp";
import {
  getExtraLadderStatusForFan,
  getExtraSessionTodayForFan,
  type ExtraLadderStatus,
  type ExtraSessionToday,
} from "../../lib/extraLadder";
import { isNewWithinDays } from "../../lib/fanNewness";
import { createInviteTokenForFan } from "../../utils/createInviteToken";
import { isVisibleToFan, normalizeFrom } from "../../lib/messageAudience";
import { normalizePreferredLanguage } from "../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../lib/dbSchemaGuard";
import { getStickerById } from "../../lib/emoji/stickers";

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

function formatNextActionFromFollowUp(followUp?: {
  title: string;
  dueAt: Date | null;
} | null): string | null {
  if (!followUp?.title) return null;
  if (!followUp.dueAt) return followUp.title;
  const iso = followUp.dueAt.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  const suffix = time ? ` ${time}` : "";
  return `${followUp.title} (para ${date}${suffix})`;
}

function mapFollowUp(followUp: {
  id: string;
  title: string;
  note: string | null;
  dueAt: Date | null;
  status: "OPEN" | "DONE" | "DELETED";
  createdAt: Date;
  updatedAt: Date;
  doneAt: Date | null;
}) {
  return {
    id: followUp.id,
    title: followUp.title,
    note: followUp.note ?? null,
    dueAt: followUp.dueAt ? followUp.dueAt.toISOString() : null,
    status: followUp.status,
    createdAt: followUp.createdAt ? followUp.createdAt.toISOString() : null,
    updatedAt: followUp.updatedAt ? followUp.updatedAt.toISOString() : null,
    doneAt: followUp.doneAt ? followUp.doneAt.toISOString() : null,
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { limit: limitParam, cursor, filter = "all", q, fanId, source } = req.query;
  const normalizedSource = typeof source === "string" && source.trim() ? source.trim().toLowerCase() : (process.env.FANS_SOURCE ?? "db").toLowerCase();
  const allowedSources = new Set(["db", "demo"]);
  if (!allowedSources.has(normalizedSource)) {
    console.warn("api/fans invalid source, defaulting to demo", normalizedSource);
  }
  const rawLimit = Array.isArray(limitParam) ? limitParam[0] : limitParam;
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ ok: false, error: "limit must be a positive number" });
    }
    limit = Math.min(parsedLimit, MAX_LIMIT);
  }

  const cursorId = typeof cursor === "string" ? cursor : undefined;
  const search = typeof q === "string" && q.trim().length > 0 ? q.trim() : null;
  const fanIdFilter = typeof fanId === "string" && fanId.trim().length > 0 ? fanId.trim() : null;

  try {
    const where: Prisma.FanWhereInput = {};
    const isArchivedFilter = filter === "archived";
    const isBlockedFilter = filter === "blocked";

    if (isArchivedFilter) {
      where.isArchived = true;
    } else if (!fanIdFilter) {
      where.isArchived = false;
    }

    if (isBlockedFilter) {
      where.isBlocked = true;
    } else if (!fanIdFilter) {
      where.isBlocked = false;
    }

    if (!isArchivedFilter) {
      if (filter === "notes") {
        where.notes = { some: {} };
      } else if (filter === "nextAction") {
        where.nextAction = { not: null };
        const existingNot = Array.isArray(where.NOT) ? where.NOT : where.NOT ? [where.NOT] : [];
        where.NOT = [...existingNot, { nextAction: "" }];
      } else if (filter === "expired") {
        where.accessGrants = { some: { expiresAt: { lte: new Date() } } };
      }
    }

    if (search) {
      where.OR = [
        ...(where.OR ?? []),
        { name: { contains: search } },
        { displayName: { contains: search } },
        { creatorLabel: { contains: search } },
        { nextAction: { contains: search } },
        { notes: { some: { content: { contains: search } } } },
      ];
    }

    if (fanIdFilter) {
      where.id = fanIdFilter;
    }

    const fans = await prisma.fan.findMany({
      select: {
        id: true,
        name: true,
        displayName: true,
        creatorLabel: true,
        avatar: true,
        preview: true,
        time: true,
        unreadCount: true,
        isNew: true,
        isHighPriority: true,
        highPriorityAt: true,
        membershipStatus: true,
        daysLeft: true,
        lastSeen: true,
        nextAction: true,
        profileText: true,
        quickNote: true,
        creatorId: true,
        segment: true,
        riskLevel: true,
        healthScore: true,
        isBlocked: true,
        isArchived: true,
        preferredLanguage: true,
        accessGrants: true,
        notes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
        followUps: {
          where: { status: "OPEN" },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            title: true,
            note: true,
            dueAt: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            doneAt: true,
          },
        },
        messages: {
          select: {
            id: true,
            time: true,
            from: true,
            text: true,
            type: true,
            audience: true,
            contentItem: { select: { title: true } },
          },
        },
        inviteCreatedAt: true,
        inviteUsedAt: true,
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

    type ExtraSessionTodayResponse =
      | (Omit<ExtraSessionToday, "todayLastPurchaseAt"> & { todayLastPurchaseAt: string | null })
      | null;
    type LadderStatusResponse =
      | (Omit<ExtraLadderStatus, "lastPurchaseAt" | "sessionToday"> & {
          lastPurchaseAt: string | null;
          sessionToday?: ExtraSessionTodayResponse | null;
        })
      | null;
    const ladderByFan = new Map<string, LadderStatusResponse>();
    const sessionTodayByFan = new Map<string, ExtraSessionTodayResponse>();
    try {
      await Promise.all(
        fanIds.map(async (fid) => {
          const [status, sessionToday] = await Promise.all([
            getExtraLadderStatusForFan(prisma, creatorId, fid, extrasCatalog),
            getExtraSessionTodayForFan(prisma, fid),
          ]);

          const serializedStatus =
            status && status.totalSpent > 0
              ? { ...status, lastPurchaseAt: status.lastPurchaseAt ? status.lastPurchaseAt.toISOString() : null }
              : null;
          const serializedSession: ExtraSessionTodayResponse = sessionToday
            ? {
                ...sessionToday,
                todayLastPurchaseAt: sessionToday.todayLastPurchaseAt
                  ? sessionToday.todayLastPurchaseAt.toISOString()
                  : null,
              }
            : null;
          sessionTodayByFan.set(fid, serializedSession);
          const statusPayload: LadderStatusResponse = serializedStatus
            ? { ...serializedStatus, sessionToday: serializedSession }
            : serializedStatus;
          ladderByFan.set(fid, statusPayload);
        })
      );
    } catch (err) {
      console.error("Error computing ladder status", err);
    }

    let mappedFans = fans.map((fan) => {
      // Grants con acceso vigente
    const activeGrants = fan.accessGrants.filter((grant) => grant.expiresAt > now);
    const activeGrant =
      activeGrants.length > 0
        ? activeGrants.reduce<typeof fan.accessGrants[number] | null>((latest, grant) => {
            if (!latest) return grant;
            return grant.expiresAt > latest.expiresAt ? grant : latest;
          }, null)
        : null;
    const lastGrant =
      fan.accessGrants.length > 0
        ? fan.accessGrants.reduce<typeof fan.accessGrants[number] | null>((latest, grant) => {
            if (!latest) return grant;
            return grant.expiresAt > latest.expiresAt ? grant : latest;
          }, null)
        : null;
    const lastGrantType = lastGrant?.type ?? null;
    const hasAccessHistory = fan.accessGrants.length > 0;
    const activeGrantTypes = activeGrants.map((grant) => grant.type);
    const accessState: "ACTIVE" | "EXPIRED" | "NONE" = activeGrant ? "ACTIVE" : hasAccessHistory ? "EXPIRED" : "NONE";
    const accessType = activeGrant?.type ?? lastGrantType ?? null;

      // Usamos la expiración más lejana entre los grants activos para el contador de días
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

      function mapAccessLabel(type?: string | null, state: "ACTIVE" | "EXPIRED" | "NONE" = "NONE") {
        if (state === "EXPIRED") return "Caducado";
        if (state === "NONE") return fan.isNew ? "Nuevo" : "Sin acceso";
        const lower = (type || "").toLowerCase();
        if (lower === "trial" || lower === "welcome") return "Prueba 7 días";
        if (lower === "special" || lower === "single") return "Pack especial";
        if (lower === "monthly") return "Suscripción mensual";
        return type || "Acceso activo";
      }
      const accessLabel = mapAccessLabel(accessType, accessState);

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
      const isNew30d = isNewWithinDays(
        { id: fan.id, inviteCreatedAt: fan.inviteCreatedAt, inviteUsedAt: fan.inviteUsedAt },
        30,
        now
      );

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

      const visibleMessages = (fan.messages ?? []).filter((msg) => isVisibleToFan(msg));
      const creatorMessages = visibleMessages.filter((msg) => normalizeFrom(msg.from) === "creator");
      const fanMessages = visibleMessages.filter((msg) => normalizeFrom(msg.from) === "fan");
      const hasMessages = visibleMessages.length > 0;

      const lastVisibleMessage = visibleMessages
        .map((msg) => ({
          msg,
          ts: parseMessageTimestamp(msg.id)?.getTime() ?? 0,
        }))
        .sort((a, b) => b.ts - a.ts)[0]?.msg;
      const lastVisibleType = lastVisibleMessage ? ((lastVisibleMessage as any).type as string | undefined) : undefined;
      const previewSource = lastVisibleMessage
        ? lastVisibleType === "CONTENT"
          ? lastVisibleMessage.contentItem?.title || "Contenido compartido"
          : lastVisibleType === "STICKER"
          ? getStickerById((lastVisibleMessage as any).stickerId ?? null)?.label || "Sticker"
          : typeof lastVisibleMessage.text === "string"
          ? lastVisibleMessage.text
          : ""
        : "";
      const preview = previewSource.trim().slice(0, 120);
      const lastVisibleTime = lastVisibleMessage?.time || "";

      const lastCreatorMessage = creatorMessages
        .map((msg) => parseMessageTimestamp(msg.id))
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const lastFanActivity = fanMessages
        .map((msg) => parseMessageTimestamp(msg.id))
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      const lastNoteSnippet = truncateSnippet(fan.notes?.[0]?.content);
      const openFollowUp = fan.followUps?.[0] ?? null;
      const followUpOpen = openFollowUp ? mapFollowUp(openFollowUp) : null;
      const nextActionValue = fan.nextAction || formatNextActionFromFollowUp(openFollowUp);
      const nextActionSnippet = truncateSnippet(nextActionValue);
      const lastNoteSummary = lastNoteSnippet;
      const nextActionSummary = nextActionSnippet;
      const hasMonthly = activeGrantTypes.includes("monthly");
      const hasSpecial = activeGrantTypes.includes("special");
      const NOVSY_EXTRA_THRESHOLD = 30;
      const isNovsy = hasMonthly || hasSpecial || (extrasTotal ?? 0) >= NOVSY_EXTRA_THRESHOLD;
      const novsyStatus: "NOVSY" | null = isNovsy ? "NOVSY" : null;
      const isHighPriority = fan.isHighPriority ?? false;

      // Campos clave que consume el CRM:
      // - membershipStatus: "active" | "expired" | "none"
      // - daysLeft: días restantes derivados de expiresAt (nunca guardados en BD)
      // - followUpTag/urgencyLevel se calculan en el cliente con estos valores
      return {
        id: fan.id,
        name: fan.name,
        displayName: fan.displayName ?? null,
        creatorLabel: fan.creatorLabel ?? null,
        preferredLanguage: normalizePreferredLanguage(fan.preferredLanguage) ?? null,
        avatar: fan.avatar || "",
        preview: hasMessages ? preview : "",
        time: hasMessages ? lastVisibleTime : "",
        unreadCount: hasMessages ? fan.unreadCount ?? 0 : 0,
        isNew: fan.isNew ?? false,
        isNew30d,
        accessState,
        accessType,
        accessLabel,
        membershipStatus,
        daysLeft,
        lastSeen: fan.lastSeen || "",
        lastSeenAt: lastFanActivity ? lastFanActivity.toISOString() : null,
        notesCount: fan._count?.notes ?? 0,
        lastCreatorMessageAt: lastCreatorMessage ? lastCreatorMessage.toISOString() : null,
        paidGrantsCount,
        lifetimeValue: totalSpend, // mantenemos compatibilidad pero usando el gasto total real
        lifetimeSpend: totalSpend,
        customerTier,
        profileText: fan.profileText ?? null,
        quickNote: fan.quickNote ?? null,
        followUpOpen,
        nextAction: nextActionValue || null,
        activeGrantTypes,
        hasAccessHistory,
        lastGrantType,
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
        highPriorityAt: fan.highPriorityAt ?? null,
        inviteUsedAt: fan.inviteUsedAt ? fan.inviteUsedAt.toISOString() : null,
        segment: fan.segment ?? "NUEVO",
        riskLevel: (fan as any).riskLevel ?? "LOW",
        healthScore: (fan as any).healthScore ?? 0,
        extraLadderStatus: ladderByFan.get(fan.id) ?? null,
        extraSessionToday: sessionTodayByFan.get(fan.id) ?? {
          todayCount: 0,
          todaySpent: 0,
          todayHighestTier: null,
          todayLastPurchaseAt: null,
        },
        isBlocked: fan.isBlocked ?? false,
        isArchived: fan.isArchived ?? false,
        firstUtmSource: (fan as any).firstUtmSource ?? null,
        firstUtmMedium: (fan as any).firstUtmMedium ?? null,
        firstUtmCampaign: (fan as any).firstUtmCampaign ?? null,
        firstUtmContent: (fan as any).firstUtmContent ?? null,
        firstUtmTerm: (fan as any).firstUtmTerm ?? null,
      };
    });

    // Filtros adicionales que requieren cálculo (se aplican tras mapear)
    if (!isArchivedFilter && filter === "today") {
      mappedFans = mappedFans.filter((fan) =>
        shouldFollowUpToday({
          membershipStatus: fan.membershipStatus,
          daysLeft: fan.daysLeft,
          followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
        })
      );
    }

    if (!isArchivedFilter && filter === "followup") {
      mappedFans = mappedFans.filter((fan) => fan.followUpTag && fan.followUpTag !== "none");
    }

    if (!isArchivedFilter && filter === "new") {
      mappedFans = mappedFans.filter((fan) => fan.isNew30d === true);
    }

    if (!isArchivedFilter && filter === "highPriority" && mappedFans.length) {
      mappedFans = mappedFans.filter((fan) => fan.isHighPriority === true);
    }

    const hasMore = mappedFans.length > limit;
    const items = mappedFans.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return res.status(200).json({ ok: true, items, fans: items, nextCursor, hasMore });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error loading fans data", error);
    return res.status(500).json({ ok: false, error: "Error loading fans data" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const creatorLabel = normalizeInput(req.body?.nameOrAlias ?? req.body?.creatorLabel, 80);
  const note = normalizeInput(req.body?.initialNote ?? req.body?.note, 500);

  if (!creatorLabel) {
    return res.status(400).json({ ok: false, error: "nameOrAlias required" });
  }

  try {
    const baseUrl = getBaseUrl(req);
    if (!baseUrl) {
      return res.status(400).json({ ok: false, error: "missing_host" });
    }

    const creator = await resolveCreator();
    if (!creator) {
      return res.status(400).json({ ok: false, error: "creator_not_found" });
    }

    const fanId = `fan-${Date.now()}`;
    const handle = slugify(creator.name || "creator");

    await prisma.fan.create({
      data: {
        id: fanId,
        name: "Invitado",
        creatorId: creator.id,
        creatorLabel: creatorLabel || null,
        source: "manual",
        handle,
        isNew: false,
      },
    });

    if (note) {
      await prisma.fanNote.create({
        data: {
          fanId,
          creatorId: creator.id,
          content: note,
        },
      });
    }

    const inviteToken = await createInviteTokenForFan(fanId);
    const inviteUrl = `${baseUrl}/i/${inviteToken}`;

    return res.status(200).json({ fanId, inviteToken, inviteUrl });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error creating manual fan", error);
    return res.status(500).json({ ok: false, error: "Error creating fan" });
  }
}

async function resolveCreator() {
  const preferredId = process.env.CREATOR_ID || "creator-1";
  const byId = await prisma.creator.findUnique({
    where: { id: preferredId },
    select: { id: true, name: true },
  });
  if (byId) return byId;
  return prisma.creator.findFirst({ select: { id: true, name: true }, orderBy: { id: "asc" } });
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function normalizeInput(value: unknown, maxLen: number) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
}

function getBaseUrl(req: NextApiRequest): string | null {
  const host = req.headers.host;
  if (!host) return null;
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const scheme = proto || "http";
  return `${scheme}://${host}`;
}
