import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { slugifyHandle } from "../../../../lib/fan/session";
import { decodeGeohash, haversineKm } from "../../../../lib/geo";
import { PUBLIC_CREATOR_PROFILE_SELECT, PUBLIC_CREATOR_SELECT } from "../../../../lib/publicCreatorSelect";

type CreatorResult = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isPro?: boolean;
  bioShort?: string | null;
  vipEnabled?: boolean;
  avgResponseHours?: number | null;
  hasPopClips: boolean;
  distanceKm?: number;
  availability?: string;
  responseTime?: string;
  locationLabel?: string | null;
  locationEnabled?: boolean;
  allowLocation?: boolean;
};

type CreatorCandidate = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  bioShort?: string | null;
  availabilityValue: CreatorAvailability;
  responseValue: CreatorResponseTime;
  avgResponseHours: number | null;
  vipEnabled: boolean;
  isVerified: boolean;
  isPro: boolean;
  popClipsCount: number;
  locationLabel?: string | null;
  locationGeohash?: string | null;
  locationEnabled?: boolean;
  allowLocation?: boolean;
  lastActiveAt?: Date | null;
};

type ScoredCandidate = CreatorCandidate & {
  distanceKm?: number | null;
  score: number;
};

type CreatorAvailability = "AVAILABLE" | "OFFLINE" | "VIP_ONLY";
type CreatorResponseTime = "INSTANT" | "LT_24H" | "LT_72H";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 20;
const DEFAULT_KM = 25;
const MIN_KM = 1;
const MAX_KM = 200;
const DEBUG_EXPLORE = process.env.NEXT_PUBLIC_DEBUG_EXPLORE === "1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const kmRaw = parseNumber(getQueryString(req.query.radiusKm ?? req.query.r ?? req.query.km));
  const latRaw = parseNumber(getQueryString(req.query.lat ?? req.query.centerLat));
  const lngRaw = parseNumber(getQueryString(req.query.lng ?? req.query.centerLng));
  const hasUserLocation = Number.isFinite(latRaw) && Number.isFinite(lngRaw);
  const km = normalizeKm(kmRaw);
  const avail = parseFlag(req.query.avail);
  const r24 = parseFlag(req.query.r24);
  const vip = parseFlag(req.query.vip);
  const limitRaw = parseNumber(getQueryString(req.query.limit));
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;

  if (process.env.NODE_ENV !== "production" && DEBUG_EXPLORE) {
    console.debug("[api.creators.recommended]", {
      lat: latRaw,
      lng: lngRaw,
      radiusKm: km,
      hasUserLocation,
      avail,
      r24,
      vip,
      limit,
    });
  }

  try {
    const creators = await prisma.creator.findMany({
      where: { discoveryProfile: { isDiscoverable: true } },
      select: {
        ...PUBLIC_CREATOR_SELECT,
        subtitle: true,
        description: true,
        _count: { select: { popClips: true } },
        profile: {
          select: {
            ...PUBLIC_CREATOR_PROFILE_SELECT,
            vipOnly: true,
            locationGeohash: true,
            updatedAt: true,
          },
        },
        discoveryProfile: {
          select: {
            updatedAt: true,
          },
        },
      },
    });

    const candidates: CreatorCandidate[] = creators.map((creator) => {
      const handle = slugifyHandle(creator.name || "creator");
      const displayName = creator.name || "Creador";
      const profile = creator.profile;
      const availabilityValue = normalizeAvailability(profile?.availability) ?? "AVAILABLE";
      const responseValue = normalizeResponseTime(profile?.responseSla) ?? "LT_24H";
      const avgResponseHours = resolveResponseHours(responseValue);
      const vipEnabled = Boolean(profile?.vipOnly) || availabilityValue === "VIP_ONLY";
      const isVerified = Boolean(profile?.isVerified ?? creator.isVerified);
      const isPro = profile?.plan === "PRO";
      const locationVisibility = (profile?.locationVisibility || "").toUpperCase();
      const locationEnabled =
        locationVisibility !== "OFF" &&
        Boolean(profile?.locationGeohash) &&
        Boolean(profile?.locationLabel);
      const allowLocation = locationEnabled && Boolean(profile?.allowDiscoveryUseLocation);
      const locationGeohash = allowLocation ? (profile?.locationGeohash || "").trim() : null;
      const locationLabel = allowLocation ? profile?.locationLabel ?? null : null;
      const avatarUrl = normalizeAvatarUrl(creator.bioLinkAvatarUrl);
      const popClipsCount = creator._count?.popClips ?? 0;
      const lastActiveAt = pickLatestDate(creator.profile?.updatedAt, creator.discoveryProfile?.updatedAt);
      const bioShort = buildBioShort(creator.subtitle, creator.description);

      return {
        id: creator.id,
        handle,
        displayName,
        avatarUrl,
        bioShort,
        availabilityValue,
        responseValue,
        avgResponseHours,
        vipEnabled,
        isVerified,
        isPro,
        popClipsCount,
        locationLabel,
        locationGeohash,
        locationEnabled,
        allowLocation,
        lastActiveAt,
      };
    });

    const userLocation = hasUserLocation
      ? { lat: latRaw as number, lng: lngRaw as number }
      : null;
    const scored = candidates.map((candidate) => {
      const distanceKm =
        userLocation && candidate.locationGeohash
          ? resolveDistanceKm(userLocation, candidate.locationGeohash, hasUserLocation ? km : null)
          : null;
      return {
        ...candidate,
        distanceKm,
        score: scoreCandidate(candidate, distanceKm),
      };
    });

    const applyFilters = (items: ScoredCandidate[], options: FilterOptions) => {
      return items.filter((item) => {
        if (options.requireVip && !item.vipEnabled) return false;
        if (options.requireAvail && !isAvailable(item.availabilityValue)) return false;
        if (options.requireR24 && !isFastResponder(item.avgResponseHours)) return false;
        if (options.requireDistance) {
          if (!Number.isFinite(item.distanceKm ?? NaN)) return false;
          if ((item.distanceKm as number) > options.maxDistanceKm) return false;
        }
        return true;
      });
    };

    let filtered = applyFilters(scored, {
      requireAvail: avail,
      requireR24: r24,
      requireVip: vip,
      requireDistance: hasUserLocation,
      maxDistanceKm: km,
    });

    if (filtered.length < 3 && (avail || r24)) {
      filtered = applyFilters(scored, {
        requireAvail: false,
        requireR24: false,
        requireVip: vip,
        requireDistance: hasUserLocation,
        maxDistanceKm: km,
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      if (hasUserLocation) {
        const aDistance = Number.isFinite(a.distanceKm ?? NaN)
          ? (a.distanceKm as number)
          : Number.POSITIVE_INFINITY;
        const bDistance = Number.isFinite(b.distanceKm ?? NaN)
          ? (b.distanceKm as number)
          : Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;
      }
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.lastActiveAt ? a.lastActiveAt.getTime() : 0;
      const bTime = b.lastActiveAt ? b.lastActiveAt.getTime() : 0;
      return bTime - aTime;
    });

    const payload: CreatorResult[] = sorted.slice(0, limit).map((creator) => ({
      id: creator.id,
      handle: creator.handle,
      displayName: creator.displayName,
      avatarUrl: creator.avatarUrl ?? null,
      isVerified: creator.isVerified,
      isPro: creator.isPro,
      bioShort: creator.bioShort ?? null,
      vipEnabled: creator.vipEnabled,
      avgResponseHours: creator.avgResponseHours ?? null,
      hasPopClips: creator.popClipsCount > 0,
      distanceKm: Number.isFinite(creator.distanceKm ?? NaN)
        ? roundDistance(creator.distanceKm as number)
        : undefined,
      availability: formatAvailabilityLabel(creator.availabilityValue),
      responseTime: formatResponseTimeLabel(creator.responseValue),
      locationLabel: creator.locationLabel ?? null,
      locationEnabled: creator.locationEnabled ?? false,
      allowLocation: creator.allowLocation ?? false,
    }));

    return res.status(200).json({ items: payload });
  } catch (err) {
    console.error("Error loading recommended creators", err);
    return res.status(200).json({ items: [] });
  }
}

type FilterOptions = {
  requireAvail: boolean;
  requireR24: boolean;
  requireVip: boolean;
  requireDistance: boolean;
  maxDistanceKm: number;
};

function getQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim?.() ?? "";
  return "";
}

function parseFlag(value: unknown): boolean {
  return getQueryString(value) === "1";
}

function parseNumber(value?: string) {
  if (!value) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
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

function isAvailable(value: CreatorAvailability) {
  return value === "AVAILABLE" || value === "VIP_ONLY";
}

function isFastResponder(responseHours: number | null) {
  return typeof responseHours === "number" && responseHours <= 24;
}

function formatAvailabilityLabel(value: CreatorAvailability): string {
  if (value === "VIP_ONLY") return "Solo VIP";
  if (value === "OFFLINE") return "No disponible";
  return "Disponible";
}

function formatResponseTimeLabel(value: CreatorResponseTime): string {
  if (value === "INSTANT") return "Responde al momento";
  if (value === "LT_72H") return "Responde <72h";
  return "Responde <24h";
}

function buildBioShort(subtitle?: string | null, description?: string | null) {
  const subtitleValue = (subtitle || "").trim();
  if (subtitleValue) return subtitleValue.slice(0, 140);
  const descValue = (description || "").trim();
  if (!descValue) return null;
  return descValue.slice(0, 160);
}

function pickLatestDate(...dates: Array<Date | null | undefined>) {
  const filtered = dates.filter((value): value is Date => Boolean(value));
  if (filtered.length === 0) return null;
  return filtered.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );
}

function scoreCandidate(candidate: CreatorCandidate, distanceKm?: number | null) {
  let score = 0;

  if (candidate.lastActiveAt) {
    const ageDays = (Date.now() - candidate.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);
    const recency = Math.max(0, 30 - ageDays) / 30;
    score += recency * 3;
  }

  if (typeof candidate.avgResponseHours === "number") {
    if (candidate.avgResponseHours <= 12) score += 2.5;
    else if (candidate.avgResponseHours <= 24) score += 2;
    else if (candidate.avgResponseHours <= 48) score += 1;
  }

  if (candidate.popClipsCount > 0) score += 1.25;

  if (typeof distanceKm === "number" && Number.isFinite(distanceKm)) {
    if (distanceKm <= 10) score += 2;
    else if (distanceKm <= 25) score += 1.5;
    else if (distanceKm <= 50) score += 1;
    else if (distanceKm <= 100) score += 0.5;
  }

  return score;
}

function roundDistance(distanceKm: number) {
  return Math.round(distanceKm * 10) / 10;
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
