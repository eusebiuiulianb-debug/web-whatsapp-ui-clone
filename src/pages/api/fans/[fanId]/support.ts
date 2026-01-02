import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

type SupportKind = "TIP" | "GIFT";

type SupportMeta = { slug: string; title: string; description: string };

const SUPPORT_CONTENT: Record<SupportKind, SupportMeta> = {
  TIP: {
    slug: "support-tip",
    title: "Propina",
    description: "Apoyo del fan",
  },
  GIFT: {
    slug: "support-gift",
    title: "Regalo",
    description: "Regalo del fan",
  },
};

function normalizeSupportKind(value: unknown): SupportKind | null {
  if (value === "TIP" || value === "GIFT") return value;
  return null;
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

function buildGiftSessionTag(packId: unknown, packName: unknown): string | null {
  const id = typeof packId === "string" ? packId.trim() : "";
  const name = typeof packName === "string" ? packName.trim() : "";
  if (!id && !name) return null;
  const raw = id && name ? `${id}:${name}` : id || name;
  return raw.slice(0, 120);
}

async function getSupportContentItem(creatorId: string, kind: SupportKind) {
  const content = SUPPORT_CONTENT[kind];
  return prisma.contentItem.upsert({
    where: { creatorId_slug: { creatorId, slug: content.slug } },
    update: {},
    create: {
      creatorId,
      slug: content.slug,
      pack: "SPECIAL",
      type: "TEXT",
      title: content.title,
      description: content.description,
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

  const kind = normalizeSupportKind(req.body?.kind);
  if (!kind) return sendBadRequest(res, "Invalid kind");

  const rawAmount = parseAmount(req.body?.amount);
  if (!rawAmount || rawAmount <= 0 || rawAmount > 500) {
    return sendBadRequest(res, "Invalid amount");
  }
  const amount = Math.round(rawAmount);
  if (amount <= 0) {
    return sendBadRequest(res, "Invalid amount");
  }

  const packId = req.body?.packId;
  const packName = req.body?.packName;

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, creatorId: true },
    });
    if (!fan) return res.status(404).json({ error: "Fan not found" });

    const supportItem = await getSupportContentItem(fan.creatorId, kind);
    const sessionTag = kind === "GIFT" ? buildGiftSessionTag(packId, packName) : null;

    const purchase = await prisma.extraPurchase.create({
      data: {
        fanId,
        contentItemId: supportItem.id,
        tier: "T0",
        amount,
        kind,
        sessionTag,
      },
    });

    return res.status(201).json({ ok: true, purchase: { id: purchase.id, kind: purchase.kind, amount: purchase.amount } });
  } catch (error) {
    console.error("Error creating support purchase", error);
    return sendServerError(res, "Failed to create support purchase");
  }
}
