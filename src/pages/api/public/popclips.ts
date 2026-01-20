import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { readFanId, slugifyHandle } from "../../../lib/fan/session";

type PublicPopClip = {
  id: string;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  startAtSec: number;
  durationSec: number | null;
  sortOrder: number;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  canInteract: boolean;
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
  res.setHeader("Cache-Control", "no-store");
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

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(12, Math.floor(limitRaw))) : 12;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";

  try {
    const creators = await prisma.creator.findMany({ include: { packs: true } });
    const creator = creators.find((item) => slugifyHandle(item.name) === handle);
    if (!creator) {
      return res.status(404).json({ error: "Not found" });
    }

    const allClips = await prisma.popClip.findMany({
      where: {
        creatorId: creator.id,
        isActive: true,
        isArchived: false,
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 24,
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

    const cursorIndex = cursor ? allClips.findIndex((clip) => clip.id === cursor) : -1;
    if (cursor && cursorIndex === -1) {
      return sendBadRequest(res, "invalid cursor");
    }
    const startIndex = cursor ? cursorIndex + 1 : 0;
    const pageClips = allClips.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < allClips.length ? pageClips[pageClips.length - 1]?.id ?? null : null;

    const clipIds = pageClips.map((clip) => clip.id);
    const fanIdFromCookie = readFanId(req, handle);
    const viewerFan = fanIdFromCookie
      ? await prisma.fan.findFirst({
          where: { id: fanIdFromCookie, creatorId: creator.id },
          select: { id: true },
        })
      : null;
    const viewerFanId = viewerFan?.id ?? "";

    const [reactionCounts, commentCounts, viewerReactions] = await Promise.all([
      clipIds.length > 0
        ? prisma.popClipReaction.groupBy({
            by: ["popClipId"],
            where: { popClipId: { in: clipIds } },
            _count: { _all: true },
          })
        : [],
      clipIds.length > 0
        ? prisma.popClipComment.groupBy({
            by: ["popClipId"],
            where: { popClipId: { in: clipIds } },
            _count: { _all: true },
          })
        : [],
      viewerFanId && clipIds.length > 0
        ? prisma.popClipReaction.findMany({
            where: { popClipId: { in: clipIds }, fanId: viewerFanId },
            select: { popClipId: true },
          })
        : [],
    ]);

    const likeCountByClip = new Map(
      reactionCounts.map((row) => [row.popClipId, row._count._all] as const)
    );
    const commentCountByClip = new Map(
      commentCounts.map((row) => [row.popClipId, row._count._all] as const)
    );
    const likedSet = new Set(viewerReactions.map((row) => row.popClipId));
    const canInteract = Boolean(viewerFanId);

    const publicClips: PublicPopClip[] = pageClips
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
          createdAt: clip.createdAt.toISOString(),
          likeCount: likeCountByClip.get(clip.id) ?? 0,
          commentCount: commentCountByClip.get(clip.id) ?? 0,
          liked: likedSet.has(clip.id),
          canInteract,
          pack: packMeta,
        };
      })
      .filter((clip): clip is PublicPopClip => Boolean(clip));

    return res.status(200).json({ clips: publicClips, nextCursor });
  } catch (err) {
    console.error("Error loading public popclips", err);
    return sendServerError(res);
  }
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
      slug: slugifyHandle(clip.catalogItem?.title || clip.title || "pack"),
      route: buildPackRoute(handle, clip.catalogItem?.id || clip.catalogItemId || "pack"),
      coverUrl: clip.posterUrl ?? null,
    };
  }

  const packKey = normalizeContentPackKey(clip.contentItem?.pack);
  if (!packKey) return null;

  const fallback = DEFAULT_PACK_META[packKey];
  const creatorPack =
    creator.packs.find((pack) => pack.id === packKey) ||
    creator.packs.find((pack) => slugifyHandle(pack.name) === packKey);
  const title = creatorPack?.name || fallback.title;
  const priceMeta = creatorPack ? parsePriceToCents(creatorPack.price) : { cents: fallback.priceCents, currency: "EUR" };

  return {
    id: packKey,
    title,
    description: creatorPack?.description ?? null,
    priceCents: priceMeta.cents,
    currency: priceMeta.currency,
    type: "PACK",
    slug: slugifyHandle(title),
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
