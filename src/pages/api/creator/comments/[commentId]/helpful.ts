import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { readFanId, slugifyHandle } from "../../../../../lib/fan/session";

type HelpfulResponse =
  | { ok: true; voted: boolean; helpfulCount: number }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<HelpfulResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const commentId = typeof req.query.commentId === "string" ? req.query.commentId.trim() : "";
  if (!commentId) return sendBadRequest(res, "comment id required");

  try {
    const comment = await prisma.creatorComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        creatorId: true,
        isPublic: true,
        status: true,
        creator: { select: { name: true } },
      },
    });
    if (!comment || !comment.isPublic || comment.status !== "APPROVED") {
      return res.status(404).json({ ok: false, error: "comment_not_found" });
    }

    const creatorHandle = slugifyHandle(comment.creator?.name || "");
    const fanId = readFanId(req, creatorHandle);
    if (!fanId) return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });

    const isEligible = await canFanVote(comment.creatorId, fanId);
    if (!isEligible) {
      return res.status(403).json({ ok: false, error: "NOT_ELIGIBLE" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.creatorCommentHelpfulVote.findUnique({
        where: { commentId_fanId: { commentId, fanId } },
        select: { id: true },
      });
      if (existing) {
        await tx.creatorCommentHelpfulVote.delete({
          where: { commentId_fanId: { commentId, fanId } },
        });
        const helpfulCount = await tx.creatorCommentHelpfulVote.count({ where: { commentId } });
        return { voted: false, helpfulCount };
      }
      await tx.creatorCommentHelpfulVote.create({ data: { commentId, fanId } });
      const helpfulCount = await tx.creatorCommentHelpfulVote.count({ where: { commentId } });
      return { voted: true, helpfulCount };
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("Error toggling helpful vote", err);
    return sendServerError(res);
  }
}

async function canFanVote(creatorId: string, fanId: string) {
  const fan = await prisma.fan.findFirst({
    where: { id: fanId, creatorId },
    select: { id: true, isArchived: true },
  });
  if (!fan?.id) return false;

  const now = new Date();
  const [accessGrant, ppvPurchase, extraPurchase] = await Promise.all([
    prisma.accessGrant.findFirst({
      where: { fanId, expiresAt: { gt: now } },
      select: { id: true },
    }),
    prisma.ppvPurchase.findFirst({
      where: { fanId, creatorId, status: "PAID" },
      select: { id: true },
    }),
    prisma.extraPurchase.findFirst({
      where: { fanId, isArchived: false, contentItem: { creatorId } },
      select: { id: true },
    }),
  ]);

  const followsCreator = !fan.isArchived;
  const hasAccess = Boolean(accessGrant || ppvPurchase || extraPurchase);
  return followsCreator || hasAccess;
}
