import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { serializePopClip } from "../../../lib/popclips";

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

    const data: {
      title?: string | null;
      videoUrl?: string;
      posterUrl?: string | null;
      durationSec?: number | null;
      isActive?: boolean;
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

    if ("durationSec" in body) {
      if (body.durationSec === null) {
        data.durationSec = null;
      } else if (!Number.isFinite(Number(body.durationSec))) {
        return sendBadRequest(res, "durationSec must be a number");
      } else {
        data.durationSec = Math.max(0, Math.round(Number(body.durationSec)));
      }
    }

    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        return sendBadRequest(res, "isActive must be boolean");
      }
      data.isActive = body.isActive;
    }

    if ("sortOrder" in body) {
      if (!Number.isFinite(Number(body.sortOrder))) {
        return sendBadRequest(res, "sortOrder must be a number");
      }
      data.sortOrder = Math.round(Number(body.sortOrder));
    }

    const updated = await (prisma.popClip as any).update({
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
