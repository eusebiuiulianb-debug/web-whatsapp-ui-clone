import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import {
  buildWalletPayload,
  getOrCreateWallet,
  hasWalletModel,
  normalizeAmountCents,
  normalizeIdempotencyKey,
} from "../../../../../lib/wallet";

const MAX_TOPUP_CENTS = 50_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) return sendBadRequest(res, "Missing fanId");

  const amountCents = normalizeAmountCents(req.body?.amountCents, MAX_TOPUP_CENTS);
  if (!amountCents) return sendBadRequest(res, "Invalid amountCents");

  const idempotencyKey = normalizeIdempotencyKey(req.body?.idempotencyKey);
  if (!idempotencyKey) return sendBadRequest(res, "Missing idempotencyKey");

  const allowFakeTopup =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_FAKE_PAYMENTS === "true";
  if (!allowFakeTopup) {
    return res.status(403).json({ error: "FAKE_TOPUP_DISABLED" });
  }

  if (!hasWalletModel(prisma)) {
    return res.status(501).json({ error: "WALLET_DISABLED" });
  }

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, adultConfirmedAt: true },
    });
    if (!fan) return res.status(404).json({ error: "Fan not found" });
    if (!fan.adultConfirmedAt) {
      return res.status(403).json({ error: "ADULT_NOT_CONFIRMED" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, fanId);
      if (!wallet) {
        return { wallet: null, transaction: null, reused: false, disabled: true };
      }
      const existing = await (tx as any).walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        const refreshed = await (tx as any).wallet.findUnique({ where: { id: wallet.id } });
        const snapshot = refreshed
          ? {
              id: refreshed.id,
              fanId: refreshed.fanId,
              currency: refreshed.currency || "EUR",
              balanceCents: refreshed.balanceCents ?? 0,
            }
          : wallet;
        return { wallet: snapshot, transaction: existing, reused: true };
      }

      const nextBalance = (wallet.balanceCents ?? 0) + amountCents;
      const transaction = await (tx as any).walletTransaction.create({
        data: {
          walletId: wallet.id,
          kind: "FAKE_TOPUP",
          amountCents,
          balanceAfterCents: nextBalance,
          idempotencyKey,
          meta: { source: "topup" },
        },
      });
      const updated = await (tx as any).wallet.update({
        where: { id: wallet.id },
        data: { balanceCents: nextBalance },
      });
      return {
        wallet: {
          id: updated.id,
          fanId: updated.fanId,
          currency: updated.currency || "EUR",
          balanceCents: updated.balanceCents ?? nextBalance,
        },
        transaction,
        reused: false,
      };
    });

    if (!result.wallet || !result.transaction) {
      return res.status(501).json({ error: "WALLET_DISABLED" });
    }

    return res.status(200).json({
      ok: true,
      reused: result.reused,
      ...buildWalletPayload(result.wallet),
      transaction: {
        id: result.transaction.id,
        kind: result.transaction.kind,
        amountCents: result.transaction.amountCents,
        balanceAfterCents: result.transaction.balanceAfterCents,
        createdAt: result.transaction.createdAt ? result.transaction.createdAt.toISOString() : null,
      },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      try {
        const wallet = await getOrCreateWallet(prisma, fanId);
        if (!wallet) {
          return res.status(501).json({ error: "WALLET_DISABLED" });
        }
        const existing = await (prisma as any).walletTransaction.findFirst({
          where: { idempotencyKey },
        });
        if (existing) {
          return res.status(200).json({
            ok: true,
            reused: true,
            ...buildWalletPayload(wallet),
            transaction: {
              id: existing.id,
              kind: existing.kind,
              amountCents: existing.amountCents,
              balanceAfterCents: existing.balanceAfterCents,
              createdAt: existing.createdAt ? existing.createdAt.toISOString() : null,
            },
          });
        }
      } catch (_err) {
        // fallthrough
      }
    }
    console.error("Error topping up wallet", error);
    return sendServerError(res, "Failed to top up wallet");
  }
}
