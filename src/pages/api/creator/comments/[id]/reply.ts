import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { sendBadRequest, sendServerError } from "@/lib/apiError";
import { slugifyHandle } from "@/lib/fan/session";

const MAX_REPLY_LENGTH = 600;

type ReplyResponse =
  | { ok: true; comment: { id: string; replyText: string | null; repliedAt: string | null; repliedByCreatorId: string | null } }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ReplyResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const commentId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!commentId) return sendBadRequest(res, "comment id required");

  const textRaw = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!textRaw || textRaw.length > MAX_REPLY_LENGTH) {
    return sendBadRequest(res, "reply text invalid");
  }

  try {
    const creatorId = await resolveCreatorId();
    const comment = await prisma.creatorComment.findUnique({
      where: { id: commentId },
      select: { id: true, creatorId: true, repliesLocked: true, creator: { select: { name: true } } },
    });
    if (!comment) return res.status(404).json({ ok: false, error: "comment_not_found" });
    if (comment.creatorId !== creatorId) return res.status(403).json({ ok: false, error: "forbidden" });
    if (comment.repliesLocked) {
      return res.status(403).json({ ok: false, error: "THREAD_LOCKED" });
    }

    const previewHandle = readPreviewHandle(req.headers.cookie);
    if (previewHandle) {
      const creatorHandle = slugifyHandle(comment.creator?.name || "");
      if (creatorHandle && previewHandle !== creatorHandle) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
    }

    const now = new Date();
    const updated = await prisma.creatorComment.update({
      where: { id: commentId },
      data: {
        replyText: textRaw,
        repliedAt: now,
        repliedByCreatorId: creatorId,
      },
      select: {
        id: true,
        replyText: true,
        repliedAt: true,
        repliedByCreatorId: true,
      },
    });

    return res.status(200).json({
      ok: true,
      comment: {
        id: updated.id,
        replyText: updated.replyText ?? null,
        repliedAt: updated.repliedAt ? updated.repliedAt.toISOString() : null,
        repliedByCreatorId: updated.repliedByCreatorId ?? null,
      },
    });
  } catch (err) {
    console.error("Error replying to creator comment", err);
    return sendServerError(res);
  }
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("creator_not_found");
  }

  return creator.id;
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const entries = cookieHeader.split(";").map((part) => part.trim().split("="));
  for (const [rawKey, ...rest] of entries) {
    if (!rawKey) continue;
    const key = decodeURIComponent(rawKey);
    if (key !== "novsy_creator_preview") continue;
    return slugifyHandle(decodeURIComponent(rest.join("=")));
  }
  return "";
}
