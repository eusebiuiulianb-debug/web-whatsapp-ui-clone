import type { NextApiRequest, NextApiResponse } from "next";
import { ExtraTier } from "@prisma/client";
import prisma from "../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../lib/apiError";
import { emitCreatorEvent as emitRealtimeEvent } from "../../server/realtimeHub";
import { resolveNextAction, type TemperatureBucket } from "../../lib/ai/temperature";
import { buildWalletPayload, getOrCreateWallet } from "../../lib/wallet";

const EXTRA_TIERS = ["T0", "T1", "T2", "T3"] as const;
const MAX_CLIENT_TXN_ID = 120;

function isValidTier(tier: unknown): tier is ExtraTier {
  return typeof tier === "string" && (EXTRA_TIERS as readonly string[]).includes(tier);
}

function normalizeClientTxnId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CLIENT_TXN_ID);
}

function formatPurchasePreview(title: string | null, amount: number) {
  const safeTitle = title?.trim() || "Extra";
  const amountLabel = `${Math.round(amount)}€`;
  return `🧾 ${safeTitle} · ${amountLabel}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end("Method Not Allowed");
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { fanId } = req.query;
  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "Missing fanId");
  }

  try {
    const purchases = await prisma.extraPurchase.findMany({
      where: { fanId, kind: "EXTRA", amount: { gt: 0 }, isArchived: false },
      orderBy: { createdAt: "desc" },
      include: { contentItem: true },
    });

    const history = purchases.map((p) => ({
      id: p.id,
      tier: p.tier,
      amount: p.amount,
      sessionTag: p.sessionTag,
      createdAt: p.createdAt,
      contentItem: {
        id: p.contentItemId,
        title: p.contentItem.title,
        type: p.contentItem.type,
        timeOfDay: p.contentItem.timeOfDay,
        isExtra: p.contentItem.isExtra,
        extraTier: p.contentItem.extraTier,
      },
    }));

    return res.status(200).json({ ok: true, history });
  } catch (error) {
    console.error("Error fetching extras history", error);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { fanId, contentItemId, tier, amount, sessionTag } = req.body || {};
  const clientTxnId = normalizeClientTxnId(req.body?.clientTxnId);
  console.log("POST /api/extras body:", req.body);

  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }
  if (!contentItemId || typeof contentItemId !== "string") {
    return sendBadRequest(res, "contentItemId is required");
  }
  if (!isValidTier(tier)) {
    return sendBadRequest(res, "Invalid tier");
  }
  const amountNumber = typeof amount === "string" ? parseInt(amount, 10) : amount;
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    return sendBadRequest(res, "Invalid amount");
  }

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: {
        id: true,
        creatorId: true,
        displayName: true,
        name: true,
        membershipStatus: true,
        lastMessageAt: true,
        lastInboundAt: true,
        lastIntentKey: true,
        lastPurchaseAt: true,
        daysLeft: true,
        temperatureBucket: true,
      },
    });
    if (!fan) {
      return sendBadRequest(res, "Fan not found");
    }

    if (clientTxnId) {
      const existing = await prisma.extraPurchase.findFirst({
        where: { fanId, kind: "EXTRA", clientTxnId },
      });
      if (existing) {
        const wallet = await getOrCreateWallet(prisma, fanId);
        return res.status(200).json({
          ok: true,
          purchase: existing,
          reused: true,
          ...buildWalletPayload(wallet),
        });
      }
    }

    const wallet = await getOrCreateWallet(prisma, fanId);
    const walletEnabled = Boolean(wallet);
    if (walletEnabled && amountNumber > 0 && (wallet?.balanceCents ?? 0) < Math.round(amountNumber * 100)) {
      return res.status(400).json({
        ok: false,
        error: "INSUFFICIENT_BALANCE",
        requiredCents: Math.round(amountNumber * 100),
        ...buildWalletPayload(wallet),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const txWallet = walletEnabled ? await getOrCreateWallet(tx, fanId) : null;
      if (walletEnabled && amountNumber > 0) {
        if (!txWallet || txWallet.balanceCents < Math.round(amountNumber * 100)) {
          const err = new Error("INSUFFICIENT_BALANCE");
          (err as any).code = "INSUFFICIENT_BALANCE";
          throw err;
        }
      }
      let nextWallet = txWallet;
      if (walletEnabled && amountNumber > 0 && txWallet) {
        const amountCents = Math.round(amountNumber * 100);
        const nextBalance = txWallet.balanceCents - amountCents;
        await (tx as any).walletTransaction.create({
          data: {
            walletId: txWallet.id,
            kind: "EXTRA_PURCHASE",
            amountCents: -amountCents,
            balanceAfterCents: nextBalance,
            idempotencyKey: clientTxnId ?? undefined,
            meta: {
              extraId: contentItemId,
              tier,
              sessionTag: typeof sessionTag === "string" ? sessionTag : null,
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
      const purchase = await tx.extraPurchase.create({
        data: {
          fanId,
          contentItemId,
          tier,
          amount: amountNumber,
          kind: "EXTRA",
          productId: contentItemId,
          productType: "EXTRA",
          sessionTag: typeof sessionTag === "string" && sessionTag.trim().length > 0 ? sessionTag.trim() : null,
          clientTxnId,
        },
        include: { contentItem: { select: { title: true } } },
      });
      return { purchase, wallet: nextWallet };
    });
    const now = new Date();
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
    const preview = formatPurchasePreview(result.purchase.contentItem?.title ?? null, amountNumber);
    await prisma.fan.update({
      where: { id: fanId },
      data: {
        lastActivityAt: now,
        lastPurchaseAt: now,
        preview,
        time,
        temperatureScore: boostedScore,
        temperatureBucket: boostedBucket,
        nextAction,
        signalsUpdatedAt: now,
      },
    });

    emitRealtimeEvent({
      eventId: result.purchase.id,
      type: "PURCHASE_CREATED",
      creatorId: fan.creatorId,
      fanId,
      createdAt: result.purchase.createdAt.toISOString(),
      payload: {
        purchaseId: result.purchase.id,
        kind: result.purchase.kind,
        amountCents: Math.round((result.purchase.amount ?? amountNumber) * 100),
        title: result.purchase.contentItem?.title ?? null,
        createdAt: result.purchase.createdAt.toISOString(),
        fanName: fan.displayName ?? fan.name ?? null,
      },
    });

    return res.status(201).json({
      ok: true,
      purchase: result.purchase,
      reused: false,
      ...buildWalletPayload(result.wallet),
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
    if (code === "P2002" && clientTxnId) {
      const existing = await prisma.extraPurchase.findFirst({
        where: { fanId, kind: "EXTRA", clientTxnId },
      });
      if (existing) {
        const wallet = await getOrCreateWallet(prisma, fanId);
        return res.status(200).json({
          ok: true,
          purchase: existing,
          reused: true,
          ...buildWalletPayload(wallet),
        });
      }
    }
    console.error("Error creating extra purchase", error);
    return sendServerError(res, "Failed to create extra purchase");
  }
}
