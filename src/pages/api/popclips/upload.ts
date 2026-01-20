import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import fs from "fs/promises";
import formidable, { type File } from "formidable";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { serializePopClip } from "../../../lib/popclips";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

function sanitizeFileToken(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function safeParseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

async function moveFile(source: string, dest: string) {
  try {
    await fs.rename(source, dest);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "EXDEV") {
      throw err;
    }
    await fs.copyFile(source, dest);
    await fs.unlink(source);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({
    multiples: false,
    maxFileSize: MAX_SIZE_BYTES + 1024,
    allowEmptyFiles: false,
  });

  try {
    const parsed = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const fields = parsed.fields;
    const files = parsed.files;
    const fileCandidate = (files.file ?? files.video ?? null) as File | File[] | null;
    const file = Array.isArray(fileCandidate) ? fileCandidate[0] : fileCandidate;
    if (!file) {
      return sendBadRequest(res, "Missing video file");
    }

    const creatorIdRaw = Array.isArray(fields.creatorId) ? fields.creatorId[0] : fields.creatorId;
    const creatorId = typeof creatorIdRaw === "string" ? creatorIdRaw.trim() : "";
    if (!creatorId) {
      return sendBadRequest(res, "creatorId is required");
    }

    const catalogItemIdRaw = Array.isArray(fields.catalogItemId) ? fields.catalogItemId[0] : fields.catalogItemId;
    const catalogItemId = typeof catalogItemIdRaw === "string" ? catalogItemIdRaw.trim() : "";
    const contentItemIdRaw = Array.isArray(fields.contentItemId) ? fields.contentItemId[0] : fields.contentItemId;
    const contentItemId = typeof contentItemIdRaw === "string" ? contentItemIdRaw.trim() : "";
    if (!catalogItemId && !contentItemId) {
      return sendBadRequest(res, "catalogItemId or contentItemId is required");
    }

    const titleRaw = Array.isArray(fields.title) ? fields.title[0] : fields.title;
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";

    const posterUrlRaw = Array.isArray(fields.posterUrl) ? fields.posterUrl[0] : fields.posterUrl;
    const posterUrl = typeof posterUrlRaw === "string" ? posterUrlRaw.trim() : "";

    const startAtSecRaw = Array.isArray(fields.startAtSec) ? fields.startAtSec[0] : fields.startAtSec;
    const startAtSecParsed = safeParseNumber(startAtSecRaw);
    if (Number.isNaN(startAtSecParsed)) {
      return sendBadRequest(res, "startAtSec must be a number");
    }
    const startAtSec = Number.isFinite(startAtSecParsed) ? Math.max(0, Math.round(startAtSecParsed)) : 0;

    const durationSecRaw = Array.isArray(fields.durationSec) ? fields.durationSec[0] : fields.durationSec;
    const durationSecParsed = safeParseNumber(durationSecRaw);
    if (Number.isNaN(durationSecParsed)) {
      return sendBadRequest(res, "durationSec must be a number");
    }
    const durationSec = Math.max(0, Math.round(durationSecParsed));
    if (durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) {
      return sendBadRequest(res, `durationSec must be between ${MIN_DURATION_SEC} and ${MAX_DURATION_SEC}`);
    }

    const videoWidthRaw = Array.isArray(fields.videoWidth) ? fields.videoWidth[0] : fields.videoWidth;
    const videoHeightRaw = Array.isArray(fields.videoHeight) ? fields.videoHeight[0] : fields.videoHeight;
    const videoWidthParsed = safeParseNumber(videoWidthRaw);
    const videoHeightParsed = safeParseNumber(videoHeightRaw);
    if (Number.isNaN(videoWidthParsed) || Number.isNaN(videoHeightParsed)) {
      return sendBadRequest(res, "videoWidth and videoHeight must be numbers");
    }
    const videoWidth = Math.max(1, Math.round(videoWidthParsed));
    const videoHeight = Math.max(1, Math.round(videoHeightParsed));
    const longEdge = Math.max(videoWidth, videoHeight);
    const shortEdge = Math.min(videoWidth, videoHeight);
    if (longEdge > MAX_RESOLUTION_LONG || shortEdge > MAX_RESOLUTION_SHORT) {
      return sendBadRequest(res, "video resolution must be at most 1280x720");
    }

    const fileSize = typeof file.size === "number" ? file.size : 0;
    if (fileSize > MAX_SIZE_BYTES) {
      return sendBadRequest(res, "videoSizeBytes exceeds 50MB");
    }

    const isStoryRaw = Array.isArray(fields.isStory) ? fields.isStory[0] : fields.isStory;
    const isStory = isStoryRaw === "true" || isStoryRaw === "1";

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
        select: { id: true, creatorId: true },
      });
      if (!contentItem) {
        return res.status(404).json({ error: "Content item not found" });
      }
      if (contentItem.creatorId !== creatorId) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const now = new Date();
    const dayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEndUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const dailyCount = await prisma.popClip.count({
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

    const popClipClient = prisma.popClip as any;
    if (!isStory) {
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
          data: { isArchived: true, isActive: false, isStory: false },
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

    const extension = path.extname(file.originalFilename || file.newFilename || "").toLowerCase();
    if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
      return sendBadRequest(res, "videoUrl must be a direct .mp4 or .webm link");
    }

    const safeCreator = sanitizeFileToken(creatorId || "creator");
    const destDir = path.join(process.cwd(), "public", "uploads", "popclips", safeCreator);
    await fs.mkdir(destDir, { recursive: true });
    const fileToken = sanitizeFileToken(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const filename = `${fileToken}${extension}`;
    const destPath = path.join(destDir, filename);
    await moveFile(file.filepath, destPath);

    const publicUrl = `/${path.posix.join("uploads", "popclips", safeCreator, filename)}`;

    const clip = await popClipClient.create({
      data: {
        creatorId,
        catalogItemId: catalogItemId || null,
        contentItemId: contentItemId || null,
        title: title || null,
        videoUrl: publicUrl,
        posterUrl: posterUrl || null,
        startAtSec,
        durationSec,
        videoWidth,
        videoHeight,
        videoSizeBytes: fileSize,
        isActive: true,
        isArchived: false,
        isStory,
        sortOrder: 0,
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
    console.error("Error uploading popclip", err);
    return sendServerError(res);
  }
}
