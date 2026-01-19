import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";

type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  fan: {
    id: string;
    name: string;
    avatar: string | null;
  };
};

type CommentListResponse = {
  items: CommentItem[];
  count: number;
};

type CommentCreateResponse = {
  item: CommentItem;
  count: number;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CommentListResponse | CommentCreateResponse | { error: string }>
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<CommentListResponse | { error: string }>) {
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
          fan: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.popClipComment.count({ where: { popClipId: id } }),
    ]);

    const items = comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      fan: {
        id: comment.fan.id,
        name: comment.fan.name,
        avatar: comment.fan.avatar ?? null,
      },
    }));

    return res.status(200).json({ items, count });
  } catch (err) {
    console.error("Error loading popclip comments", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<CommentCreateResponse | { error: string }>) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    return sendBadRequest(res, "body is required");
  }

  try {
    const clip = await prisma.popClip.findUnique({
      where: { id },
      select: { id: true, creatorId: true, creator: { select: { name: true } } },
    });
    if (!clip) {
      return res.status(404).json({ error: "Not found" });
    }

    const fanId = getFanIdFromCookie(req, clip.creator?.name || "");
    if (!fanId) {
      return res.status(401).json({ error: "auth_required" });
    }

    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId: clip.creatorId },
      select: { id: true, name: true, avatar: true },
    });
    if (!fan) {
      return res.status(401).json({ error: "auth_required" });
    }

    const [comment, count] = await prisma.$transaction([
      prisma.popClipComment.create({
        data: { popClipId: clip.id, fanId: fan.id, body },
      }),
      prisma.popClipComment.count({ where: { popClipId: clip.id } }),
    ]);

    return res.status(200).json({
      item: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        fan: {
          id: fan.id,
          name: fan.name,
          avatar: fan.avatar ?? null,
        },
      },
      count,
    });
  } catch (err) {
    console.error("Error creating popclip comment", err);
    return sendServerError(res);
  }
}

function getFanIdFromCookie(req: NextApiRequest, handle: string) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const key = `novsy_fan_${slugify(handle)}`;
  return cookies[key] || "";
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    const key = decodeURIComponent(rawKey);
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
