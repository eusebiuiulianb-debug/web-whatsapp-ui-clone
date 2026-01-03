import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendServerError } from "../../../../lib/apiError";
import { computeFanTotals } from "../../../../lib/fanTotals";

type SegmentPreview = {
  fanId: string;
  displayName: string;
  totalSpent: number;
  extrasCount: number;
  giftsCount: number;
  tipsCount: number;
  hasActiveSub: boolean;
  followUpAt: string | null;
  followUpNote: string | null;
  notesCount: number;
};

type InternalPreview = SegmentPreview & {
  inviteUsedAt: string | null;
  isNew: boolean;
};

type SegmentEntry = {
  id: string;
  title: string;
  reason: string;
  fanIds: string[];
  fanPreview: SegmentPreview[];
  potentialAmount: number;
  suggestedAction: string;
};

type SegmentsResponse = {
  segments: SegmentEntry[];
  followUps: {
    rangeDays: number;
    overdue: Array<{
      fanId: string;
      fanName: string;
      nextActionAt: string;
      nextActionNote: string | null;
      statusLabel: string;
    }>;
    dueToday: Array<{
      fanId: string;
      fanName: string;
      nextActionAt: string;
      nextActionNote: string | null;
      statusLabel: string;
    }>;
    upcoming: Array<{
      fanId: string;
      fanName: string;
      nextActionAt: string;
      nextActionNote: string | null;
      statusLabel: string;
    }>;
  };
};

const FALLBACK_EXTRA_PRICE = 15;
const LEGACY_SCHEDULE_RE = /\s*\(para\s+\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?\)\s*$/i;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeNoteValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLegacyNextAction(value: string | null | undefined): string | null {
  const normalized = normalizeNoteValue(value);
  if (!normalized) return null;
  const cleaned = normalized.replace(LEGACY_SCHEDULE_RE, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizePurchaseKind(kind: string | null | undefined): "EXTRA" | "TIP" | "GIFT" {
  if (kind === "TIP" || kind === "GIFT") return kind;
  return "EXTRA";
}

function hasActiveSubscription(grants: { type: string; expiresAt: Date }[], now: Date): boolean {
  return grants.some((grant) => {
    const type = (grant.type || "").toLowerCase();
    if (grant.expiresAt <= now) return false;
    return type === "monthly" || type === "special" || type === "single";
  });
}

function pickDisplayName(fan: { displayName?: string | null; name?: string | null }) {
  return fan.displayName?.trim() || fan.name?.trim() || "Fan";
}

function buildSuggestedAction(segmentId: string) {
  switch (segmentId) {
    case "sub_active_no_extras":
      return "Te preparo un extra rápido (15€) hoy. ¿Lo quieres suave o más directo?";
    case "gifters":
      return "Si te apetece, tengo un pack recomendado que encaja con lo que sueles regalar…";
    case "tipsters":
      return "Si te gustó, lo convierto en un extra con más detalle. ¿Te lo preparo?";
    case "no_access_or_onboarding":
      return "¿Quieres activar tu acceso completo hoy? Te lo preparo en un minuto.";
    case "followup_due":
      return "¡Te tenía pendiente! ¿Quieres que te prepare algo nuevo hoy?";
    default:
      return "¿Te apetece algo nuevo hoy?";
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SegmentsResponse | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();
  const rawRange = Array.isArray(req.query.rangeDays) ? req.query.rangeDays[0] : req.query.rangeDays;
  const parsedRange = Number(rawRange);
  const rangeDays = parsedRange === 1 || parsedRange === 3 || parsedRange === 7 || parsedRange === 30 ? parsedRange : 7;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const rangeEnd = new Date(endOfToday);
  rangeEnd.setDate(rangeEnd.getDate() + rangeDays);

  try {
    const fans = await prisma.fan.findMany({
      where: { creatorId },
      select: {
        id: true,
        name: true,
        displayName: true,
        quickNote: true,
        profileText: true,
        inviteUsedAt: true,
        isNew: true,
        nextAction: true,
        nextActionAt: true,
        nextActionNote: true,
        accessGrants: { select: { type: true, expiresAt: true } },
        extraPurchases: { select: { amount: true, kind: true } },
        followUps: {
          where: { status: "OPEN" },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: { dueAt: true, title: true, note: true },
        },
        _count: { select: { notes: true } },
      },
    });

    const previews: InternalPreview[] = fans.map((fan) => {
      const notesCount = (fan._count?.notes ?? 0) + (normalizeNoteValue(fan.quickNote) ? 1 : 0);
      let extrasCount = 0;
      let tipsCount = 0;
      let giftsCount = 0;
      for (const purchase of fan.extraPurchases ?? []) {
        const kind = normalizePurchaseKind(purchase.kind);
        if (kind === "TIP") tipsCount += 1;
        else if (kind === "GIFT") giftsCount += 1;
        else extrasCount += 1;
      }
      const totals = computeFanTotals(fan.extraPurchases ?? []);
      const followUpCandidates = [fan.nextActionAt, fan.followUps?.[0]?.dueAt].filter(Boolean) as Date[];
      const followUpAt =
        followUpCandidates.length > 0
          ? followUpCandidates.sort((a, b) => a.getTime() - b.getTime())[0]
          : null;
      const followUpNote =
        normalizeNoteValue(fan.nextActionNote) ||
        normalizeNoteValue(fan.followUps?.[0]?.note) ||
        normalizeNoteValue(fan.followUps?.[0]?.title) ||
        normalizeLegacyNextAction(fan.nextAction) ||
        null;
      return {
        fanId: fan.id,
        displayName: pickDisplayName(fan),
        totalSpent: totals.totalSpent,
        extrasCount,
        giftsCount,
        tipsCount,
        hasActiveSub: hasActiveSubscription(fan.accessGrants ?? [], now),
        followUpAt: followUpAt ? followUpAt.toISOString() : null,
        followUpNote,
        notesCount,
        inviteUsedAt: fan.inviteUsedAt ? fan.inviteUsedAt.toISOString() : null,
        isNew: fan.isNew ?? false,
      };
    });

    const byFanId = new Map(previews.map((fan) => [fan.fanId, fan]));

    const segmentDefs: Array<{
      id: string;
      title: string;
      reason: string;
      filter: (fan: SegmentPreview) => boolean;
    }> = [
      {
        id: "sub_active_no_extras",
        title: "Suscripción activa sin extras",
        reason: "Tienen acceso activo pero aún no han comprado extras.",
        filter: (fan) => fan.hasActiveSub && fan.extrasCount === 0,
      },
      {
        id: "gifters",
        title: "Fans regaladores",
        reason: "Han comprado regalos recientemente o en histórico.",
        filter: (fan) => fan.giftsCount > 0,
      },
      {
        id: "tipsters",
        title: "Fans que dejan propinas",
        reason: "Ya han dejado propinas y pueden escalar a extras.",
        filter: (fan) => fan.tipsCount > 0,
      },
      {
        id: "no_access_or_onboarding",
        title: "Sin acceso u onboarding",
        reason: "No tienen acceso activo o aún no completaron onboarding.",
        filter: (fan) => !fan.hasActiveSub && (!fan.inviteUsedAt || fan.isNew),
      },
      {
        id: "followup_due",
        title: "Seguimiento vencido",
        reason: "Tareas de seguimiento con fecha pasada o para hoy.",
        filter: (fan) => !!fan.followUpAt && new Date(fan.followUpAt).getTime() <= now.getTime(),
      },
    ];

    const segments = segmentDefs.map((segment) => {
      const matched = previews.filter(segment.filter);
      const fanIds = matched.map((fan) => fan.fanId);
      return {
        id: segment.id,
        title: segment.title,
        reason: segment.reason,
        fanIds,
        fanPreview: fanIds.map((fanId) => byFanId.get(fanId)).filter(Boolean) as SegmentPreview[],
        potentialAmount: matched.length * FALLBACK_EXTRA_PRICE,
        suggestedAction: buildSuggestedAction(segment.id),
      };
    });

    const followUpItems = previews
      .map((fan) => {
        if (!fan.followUpAt) return null;
        const followUpDate = new Date(fan.followUpAt);
        if (Number.isNaN(followUpDate.getTime())) return null;
        return {
          fanId: fan.fanId,
          fanName: fan.displayName,
          nextActionAt: followUpDate.toISOString(),
          nextActionNote: fan.followUpNote ?? null,
          followUpDate,
        };
      })
      .filter(Boolean) as Array<{
      fanId: string;
      fanName: string;
      nextActionAt: string;
      nextActionNote: string | null;
      followUpDate: Date;
    }>;

    const overdue = followUpItems
      .filter((item) => item.followUpDate.getTime() < startOfToday.getTime())
      .sort((a, b) => a.followUpDate.getTime() - b.followUpDate.getTime())
      .map((item) => ({
        fanId: item.fanId,
        fanName: item.fanName,
        nextActionAt: item.nextActionAt,
        nextActionNote: item.nextActionNote,
        statusLabel: "Vencido",
      }));

    const dueToday = followUpItems
      .filter(
        (item) =>
          item.followUpDate.getTime() >= startOfToday.getTime() &&
          item.followUpDate.getTime() <= endOfToday.getTime()
      )
      .sort((a, b) => a.followUpDate.getTime() - b.followUpDate.getTime())
      .map((item) => ({
        fanId: item.fanId,
        fanName: item.fanName,
        nextActionAt: item.nextActionAt,
        nextActionNote: item.nextActionNote,
        statusLabel: "Hoy",
      }));

    const upcoming = followUpItems
      .filter(
        (item) =>
          item.followUpDate.getTime() > endOfToday.getTime() &&
          item.followUpDate.getTime() <= rangeEnd.getTime()
      )
      .sort((a, b) => a.followUpDate.getTime() - b.followUpDate.getTime())
      .map((item) => {
        const diffDays = Math.max(
          1,
          Math.ceil((item.followUpDate.getTime() - startOfToday.getTime()) / MS_PER_DAY)
        );
        return {
          fanId: item.fanId,
          fanName: item.fanName,
          nextActionAt: item.nextActionAt,
          nextActionNote: item.nextActionNote,
          statusLabel: `En ${diffDays}d`,
        };
      });

    return res.status(200).json({
      segments,
      followUps: {
        rangeDays,
        overdue,
        dueToday,
        upcoming,
      },
    });
  } catch (error) {
    console.error("Error loading cortex segments", error);
    return sendServerError(res, "Failed to load segments");
  }
}
