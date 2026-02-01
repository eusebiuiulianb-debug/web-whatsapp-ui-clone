import fs from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { slugifyHandle } from "../../../../lib/fan/session";

type PopClipFeedItem = {
  id: string;
  creatorId: string;
  packId?: string | null;
  title: string | null;
  caption?: string | null;
  thumbnailUrl: string | null;
  posterUrl?: string | null;
  videoUrl?: string | null;
  durationSec: number | null;
  createdAt: string;
  commentCount?: number;
  creatorRating?: number | null;
  creatorReviewCount?: number;
  creator: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
    isPro: boolean;
    vipEnabled: boolean;
    avgResponseHours: number | null;
    responseTime: string | null;
    isAvailable: boolean;
    locationLabel: string | null;
    allowLocation?: boolean;
    popclipPreviewLimit?: number;
    ratingAvg?: number | null;
    ratingCount?: number | null;
    offerTags?: string[] | null;
  };
  stats?: {
    likeCount: number;
    commentCount: number;
  };
  savesCount?: number;
  distanceKm?: number | null;
};

type CreatorAvailability = "AVAILABLE" | "OFFLINE" | "VIP_ONLY";
type CreatorResponseTime = "INSTANT" | "LT_24H" | "LT_72H";

const DISCOVERABLE_VISIBILITY = ["PUBLIC", "DISCOVERABLE"] as const;
const DEFAULT_PREVIEW_LIMIT = 3;

const CLIP_SELECT = {
  id: true,
  title: true,
  caption: true,
  catalogItemId: true,
  posterUrl: true,
  durationSec: true,
  savesCount: true,
  createdAt: true,
  creator: {
    select: {
      id: true,
      name: true,
      bioLinkAvatarUrl: true,
      isVerified: true,
      profile: {
        select: {
          availability: true,
          responseSla: true,
          vipOnly: true,
          locationLabel: true,
          locationGeohash: true,
          locationVisibility: true,
          allowDiscoveryUseLocation: true,
          isVerified: true,
          plan: true,
          popclipPreviewLimit: true,
          ratingAvg: true,
          ratingCount: true,
          offerTags: true,
        },
      },
    },
  },
  _count: {
    select: {
      reactions: true,
      comments: true,
    },
  },
  videoUrl: true,
} as const;

type ClipRow = Prisma.PopClipGetPayload<{ select: typeof CLIP_SELECT }>;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = normalizeIds(rawIds);
  if (ids.length === 0) {
    return res.status(200).json({ items: [] });
  }

  try {
    const items = (await prisma.popClip.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        isArchived: false,
        isStory: false,
        AND: [
          {
            OR: [
              { catalogItem: { isActive: true, isPublic: true } },
              { contentItemId: { not: null } },
            ],
          },
          {
            OR: [
              {
                creator: {
                  profile: { is: { visibilityMode: { in: DISCOVERABLE_VISIBILITY } } },
                },
              },
              {
                creator: {
                  discoveryProfile: { is: { isDiscoverable: true } },
                },
              },
            ],
          },
        ],
      } as Prisma.PopClipWhereInput,
      select: CLIP_SELECT,
    })) as unknown as ClipRow[];

    const mapped = mapItems(items);
    const mappedWithReviews = await attachCreatorReviews(mapped);
    const byId = new Map(mappedWithReviews.map((item) => [item.id, item]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as PopClipFeedItem[];

    return res.status(200).json({ items: ordered });
  } catch (err) {
    console.error("Error loading saved popclips", err);
    return res.status(500).json({ error: "No se pudieron cargar los PopClips" });
  }
}

function normalizeIds(values: unknown[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const key = String(value).trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    ids.push(key);
  });
  return ids;
}

function mapItems(items: ClipRow[]): PopClipFeedItem[] {
  return items.map((clip) => {
    const creatorName = clip.creator?.name || "Creador";
    const handle = slugifyHandle(creatorName || "creator");
    const availabilityValue = normalizeAvailability(clip.creator?.profile?.availability) ?? "AVAILABLE";
    const responseValue = normalizeResponseTime(clip.creator?.profile?.responseSla) ?? "LT_24H";
    const avgResponseHours = resolveResponseHours(responseValue);
    const responseTime = formatResponseTimeLabel(responseValue);
    const vipEnabled = Boolean(clip.creator?.profile?.vipOnly) || availabilityValue === "VIP_ONLY";
    const isAvailable = availabilityValue === "AVAILABLE" || availabilityValue === "VIP_ONLY";
    const isVerified = Boolean(clip.creator?.profile?.isVerified ?? clip.creator?.isVerified);
    const isPro = clip.creator?.profile?.plan === "PRO";
    const popclipPreviewLimit = normalizePreviewLimit(clip.creator?.profile?.popclipPreviewLimit);
    const ratingAvg = clip.creator?.profile?.ratingAvg ?? null;
    const ratingCount = clip.creator?.profile?.ratingCount ?? 0;
    const offerTags = normalizeOfferTags(clip.creator?.profile?.offerTags);
    const locationVisibility = (clip.creator?.profile?.locationVisibility || "").toUpperCase();
    const locationEnabled =
      locationVisibility !== "OFF" &&
      Boolean(clip.creator?.profile?.locationGeohash) &&
      Boolean(clip.creator?.profile?.locationLabel);
    const allowLocation = locationEnabled && Boolean(clip.creator?.profile?.allowDiscoveryUseLocation);
    const locationLabel = allowLocation ? clip.creator?.profile?.locationLabel ?? null : null;

    return {
      id: clip.id,
      creatorId: clip.creator?.id ?? "",
      packId: clip.catalogItemId ?? null,
      title: clip.title ?? null,
      caption: clip.caption ?? clip.title ?? null,
      thumbnailUrl: clip.posterUrl ?? null,
      posterUrl: clip.posterUrl ?? null,
      videoUrl: clip.videoUrl ?? null,
      durationSec: clip.durationSec ?? null,
      createdAt: clip.createdAt.toISOString(),
      savesCount: clip.savesCount ?? 0,
      commentCount: clip._count?.comments ?? 0,
      creator: {
        handle,
        displayName: creatorName,
        avatarUrl: normalizeAvatarUrl(clip.creator?.bioLinkAvatarUrl ?? null),
        isVerified,
        isPro,
        vipEnabled,
        avgResponseHours,
        responseTime,
        isAvailable,
        locationLabel,
        allowLocation,
        popclipPreviewLimit,
        ratingAvg,
        ratingCount,
        offerTags,
      },
      stats: {
        likeCount: clip._count?.reactions ?? 0,
        commentCount: clip._count?.comments ?? 0,
      },
      distanceKm: null,
    };
  });
}

async function attachCreatorReviews(items: PopClipFeedItem[]) {
  if (items.length === 0) return items;
  const creatorIds = Array.from(new Set(items.map((item) => item.creatorId).filter(Boolean)));
  if (creatorIds.length === 0) {
    return items.map((item) => ({ ...item, creatorRating: null, creatorReviewCount: 0 }));
  }
  const rows = await prisma.creatorComment.groupBy({
    by: ["creatorId"],
    where: { creatorId: { in: creatorIds }, isPublic: true, status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const reviewMap = new Map<string, { ratingAvg: number | null; reviewCount: number }>();
  rows.forEach((row) => {
    const reviewCount = row._count?._all ?? 0;
    const avgRaw = typeof row._avg?.rating === "number" ? row._avg.rating : null;
    const ratingAvg = reviewCount > 0 && avgRaw !== null ? Math.round(avgRaw * 10) / 10 : null;
    reviewMap.set(row.creatorId, { ratingAvg, reviewCount });
  });
  return items.map((item) => {
    const stats = reviewMap.get(item.creatorId);
    return {
      ...item,
      creatorRating: stats?.ratingAvg ?? null,
      creatorReviewCount: stats?.reviewCount ?? 0,
    };
  });
}

function normalizeAvailability(value?: string | null): CreatorAvailability | null {
  const normalized = (value || "").toUpperCase();
  if (normalized === "AVAILABLE" || normalized === "ONLINE") return "AVAILABLE";
  if (normalized === "VIP_ONLY") return "VIP_ONLY";
  if (normalized === "NOT_AVAILABLE" || normalized === "OFFLINE") return "OFFLINE";
  return null;
}

function normalizePreviewLimit(value?: number | null) {
  if (value === 1 || value === 3 || value === 5) return value;
  return DEFAULT_PREVIEW_LIMIT;
}

function normalizeOfferTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => Boolean(tag));
}

function normalizeResponseTime(value?: string | null): CreatorResponseTime | null {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "INSTANT";
  if (normalized === "LT_24H") return "LT_24H";
  if (normalized === "LT_72H" || normalized === "LT_48H") return "LT_72H";
  return null;
}

function resolveResponseHours(responseValue: CreatorResponseTime) {
  if (responseValue === "INSTANT") return 1;
  if (responseValue === "LT_24H") return 24;
  if (responseValue === "LT_72H") return 72;
  return null;
}

function formatResponseTimeLabel(value: CreatorResponseTime) {
  if (value === "INSTANT") return "Responde al momento";
  if (value === "LT_72H") return "Responde <72h";
  return "Responde <24h";
}

function normalizeAvatarUrl(value?: string | null): string | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const publicPath = path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
  if (!fs.existsSync(publicPath)) return null;
  return normalized;
}
