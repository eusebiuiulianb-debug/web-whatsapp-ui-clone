import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { decode } from "ngeohash";
import prisma from "../../../../lib/prisma.server";
import { slugifyHandle } from "../../../../lib/fan/session";

type CreatorResult = {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  bioShort?: string | null;
  vipEnabled?: boolean;
  avgResponseHours?: number | null;
  hasPopClips: boolean;
  distanceKm?: number;
  availability?: string;
  responseTime?: string;
  locationLabel?: string | null;
};

type CreatorCandidate = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  bioShort?: string | null;
  availabilityValue: CreatorAvailability;
  responseValue: CreatorResponseTime | null;
  avgResponseHours: number | null;
  vipEnabled: boolean;
  popClipsCount: number;
  locationLabel?: string | null;
  locationGeohash?: string | null;
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
const MIN_KM = 5;
const MAX_KM = 200;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const kmRaw = parseNumber(getQueryString(req.query.km));
  const latRaw = parseNumber(getQueryString(req.query.lat));
  const lngRaw = parseNumber(getQueryString(req.query.lng));
  const hasUserLocation = Number.isFinite(latRaw) && Number.isFinite(lngRaw);
  const km = normalizeKm(kmRaw);
  const avail = parseFlag(req.query.avail);
  const r24 = parseFlag(req.query.r24);
  const vip = parseFlag(req.query.vip);
  const limitRaw = parseNumber(getQueryString(req.query.limit));
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;

  try {
    const creators = await prisma.creator.findMany({
      where: { discoveryProfile: { isDiscoverable: true } },
      select: {
        id: true,
        name: true,
        subtitle: true,
        description: true,
        bioLinkAvatarUrl: true,
        _count: { select: { popClips: true } },
        profile: {
          select: {
            availability: true,
            responseSla: true,
            vipOnly: true,
            locationLabel: true,
            locationGeohash: true,
            locationVisibility: true,
            allowDiscoveryUseLocation: true,
            updatedAt: true,
          },
        },
        discoveryProfile: {
          select: {
            responseHours: true,
            updatedAt: true,
          },
        },
      },
    });

    const candidates: CreatorCandidate[] = creators.map((creator) => {
      const handle = slugifyHandle(creator.name || "creator");
      const displayName = creator.name || "Creador";
      const availabilityValue = normalizeAvailability(creator.profile?.availability) ?? "AVAILABLE";
      const responseValue = normalizeResponseTime(creator.profile?.responseSla);
      const avgResponseHours = resolveResponseHours(creator.discoveryProfile?.responseHours, responseValue);
      const vipEnabled = Boolean(creator.profile?.vipOnly) || availabilityValue === "VIP_ONLY";
      const locationVisibility = (creator.profile?.locationVisibility || "").toUpperCase();
      const allowLocation =
        Boolean(creator.profile?.allowDiscoveryUseLocation) && locationVisibility !== "OFF";
      const locationGeohash = allowLocation ? (creator.profile?.locationGeohash || "").trim() : null;
      const locationLabel =
        locationVisibility !== "OFF" ? creator.profile?.locationLabel ?? null : null;
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
        popClipsCount,
        locationLabel,
        locationGeohash,
        lastActiveAt,
      };
    });

    const userLocation = hasUserLocation
      ? { lat: latRaw as number, lng: lngRaw as number }
      : null;
    const scored = candidates.map((candidate) => {
      const distanceKm =
        userLocation && candidate.locationGeohash
          ? getDistanceKm(userLocation, candidate.locationGeohash)
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

    if (filtered.length < 3 && hasUserLocation) {
      filtered = applyFilters(scored, {
        requireAvail: avail,
        requireR24: r24,
        requireVip: vip,
        requireDistance: false,
        maxDistanceKm: km,
      });
    }

    if (filtered.length < 3 && (avail || r24)) {
      filtered = applyFilters(scored, {
        requireAvail: false,
        requireR24: false,
        requireVip: vip,
        requireDistance: false,
        maxDistanceKm: km,
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.lastActiveAt ? a.lastActiveAt.getTime() : 0;
      const bTime = b.lastActiveAt ? b.lastActiveAt.getTime() : 0;
      return bTime - aTime;
    });

    const payload: CreatorResult[] = sorted.slice(0, limit).map((creator) => ({
      handle: creator.handle,
      displayName: creator.displayName,
      avatarUrl: creator.avatarUrl ?? null,
      bioShort: creator.bioShort ?? null,
      vipEnabled: creator.vipEnabled,
      avgResponseHours: creator.avgResponseHours ?? null,
      hasPopClips: creator.popClipsCount > 0,
      distanceKm: Number.isFinite(creator.distanceKm ?? NaN)
        ? roundDistance(creator.distanceKm as number)
        : undefined,
      availability: formatAvailabilityLabel(creator.availabilityValue),
      responseTime: formatResponseLabel(creator.responseValue, creator.avgResponseHours),
      locationLabel: creator.locationLabel ?? null,
    }));

    return res.status(200).json({ items: payload });
  } catch (err) {
    console.error("Error loading recommended creators", err);
    return res.status(500).json({ error: "No se pudieron cargar los creadores" });
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

function resolveResponseHours(
  responseHours?: number | null,
  responseValue?: CreatorResponseTime | null
) {
  if (typeof responseHours === "number" && Number.isFinite(responseHours)) return responseHours;
  if (!responseValue) return null;
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

function formatResponseLabel(value: CreatorResponseTime | null, avgResponseHours: number | null) {
  if (value) return formatResponseTimeLabel(value);
  if (typeof avgResponseHours === "number" && Number.isFinite(avgResponseHours)) {
    const rounded = Math.round(avgResponseHours);
    if (rounded <= 24) return "Responde <24h";
    return `Resp. ~${rounded}h`;
  }
  return "Respuesta estandar";
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

function getDistanceKm(from: { lat: number; lng: number }, toGeohash: string) {
  const to = decodeGeohash(toGeohash);
  if (!to) return NaN;
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLng = (to.lng - from.lng) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function decodeGeohash(value: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  try {
    const decoded = decode(trimmed);
    if (!decoded || !Number.isFinite(decoded.latitude) || !Number.isFinite(decoded.longitude)) return null;
    return { lat: decoded.latitude, lng: decoded.longitude };
  } catch (_err) {
    return null;
  }
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
