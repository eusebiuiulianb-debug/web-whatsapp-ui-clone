import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { parseCookieHeader, readFanId, slugifyHandle } from "../../../../../lib/fan/session";

type HelpfulResponse =
  | { ok: true; voted: boolean; helpfulCount: number }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<HelpfulResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
  const commentId = id.trim();
  if (!commentId) return res.status(400).json({ ok: false, error: "Missing id" });

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
    const previewHandle = readPreviewHandle(req.headers.cookie);
    if (previewHandle && previewHandle === creatorHandle) {
      return res.status(403).json({ ok: false, error: "OWNER_NOT_ALLOWED" });
    }
    const fanId = readFanId(req, creatorHandle);
    if (!fanId) return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });

    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId: comment.creatorId },
      select: { id: true },
    });
    if (!fan?.id) {
      return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
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

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const cookies = parseCookieHeader(cookieHeader);
  const value = cookies["novsy_creator_preview"] || "";
  return value ? slugifyHandle(value) : "";
}
