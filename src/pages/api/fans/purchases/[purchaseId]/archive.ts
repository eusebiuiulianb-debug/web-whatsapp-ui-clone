import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendBadRequest(res, "Method not allowed");
  }

  const purchaseId = typeof req.query.purchaseId === "string" ? req.query.purchaseId.trim() : "";
  if (!purchaseId) return sendBadRequest(res, "purchaseId is required");

  const requestedArchived = typeof req.body?.archived === "boolean" ? req.body.archived : null;

  try {
    const existing = await prisma.extraPurchase.findUnique({
      where: { id: purchaseId },
      select: { id: true, fanId: true, isArchived: true },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Purchase not found" });
    }
    const nextArchived = requestedArchived ?? !existing.isArchived;
    const updated = await prisma.extraPurchase.update({
      where: { id: purchaseId },
      data: { isArchived: nextArchived },
      select: { id: true, fanId: true, isArchived: true },
    });
    return res.status(200).json({ ok: true, purchase: updated });
  } catch (err) {
    console.error("Error updating purchase archive state", err);
    return sendServerError(res, "Failed to update purchase");
  }
}
