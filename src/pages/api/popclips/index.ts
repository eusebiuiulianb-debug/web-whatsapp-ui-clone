import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { serializePopClip, type PopClipInput } from "../../../lib/popclips";

const ALLOWED_PACK_TYPES = new Set(["PACK"]);
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".webm"];
const MIN_DURATION_SEC = 6;
const MAX_DURATION_SEC = 60;
const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_RESOLUTION_LONG = 1280;
const MAX_RESOLUTION_SHORT = 720;
const DAILY_POPCLIP_LIMIT = 3;
const MAX_ACTIVE_POPCLIPS = 24;
const MAX_STORY_POPCLIPS = 8;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId.trim() : "";
  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }

  try {
    const clips = await (prisma.popClip as any).findMany({
      where: { creatorId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        catalogItem: {
          select: {
            id: true,
            title: true,
            description: true,
            priceCents: true,
            currency: true,
            type: true,
            isPublic: true,
            isActive: true,
          },
        },
      },
    });

    return res.status(200).json({ clips: clips.map((clip: any) => serializePopClip(clip as any)) });
  } catch (err) {
    console.error("Error loading popclips", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Partial<PopClipInput>;
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  const catalogItemId = typeof body.catalogItemId === "string" ? body.catalogItemId.trim() : "";
  const contentItemId = typeof body.contentItemId === "string" ? body.contentItemId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const posterUrl = typeof body.posterUrl === "string" ? body.posterUrl.trim() : "";
  const startAtRaw = body.startAtSec;
  const startAtSec =
    startAtRaw === null || startAtRaw === undefined
      ? 0
      : Number.isFinite(Number(startAtRaw))
      ? Math.max(0, Math.round(Number(startAtRaw)))
      : NaN;
  const durationSecRaw = body.durationSec;
  const durationSec =
    durationSecRaw === null || durationSecRaw === undefined
      ? null
      : Number.isFinite(Number(durationSecRaw))
      ? Math.max(0, Math.round(Number(durationSecRaw)))
      : NaN;
  const videoWidthRaw = body.videoWidth;
  const videoWidth =
    videoWidthRaw === null || videoWidthRaw === undefined
      ? null
      : Number.isFinite(Number(videoWidthRaw))
      ? Math.max(1, Math.round(Number(videoWidthRaw)))
      : NaN;
  const videoHeightRaw = body.videoHeight;
  const videoHeight =
    videoHeightRaw === null || videoHeightRaw === undefined
      ? null
      : Number.isFinite(Number(videoHeightRaw))
      ? Math.max(1, Math.round(Number(videoHeightRaw)))
      : NaN;
  const videoSizeBytesRaw = body.videoSizeBytes;
  const videoSizeBytes =
    videoSizeBytesRaw === null || videoSizeBytesRaw === undefined
      ? null
      : Number.isFinite(Number(videoSizeBytesRaw))
      ? Math.max(0, Math.round(Number(videoSizeBytesRaw)))
      : NaN;
  const isStoryRaw = body.isStory;
  const isStory = typeof isStoryRaw === "boolean" ? isStoryRaw : false;

  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }
  if (!catalogItemId && !contentItemId) {
    return sendBadRequest(res, "catalogItemId or contentItemId is required");
  }
  if (Number.isNaN(startAtSec)) {
    return sendBadRequest(res, "startAtSec must be a number");
  }
  if (Number.isNaN(durationSec)) {
    return sendBadRequest(res, "durationSec must be a number");
  }
  if (Number.isNaN(videoWidth)) {
    return sendBadRequest(res, "videoWidth must be a number");
  }
  if (Number.isNaN(videoHeight)) {
    return sendBadRequest(res, "videoHeight must be a number");
  }
  if (Number.isNaN(videoSizeBytes)) {
    return sendBadRequest(res, "videoSizeBytes must be a number");
  }
  if (isStoryRaw !== undefined && typeof isStoryRaw !== "boolean") {
    return sendBadRequest(res, "isStory must be boolean");
  }
  if (durationSec === null) {
    return sendBadRequest(res, "durationSec is required");
  }
  if (durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) {
    return sendBadRequest(res, `durationSec must be between ${MIN_DURATION_SEC} and ${MAX_DURATION_SEC}`);
  }
  if ((videoWidth === null) !== (videoHeight === null)) {
    return sendBadRequest(res, "videoWidth and videoHeight must be provided together");
  }
  if (videoWidth !== null && videoHeight !== null) {
    const longEdge = Math.max(videoWidth, videoHeight);
    const shortEdge = Math.min(videoWidth, videoHeight);
    if (longEdge > MAX_RESOLUTION_LONG || shortEdge > MAX_RESOLUTION_SHORT) {
      return sendBadRequest(res, "video resolution must be at most 1280x720");
    }
  }
  if (videoSizeBytes !== null && videoSizeBytes > MAX_SIZE_BYTES) {
    return sendBadRequest(res, "videoSizeBytes exceeds 50MB");
  }

  try {
    let resolvedVideoUrl = videoUrl;

    if (catalogItemId) {
      const catalogItem = await prisma.catalogItem.findUnique({
        where: { id: catalogItemId },
        select: { id: true, creatorId: true, type: true },
      });

      if (!catalogItem) {
        return res.status(404).json({ error: "Catalog item not found" });
      }
      if (catalogItem.creatorId !== creatorId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (!ALLOWED_PACK_TYPES.has(catalogItem.type)) {
        return sendBadRequest(res, "catalog item type not allowed");
      }
    }

    if (contentItemId) {
      const contentItem = await prisma.contentItem.findUnique({
        where: { id: contentItemId },
        select: { id: true, creatorId: true, type: true, mediaPath: true, externalUrl: true },
      });
      if (!contentItem) {
        return res.status(404).json({ error: "Content item not found" });
      }
      if (contentItem.creatorId !== creatorId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      resolvedVideoUrl = resolvedVideoUrl || resolveContentMediaUrl(contentItem);
    }

    if (!resolvedVideoUrl) {
      return sendBadRequest(res, "videoUrl is required");
    }
    if (!isDirectVideoUrl(resolvedVideoUrl)) {
      return sendBadRequest(res, "videoUrl must be a direct .mp4 or .webm link");
    }

    const now = new Date();
    const dayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEndUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const popClipClient = prisma.popClip as any;
    const dailyCount = await popClipClient.count({
      where: {
        creatorId,
        createdAt: {
          gte: dayStartUtc,
          lt: dayEndUtc,
        },
      },
    });
    if (dailyCount >= DAILY_POPCLIP_LIMIT) {
      return res.status(429).json({ error: "daily_limit_reached" });
    }

    const resolvedIsActive = typeof body.isActive === "boolean" ? body.isActive : true;
    if (!isStory && resolvedIsActive) {
      const activeClips = await popClipClient.findMany({
        where: { creatorId, isActive: true, isArchived: false, isStory: false },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (activeClips.length >= MAX_ACTIVE_POPCLIPS) {
        const archiveCount = activeClips.length - (MAX_ACTIVE_POPCLIPS - 1);
        const idsToArchive = activeClips.slice(0, archiveCount).map((clip: { id: string }) => clip.id);
        await popClipClient.updateMany({
          where: { id: { in: idsToArchive } },
          data: { isArchived: true, isActive: false },
        });
      }
    }

    if (isStory) {
      const storyCount = await popClipClient.count({
        where: { creatorId, isStory: true, isArchived: false },
      });
      if (storyCount >= MAX_STORY_POPCLIPS) {
        return res.status(409).json({ error: "story_limit_reached" });
      }
    }

    if (catalogItemId) {
      const existing = await popClipClient.findFirst({
        where: { creatorId, catalogItemId },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: "PopClip already exists" });
      }
    }
    if (contentItemId) {
      const existing = await popClipClient.findFirst({
        where: { creatorId, contentItemId },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: "PopClip already exists" });
      }
    }

    const clip = await popClipClient.create({
      data: {
        creatorId,
        catalogItemId: catalogItemId || null,
        contentItemId: contentItemId || null,
        title: title || null,
        videoUrl: resolvedVideoUrl,
        posterUrl: posterUrl || null,
        startAtSec,
        durationSec: durationSec ?? null,
        videoWidth,
        videoHeight,
        videoSizeBytes,
        isActive: isStory ? true : resolvedIsActive,
        isArchived: false,
        isStory,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : 0,
      },
      include: {
        catalogItem: {
          select: {
            id: true,
            title: true,
            description: true,
            priceCents: true,
            currency: true,
            type: true,
            isPublic: true,
            isActive: true,
          },
        },
      },
    });

    return res.status(201).json({ clip: serializePopClip(clip as any) });
  } catch (err) {
    console.error("Error creating popclip", err);
    return sendServerError(res);
  }
}

function resolveContentMediaUrl(contentItem: { mediaPath: string | null; externalUrl: string | null }) {
  const direct = (contentItem.externalUrl || "").trim();
  if (direct) return direct;
  return (contentItem.mediaPath || "").trim();
}

function isDirectVideoUrl(url: string) {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) return false;
  const clean = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  return ALLOWED_VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}
