import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { readFanId, slugifyHandle } from "../../../lib/fan/session";

type PublicPopClip = {
  id: string;
  title: string | null;
  isSensitive?: boolean;
  creatorIsAdult?: boolean;
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
  canComment: boolean;
  isStory: boolean;
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

type PopClipRow = {
  id: string;
  title: string | null;
  isSensitive?: boolean | null;
  videoUrl: string;
  posterUrl: string | null;
  startAtSec: number;
  durationSec: number | null;
  sortOrder: number;
  createdAt: Date;
  isStory?: boolean | null;
  catalogItemId: string | null;
  catalogItem?: {
    id: string;
    title: string;
    description: string | null;
    priceCents: number;
    currency: string;
    type: string;
    isPublic: boolean;
    isActive: boolean;
  } | null;
  contentItem?: {
    id: string;
    pack: string | null;
    type: string;
    mediaPath: string | null;
    externalUrl: string | null;
  } | null;
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
  const storyParam = typeof req.query.story === "string" ? req.query.story.trim() : "";
  const storyOnly = storyParam === "1" || storyParam.toLowerCase() === "true";
  const popclipLimit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(12, Math.floor(limitRaw))) : 12;
  const storyLimit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(8, Math.floor(limitRaw))) : 8;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
  const clipIdParam = typeof req.query.id === "string" ? req.query.id.trim() : "";

  try {
    const creators = await prisma.creator.findMany({
      include: { packs: true, profile: { select: { visibilityMode: true, isAdult: true } } },
    });
    const creator = creators.find((item) => slugifyHandle(item.name) === handle);
    if (!creator) {
      return res.status(404).json({ error: "Not found" });
    }
    const visibilityMode = resolveVisibilityMode(creator.profile?.visibilityMode);
    const creatorIsAdult = Boolean(creator.profile?.isAdult);
    const previewHandle = readPreviewHandle(req.headers?.cookie);
    const previewAllowed = Boolean(previewHandle && previewHandle === slugifyHandle(creator.name));
    if (visibilityMode === "INVISIBLE" && !previewAllowed) {
      return res.status(404).json({ error: "Not found" });
    }

    const baseWhere = {
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
    };
    const fanIdFromCookie = readFanId(req, handle);
    const viewerFan = fanIdFromCookie
      ? await prisma.fan.findFirst({
          where: { id: fanIdFromCookie, creatorId: creator.id },
          select: { id: true },
        })
      : null;
    const viewerFanId = viewerFan?.id ?? "";
    const clipInclude = {
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
    };

    let popclipClips: PopClipRow[] = [];
    let storyClips: PopClipRow[] = [];
    let nextCursor: string | null = null;
    let popclipsCount = 0;
    let storiesCount = 0;

    if (clipIdParam) {
      const clip = (await prisma.popClip.findFirst({
        where: { ...baseWhere, id: clipIdParam },
        include: clipInclude,
      })) as PopClipRow | null;
      if (clip) {
        if (clip.isStory) {
          storyClips = [clip];
        } else {
          popclipClips = [clip];
        }
      }
      popclipsCount = popclipClips.length;
      storiesCount = storyClips.length;
      nextCursor = null;
    } else if (storyOnly) {
      storyClips = (await prisma.popClip.findMany({
        where: { ...baseWhere, isStory: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: storyLimit,
        include: clipInclude,
      })) as PopClipRow[];
      storiesCount = storyClips.length;
      popclipsCount = 0;
      nextCursor = null;
    } else {
      const [allPopclips, allStories] = await Promise.all([
        prisma.popClip.findMany({
          where: { ...baseWhere, isStory: false },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 24,
          include: clipInclude,
        }),
        prisma.popClip.findMany({
          where: { ...baseWhere, isStory: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: storyLimit,
          include: clipInclude,
        }),
      ]);
      const resolvedPopclips = allPopclips as PopClipRow[];
      const resolvedStories = allStories as PopClipRow[];
      popclipsCount = resolvedPopclips.length;
      storiesCount = resolvedStories.length;
      const cursorIndex = cursor ? resolvedPopclips.findIndex((clip) => clip.id === cursor) : -1;
      if (cursor && cursorIndex === -1) {
        return sendBadRequest(res, "invalid cursor");
      }
      const startIndex = cursor ? cursorIndex + 1 : 0;
      popclipClips = resolvedPopclips.slice(startIndex, startIndex + popclipLimit);
      nextCursor =
        startIndex + popclipLimit < resolvedPopclips.length
          ? popclipClips[popclipClips.length - 1]?.id ?? null
          : null;
      storyClips = resolvedStories;
    }

    const clipIds = Array.from(
      new Set([...popclipClips, ...storyClips].map((clip) => clip.id))
    );
    const [reactionCounts, commentCounts, viewerReactions, accessGrant] = await Promise.all([
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
      viewerFanId
        ? prisma.accessGrant.findFirst({
            where: { fanId: viewerFanId, expiresAt: { gt: new Date() } },
            select: { id: true },
          })
        : null,
    ]);

    const likeCountByClip = new Map(
      reactionCounts.map((row) => [row.popClipId, row._count._all] as const)
    );
    const commentCountByClip = new Map(
      commentCounts.map((row) => [row.popClipId, row._count._all] as const)
    );
    const likedSet = new Set(viewerReactions.map((row) => row.popClipId));
    const canInteract = Boolean(viewerFanId);
    const canComment = Boolean(accessGrant);

    const publicPopclips = serializePublicClips({
      clips: popclipClips,
      creator,
      handle,
      creatorIsAdult,
      likeCountByClip,
      commentCountByClip,
      likedSet,
      canInteract,
      canComment,
    });
    const publicStories = serializePublicClips({
      clips: storyClips,
      creator,
      handle,
      creatorIsAdult,
      likeCountByClip,
      commentCountByClip,
      likedSet,
      canInteract,
      canComment,
    });
    const clipsPayload = clipIdParam || storyOnly ? [...publicStories, ...publicPopclips] : publicPopclips;

    return res.status(200).json({
      clips: clipsPayload,
      popclips: publicPopclips,
      stories: publicStories,
      popclipsCount,
      storiesCount,
      nextCursor,
    });
  } catch (err) {
    console.error("Error loading public popclips", err);
    return sendServerError(res);
  }
}

function buildPackRoute(handle: string, packId: string) {
  return `/p/${handle}/${packId}`;
}

function serializePublicClips({
  clips,
  creator,
  handle,
  creatorIsAdult,
  likeCountByClip,
  commentCountByClip,
  likedSet,
  canInteract,
  canComment,
}: {
  clips: PopClipRow[];
  creator: { packs: Array<{ id: string; name: string; price: string; description: string }> };
  handle: string;
  creatorIsAdult: boolean;
  likeCountByClip: Map<string, number>;
  commentCountByClip: Map<string, number>;
  likedSet: Set<string>;
  canInteract: boolean;
  canComment: boolean;
}): PublicPopClip[] {
  return clips.flatMap((clip) => {
    const packMeta = resolvePackMeta({
      clip,
      creator,
      handle,
    });
    if (!packMeta) return [];
    const videoUrl = clip.videoUrl || resolveContentMediaUrl(clip.contentItem);
    if (!videoUrl) return [];
    return [
      {
        id: clip.id,
        title: clip.title ?? null,
        isSensitive: Boolean(clip.isSensitive),
        creatorIsAdult,
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
        canComment,
        isStory: Boolean(clip.isStory),
        pack: packMeta,
      },
    ];
  });
}

function resolveVisibilityMode(value: unknown): "INVISIBLE" | "SOLO_LINK" | "DISCOVERABLE" | "PUBLIC" {
  if (value === "INVISIBLE") return "INVISIBLE";
  if (value === "DISCOVERABLE") return "DISCOVERABLE";
  if (value === "PUBLIC") return "PUBLIC";
  return "SOLO_LINK";
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const entries = cookieHeader.split(";").map((part) => part.trim().split("="));
  for (const [rawKey, ...rest] of entries) {
    if (!rawKey) continue;
    const key = decodeURIComponent(rawKey);
    if (key !== "novsy_creator_preview") continue;
    return slugifyHandle(decodeURIComponent(rest.join("=")));
  }
  return "";
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
