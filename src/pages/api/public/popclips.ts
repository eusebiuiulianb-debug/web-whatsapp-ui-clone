import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

type PublicPopClip = {
  id: string;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  durationSec: number | null;
  sortOrder: number;
  pack: {
    id: string;
    title: string;
    description: string | null;
    priceCents: number;
    currency: string;
    type: string;
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const handleParam =
    typeof req.query.creatorHandle === "string"
      ? req.query.creatorHandle
      : typeof req.query.handle === "string"
      ? req.query.handle
      : "";
  const handle = handleParam.trim();
  if (!handle) {
    return sendBadRequest(res, "handle is required");
  }

  try {
    const creators = await prisma.creator.findMany();
    const creator = creators.find((item) => slugify(item.name) === handle);
    if (!creator) {
      return res.status(404).json({ error: "Not found" });
    }

    const clips = await prisma.popClip.findMany({
      where: {
        creatorId: creator.id,
        isActive: true,
        catalogItem: {
          isActive: true,
          isPublic: true,
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
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

    const publicClips: PublicPopClip[] = clips
      .filter((clip) => clip.catalogItem?.type === "PACK")
      .map((clip) => ({
        id: clip.id,
        title: clip.title ?? null,
        videoUrl: clip.videoUrl,
        posterUrl: clip.posterUrl ?? null,
        durationSec: clip.durationSec ?? null,
        sortOrder: clip.sortOrder,
        pack: {
          id: clip.catalogItem?.id || clip.catalogItemId,
          title: clip.catalogItem?.title || "Pack",
          description: clip.catalogItem?.description ?? null,
          priceCents: clip.catalogItem?.priceCents ?? 0,
          currency: clip.catalogItem?.currency ?? "EUR",
          type: clip.catalogItem?.type ?? "PACK",
        },
      }));

    return res.status(200).json({ clips: publicClips });
  } catch (err) {
    console.error("Error loading public popclips", err);
    return sendServerError(res);
  }
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
