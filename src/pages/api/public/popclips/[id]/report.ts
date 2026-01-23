import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { readFanId } from "../../../../../lib/fan/session";
import { enforceRateLimit } from "../../../../../lib/rateLimit";

type ReportResponse =
  | { ok: true }
  | { ok: false; error: string; retryAfterMs?: number }
  | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ReportResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  const rawReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (rawReason.length > 500) {
    return sendBadRequest(res, "reason is too long");
  }
  const reason = rawReason || null;

  try {
    const clip = await prisma.popClip.findUnique({
      where: { id },
      select: { id: true, creator: { select: { name: true } } },
    });
    if (!clip) {
      return res.status(404).json({ error: "Not found" });
    }

    const fanId = readFanId(req, clip.creator?.name) || null;

    const allowed = await enforceRateLimit({
      req,
      res,
      fanId,
      endpoint: "POST /api/public/popclips/[id]/report",
      burst: { limit: 4, windowSeconds: 60 },
      cooldownMs: 1000,
    });
    if (!allowed) return;

    if (fanId) {
      const existing = await prisma.popClipReport.findUnique({
        where: { popClipId_fanId: { popClipId: id, fanId } },
        select: { id: true },
      });
      if (existing) {
        return res.status(200).json({ ok: true });
      }
    }

    await prisma.popClipReport.create({
      data: {
        popClipId: id,
        fanId,
        reason,
      },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error reporting popclip", err);
    return sendServerError(res);
  }
}
