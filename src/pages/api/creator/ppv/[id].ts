import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";

type PpvAttachment = {
  id: string;
  title: string;
  kind: "CONTENT";
  contentType: string | null;
  url: string | null;
};

type PpvDetailResponse =
  | {
      ok: true;
      ppv: {
        id: string;
        messageId: string | null;
        title: string;
        priceCents: number;
        currency: string;
        status: "locked" | "unlocked";
        content: string | null;
        text: string | null;
        attachments: PpvAttachment[];
        purchasedAt?: string | null;
      };
    }
  | { ok: false; error: string; errorCode?: string; fix?: string[] };

const PPV_OFFER_FALLBACK_TITLE = "Extra";
const OFFER_MARKER = "\n\n__NOVSY_OFFER__:";

function stripOfferMarker(value?: string | null) {
  if (!value) return null;
  const idx = value.indexOf(OFFER_MARKER);
  if (idx === -1) return value;
  return value.slice(0, idx);
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;
  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return creator?.id ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<PpvDetailResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const creatorId = await resolveCreatorId();
  if (!creatorId) {
    return res.status(401).json({ ok: false, error: "CREATOR_NOT_FOUND" });
  }

  const ppvId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!ppvId) {
    return res.status(400).json({ ok: false, error: "Missing ppv id" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  try {
    const ppvMessage = await prisma.ppvMessage.findUnique({
      where: { id: ppvId },
      select: {
        id: true,
        messageId: true,
        title: true,
        priceCents: true,
        currency: true,
        status: true,
        soldAt: true,
        purchaseId: true,
        creatorId: true,
        message: {
          select: {
            text: true,
            contentItem: {
              select: {
                id: true,
                title: true,
                type: true,
                mediaPath: true,
                externalUrl: true,
              },
            },
          },
        },
        purchases: {
          select: { id: true, createdAt: true, fanId: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!ppvMessage?.id) {
      return res.status(404).json({ ok: false, error: "PPV_NOT_FOUND" });
    }
    if (ppvMessage.creatorId !== creatorId) {
      return res.status(403).json({ ok: false, error: "PPV_FORBIDDEN" });
    }

    const purchase = ppvMessage.purchases[0] ?? null;
    const statusRaw = typeof ppvMessage.status === "string" ? ppvMessage.status.trim().toUpperCase() : "";
    const hasPurchase = Boolean(purchase?.id);
    const isSold = statusRaw === "SOLD" || hasPurchase;
    const content = stripOfferMarker(ppvMessage.message?.text ?? null);
    const attachments: PpvAttachment[] = [];
    const contentItem = ppvMessage.message?.contentItem;
    if (contentItem) {
      const url = (contentItem.externalUrl || contentItem.mediaPath || "").trim();
      attachments.push({
        id: contentItem.id,
        title: contentItem.title,
        kind: "CONTENT",
        contentType: contentItem.type,
        url: url || null,
      });
    }
    const purchasedAtSource = ppvMessage.soldAt ?? purchase?.createdAt ?? null;
    const purchasedAt =
      purchasedAtSource instanceof Date
        ? purchasedAtSource.toISOString()
        : typeof purchasedAtSource === "string"
        ? purchasedAtSource
        : null;

    return res.status(200).json({
      ok: true,
      ppv: {
        id: ppvMessage.id,
        messageId: ppvMessage.messageId ?? null,
        title: (ppvMessage.title || "").trim() || PPV_OFFER_FALLBACK_TITLE,
        priceCents: ppvMessage.priceCents,
        currency: (ppvMessage.currency ?? "EUR").toUpperCase(),
        status: isSold ? "unlocked" : "locked",
        content,
        text: content,
        attachments,
        ...(purchasedAt ? { purchasedAt } : {}),
      },
    });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/creator/ppv detail error", { ppvId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error fetching ppv" });
  }
}
