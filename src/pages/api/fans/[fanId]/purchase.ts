import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { PACKS, type PackCode } from "../../../../config/packs";
import { upsertAccessGrant, type GrantType } from "../../../../lib/accessGrants";
import { emitCreatorEvent as emitRealtimeEvent } from "../../../../server/realtimeHub";
import { resolveNextAction, type TemperatureBucket } from "../../../../lib/ai/temperature";
import { buildAccessStateFromGrants } from "../../../../lib/accessState";
import { getAccessSummary } from "../../../../lib/access";
import { getFanContents } from "../../../../lib/fanContent";
import { buildPackStatusById, parseAmountValue, resolveGrantTypeFromPack } from "../../../../lib/fanPackStatus";
import { buildWalletPayload, getOrCreateWallet } from "../../../../lib/wallet";

const MAX_CLIENT_TXN_ID = 120;
const MAX_TITLE_LEN = 140;
const MAX_ID_LEN = 80;
const MAX_AMOUNT = 500;

type PurchaseKind = "OFFER" | "PACK";

type ResolvedPurchase = {
  kind: PurchaseKind;
  itemId: string;
  title: string;
  amount: number;
  amountCents: number;
  grantType: GrantType | null;
  productType: "SUBSCRIPTION" | "PACK";
  pack: "WELCOME" | "MONTHLY" | "SPECIAL";
};

type AccessPayload = {
  accessSummary: ReturnType<typeof getAccessSummary>;
  packStatusById: Record<string, "LOCKED" | "UNLOCKED" | "ACTIVE">;
  unlockedPacks: string[];
  includedContentCount: number;
};

function normalizeItemId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_ID_LEN) : null;
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

function normalizeKind(value: unknown): PurchaseKind | null {
  if (value === "OFFER" || value === "PACK") return value;
  return null;
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolvePackCode(idValue: string): PackCode | null {
  const token = normalizeToken(idValue);
  if (!token) return null;
  if (token.includes("monthly") || token.includes("mensual")) return "monthly";
  if (token.includes("special") || token.includes("especial") || token.includes("pareja")) return "special";
  if (token.includes("trial") || token.includes("welcome") || token.includes("bienvenida") || token.includes("prueba")) {
    return "trial";
  }
  return null;
}

function resolveGrantTypeFromOffer(
  offerId: string,
  title: string,
  amount: number | null,
  tier?: string | null
): GrantType | null {
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
  itemId: string,
  title: string,
  pack: "WELCOME" | "MONTHLY" | "SPECIAL",
  prismaClient: Pick<typeof prisma, "contentItem"> = prisma
) {
  const baseSlug = itemId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

async function resolveOfferForPurchase(creatorId: string, offerId: string): Promise<ResolvedPurchase | null> {
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
    const grantType = resolveGrantTypeFromOffer(matched.code || matched.id, title, amount, matched.tier);
    const productType = grantType ? "SUBSCRIPTION" : "PACK";
    return {
      kind: "OFFER",
      itemId: trimmed,
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
    kind: "OFFER",
    itemId: packCode,
    title,
    amount,
    amountCents,
    grantType: packCode,
    productType: "SUBSCRIPTION",
    pack: resolveContentPack(packCode),
  };
}

async function resolvePackForPurchase(creatorId: string, packId: string): Promise<ResolvedPurchase | null> {
  const pack = await prisma.pack.findFirst({
    where: { id: packId, creatorId },
    select: { id: true, name: true, price: true },
  });
  if (pack) {
    const amount = parseAmountValue(pack.price);
    if (amount === null) return null;
    const grantType = resolveGrantTypeFromPack({ id: pack.id, name: pack.name, price: pack.price }, amount);
    if (!grantType) return null;
    const title = normalizeTitle(pack.name, "Pack desbloqueado");
    const amountCents = Math.round(amount * 100);
    return {
      kind: "PACK",
      itemId: pack.id,
      title,
      amount,
      amountCents,
      grantType,
      productType: "SUBSCRIPTION",
      pack: resolveContentPack(grantType),
    };
  }

  const packCode = resolvePackCode(packId);
  if (!packCode) return null;
  const packMeta = PACKS[packCode];
  const title = normalizeTitle(packCode === "trial" ? "Pack bienvenida" : packMeta.name, "Pack desbloqueado");
  const amount = packMeta.price;
  const amountCents = Math.round(amount * 100);
  return {
    kind: "PACK",
    itemId: packCode,
    title,
    amount,
    amountCents,
    grantType: packCode,
    productType: "SUBSCRIPTION",
    pack: resolveContentPack(packCode),
  };
}

async function buildAccessPayload(fanId: string, creatorId: string, isNew: boolean | null, now: Date): Promise<AccessPayload> {
  const [accessGrants, packs] = await Promise.all([
    prisma.accessGrant.findMany({ where: { fanId } }),
    prisma.pack.findMany({ where: { creatorId }, select: { id: true, name: true, price: true } }),
  ]);
  const accessState = buildAccessStateFromGrants({
    accessGrants,
    isNew: isNew ?? false,
    now,
  });
  const accessSummary = getAccessSummary({
    membershipStatus: accessState.membershipStatus,
    daysLeft: accessState.daysLeft,
    hasAccessHistory: accessState.hasAccessHistory,
    activeGrantTypes: accessState.activeGrantTypes,
  });
  const includedContent = await getFanContents(creatorId, accessSummary, accessState.activeGrantTypes);
  const { packStatusById, unlockedPacks } = buildPackStatusById(packs, accessGrants, now);
  return {
    accessSummary,
    packStatusById,
    unlockedPacks,
    includedContentCount: includedContent.length,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId : null;
  if (!fanId) return sendBadRequest(res, "Missing fanId");

  const offerId = normalizeItemId(req.body?.offerId);
  const packId = normalizeItemId(req.body?.packId);
  const requestedKind = normalizeKind(req.body?.kind);
  const kind: PurchaseKind =
    requestedKind ?? (packId && !offerId ? "PACK" : "OFFER");

  if (kind === "PACK" && !packId) return sendBadRequest(res, "Missing packId");
  if (kind === "OFFER" && !offerId) return sendBadRequest(res, "Missing offerId");

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
        isNew: true,
      },
    });
    if (!fan) return res.status(404).json({ error: "Fan not found" });

    const wallet = await getOrCreateWallet(prisma, fanId);
    const walletEnabled = Boolean(wallet);

    const resolved =
      kind === "PACK"
        ? await resolvePackForPurchase(fan.creatorId, packId as string)
        : await resolveOfferForPurchase(fan.creatorId, offerId as string);
    if (!resolved) {
      return sendBadRequest(res, kind === "PACK" ? "Pack not found" : "Offer not found");
    }
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
        const accessPayload = await buildAccessPayload(fanId, fan.creatorId, fan.isNew ?? false, now);
        return res.status(200).json({
          ok: true,
          reused: true,
          accessGranted: true,
          alreadyHasAccess: true,
          ...buildWalletPayload(wallet),
          ...accessPayload,
        });
      }
    }

    const existing = await prisma.extraPurchase.findFirst({
      where: { fanId, kind: "EXTRA", clientTxnId },
      select: { id: true, kind: true, amount: true, createdAt: true },
    });
    if (existing) {
      const accessPayload = await buildAccessPayload(fanId, fan.creatorId, fan.isNew ?? false, now);
      return res.status(200).json({
        ok: true,
        reused: true,
        accessGranted: true,
        purchase: existing,
        purchaseId: existing.id,
        ...buildWalletPayload(wallet),
        ...accessPayload,
      });
    }

    if (walletEnabled && resolved.amountCents > 0 && (wallet?.balanceCents ?? 0) < resolved.amountCents) {
      return res.status(400).json({
        ok: false,
        error: "INSUFFICIENT_BALANCE",
        requiredCents: resolved.amountCents,
        ...buildWalletPayload(wallet),
      });
    }

    const purchaseResult = await prisma.$transaction(async (tx) => {
      const txWallet = walletEnabled ? await getOrCreateWallet(tx, fanId) : null;
      if (walletEnabled && resolved.amountCents > 0) {
        if (!txWallet || txWallet.balanceCents < resolved.amountCents) {
          const err = new Error("INSUFFICIENT_BALANCE");
          (err as any).code = "INSUFFICIENT_BALANCE";
          throw err;
        }
      }
      const contentItem = await getPurchaseContentItem(
        fan.creatorId,
        resolved.itemId,
        resolved.title,
        resolved.pack,
        tx
      );
      let nextWallet = txWallet;
      if (walletEnabled && resolved.amountCents > 0 && txWallet) {
        const nextBalance = txWallet.balanceCents - resolved.amountCents;
        await (tx as any).walletTransaction.create({
          data: {
            walletId: txWallet.id,
            kind: resolved.kind === "PACK" ? "PACK_PURCHASE" : "EXTRA_PURCHASE",
            amountCents: -resolved.amountCents,
            balanceAfterCents: nextBalance,
            idempotencyKey: clientTxnId,
            meta: {
              itemId: resolved.itemId,
              kind: resolved.kind,
              title: resolved.title,
            },
          },
        });
        const updatedWallet = await (tx as any).wallet.update({
          where: { id: txWallet.id },
          data: { balanceCents: nextBalance },
        });
        nextWallet = {
          id: updatedWallet.id,
          fanId: updatedWallet.fanId,
          currency: updatedWallet.currency || "EUR",
          balanceCents: updatedWallet.balanceCents ?? nextBalance,
        };
      }
      const created = await tx.extraPurchase.create({
        data: {
          fanId,
          contentItemId: contentItem.id,
          tier: "T0",
          amount: Math.round(resolved.amount),
          kind: "EXTRA",
          productId: resolved.itemId,
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
      return { purchase: created, wallet: nextWallet };
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
      eventId: purchaseResult.purchase.id,
      type: "PURCHASE_CREATED",
      creatorId: fan.creatorId,
      fanId,
      createdAt: purchaseResult.purchase.createdAt.toISOString(),
      payload: {
        purchaseId: purchaseResult.purchase.id,
        kind: purchaseResult.purchase.kind,
        amountCents: resolved.amountCents,
        title: resolved.title,
        createdAt: purchaseResult.purchase.createdAt.toISOString(),
        fanName: fan.displayName ?? fan.name ?? null,
        clientTxnId,
      },
    });

    const accessPayload = await buildAccessPayload(fanId, fan.creatorId, fan.isNew ?? false, now);
    return res.status(201).json({
      ok: true,
      reused: false,
      accessGranted: true,
      purchase: {
        id: purchaseResult.purchase.id,
        kind: purchaseResult.purchase.kind,
        amount: purchaseResult.purchase.amount,
        createdAt: purchaseResult.purchase.createdAt,
      },
      purchaseId: purchaseResult.purchase.id,
      ...buildWalletPayload(purchaseResult.wallet),
      ...accessPayload,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "INSUFFICIENT_BALANCE") {
      try {
        const wallet = await getOrCreateWallet(prisma, fanId);
        return res.status(400).json({
          ok: false,
          error: "INSUFFICIENT_BALANCE",
          ...buildWalletPayload(wallet),
        });
      } catch (_err) {
        return res.status(400).json({ ok: false, error: "INSUFFICIENT_BALANCE" });
      }
    }
    if (code === "P2002") {
      const existing = await prisma.extraPurchase.findFirst({
        where: { fanId, kind: "EXTRA", clientTxnId },
        select: { id: true, kind: true, amount: true, createdAt: true },
      });
      if (existing) {
        const fan = await prisma.fan.findUnique({
          where: { id: fanId },
          select: { creatorId: true, isNew: true },
        });
        const now = new Date();
        const accessPayload = fan
          ? await buildAccessPayload(fanId, fan.creatorId, fan.isNew ?? false, now)
          : null;
        const wallet = await getOrCreateWallet(prisma, fanId);
        return res.status(200).json({
          ok: true,
          reused: true,
          accessGranted: true,
          purchase: existing,
          purchaseId: existing.id,
          ...buildWalletPayload(wallet),
          ...(accessPayload ?? {}),
        });
      }
    }
    console.error("Error creating fan purchase", error);
    return sendServerError(res, "Failed to create purchase");
  }
}
