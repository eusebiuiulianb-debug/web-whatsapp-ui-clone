import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { getOrCreateWallet } from "../../../../lib/wallet";

const MAX_TXNS = 8;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) return sendBadRequest(res, "Missing fanId");

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true },
    });
    if (!fan) return res.status(404).json({ error: "Fan not found" });

    const wallet = await getOrCreateWallet(prisma, fanId);
    if (!wallet) {
      return res.status(200).json({ ok: true, enabled: false });
    }
    const transactions = await (prisma as any).walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: MAX_TXNS,
    });

    return res.status(200).json({
      ok: true,
      enabled: true,
      currency: wallet.currency || "EUR",
      balanceCents: wallet.balanceCents ?? 0,
      lastTransactions: (transactions || []).map((txn: any) => ({
        id: txn.id,
        kind: txn.kind,
        amountCents: txn.amountCents,
        balanceAfterCents: txn.balanceAfterCents,
        createdAt: txn.createdAt ? txn.createdAt.toISOString() : null,
        meta: txn.meta ?? null,
      })),
    });
  } catch (error) {
    console.error("Error loading wallet", error);
    return sendServerError(res, "Failed to load wallet");
  }
}
