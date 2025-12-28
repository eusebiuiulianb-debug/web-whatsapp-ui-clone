import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { serializePopClip, type PopClipInput } from "../../../lib/popclips";

const ALLOWED_PACK_TYPES = new Set(["PACK"]);

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
    const clips = await prisma.popClip.findMany({
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

    return res.status(200).json({ clips: clips.map((clip) => serializePopClip(clip)) });
  } catch (err) {
    console.error("Error loading popclips", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Partial<PopClipInput>;
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  const catalogItemId = typeof body.catalogItemId === "string" ? body.catalogItemId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const posterUrl = typeof body.posterUrl === "string" ? body.posterUrl.trim() : "";
  const durationSecRaw = body.durationSec;
  const durationSec =
    durationSecRaw === null || durationSecRaw === undefined
      ? null
      : Number.isFinite(Number(durationSecRaw))
      ? Math.max(0, Math.round(Number(durationSecRaw)))
      : NaN;

  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }
  if (!catalogItemId) {
    return sendBadRequest(res, "catalogItemId is required");
  }
  if (!videoUrl) {
    return sendBadRequest(res, "videoUrl is required");
  }
  if (Number.isNaN(durationSec)) {
    return sendBadRequest(res, "durationSec must be a number");
  }

  try {
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

    const existing = await prisma.popClip.findFirst({
      where: { creatorId, catalogItemId },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: "PopClip already exists" });
    }

    const clip = await (prisma.popClip as any).create({
      data: {
        creatorId,
        catalogItemId,
        title: title || null,
        videoUrl,
        posterUrl: posterUrl || null,
        durationSec: durationSec ?? null,
        isActive: typeof body.isActive === "boolean" ? body.isActive : true,
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

    return res.status(201).json({ clip: serializePopClip(clip) });
  } catch (err) {
    console.error("Error creating popclip", err);
    return sendServerError(res);
  }
}
