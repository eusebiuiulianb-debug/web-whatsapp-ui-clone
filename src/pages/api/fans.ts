import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/prisma";
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
import { normalizeLocaleTag, normalizePreferredLanguage, normalizeUiLocale } from "../../lib/language";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../lib/dbSchemaGuard";
import { buildAccessStateFromGrants } from "../../lib/accessState";
import { computeFanTotals } from "../../lib/fanTotals";
import { getStickerById } from "../../lib/emoji/stickers";
import { buildFanMonetizationSummaryFromFan } from "../../lib/analytics/revenue";
import { computeAgencyPriorityScore } from "../../lib/agency/priorityScore";
import { resolveObjectiveForScoring, resolveObjectiveLabel } from "../../lib/agency/objectives";
import type { AgencyIntensity, AgencyPlaybook, AgencyStage } from "../../lib/agency/types";
import { computeHeatFromSignals } from "../../lib/ai/heat";

function parseMessageTimestamp(messageId: string): Date | null {
  const parts = messageId.split("-");
  const last = parts[parts.length - 1];
  const ts = Number(last);
  if (Number.isFinite(ts) && last.length >= 10) {
    return new Date(ts);
  }
  return null;
}

type ViewerRole = "creator" | "fan";

function resolveViewerRole(req: NextApiRequest): ViewerRole {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string") {
    const normalized = header.trim().toLowerCase();
    if (normalized === "fan") return "fan";
    if (normalized === "creator") return "creator";
  }

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string") {
    const normalized = viewerParam.trim().toLowerCase();
    if (normalized === "fan") return "fan";
    if (normalized === "creator") return "creator";
  }

  return "creator";
}

function truncateSnippet(text: string | null | undefined, max = 80): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function normalizeNoteValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function formatNextActionFromSchedule(note?: string | null, dueAt?: string | null): string | null {
  const normalizedNote = normalizeNoteValue(note);
  if (!normalizedNote && !dueAt) return null;
  const safeNote = normalizedNote || "Seguimiento";
  if (!dueAt) return safeNote;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return safeNote;
  const iso = parsed.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  const suffix = time ? ` ${time}` : "";
  return `${safeNote} (para ${date}${suffix})`;
}

function isSuggestedActionKey(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return false;
  return (
    normalized === "BREAK_ICE" ||
    normalized === "BUILD_RAPPORT" ||
    normalized === "OFFER_EXTRA" ||
    normalized === "PUSH_MONTHLY" ||
    normalized === "SEND_PAYMENT_LINK" ||
    normalized === "SUPPORT" ||
    normalized === "SAFETY"
  );
}

function sumPurchasesSince(purchases: Array<{ amount: number | null; createdAt: Date }>, since: Date): number {
  return purchases.reduce((sum, purchase) => {
    if (purchase.createdAt < since) return sum;
    return sum + (purchase.amount ?? 0);
  }, 0);
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

  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }

  res.setHeader("Cache-Control", "no-store");
  const viewerRole = resolveViewerRole(req);

  const { limit: limitParam, cursor, filter = "all", q, fanId, source, temp, intent } = req.query;
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
  const tempFilter = typeof temp === "string" && temp.trim().length > 0 ? temp.trim().toLowerCase() : null;
  const intentFilter = typeof intent === "string" && intent.trim().length > 0 ? intent.trim().toUpperCase() : null;

  try {
    const creator = await prisma.creator.findFirst({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (!creator) {
      if (process.env.NODE_ENV === "development" || process.env.DEV_BYPASS_AUTH === "true") {
        try {
          await prisma.creator.create({
            data: {
              id: "creator-1",
              name: "Creator demo",
              subtitle: "Demo",
              description: "Perfil demo generado automáticamente.",
            },
          });
        } catch (_err) {
          // ignore create failures
        }
      } else {
        return res.status(401).json({
          ok: false,
          error: "CREATOR_NOT_FOUND",
          code: "CREATOR_NOT_FOUND",
          message: "No se pudo resolver el creator.",
        });
      }
    }

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
        where.OR = [{ notes: { some: {} } }, { quickNote: { not: null } }];
        const existingNot = Array.isArray(where.NOT) ? where.NOT : where.NOT ? [where.NOT] : [];
        where.NOT = [...existingNot, { quickNote: "" }];
      } else if (filter === "nextAction") {
        where.OR = [
          { nextAction: { not: null } },
          { nextActionNote: { not: null } },
          { nextActionAt: { not: null } },
        ];
        const existingNot = Array.isArray(where.NOT) ? where.NOT : where.NOT ? [where.NOT] : [];
        where.NOT = [...existingNot, { nextAction: "" }, { nextActionNote: "" }];
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
        { nextActionNote: { contains: search } },
        { notes: { some: { content: { contains: search } } } },
      ];
    }

    if (fanIdFilter) {
      where.id = fanIdFilter;
    }

    const countWhere: Prisma.FanWhereInput = { ...where };

    if (tempFilter && tempFilter !== "all") {
      const label = tempFilter.toUpperCase();
      if (label === "COLD" || label === "WARM" || label === "HOT") {
        where.temperatureBucket = label;
      }
    }

    if (intentFilter && intentFilter !== "ANY" && intentFilter !== "ALL") {
      where.lastIntentKey = intentFilter;
    }

    let cursorFilter: Prisma.FanWhereInput | null = null;
    if (cursorId && !fanIdFilter) {
      const cursorFan = await prisma.fan.findUnique({
        where: { id: cursorId },
        select: { lastMessageAt: true },
      });
      if (cursorFan?.lastMessageAt) {
        cursorFilter = {
          OR: [
            { lastMessageAt: { lt: cursorFan.lastMessageAt } },
            { AND: [{ lastMessageAt: cursorFan.lastMessageAt }, { id: { lt: cursorId } }] },
            { lastMessageAt: null },
          ],
        };
      } else if (cursorFan) {
        cursorFilter = {
          AND: [{ lastMessageAt: null }, { id: { lt: cursorId } }],
        };
      }
    }

    const finalWhere = cursorFilter ? { AND: [where, cursorFilter] } : where;

    const baseSelect = {
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
      nextActionAt: true,
      nextActionNote: true,
      profileText: true,
      quickNote: true,
      creatorId: true,
      segment: true,
      riskLevel: true,
      healthScore: true,
      temperatureScore: true,
      temperatureBucket: true,
      heatScore: true,
      heatLabel: true,
      heatUpdatedAt: true,
      heatMeta: true,
      lastIntentKey: true,
      lastIntentConfidence: true,
      lastIntentAt: true,
      lastInboundAt: true,
      signalsUpdatedAt: true,
      lastMessageAt: true,
      lastActivityAt: true,
      lastReadAtCreator: true,
      lastReadAtFan: true,
      isBlocked: true,
      isArchived: true,
      locale: true,
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
            intentKey: true,
            contentItem: { select: { title: true } },
          },
        },
      inviteCreatedAt: true,
      inviteUsedAt: true,
      _count: { select: { notes: true } },
    } as any;

    const findManyArgs = {
      select: baseSelect,
      orderBy: [{ lastMessageAt: "desc" as const }, { id: "desc" as const }],
      take: limit + 1,
      where: finalWhere,
    };

    let fans: any[] = [];
    try {
      fans = (await prisma.fan.findMany(findManyArgs)) as any[];
    } catch (err: any) {
      const message = typeof err?.message === "string" ? err.message : "";
      const isValidationError =
        err?.name === "PrismaClientValidationError" && message.includes("Unknown field");
      if (!isValidationError) {
        throw err;
      }
      const payload = getDbSchemaOutOfSyncPayload(message);
      return res.status(500).json({
        ok: false,
        error: payload.code,
        ...payload,
      });
    }

    const now = new Date();

    const fanIds = fans.map((fan) => fan.id);
    const creatorId = fans[0]?.creatorId || "creator-1";
    const creatorLocale = await prisma.creator
      .findUnique({ where: { id: creatorId }, select: { uiLocale: true } })
      .then((creator) => normalizeUiLocale(creator?.uiLocale) ?? "es")
      .catch(() => "es");
    type ExtraPurchaseRow = { amount: number | null; createdAt: Date; tier: string; kind?: string | null };
    type ExtraStats = { purchases: ExtraPurchaseRow[]; maxTier: string | null };
    const extrasByFan = new Map<string, ExtraStats>();
    const purchasesByFan = new Map<string, ExtraPurchaseRow[]>();
    const agencyMetaByFan = new Map<
      string,
      {
        stage: string;
        objectiveCode: string;
        intensity: string;
        playbook: string;
        nextAction: string | null;
        lastTouchAt: Date | null;
      }
    >();

    if (fanIds.length > 0) {
      try {
        const purchases = await prisma.extraPurchase.findMany({
          where: { fanId: { in: fanIds }, amount: { gt: 0 }, isArchived: false },
          select: { fanId: true, amount: true, tier: true, createdAt: true, kind: true },
        });
        const tierPriority: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
        for (const purchase of purchases) {
          const kind = purchase.kind ?? "EXTRA";
          const allPurchases = purchasesByFan.get(purchase.fanId) ?? [];
          allPurchases.push({
            amount: purchase.amount ?? 0,
            createdAt: purchase.createdAt,
            tier: purchase.tier,
            kind: purchase.kind ?? null,
          });
          purchasesByFan.set(purchase.fanId, allPurchases);
          if (kind !== "EXTRA") continue;
          const current = extrasByFan.get(purchase.fanId) ?? { purchases: [], maxTier: null };
          current.purchases.push({ amount: purchase.amount ?? 0, createdAt: purchase.createdAt, tier: purchase.tier, kind: purchase.kind ?? null });
          const shouldUpdateTier =
            current.maxTier === null || (tierPriority[purchase.tier] ?? 0) > (tierPriority[current.maxTier] ?? 0);
          const nextTier = shouldUpdateTier ? purchase.tier : current.maxTier;
          extrasByFan.set(purchase.fanId, { purchases: current.purchases, maxTier: nextTier });
        }
      } catch (err) {
        console.error("Error calculating extra metrics", err);
      }
    }

    if (fanIds.length > 0) {
      try {
        const agencyMetas = await prisma.chatAgencyMeta.findMany({
          where: { fanId: { in: fanIds }, creatorId },
          select: {
            fanId: true,
            stage: true,
            objectiveCode: true,
            intensity: true,
            playbook: true,
            nextAction: true,
            lastTouchAt: true,
          },
        });
        agencyMetas.forEach((meta) => {
          agencyMetaByFan.set(meta.fanId, {
            stage: meta.stage,
            objectiveCode: meta.objectiveCode,
            intensity: meta.intensity,
            playbook: meta.playbook,
            nextAction: meta.nextAction ?? null,
            lastTouchAt: meta.lastTouchAt ?? null,
          });
        });
      } catch (err) {
        console.error("Error loading agency meta", err);
      }
    }

    const objectiveLabelsByCode = new Map<string, Record<string, string>>();
    if (creatorId) {
      try {
        const objectives = await prisma.agencyObjective.findMany({
          where: { creatorId, active: true },
          select: { code: true, labels: true },
        });
        objectives.forEach((objective) => {
          const labels = objective.labels;
          if (!labels || typeof labels !== "object" || Array.isArray(labels)) return;
          objectiveLabelsByCode.set(objective.code, labels as Record<string, string>);
        });
      } catch (err) {
        console.error("Error loading agency objectives", err);
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
      const accessSnapshot = buildAccessStateFromGrants({
        accessGrants: fan.accessGrants,
        isNew: fan.isNew ?? false,
        now,
      });
      const {
        accessState,
        accessType,
        accessLabel,
        membershipStatus,
        daysLeft,
        hasAccessHistory,
        activeGrantTypes,
        lastGrantType,
        hasActiveAccess,
      } = accessSnapshot;

      const paidGrants = (fan.accessGrants as any[]).filter(
        (grant: any) => grant.type === "monthly" || grant.type === "special" || grant.type === "single"
      );
      const paidGrantsCount = paidGrants.length;
      const extrasInfo = extrasByFan.get(fan.id) ?? { purchases: [], maxTier: null };
      const allPurchases = purchasesByFan.get(fan.id) ?? [];
      const purchaseTotals = computeFanTotals(allPurchases);
      const monetization = buildFanMonetizationSummaryFromFan({
        accessGrants: fan.accessGrants,
        extraPurchases: allPurchases,
      }, now);
      const extrasTotal = purchaseTotals.extrasAmount;
      const totalSpend = monetization.totalSpent;
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
      const agencyMeta = agencyMetaByFan.get(fan.id);
      const agencyStage = (agencyMeta?.stage ?? "NEW") as AgencyStage;
      const agencyObjective = agencyMeta?.objectiveCode ?? "CONNECT";
      const agencyIntensity = (agencyMeta?.intensity ?? "MEDIUM") as AgencyIntensity;
      const agencyPlaybook = (agencyMeta?.playbook ?? "GIRLFRIEND") as AgencyPlaybook;
      const agencyNextAction = agencyMeta?.nextAction ?? null;
      const objectiveLocale = creatorLocale;
      const agencyObjectiveLabel =
        resolveObjectiveLabel({
          code: agencyObjective,
          locale: objectiveLocale,
          labelsByCode: objectiveLabelsByCode,
        }) ?? agencyObjective;
      const spent7d = sumPurchasesSince(allPurchases, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const spent30d = sumPurchasesSince(allPurchases, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      const segmentLabel = (fan.segment ?? "").toUpperCase();
      const riskValue = ((fan as any).riskLevel ?? "LOW").toString().toUpperCase();
      const isVip = customerTier === "vip" || segmentLabel === "VIP";
      const isAtRisk = segmentLabel === "EN_RIESGO" || (riskValue && riskValue !== "LOW");
      const isExpired = followUpTag === "expired";

      const visibleMessages = (fan.messages ?? []).filter((msg: any) => isVisibleToFan(msg));
      const creatorMessages = visibleMessages.filter((msg: any) => normalizeFrom(msg.from) === "creator");
      const fanMessages = visibleMessages.filter((msg: any) => normalizeFrom(msg.from) === "fan");
      const hasMessages = visibleMessages.length > 0;
      const lastIntentFromMessages = fanMessages
        .filter((msg: any) => typeof msg.intentKey === "string" && msg.intentKey.trim().length > 0)
        .map((msg: any) => ({
          intentKey: msg.intentKey,
          ts: parseMessageTimestamp(msg.id)?.getTime() ?? 0,
        }))
        .sort((a: any, b: any) => b.ts - a.ts)[0];
      const resolvedLastIntentKey = (fan as any).lastIntentKey ?? lastIntentFromMessages?.intentKey ?? null;
      const resolvedLastIntentAt =
        (fan as any).lastIntentAt ??
        (lastIntentFromMessages?.ts ? new Date(lastIntentFromMessages.ts).toISOString() : null);
      const resolvedTemperatureScore =
        typeof (fan as any).temperatureScore === "number"
          ? (fan as any).temperatureScore
          : typeof (fan as any).heatScore === "number"
          ? (fan as any).heatScore
          : 0;
      const resolvedTemperatureBucketRaw =
        typeof (fan as any).temperatureBucket === "string" && (fan as any).temperatureBucket.trim()
          ? (fan as any).temperatureBucket
          : typeof (fan as any).heatLabel === "string" && (fan as any).heatLabel.trim()
          ? (fan as any).heatLabel === "READY"
            ? "HOT"
            : (fan as any).heatLabel
          : "COLD";
      const resolvedTemperatureBucket = String(resolvedTemperatureBucketRaw).toUpperCase();
      const fallbackHeat =
        !fan.heatUpdatedAt && visibleMessages.length > 0
          ? computeHeatFromSignals({
              recentMessages: visibleMessages,
              recentPurchases: allPurchases,
              subscriptionStatus: fan.membershipStatus ?? null,
              lastSeenAt: fan.lastMessageAt ?? null,
            })
          : null;
      const resolvedHeatScore =
        fallbackHeat?.score ?? (typeof (fan as any).heatScore === "number" ? (fan as any).heatScore : null);
      const resolvedHeatLabel = fallbackHeat?.label ?? (fan as any).heatLabel ?? null;
      const resolvedHeatMeta =
        fallbackHeat && !fan.heatUpdatedAt
          ? { ...((fan as any).heatMeta ?? {}), reasons: fallbackHeat.reasons }
          : (fan as any).heatMeta ?? null;

      const lastVisibleMessage = visibleMessages
        .map((msg: any) => ({
          msg,
          ts: parseMessageTimestamp(msg.id)?.getTime() ?? 0,
        }))
        .sort((a: any, b: any) => b.ts - a.ts)[0]?.msg;
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
        .map((msg: any) => parseMessageTimestamp(msg.id))
        .filter((d: Date | null): d is Date => !!d)
        .sort((a: any, b: any) => b.getTime() - a.getTime())[0];
      const lastFanActivity = fanMessages
        .map((msg: any) => parseMessageTimestamp(msg.id))
        .filter((d: Date | null): d is Date => !!d)
        .sort((a: any, b: any) => b.getTime() - a.getTime())[0];
      const priorityScore = computeAgencyPriorityScore({
        lastIncomingAt: lastFanActivity,
        lastOutgoingAt: lastCreatorMessage,
        spent7d,
        spent30d,
        stage: agencyStage,
        objective: resolveObjectiveForScoring(agencyObjective),
        intensity: agencyIntensity,
        flags: { vip: isVip, expired: isExpired, atRisk: isAtRisk, isNew: isNew30d },
      });

      const lastVisibleAt = lastVisibleMessage ? parseMessageTimestamp(lastVisibleMessage.id) : null;
      const lastMessageAt = fan.lastMessageAt ?? lastVisibleAt ?? null;
      const lastActivityAt =
        fan.lastActivityAt ?? lastMessageAt ?? lastVisibleAt ?? lastCreatorMessage ?? lastFanActivity ?? null;
      const lastReadAt = viewerRole === "creator" ? fan.lastReadAtCreator : fan.lastReadAtFan;
      const lastReadMs = lastReadAt ? lastReadAt.getTime() : null;
      const unreadCount = hasMessages
        ? visibleMessages.filter((msg: any) => {
            if (normalizeFrom(msg.from) === viewerRole) return false;
            const ts = msg.id ? parseMessageTimestamp(msg.id) : null;
            if (!ts) return false;
            return lastReadMs === null ? true : ts.getTime() > lastReadMs;
          }).length
        : 0;
      const lastNoteSnippet = truncateSnippet(fan.notes?.[0]?.content);
      const quickNoteValue = normalizeNoteValue(fan.quickNote);
      const quickNotePreview = truncateSnippet(quickNoteValue);
      const baseNotesCount = fan._count?.notes ?? 0;
      const notesCount = baseNotesCount + (quickNoteValue ? 1 : 0);
      const notePreview = quickNotePreview ?? lastNoteSnippet ?? null;
      const openFollowUp = fan.followUps?.[0] ?? null;
      const followUpOpen = openFollowUp ? mapFollowUp(openFollowUp) : null;
      const nextActionAt = fan.nextActionAt ? fan.nextActionAt.toISOString() : null;
      const nextActionNote = normalizeNoteValue(fan.nextActionNote);
      const rawNextAction = typeof fan.nextAction === "string" ? fan.nextAction.trim() : "";
      const nextActionIsSuggested = isSuggestedActionKey(rawNextAction);
      const nextActionValue =
        formatNextActionFromSchedule(nextActionNote, nextActionAt) ||
        (!nextActionIsSuggested && rawNextAction ? rawNextAction : null) ||
        formatNextActionFromFollowUp(openFollowUp);
      const nextActionSnippet = truncateSnippet(nextActionNote ?? nextActionValue);
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
        threadId: fan.id,
        id: fan.id,
        name: fan.name,
        displayName: fan.displayName ?? null,
        creatorLabel: fan.creatorLabel ?? null,
        locale: fan.locale ? normalizeLocaleTag(fan.locale) : null,
        preferredLanguage: normalizePreferredLanguage(fan.preferredLanguage) ?? null,
        avatar: fan.avatar || "",
        preview: hasMessages ? preview : "",
        lastMessagePreview: hasMessages ? preview : "",
        time: hasMessages ? lastVisibleTime : "",
        unreadCount,
        isNew: fan.isNew ?? false,
        isNew30d,
        accessState,
        accessType,
        accessLabel,
        hasActiveAccess,
        membershipStatus,
        daysLeft,
        lastSeen: fan.lastSeen || "",
        lastSeenAt: lastFanActivity ? lastFanActivity.toISOString() : null,
        notesCount,
        notePreview,
        lastCreatorMessageAt: lastCreatorMessage ? lastCreatorMessage.toISOString() : null,
        lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
        lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
        paidGrantsCount,
        lifetimeValue: totalSpend, // mantenemos compatibilidad pero usando el gasto total real
        lifetimeSpend: totalSpend,
        totalSpent: purchaseTotals.totalSpent,
        recent30dSpent: monetization?.recent30dSpent ?? null,
        customerTier,
        profileText: fan.profileText ?? null,
        quickNote: fan.quickNote ?? null,
        followUpOpen,
        nextAction: rawNextAction || null,
        nextActionAt,
        nextActionNote,
        activeGrantTypes,
        hasAccessHistory,
        lastGrantType,
        followUpTag,
        priorityScore,
        agencyStage,
        agencyObjective,
        agencyObjectiveLabel,
        agencyIntensity,
        agencyPlaybook,
        agencyNextAction,
        lastNoteSnippet,
        nextActionSnippet,
        lastNoteSummary,
        nextActionSummary,
        extrasCount: monetization.extras.count,
        extrasSpentTotal: purchaseTotals.extrasAmount,
        tipsCount: monetization.tips.count,
        tipsSpentTotal: purchaseTotals.tipsAmount,
        giftsCount: monetization.gifts.count,
        giftsSpentTotal: purchaseTotals.giftsAmount,
        maxExtraTier: extrasInfo.maxTier,
        novsyStatus,
        isHighPriority,
        highPriorityAt: fan.highPriorityAt ?? null,
        inviteUsedAt: fan.inviteUsedAt ? fan.inviteUsedAt.toISOString() : null,
        segment: fan.segment ?? "NUEVO",
        riskLevel: (fan as any).riskLevel ?? "LOW",
        healthScore: (fan as any).healthScore ?? 0,
        temperatureScore: resolvedTemperatureScore,
        temperatureBucket: resolvedTemperatureBucket,
        heatScore: resolvedHeatScore,
        heatLabel: resolvedHeatLabel,
        heatUpdatedAt: fan.heatUpdatedAt ? fan.heatUpdatedAt.toISOString() : null,
        heatMeta: resolvedHeatMeta,
        lastIntentKey: resolvedLastIntentKey,
        lastIntentConfidence: typeof (fan as any).lastIntentConfidence === "number" ? (fan as any).lastIntentConfidence : null,
        lastIntentAt: resolvedLastIntentAt,
        lastInboundAt: fan.lastInboundAt ? fan.lastInboundAt.toISOString() : null,
        signalsUpdatedAt: fan.signalsUpdatedAt ? fan.signalsUpdatedAt.toISOString() : null,
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
          nextActionAt: fan.nextActionAt,
        })
      );
    }

    if (!isArchivedFilter && filter === "followup") {
      mappedFans = mappedFans.filter((fan) => {
        const hasTag = fan.followUpTag && fan.followUpTag !== "none";
        const hasNextAction =
          Boolean(fan.followUpOpen) ||
          Boolean(fan.nextActionAt) ||
          Boolean(fan.nextActionNote?.trim()) ||
          Boolean(fan.nextAction?.trim());
        return hasTag || hasNextAction;
      });
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

    const intentKeys = [
      "BUY_NOW",
      "PRICE_ASK",
      "CONTENT_REQUEST",
      "CUSTOM_REQUEST",
      "SUBSCRIBE",
      "CANCEL",
      "OFF_PLATFORM",
      "SUPPORT",
      "OBJECTION",
      "RUDE_OR_HARASS",
      "OTHER",
    ] as const;
    const [countAll, countCold, countWarm, countHot, intentCounts] = await Promise.all([
      prisma.fan.count({ where: countWhere }),
      prisma.fan.count({ where: { ...countWhere, temperatureBucket: "COLD" } }),
      prisma.fan.count({ where: { ...countWhere, temperatureBucket: "WARM" } }),
      prisma.fan.count({ where: { ...countWhere, temperatureBucket: "HOT" } }),
      Promise.all(
        intentKeys.map(async (key) => ({
          key,
          count: await prisma.fan.count({ where: { ...countWhere, lastIntentKey: key } }),
        }))
      ),
    ]);
    const intentCountsByKey = intentCounts.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.key] = entry.count;
      return acc;
    }, {});
    const counts = {
      all: countAll,
      cold: countCold,
      warm: countWarm,
      hot: countHot,
    };

    return res.status(200).json({
      ok: true,
      items,
      fans: items,
      nextCursor,
      hasMore,
      counts,
      intentCounts: intentCountsByKey,
    });
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
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
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
