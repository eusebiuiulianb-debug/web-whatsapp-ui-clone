import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { readFanId } from "../../../../../lib/fan/session";
import { enforceRateLimit } from "../../../../../lib/rateLimit";

type LikeResponse =
  | { ok: true; liked: boolean; likeCount: number }
  | { ok: false; error: string; retryAfterMs?: number }
  | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<LikeResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  try {
    const clip = await prisma.popClip.findUnique({
      where: { id },
      select: { id: true, creatorId: true, creator: { select: { name: true } } },
    });
    if (!clip) {
      return res.status(404).json({ error: "Not found" });
    }

    const fanId = readFanId(req, clip.creator?.name || "");
    if (!fanId) {
      return res.status(401).json({ ok: false, error: "CHAT_REQUIRED" });
    }

    const allowed = await enforceRateLimit({
      req,
      res,
      fanId,
      endpoint: "POST /api/public/popclips/[id]/like",
      burst: { limit: 8, windowSeconds: 10 },
      cooldownMs: 1000,
    });
    if (!allowed) return;

    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId: clip.creatorId },
      select: { id: true },
    });
    if (!fan) {
      return res.status(403).json({ ok: false, error: "CHAT_REQUIRED" });
    }
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.popClipReaction.findUnique({
        where: { popClipId_fanId: { popClipId: clip.id, fanId: fan.id } },
        select: { id: true },
      });
      if (existing) {
        await tx.popClipReaction.delete({ where: { id: existing.id } });
        const likeCount = await tx.popClipReaction.count({ where: { popClipId: clip.id } });
        return { liked: false, likeCount };
      }
      await tx.popClipReaction.create({ data: { popClipId: clip.id, fanId: fan.id } });
      const likeCount = await tx.popClipReaction.count({ where: { popClipId: clip.id } });
      return { liked: true, likeCount };
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("Error toggling popclip reaction", err);
    return sendServerError(res);
  }
}
