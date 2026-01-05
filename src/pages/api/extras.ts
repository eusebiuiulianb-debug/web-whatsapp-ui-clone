import type { NextApiRequest, NextApiResponse } from "next";
import { ExtraTier } from "@prisma/client";
import prisma from "../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../lib/apiError";

const EXTRA_TIERS = ["T0", "T1", "T2", "T3"] as const;

function isValidTier(tier: unknown): tier is ExtraTier {
  return typeof tier === "string" && (EXTRA_TIERS as readonly string[]).includes(tier);
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
      },
    });

    return res.status(201).json({ ok: true, purchase });
  } catch (error) {
    console.error("Error creating extra purchase", error);
    return sendServerError(res, "Failed to create extra purchase");
  }
}
