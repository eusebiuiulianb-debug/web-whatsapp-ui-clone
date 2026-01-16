import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { PACKS, type PackCode } from "../../../../config/packs";
import { upsertAccessGrant, type GrantType } from "../../../../lib/accessGrants";
import { emitCreatorEvent as emitRealtimeEvent } from "../../../../server/realtimeHub";
import { resolveNextAction, type TemperatureBucket } from "../../../../lib/ai/temperature";

const MAX_CLIENT_TXN_ID = 120;
const MAX_TITLE_LEN = 140;
const MAX_OFFER_ID_LEN = 80;
const MAX_AMOUNT = 500;

type ResolvedOffer = {
  offerId: string;
  title: string;
  amount: number;
  amountCents: number;
  grantType: GrantType | null;
  productType: "SUBSCRIPTION" | "PACK";
  pack: "WELCOME" | "MONTHLY" | "SPECIAL";
};

function normalizeOfferId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_OFFER_ID_LEN) : null;
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

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolvePackCode(offerId: string): PackCode | null {
  const token = normalizeToken(offerId);
  if (!token) return null;
  if (token.includes("monthly") || token.includes("mensual")) return "monthly";
  if (token.includes("special") || token.includes("especial") || token.includes("pareja")) return "special";
  if (token.includes("trial") || token.includes("welcome") || token.includes("bienvenida") || token.includes("prueba")) {
    return "trial";
  }
  return null;
}

function resolveGrantType(offerId: string, title: string, amount: number | null, tier?: string | null): GrantType | null {
  const normalizedTier = typeof tier === "string" ? tier.trim().toLowerCase() : "";
  if (normalizedTier === "monthly") return "monthly";
  const tokens = [offerId, title].map((value) => normalizeToken(value)).join("|");
  if (tokens.includes("monthly") || tokens.includes("mensual")) return "monthly";
  if (tokens.includes("special") || tokens.includes("especial") || tokens.includes("pareja")) return "special";
  if (tokens.includes("trial") || tokens.includes("welcome") || tokens.includes("bienvenida") || tokens.includes("prueba")) {
    return "trial";
  }
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

function buildPurchasePreview(title: string, amount: number) {
  const amountLabel = amount > 0 ? `${Math.round(amount)} EUR` : "";
  return `Desbloqueado: ${title}${amountLabel ? ` - ${amountLabel}` : ""}`;
}

async function getPurchaseContentItem(
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
      description: "Fan purchase unlock",
      isPreview: true,
      visibility: "VIP",
      isExtra: false,
      order: 0,
    },
  });
}

async function resolveOfferForPurchase(creatorId: string, offerId: string): Promise<ResolvedOffer | null> {
  const offers = await prisma.offer.findMany({
    where: { creatorId, active: true },
    select: { id: true, code: true, title: true, tier: true, priceCents: true },
  });
  const trimmed = offerId.trim();
  const normalized = trimmed.toLowerCase();
  const matched =
    offers.find((offer) => offer.id === trimmed || offer.code === trimmed) ??
    offers.find((offer) => offer.code.toLowerCase() === normalized);

  if (matched) {
    const title = normalizeTitle(matched.title, "Acceso desbloqueado");
    const amountCents = Number.isFinite(matched.priceCents) ? Math.max(0, matched.priceCents) : 0;
    const amount = Math.round(amountCents / 100);
    const grantType = resolveGrantType(matched.code || matched.id, title, amount, matched.tier);
    const productType = grantType ? "SUBSCRIPTION" : "PACK";
    return {
      offerId: trimmed,
      title,
      amount,
      amountCents,
      grantType,
      productType,
      pack: resolveContentPack(grantType),
    };
  }

  const packCode = resolvePackCode(trimmed);
  if (!packCode) return null;
  const pack = PACKS[packCode];
  const title = normalizeTitle(packCode === "trial" ? "Pack bienvenida" : pack.name, "Acceso desbloqueado");
  const amount = pack.price;
  const amountCents = Math.round(amount * 100);
  return {
    offerId: packCode,
    title,
    amount,
    amountCents,
    grantType: packCode,
    productType: "SUBSCRIPTION",
    pack: resolveContentPack(packCode),
  };
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

  const clientTxnId = normalizeClientTxnId(req.body?.clientTxnId);
  if (!clientTxnId) return sendBadRequest(res, "Missing clientTxnId");

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

    const resolved = await resolveOfferForPurchase(fan.creatorId, offerId);
    if (!resolved) return sendBadRequest(res, "Offer not found");
    if (!Number.isFinite(resolved.amount) || resolved.amount < 0 || resolved.amount > MAX_AMOUNT) {
      return sendBadRequest(res, "Invalid amount");
    }

    const now = new Date();
    if (resolved.grantType) {
      const activeGrant = await prisma.accessGrant.findFirst({
        where: { fanId, type: resolved.grantType, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (activeGrant) {
        return res.status(200).json({ ok: true, reused: true, accessGranted: true, alreadyHasAccess: true });
      }
    }

    const existing = await prisma.extraPurchase.findFirst({
      where: { fanId, kind: "EXTRA", clientTxnId },
      select: { id: true, kind: true, amount: true, createdAt: true },
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        reused: true,
        accessGranted: true,
        purchaseId: existing.id,
      });
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const contentItem = await getPurchaseContentItem(
        fan.creatorId,
        resolved.offerId,
        resolved.title,
        resolved.pack,
        tx
      );
      const created = await tx.extraPurchase.create({
        data: {
          fanId,
          contentItemId: contentItem.id,
          tier: "T0",
          amount: Math.round(resolved.amount),
          kind: "EXTRA",
          productId: resolved.offerId,
          productType: resolved.productType,
          clientTxnId,
        },
      });
      if (resolved.grantType) {
        await upsertAccessGrant({
          fanId,
          type: resolved.grantType,
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
        preview: buildPurchasePreview(resolved.title, resolved.amount),
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
        amountCents: resolved.amountCents,
        title: resolved.title,
        createdAt: purchase.createdAt.toISOString(),
        fanName: fan.displayName ?? fan.name ?? null,
        clientTxnId,
      },
    });

    return res.status(201).json({
      ok: true,
      reused: false,
      purchaseId: purchase.id,
      accessGranted: true,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      const existing = await prisma.extraPurchase.findFirst({
        where: { fanId, kind: "EXTRA", clientTxnId },
        select: { id: true, kind: true, amount: true, createdAt: true },
      });
      if (existing) {
        return res.status(200).json({ ok: true, reused: true, accessGranted: true, purchaseId: existing.id });
      }
    }
    console.error("Error creating fan purchase", error);
    return sendServerError(res, "Failed to create purchase");
  }
}
