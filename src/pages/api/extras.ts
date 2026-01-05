import type { NextApiRequest, NextApiResponse } from "next";
import { ExtraTier } from "@prisma/client";
import prisma from "../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../lib/apiError";

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
    if (clientTxnId) {
      const existing = await prisma.extraPurchase.findFirst({
        where: { fanId, kind: "EXTRA", clientTxnId },
      });
      if (existing) {
        return res.status(200).json({ ok: true, purchase: existing, reused: true });
      }
    }

    const purchase = await prisma.extraPurchase.create({
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
    const now = new Date();
    const time = now.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const preview = formatPurchasePreview(purchase.contentItem?.title ?? null, amountNumber);
    await prisma.fan.update({
      where: { id: fanId },
      data: {
        lastActivityAt: now,
        lastPurchaseAt: now,
        preview,
        time,
      },
    });

    return res.status(201).json({ ok: true, purchase, reused: false });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002" && clientTxnId) {
      const existing = await prisma.extraPurchase.findFirst({
        where: { fanId, kind: "EXTRA", clientTxnId },
      });
      if (existing) {
        return res.status(200).json({ ok: true, purchase: existing, reused: true });
      }
    }
    console.error("Error creating extra purchase", error);
    return sendServerError(res, "Failed to create extra purchase");
  }
}
