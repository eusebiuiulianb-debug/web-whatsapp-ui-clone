import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { ensureFan } from "../../../../../lib/fan/session";
import { enforceRateLimit } from "../../../../../lib/rateLimit";

type SaveResponse =
  | { ok: true; isSaved: boolean; savesCount: number }
  | { ok: false; error: string; retryAfterMs?: number }
  | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<SaveResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", ["POST", "DELETE"]);
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

    const { fanId } = await ensureFan(req, res, {
      creatorId: clip.creatorId,
      creatorHandle: clip.creator?.name || "",
      mode: "public",
    });

    const allowed = await enforceRateLimit({
      req,
      res,
      fanId,
      endpoint: `${req.method} /api/public/popclips/[id]/save`,
      burst: { limit: 8, windowSeconds: 10 },
      cooldownMs: 1000,
    });
    if (!allowed) return;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.popClipSave.findUnique({
        where: { popClipId_fanId: { popClipId: clip.id, fanId } },
        select: { id: true },
      });

      if (req.method === "POST") {
        if (existing) {
          const current = await tx.popClip.findUnique({
            where: { id: clip.id },
            select: { savesCount: true },
          });
          return { isSaved: true, savesCount: current?.savesCount ?? 0 };
        }
        await tx.popClipSave.create({ data: { popClipId: clip.id, fanId } });
        const updated = await tx.popClip.update({
          where: { id: clip.id },
          data: { savesCount: { increment: 1 } },
          select: { savesCount: true },
        });
        return { isSaved: true, savesCount: updated.savesCount ?? 0 };
      }

      if (!existing) {
        const current = await tx.popClip.findUnique({
          where: { id: clip.id },
          select: { savesCount: true },
        });
        return { isSaved: false, savesCount: current?.savesCount ?? 0 };
      }

      await tx.popClipSave.delete({ where: { id: existing.id } });
      const updated = await tx.popClip.update({
        where: { id: clip.id },
        data: { savesCount: { decrement: 1 } },
        select: { savesCount: true },
      });
      const safeCount = Math.max(0, updated.savesCount ?? 0);
      if (safeCount !== updated.savesCount) {
        await tx.popClip.update({
          where: { id: clip.id },
          data: { savesCount: safeCount },
        });
      }
      return { isSaved: false, savesCount: safeCount };
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("Error toggling popclip save", err);
    return sendServerError(res);
  }
}
