import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

type PurchaseKind = "EXTRA" | "TIP" | "GIFT";

function normalizeKind(kind: string | null | undefined): PurchaseKind {
  if (kind === "TIP" || kind === "GIFT") return kind;
  return "EXTRA";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendBadRequest(res, "Method not allowed");
  }

  const { fanId } = req.query;
  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const purchases = await prisma.extraPurchase.findMany({
      where: { fanId, amount: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        amount: true,
        createdAt: true,
        isArchived: true,
        contentItemId: true,
        contentItem: { select: { title: true } },
      },
    });

    const history = purchases.map((purchase) => ({
      id: purchase.id,
      kind: normalizeKind(purchase.kind),
      amount: purchase.amount ?? 0,
      createdAt: purchase.createdAt,
      contentItemId: purchase.contentItemId ?? null,
      contentTitle: purchase.contentItem?.title ?? null,
      isArchived: purchase.isArchived ?? false,
    }));

    return res.status(200).json({ ok: true, history });
  } catch (error) {
    console.error("Error fetching purchase history", error);
    return sendServerError(res);
  }
}
