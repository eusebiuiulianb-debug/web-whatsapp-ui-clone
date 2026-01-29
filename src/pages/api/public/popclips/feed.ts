import fs from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { slugifyHandle } from "../../../../lib/fan/session";
import { decodeGeohash, haversineKm } from "../../../../lib/geo";

type PopClipFeedItem = {
  id: string;
  creatorId: string;
  packId?: string | null;
  title: string | null;
  caption?: string | null;
  thumbnailUrl: string | null;
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

const DEFAULT_TAKE = 24;
const MAX_TAKE = 60;
const DEFAULT_KM = 25;
const MIN_KM = 1;
const MAX_KM = 200;
const MIN_FALLBACK_ITEMS = 6;
const DISCOVERABLE_VISIBILITY = ["PUBLIC", "DISCOVERABLE"] as const;
const DEFAULT_PREVIEW_LIMIT = 3;
let hasLoggedFeedShape = false;

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

type FeedClipRow = Prisma.PopClipGetPayload<{ select: typeof CLIP_SELECT }>;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const takeRaw = parseNumber(getQueryString(req.query.take));
  const take = Number.isFinite(takeRaw)
    ? Math.max(1, Math.min(MAX_TAKE, Math.floor(takeRaw)))
    : DEFAULT_TAKE;
  const cursor = getQueryString(req.query.cursor);
  const km = normalizeKm(
    parseNumber(getQueryString(req.query.radiusKm ?? req.query.r ?? req.query.km))
  );
  const lat = parseNumber(getQueryString(req.query.lat ?? req.query.centerLat));
  const lng = parseNumber(getQueryString(req.query.lng ?? req.query.centerLng));
  const hasUserLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const avail = parseFlag(req.query.avail);
  const r24 = parseFlag(req.query.r24);
  const vip = parseFlag(req.query.vip);

  const baseWhere = {
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
  } as Prisma.PopClipWhereInput;

  try {
    const rawClips = (await prisma.popClip.findMany({
      where: baseWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: CLIP_SELECT,
    })) as unknown as FeedClipRow[];

    const hasMore = rawClips.length > take;
    const sliced = rawClips.slice(0, take);
    const userLocation = hasUserLocation ? { lat: lat as number, lng: lng as number } : null;

    const mapped = mapFeedItems(sliced, userLocation, hasUserLocation ? km : null);
    if (process.env.NODE_ENV !== "production" && !hasLoggedFeedShape) {
      const first = rawClips[0];
      if (first) {
        console.log("[popclips.feed] shape", {
          commentCount: first._count?.comments,
          ratingAvg: first.creator?.profile?.ratingAvg ?? null,
          ratingCount: first.creator?.profile?.ratingCount ?? null,
          profileRatingAvg: first.creator?.profile?.ratingAvg ?? null,
          profileRatingCount: first.creator?.profile?.ratingCount ?? null,
        });
        hasLoggedFeedShape = true;
      }
    }
    const strictFiltered = applyFilters(mapped, {
      avail,
      r24,
      vip,
      km,
      requireDistance: hasUserLocation,
    });

    let items = strictFiltered;
    let nextCursor: string | null = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    if (!cursor && items.length < MIN_FALLBACK_ITEMS && (avail || r24 || hasUserLocation)) {
      const fallbackClips = (await prisma.popClip.findMany({
        where: baseWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        select: CLIP_SELECT,
      })) as unknown as FeedClipRow[];
      const fallbackMapped = mapFeedItems(fallbackClips.slice(0, take), userLocation, hasUserLocation ? km : null);
      const relaxed = applyFilters(fallbackMapped, {
        avail: false,
        r24: false,
        vip,
        km,
        requireDistance: hasUserLocation,
      });
      items = mergeUniqueById([...items, ...relaxed]).slice(0, take);
      if (!nextCursor && fallbackClips.length > take) {
        nextCursor = fallbackClips[take - 1]?.id ?? null;
      }
    }

    const itemsWithReviews = await attachCreatorReviews(items);
    const sorted = hasUserLocation ? sortByDistance(itemsWithReviews) : boostEngagement(itemsWithReviews);

    return res.status(200).json({
      items: sorted,
      nextCursor: nextCursor ?? undefined,
    });
  } catch (err) {
    console.error("Error loading popclip feed", err);
    return res.status(500).json({ error: "No se pudieron cargar los PopClips" });
  }
}

type FilterOptions = {
  avail: boolean;
  r24: boolean;
  vip: boolean;
  km: number;
  requireDistance: boolean;
};

function applyFilters(items: PopClipFeedItem[], options: FilterOptions) {
  return items.filter((item) => {
    if (options.vip && !item.creator.vipEnabled) return false;
    if (options.avail && !item.creator.isAvailable) return false;
    if (options.r24 && !isFastResponder(item.creator.avgResponseHours)) return false;
    if (options.requireDistance) {
      if (!Number.isFinite(item.distanceKm ?? NaN)) return false;
      if ((item.distanceKm as number) > options.km) return false;
    }
    return true;
  });
}

function mapFeedItems(
  items: FeedClipRow[],
  userLocation: { lat: number; lng: number } | null,
  radiusKm: number | null
) {
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
    const locationGeohash = allowLocation
      ? (clip.creator?.profile?.locationGeohash || "").trim()
      : "";
    const locationLabel = allowLocation ? clip.creator?.profile?.locationLabel ?? null : null;
    const distanceKm =
      userLocation && locationGeohash
        ? resolveDistanceKm(userLocation, locationGeohash, radiusKm)
        : null;

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
      distanceKm: Number.isFinite(distanceKm ?? NaN) ? roundDistance(distanceKm as number) : null,
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

function boostEngagement(items: PopClipFeedItem[]) {
  if (items.length < 2) return items;
  const scored = items.map((item, index) => ({
    item,
    index,
    score: computeEngagementScore(item),
  }));
  const hasSignals = scored.some((entry) => entry.score > 0);
  if (!hasSignals) return items;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  return scored.map((entry) => entry.item);
}

function computeEngagementScore(item: PopClipFeedItem) {
  const likeCount = item.stats?.likeCount ?? 0;
  const commentCount = item.stats?.commentCount ?? 0;
  const engagement = likeCount + commentCount * 2;
  if (!engagement) return 0;
  const capped = Math.min(engagement, 50) / 50;
  const createdAt = Date.parse(item.createdAt);
  const ageDays = Number.isFinite(createdAt) ? (Date.now() - createdAt) / (1000 * 60 * 60 * 24) : 0;
  const recency = Math.max(0, 14 - ageDays) / 14;
  return capped * 0.85 + recency * 0.15;
}

function parseNumber(value?: string) {
  if (!value) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim?.() ?? "";
  return "";
}

function parseFlag(value: unknown): boolean {
  return getQueryString(value) === "1";
}

function normalizeKm(value?: number): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_KM;
  const rounded = Math.round(value as number);
  if (rounded < MIN_KM) return MIN_KM;
  if (rounded > MAX_KM) return MAX_KM;
  return rounded;
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

function isFastResponder(responseHours: number | null) {
  return typeof responseHours === "number" && responseHours <= 24;
}

function mergeUniqueById(items: PopClipFeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sortByDistance(items: PopClipFeedItem[]) {
  return items
    .map((item, index) => {
      const distance = Number.isFinite(item.distanceKm ?? NaN)
        ? (item.distanceKm as number)
        : Number.POSITIVE_INFINITY;
      return { item, index, distance };
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function roundDistance(distanceKm: number) {
  return Math.round(distanceKm * 10) / 10;
}

function resolveDistanceKm(
  userLocation: { lat: number; lng: number },
  geohash: string,
  radiusKm: number | null
) {
  const decoded = decodeGeohash(geohash);
  if (!decoded) return null;
  if (Number.isFinite(radiusKm ?? NaN)) {
    const rad = Math.PI / 180;
    const latDelta = (radiusKm as number) / 111;
    const lngDelta = (radiusKm as number) / (111 * Math.cos(userLocation.lat * rad));
    if (Math.abs(decoded.lat - userLocation.lat) > latDelta) return null;
    if (Math.abs(decoded.lng - userLocation.lng) > lngDelta) return null;
  }
  const distance = haversineKm(userLocation, decoded);
  if (!Number.isFinite(distance)) return null;
  return distance;
}

function normalizeOfferTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => Boolean(tag));
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
