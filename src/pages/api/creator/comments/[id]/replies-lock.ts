import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { parseCookieHeader, slugifyHandle } from "../../../../../lib/fan/session";

type LockResponse =
  | { ok: true; repliesLocked: boolean }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<LockResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) return sendBadRequest(res, "Missing id");
  const commentId = id.trim();
  if (!commentId) return sendBadRequest(res, "Missing id");

  const locked = typeof req.body?.locked === "boolean" ? req.body.locked : null;
  if (locked === null) return sendBadRequest(res, "locked flag required");

  try {
    const comment = await prisma.creatorComment.findUnique({
      where: { id: commentId },
      select: { id: true, creator: { select: { name: true } } },
    });
    if (!comment) {
      return res.status(404).json({ ok: false, error: "comment_not_found" });
    }

    const previewHandle = readPreviewHandle(req.headers.cookie);
    const creatorHandle = slugifyHandle(comment.creator?.name || "");
    if (!previewHandle || previewHandle !== creatorHandle) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const updated = await prisma.creatorComment.update({
      where: { id: commentId },
      data: { repliesLocked: locked },
      select: { repliesLocked: true },
    });

    return res.status(200).json({ ok: true, repliesLocked: updated.repliesLocked });
  } catch (err) {
    console.error("Error toggling replies lock", err);
    return sendServerError(res);
  }
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const cookies = parseCookieHeader(cookieHeader);
  const value = cookies["novsy_creator_preview"] || "";
  return value ? slugifyHandle(value) : "";
}
