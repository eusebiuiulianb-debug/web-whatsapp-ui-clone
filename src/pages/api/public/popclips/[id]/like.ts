import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";

type LikeResponse = {
  liked: boolean;
  likeCount: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<LikeResponse | { error: string }>) {
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

    const fanId = getFanIdFromCookie(req, clip.creator?.name || "");
    if (!fanId) {
      return res.status(401).json({ error: "auth_required" });
    }

    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId: clip.creatorId },
      select: { id: true },
    });
    if (!fan) {
      return res.status(401).json({ error: "auth_required" });
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

    return res.status(200).json(result);
  } catch (err) {
    console.error("Error toggling popclip reaction", err);
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
