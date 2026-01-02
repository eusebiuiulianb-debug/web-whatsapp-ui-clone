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
};

const FALLBACK_EXTRA_PRICE = 15;

function normalizeNoteValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
        accessGrants: { select: { type: true, expiresAt: true } },
        extraPurchases: { select: { amount: true, kind: true } },
        followUps: {
          where: { status: "OPEN" },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: { dueAt: true },
        },
        _count: { select: { notes: true } },
      },
    });

    const previews: InternalPreview[] = fans.map((fan) => {
      const notesCount = (fan._count?.notes ?? 0) + (normalizeNoteValue(fan.quickNote) ? 1 : 0) + (normalizeNoteValue(fan.profileText) ? 1 : 0);
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
      const followUpAt = fan.followUps?.[0]?.dueAt ?? null;
      return {
        fanId: fan.id,
        displayName: pickDisplayName(fan),
        totalSpent: totals.totalSpent,
        extrasCount,
        giftsCount,
        tipsCount,
        hasActiveSub: hasActiveSubscription(fan.accessGrants ?? [], now),
        followUpAt: followUpAt ? followUpAt.toISOString() : null,
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

    return res.status(200).json({ segments });
  } catch (error) {
    console.error("Error loading cortex segments", error);
    return sendServerError(res, "Failed to load segments");
  }
}
