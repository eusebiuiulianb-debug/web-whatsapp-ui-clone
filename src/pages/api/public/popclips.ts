import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

type PublicPopClip = {
  id: string;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  startAtSec: number;
  durationSec: number | null;
  sortOrder: number;
  pack: {
    id: string;
    title: string;
    description: string | null;
    priceCents: number;
    currency: string;
    type: string;
    slug: string;
    route: string;
    coverUrl: string | null;
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
    const creators = await prisma.creator.findMany({ include: { packs: true } });
    const creator = creators.find((item) => slugify(item.name) === handle);
    if (!creator) {
      return res.status(404).json({ error: "Not found" });
    }

    const clips = await prisma.popClip.findMany({
      where: {
        creatorId: creator.id,
        isActive: true,
        OR: [
          {
            catalogItem: {
              isActive: true,
              isPublic: true,
            },
          },
          { contentItemId: { not: null } },
        ],
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
        contentItem: {
          select: {
            id: true,
            pack: true,
            type: true,
            mediaPath: true,
            externalUrl: true,
          },
        },
      },
    });

    const publicClips: PublicPopClip[] = clips
      .map((clip) => {
        const packMeta = resolvePackMeta({
          clip,
          creator,
          handle,
        });
        if (!packMeta) return null;
        const videoUrl = clip.videoUrl || resolveContentMediaUrl(clip.contentItem);
        if (!videoUrl) return null;
        return {
          id: clip.id,
          title: clip.title ?? null,
          videoUrl,
          posterUrl: clip.posterUrl ?? null,
          startAtSec: Number.isFinite(Number(clip.startAtSec)) ? Math.max(0, Number(clip.startAtSec)) : 0,
          durationSec: clip.durationSec ?? null,
          sortOrder: clip.sortOrder,
          pack: packMeta,
        };
      })
      .filter((clip): clip is PublicPopClip => Boolean(clip));

    return res.status(200).json({ clips: publicClips });
  } catch (err) {
    console.error("Error loading public popclips", err);
    return sendServerError(res);
  }
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function buildPackRoute(handle: string, packId: string) {
  return `/p/${handle}/${packId}`;
}

function resolveContentMediaUrl(contentItem?: { mediaPath: string | null; externalUrl: string | null } | null) {
  if (!contentItem) return "";
  return (contentItem.externalUrl || contentItem.mediaPath || "").trim();
}

function resolvePackMeta({
  clip,
  creator,
  handle,
}: {
  clip: {
    catalogItem?: {
      id: string;
      title: string;
      description: string | null;
      priceCents: number;
      currency: string;
      type: string;
    } | null;
    catalogItemId: string | null;
    contentItem?: { pack: string | null } | null;
    posterUrl: string | null;
    title: string | null;
  };
  creator: { packs: Array<{ id: string; name: string; price: string; description: string }> };
  handle: string;
}) {
  if (clip.catalogItem?.type === "PACK") {
    return {
      id: clip.catalogItem?.id || clip.catalogItemId || "pack",
      title: clip.catalogItem?.title || "Pack",
      description: clip.catalogItem?.description ?? null,
      priceCents: clip.catalogItem?.priceCents ?? 0,
      currency: clip.catalogItem?.currency ?? "EUR",
      type: clip.catalogItem?.type ?? "PACK",
      slug: slugify(clip.catalogItem?.title || clip.title || "pack"),
      route: buildPackRoute(handle, clip.catalogItem?.id || clip.catalogItemId || "pack"),
      coverUrl: clip.posterUrl ?? null,
    };
  }

  const packKey = normalizeContentPackKey(clip.contentItem?.pack);
  if (!packKey) return null;

  const fallback = DEFAULT_PACK_META[packKey];
  const creatorPack =
    creator.packs.find((pack) => pack.id === packKey) ||
    creator.packs.find((pack) => slugify(pack.name) === packKey);
  const title = creatorPack?.name || fallback.title;
  const priceMeta = creatorPack ? parsePriceToCents(creatorPack.price) : { cents: fallback.priceCents, currency: "EUR" };

  return {
    id: packKey,
    title,
    description: creatorPack?.description ?? null,
    priceCents: priceMeta.cents,
    currency: priceMeta.currency,
    type: "PACK",
    slug: slugify(title),
    route: buildPackRoute(handle, packKey),
    coverUrl: clip.posterUrl ?? null,
  };
}

const DEFAULT_PACK_META: Record<string, { title: string; priceCents: number }> = {
  welcome: { title: "Pack bienvenida", priceCents: 900 },
  monthly: { title: "Suscripción mensual", priceCents: 2500 },
  special: { title: "Pack especial", priceCents: 4900 },
};

function normalizeContentPackKey(value?: string | null) {
  const key = (value || "").toLowerCase().trim();
  if (key === "welcome" || key === "monthly" || key === "special") return key;
  return "";
}

function parsePriceToCents(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw) return { cents: 0, currency: "EUR" };
  const currency = raw.includes("$") ? "USD" : raw.includes("£") ? "GBP" : "EUR";
  const normalized = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  if (Number.isNaN(amount)) return { cents: 0, currency };
  return { cents: Math.round(amount * 100), currency };
}
