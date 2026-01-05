import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { PACKS } from "../../../../config/packs";
import { upsertAccessGrant, type GrantType } from "../../../../lib/accessGrants";

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

const MAX_CLIENT_TXN_ID = 120;

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

function normalizeClientTxnId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CLIENT_TXN_ID);
}

function buildGiftSessionTag(packId: unknown, packName: unknown): string | null {
  const id = typeof packId === "string" ? packId.trim() : "";
  const name = typeof packName === "string" ? packName.trim() : "";
  if (!id && !name) return null;
  const raw = id && name ? `${id}:${name}` : id || name;
  return raw.slice(0, 120);
}

async function getSupportContentItem(
  creatorId: string,
  kind: SupportKind,
  prismaClient: Pick<typeof prisma, "contentItem"> = prisma
) {
  const content = SUPPORT_CONTENT[kind];
  return prismaClient.contentItem.upsert({
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

function normalizePackToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveGiftProductId(packId: unknown, packName: unknown): string | null {
  const id = typeof packId === "string" ? packId.trim() : "";
  if (id) return id;
  const name = typeof packName === "string" ? packName.trim() : "";
  if (!name) return null;
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function resolveGiftProductType(packId: unknown, packName: unknown, amount: number): "SUBSCRIPTION" | "PACK" | "BUNDLE" | null {
  const id = normalizePackToken(packId);
  const name = normalizePackToken(packName);
  const candidates = [id, name].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("bundle")) return "BUNDLE";
    if (candidate.includes("monthly") || candidate.includes("mensual")) return "SUBSCRIPTION";
    if (candidate.includes("special") || candidate.includes("especial") || candidate.includes("single") || candidate.includes("individual")) {
      return "SUBSCRIPTION";
    }
    if (candidate.includes("trial") || candidate.includes("welcome") || candidate.includes("bienvenida")) return "SUBSCRIPTION";
    if (candidate.includes("pack")) return "PACK";
  }

  if (amount === PACKS.monthly.price) return "SUBSCRIPTION";
  if (amount === PACKS.special.price) return "SUBSCRIPTION";
  if (amount === PACKS.trial.price) return "SUBSCRIPTION";
  return null;
}

function resolveGiftGrantType(packId: unknown, packName: unknown, amount: number): GrantType | null {
  const id = normalizePackToken(packId);
  const name = normalizePackToken(packName);
  const candidates = [id, name].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("monthly") || candidate.includes("mensual")) return "monthly";
    if (candidate.includes("special") || candidate.includes("especial") || candidate.includes("single") || candidate.includes("individual")) {
      return "special";
    }
    if (candidate.includes("trial") || candidate.includes("welcome") || candidate.includes("bienvenida")) return "trial";
  }

  if (amount === PACKS.monthly.price) return "monthly";
  if (amount === PACKS.special.price) return "special";
  if (amount === PACKS.trial.price) return "trial";
  return null;
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
  const clientTxnId = normalizeClientTxnId(req.body?.clientTxnId);

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, creatorId: true },
    });
    if (!fan) return res.status(404).json({ error: "Fan not found" });

    if (clientTxnId) {
      const existing = await prisma.extraPurchase.findUnique({
        where: { clientTxnId },
        select: { id: true, kind: true, amount: true },
      });
      if (existing) {
        return res.status(200).json({ ok: true, purchase: existing, reused: true });
      }
    }

    const now = new Date();
    const purchase = await prisma.$transaction(async (tx) => {
      const supportItem = await getSupportContentItem(fan.creatorId, kind, tx);
      const sessionTag = kind === "GIFT" ? buildGiftSessionTag(packId, packName) : null;
      const productId = kind === "GIFT" ? resolveGiftProductId(packId, packName) : null;
      const productType = kind === "GIFT" ? resolveGiftProductType(packId, packName, amount) : null;
      const created = await tx.extraPurchase.create({
        data: {
          fanId,
          contentItemId: supportItem.id,
          tier: "T0",
          amount,
          kind,
          productId,
          productType,
          sessionTag,
          clientTxnId,
        },
      });

      if (kind === "GIFT") {
        const grantType = resolveGiftGrantType(packId, packName, amount);
        if (grantType) {
          await upsertAccessGrant({
            fanId,
            type: grantType,
            prismaClient: tx,
            now,
            extendIfActive: true,
          });
        }
      }

      return created;
    });

    return res.status(201).json({ ok: true, purchase: { id: purchase.id, kind: purchase.kind, amount: purchase.amount } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002" && clientTxnId) {
      const existing = await prisma.extraPurchase.findUnique({
        where: { clientTxnId },
        select: { id: true, kind: true, amount: true },
      });
      if (existing) {
        return res.status(200).json({ ok: true, purchase: existing, reused: true });
      }
    }
    console.error("Error creating support purchase", error);
    return sendServerError(res, "Failed to create support purchase");
  }
}
