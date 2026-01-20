import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";

type ViewerRole = "creator" | "fan";

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

function resolveViewerRole(req: NextApiRequest): ViewerRole {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<PpvDetailResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ppvId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!ppvId) {
    return res.status(400).json({ ok: false, error: "Missing ppv id" });
  }

  const viewerRole = resolveViewerRole(req);
  // No-store avoids stale PPV status/content for creator refresh (pages router).
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
        fanId: true,
        creatorId: true,
        message: { select: { text: true } },
        purchases: {
          select: { id: true, createdAt: true, fanId: true },
          orderBy: { createdAt: "desc" },
        },
        fan: { select: { adultConfirmedAt: true } },
      },
    });

    if (!ppvMessage?.id) {
      return res.status(404).json({ ok: false, error: "PPV_NOT_FOUND" });
    }

    const purchase =
      ppvMessage.purchases.find((item) => item.fanId === ppvMessage.fanId) ??
      ppvMessage.purchases[0] ??
      null;
    const statusRaw = typeof ppvMessage.status === "string" ? ppvMessage.status.trim().toUpperCase() : "";
    const hasPurchase = Boolean(purchase?.id);
    const isSold = statusRaw === "SOLD" || hasPurchase;
    const isUnlocked = viewerRole === "creator" ? isSold : hasPurchase;
    const isAdultConfirmed = Boolean(ppvMessage.fan?.adultConfirmedAt);
    const allowContent = viewerRole === "creator" || (isUnlocked && isAdultConfirmed);
    if (!allowContent && viewerRole === "fan") {
      const errorCode = isAdultConfirmed ? "PPV_LOCKED" : "ADULT_NOT_CONFIRMED";
      return res.status(403).json({ ok: false, error: errorCode });
    }
    const content =
      allowContent ? stripOfferMarker(ppvMessage.message?.text ?? null) : null;
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
        ...(purchasedAt ? { purchasedAt } : {}),
      },
    });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/ppv detail error", { ppvId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error fetching ppv" });
  }
}
