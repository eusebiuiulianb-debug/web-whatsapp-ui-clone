import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { readFanId } from "../../../../../lib/fan/session";
import { enforceRateLimit } from "../../../../../lib/rateLimit";

type CommentItem = {
  id: string;
  text: string;
  createdAt: string;
  fanDisplayName: string;
};

type CommentListResponse = { ok: true; items: CommentItem[]; count: number } | { error: string };
type CommentCreateResponse =
  | { ok: true; item: CommentItem; count: number }
  | { ok: false; error: string; retryAfterMs?: number }
  | { error: string };

const MAX_COMMENT_LENGTH = 300;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CommentListResponse | CommentCreateResponse>
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<CommentListResponse>) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  try {
    const clip = await prisma.popClip.findUnique({ where: { id }, select: { id: true } });
    if (!clip) {
      return res.status(404).json({ error: "Not found" });
    }

    const [comments, count] = await Promise.all([
      prisma.popClipComment.findMany({
        where: { popClipId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          fan: { select: { name: true, displayName: true } },
        },
      }),
      prisma.popClipComment.count({ where: { popClipId: id } }),
    ]);

    const items = comments.map((comment) => ({
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
      fanDisplayName: resolveFanDisplayName(comment.fan?.displayName, comment.fan?.name),
    }));

    return res.status(200).json({ ok: true, items, count });
  } catch (err) {
    console.error("Error loading popclip comments", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<CommentCreateResponse>) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return sendBadRequest(res, "text is required");
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    return sendBadRequest(res, "text is too long");
  }
  if (isEmojiOnly(text)) {
    return sendBadRequest(res, "text is invalid");
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
      endpoint: "POST /api/public/popclips/[id]/comments",
      burst: { limit: 8, windowSeconds: 10 },
      cooldownMs: 5000,
    });
    if (!allowed) return;

    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId: clip.creatorId },
      select: { id: true, name: true, displayName: true },
    });
    if (!fan) {
      return res.status(403).json({ ok: false, error: "CHAT_REQUIRED" });
    }
    const [comment, count] = await prisma.$transaction([
      prisma.popClipComment.create({
        data: { popClipId: clip.id, fanId: fan.id, text },
      }),
      prisma.popClipComment.count({ where: { popClipId: clip.id } }),
    ]);

    return res.status(200).json({
      ok: true,
      item: {
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        fanDisplayName: resolveFanDisplayName(fan.displayName, fan.name),
      },
      count,
    });
  } catch (err) {
    console.error("Error creating popclip comment", err);
    return sendServerError(res);
  }
}

function resolveFanDisplayName(displayName?: string | null, fallbackName?: string | null) {
  const name = (displayName || fallbackName || "Fan").trim();
  return name || "Fan";
}

function isEmojiOnly(text: string) {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  return /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\uFE0F]+$/u.test(compact);
}
