import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { serializePopClip } from "../../../lib/popclips";

const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".webm"];
const MAX_ACTIVE_POPCLIPS = 24;
const MAX_STORY_POPCLIPS = 8;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "PATCH") {
    return handlePatch(req, res);
  }
  if (req.method === "DELETE") {
    return handleDelete(req, res);
  }
  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  const body = req.body ?? {};
  const creatorId =
    typeof body.creatorId === "string"
      ? body.creatorId.trim()
      : typeof req.query.creatorId === "string"
      ? req.query.creatorId.trim()
      : "";
  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }

  try {
    const popClipClient = prisma.popClip as any;
    const existing = await popClipClient.findUnique({
      where: { id },
      select: { id: true, creatorId: true, isStory: true, isArchived: true, isActive: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }
    if (existing.creatorId !== creatorId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const data: {
      title?: string | null;
      videoUrl?: string;
      posterUrl?: string | null;
      startAtSec?: number;
      durationSec?: number | null;
      isActive?: boolean;
      isArchived?: boolean;
      isStory?: boolean;
      sortOrder?: number;
    } = {};

    if ("title" in body) {
      if (body.title === null) {
        data.title = null;
      } else if (typeof body.title === "string") {
        const trimmed = body.title.trim();
        data.title = trimmed || null;
      } else {
        return sendBadRequest(res, "title must be a string");
      }
    }

    if ("videoUrl" in body) {
      if (typeof body.videoUrl !== "string" || !body.videoUrl.trim()) {
        return sendBadRequest(res, "videoUrl is required");
      }
      if (!isDirectVideoUrl(body.videoUrl)) {
        return sendBadRequest(res, "videoUrl must be a direct .mp4 or .webm link");
      }
      data.videoUrl = body.videoUrl.trim();
    }

    if ("posterUrl" in body) {
      if (body.posterUrl === null) {
        data.posterUrl = null;
      } else if (typeof body.posterUrl === "string") {
        const trimmed = body.posterUrl.trim();
        data.posterUrl = trimmed || null;
      } else {
        return sendBadRequest(res, "posterUrl must be a string");
      }
    }

    if ("startAtSec" in body) {
      if (!Number.isFinite(Number(body.startAtSec))) {
        return sendBadRequest(res, "startAtSec must be a number");
      }
      data.startAtSec = Math.max(0, Math.round(Number(body.startAtSec)));
    }

    if ("durationSec" in body) {
      if (body.durationSec === null) {
        return sendBadRequest(res, "durationSec is required");
      } else if (!Number.isFinite(Number(body.durationSec))) {
        return sendBadRequest(res, "durationSec must be a number");
      } else {
        const durationSec = Math.max(0, Math.round(Number(body.durationSec)));
        if (durationSec < 6 || durationSec > 60) {
          return sendBadRequest(res, "durationSec must be between 6 and 60");
        }
        data.durationSec = durationSec;
      }
    }

    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        return sendBadRequest(res, "isActive must be boolean");
      }
      data.isActive = body.isActive;
    }

    if ("isArchived" in body) {
      if (typeof body.isArchived !== "boolean") {
        return sendBadRequest(res, "isArchived must be boolean");
      }
      data.isArchived = body.isArchived;
    }

    if ("isStory" in body) {
      if (typeof body.isStory !== "boolean") {
        return sendBadRequest(res, "isStory must be boolean");
      }
      data.isStory = body.isStory;
    }

    if ("sortOrder" in body) {
      if (!Number.isFinite(Number(body.sortOrder))) {
        return sendBadRequest(res, "sortOrder must be a number");
      }
      data.sortOrder = Math.round(Number(body.sortOrder));
    }

    if (data.isStory === true && !existing.isStory) {
      const storyCount = await popClipClient.count({
        where: { creatorId, isStory: true, isArchived: false, id: { not: id } },
      });
      if (storyCount >= MAX_STORY_POPCLIPS) {
        return res.status(409).json({ error: "story_limit_reached" });
      }
    }

    const wasActiveFeed = !existing.isArchived && !existing.isStory && existing.isActive;
    if (data.isStory === true) {
      data.isArchived = false;
      data.isActive = true;
    }
    if (data.isArchived === true) {
      data.isActive = false;
      data.isStory = false;
    }
    if (data.isArchived === false) {
      if (data.isActive === undefined) {
        data.isActive = true;
      }
    }

    const nextIsStory = typeof data.isStory === "boolean" ? data.isStory : existing.isStory;
    const nextIsArchived = typeof data.isArchived === "boolean" ? data.isArchived : existing.isArchived;
    const nextIsActive = typeof data.isActive === "boolean" ? data.isActive : existing.isActive;
    const willBeActiveFeed = !nextIsArchived && !nextIsStory && nextIsActive;

    if (willBeActiveFeed && !wasActiveFeed) {
      const activeClips = await popClipClient.findMany({
        where: { creatorId, isActive: true, isArchived: false, isStory: false, id: { not: id } },
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

    const updated = await popClipClient.update({
      where: { id },
      data,
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

    return res.status(200).json({ clip: serializePopClip(updated) });
  } catch (err) {
    console.error("Error updating popclip", err);
    return sendServerError(res);
  }
}

function isDirectVideoUrl(url: string) {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) return false;
  const clean = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  return ALLOWED_VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  const body = req.body ?? {};
  const creatorId =
    typeof body.creatorId === "string"
      ? body.creatorId.trim()
      : typeof req.query.creatorId === "string"
      ? req.query.creatorId.trim()
      : "";
  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }

  try {
    const existing = await prisma.popClip.findUnique({
      where: { id },
      select: { id: true, creatorId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }
    if (existing.creatorId !== creatorId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await (prisma.popClip as any).delete({ where: { id } });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error deleting popclip", err);
    return sendServerError(res);
  }
}
