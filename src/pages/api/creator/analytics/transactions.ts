import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { PACKS } from "../../../../config/packs";
import { daysAgoInTimeZone } from "../../../../lib/timezone";

type TransactionsRange = "7d" | "30d" | "90d";
type TransactionKind = "EXTRA" | "SUB" | "TIP" | "GIFT" | "PACK";
type TransactionStatus = "PAID" | "PENDING" | "REFUNDED" | "FAILED";

type TransactionEntry = {
  id: string;
  createdAt: string;
  fan: { id: string; name: string | null };
  kind: TransactionKind;
  itemTitle: string | null;
  amount: number;
  currency: "EUR";
  status?: TransactionStatus;
};

function normalizeRange(value: unknown): TransactionsRange | null {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return null;
}

function getRangeStart(range: TransactionsRange): Date {
  if (range === "30d") return daysAgoInTimeZone(30);
  if (range === "90d") return daysAgoInTimeZone(90);
  return daysAgoInTimeZone(7);
}

function normalizePurchaseKind(raw: string | null | undefined): "EXTRA" | "TIP" | "GIFT" {
  if (raw === "TIP" || raw === "GIFT") return raw;
  return "EXTRA";
}

function normalizeGrantType(raw: string | null | undefined): "monthly" | "special" | "trial" | "welcome" | "unknown" {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "monthly") return "monthly";
  if (normalized === "special") return "special";
  if (normalized === "trial") return "trial";
  if (normalized === "welcome") return "welcome";
  if (normalized === "single") return "special";
  return "unknown";
}

function getGrantAmount(type: string): number {
  if (type === "monthly") return PACKS.monthly.price;
  if (type === "special") return PACKS.special.price;
  if (type === "trial") return PACKS.trial.price;
  return 0;
}

function getGrantTitle(type: string): string {
  if (type === "monthly") return PACKS.monthly.name;
  if (type === "special") return PACKS.special.name;
  if (type === "trial") return PACKS.trial.name;
  return "Pack";
}

function getGrantKind(type: string): TransactionKind {
  return type === "monthly" ? "SUB" : "PACK";
}

function parseGiftSessionTag(tag?: string | null): { id?: string; name?: string } {
  const value = typeof tag === "string" ? tag.trim() : "";
  if (!value) return {};
  const parts = value.split(":").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { id: parts[0], name: parts.slice(1).join(":") };
  }
  return { id: value };
}

function resolvePackName(productId?: string | null, fallbackName?: string | null): string | null {
  const id = productId?.trim() ?? "";
  if (id && (id === PACKS.monthly.code || id === PACKS.special.code || id === PACKS.trial.code)) {
    return PACKS[id as keyof typeof PACKS]?.name ?? fallbackName ?? null;
  }
  return fallbackName ?? null;
}

function resolveFanName(fan?: { displayName?: string | null; name?: string | null }): string | null {
  const value = fan?.displayName?.trim() || fan?.name?.trim();
  return value || null;
}

function resolvePurchaseTitle({
  kind,
  contentTitle,
  productId,
  sessionTag,
}: {
  kind: TransactionKind;
  contentTitle?: string | null;
  productId?: string | null;
  sessionTag?: string | null;
}): string | null {
  if (kind === "TIP") return "Propina";
  if (kind === "GIFT") {
    const giftInfo = parseGiftSessionTag(sessionTag);
    return resolvePackName(productId, giftInfo.name ?? null) ?? "Regalo";
  }
  return contentTitle ?? resolvePackName(productId, null) ?? "Extra";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TransactionEntry[] | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const range = normalizeRange(req.query.range);
  if (!range) {
    return sendBadRequest(res, "range must be 7d, 30d, or 90d");
  }

  const creatorId = process.env.CREATOR_ID ?? "creator-1";
  const now = new Date();
  const from = getRangeStart(range);

  try {
    const [purchases, grants] = await Promise.all([
      prisma.extraPurchase.findMany({
        where: {
          fan: { creatorId },
          createdAt: { gte: from, lte: now },
          amount: { gt: 0 },
          isArchived: false,
        },
        select: {
          id: true,
          createdAt: true,
          fanId: true,
          amount: true,
          kind: true,
          productId: true,
          sessionTag: true,
          contentItem: { select: { title: true } },
          fan: { select: { displayName: true, name: true } },
        },
      }),
      prisma.accessGrant.findMany({
        where: {
          fan: { creatorId },
          createdAt: { gte: from, lte: now },
        },
        select: {
          id: true,
          createdAt: true,
          fanId: true,
          type: true,
          fan: { select: { displayName: true, name: true } },
        },
      }),
    ]);

    const transactions: TransactionEntry[] = [];

    for (const purchase of purchases) {
      const kind = normalizePurchaseKind(purchase.kind);
      const itemTitle = resolvePurchaseTitle({
        kind,
        contentTitle: purchase.contentItem?.title ?? null,
        productId: purchase.productId ?? null,
        sessionTag: purchase.sessionTag ?? null,
      });
      transactions.push({
        id: purchase.id,
        createdAt: purchase.createdAt.toISOString(),
        fan: { id: purchase.fanId, name: resolveFanName(purchase.fan) },
        kind,
        itemTitle,
        amount: Number(purchase.amount) || 0,
        currency: "EUR",
        status: "PAID",
      });
    }

    for (const grant of grants) {
      const grantType = normalizeGrantType(grant.type);
      const amount = getGrantAmount(grantType);
      if (amount <= 0) continue;
      transactions.push({
        id: grant.id,
        createdAt: grant.createdAt.toISOString(),
        fan: { id: grant.fanId, name: resolveFanName(grant.fan) },
        kind: getGrantKind(grantType),
        itemTitle: getGrantTitle(grantType),
        amount,
        currency: "EUR",
        status: "PAID",
      });
    }

    transactions.sort((a, b) => {
      const aTs = new Date(a.createdAt).getTime();
      const bTs = new Date(b.createdAt).getTime();
      return bTs - aTs;
    });

    return res.status(200).json(transactions);
  } catch (error) {
    console.error("Error loading transactions analytics", error);
    return sendServerError(res, "Failed to load transactions");
  }
}
