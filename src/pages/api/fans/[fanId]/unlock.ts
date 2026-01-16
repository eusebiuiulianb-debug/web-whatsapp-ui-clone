import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { PACKS } from "../../../../config/packs";
import { upsertAccessGrant, type GrantType } from "../../../../lib/accessGrants";
import { emitCreatorEvent as emitRealtimeEvent } from "../../../../server/realtimeHub";
import { resolveNextAction, type TemperatureBucket } from "../../../../lib/ai/temperature";

const MAX_CLIENT_TXN_ID = 120;
const MAX_TITLE_LEN = 140;

function normalizeOfferId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TITLE_LEN) : fallback;
}

function normalizeClientTxnId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CLIENT_TXN_ID);
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/[^\d.,]/g, "").replace(",", ".");
    const amount = Number.parseFloat(normalized);
    return Number.isFinite(amount) ? amount : null;
  }
  return null;
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveGrantType(offerId: string, title: string, amount: number | null): GrantType | null {
  const tokens = [offerId, title].map((value) => normalizeToken(value)).join("|");
  if (tokens.includes("monthly") || tokens.includes("mensual")) return "monthly";
  if (tokens.includes("special") || tokens.includes("especial") || tokens.includes("pareja")) return "special";
  if (tokens.includes("trial") || tokens.includes("welcome") || tokens.includes("prueba")) return "trial";
  if (typeof amount === "number") {
    if (amount === PACKS.monthly.price) return "monthly";
    if (amount === PACKS.special.price) return "special";
    if (amount === PACKS.trial.price) return "trial";
  }
  return null;
}

function resolveContentPack(grantType: GrantType | null) {
  if (grantType === "monthly") return "MONTHLY";
  if (grantType === "special") return "SPECIAL";
  return "WELCOME";
}

function buildUnlockPreview(title: string, amount: number) {
  const amountLabel = amount > 0 ? `${Math.round(amount)}€` : "";
  return `🔓 ${title}${amountLabel ? ` · ${amountLabel}` : ""}`;
}

async function getUnlockContentItem(
  creatorId: string,
  offerId: string,
  title: string,
  pack: "WELCOME" | "MONTHLY" | "SPECIAL",
  prismaClient: Pick<typeof prisma, "contentItem"> = prisma
) {
  const baseSlug = offerId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = baseSlug ? `unlock-${baseSlug}`.slice(0, 80) : "unlock-offer";
  return prismaClient.contentItem.upsert({
    where: { creatorId_slug: { creatorId, slug } },
    update: { title },
    create: {
      creatorId,
      slug,
      pack,
      type: "TEXT",
      title,
      description: "Desbloqueo de acceso del fan",
      isPreview: true,
      visibility: "VIP",
      isExtra: false,
      order: 0,
    },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId : null;
  if (!fanId) return sendBadRequest(res, "Missing fanId");

  const offerId = normalizeOfferId(req.body?.offerId);
  if (!offerId) return sendBadRequest(res, "Missing offerId");
  const title = normalizeTitle(req.body?.title, "Acceso desbloqueado");
  const amountRaw = parseAmount(req.body?.price);
  const grantType = resolveGrantType(offerId, title, amountRaw);
  const amount = typeof amountRaw === "number" ? amountRaw : grantType ? PACKS[grantType].price : 0;
  if (!Number.isFinite(amount) || amount < 0 || amount > 500) {
    return sendBadRequest(res, "Invalid amount");
  }

  const clientTxnId =
    normalizeClientTxnId(req.body?.clientTxnId) ?? `unlock:${offerId}`.slice(0, MAX_CLIENT_TXN_ID);

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: {
        id: true,
        creatorId: true,
        displayName: true,
        name: true,
        lastIntentKey: true,
        temperatureBucket: true,
      },
    });
    if (!fan) return res.status(404).json({ error: "Fan not found" });

    const now = new Date();
    if (grantType) {
      const activeGrant = await prisma.accessGrant.findFirst({
        where: { fanId, type: grantType, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (activeGrant) {
        return res.status(200).json({ ok: true, reused: true, alreadyHasAccess: true });
      }
    }

    const existing = await prisma.extraPurchase.findFirst({
      where: { fanId, kind: "EXTRA", clientTxnId },
      select: { id: true, kind: true, amount: true, createdAt: true },
    });
    if (existing) {
      return res.status(200).json({ ok: true, purchase: existing, reused: true });
    }

    const pack = resolveContentPack(grantType);
    const productType = grantType ? "SUBSCRIPTION" : "PACK";
    const purchase = await prisma.$transaction(async (tx) => {
      const contentItem = await getUnlockContentItem(fan.creatorId, offerId, title, pack, tx);
      const created = await tx.extraPurchase.create({
        data: {
          fanId,
          contentItemId: contentItem.id,
          tier: "T0",
          amount: Math.round(amount),
          kind: "EXTRA",
          productId: offerId,
          productType,
          clientTxnId,
        },
      });
      if (grantType) {
        await upsertAccessGrant({
          fanId,
          type: grantType,
          prismaClient: tx,
          now,
          extendIfActive: false,
        });
      }
      return created;
    });

    const time = now.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const bucketValue =
      typeof fan.temperatureBucket === "string" ? fan.temperatureBucket.trim().toUpperCase() : "";
    const previousScore = bucketValue === "HOT" ? 80 : bucketValue === "WARM" ? 45 : 10;
    const boostedScore = Math.min(100, Math.max(0, previousScore + 50));
    const boostedBucket: TemperatureBucket =
      boostedScore >= 70 ? "HOT" : boostedScore >= 35 ? "WARM" : "COLD";
    const nextAction = resolveNextAction({
      intentKey: fan.lastIntentKey ?? null,
      temperatureBucket: boostedBucket,
    });
    await prisma.fan.update({
      where: { id: fanId },
      data: {
        lastActivityAt: now,
        lastPurchaseAt: now,
        preview: buildUnlockPreview(title, amount),
        time,
        temperatureScore: boostedScore,
        temperatureBucket: boostedBucket,
        nextAction,
        signalsUpdatedAt: now,
      },
    });

    emitRealtimeEvent({
      eventId: purchase.id,
      type: "PURCHASE_CREATED",
      creatorId: fan.creatorId,
      fanId,
      createdAt: purchase.createdAt.toISOString(),
      payload: {
        purchaseId: purchase.id,
        kind: purchase.kind,
        amountCents: Math.round(amount * 100),
        title,
        createdAt: purchase.createdAt.toISOString(),
        fanName: fan.displayName ?? fan.name ?? null,
      },
    });

    return res.status(201).json({
      ok: true,
      reused: false,
      purchase: { id: purchase.id, kind: purchase.kind, amount: purchase.amount, createdAt: purchase.createdAt },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      const existing = await prisma.extraPurchase.findFirst({
        where: { fanId, kind: "EXTRA", clientTxnId },
        select: { id: true, kind: true, amount: true, createdAt: true },
      });
      if (existing) {
        return res.status(200).json({ ok: true, purchase: existing, reused: true });
      }
    }
    console.error("Error creating unlock purchase", error);
    return sendServerError(res, "Failed to create unlock purchase");
  }
}
