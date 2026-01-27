import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { slugifyHandle } from "../../../../lib/fan/session";
import { decodeGeohash, distanceKmFromGeohash } from "../../../../lib/geo";
import { PUBLIC_CREATOR_PROFILE_SELECT, PUBLIC_CREATOR_SELECT } from "../../../../lib/publicCreatorSelect";

type CreatorItem = {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isPro?: boolean;
  availability: string;
  responseTime: string;
  locationLabel?: string | null;
  priceFrom?: number | null;
  distanceKm?: number | null;
  locationEnabled?: boolean;
  allowLocation?: boolean;
};

type CreatorAvailability = "AVAILABLE" | "OFFLINE" | "VIP_ONLY";
type CreatorResponseTime = "INSTANT" | "LT_24H" | "LT_72H";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const availabilityParam = typeof req.query.availability === "string" ? req.query.availability.trim() : "";
  const responseParam = typeof req.query.responseTime === "string" ? req.query.responseTime.trim() : "";
  const radiusParam = typeof req.query.radiusKm === "string" ? req.query.radiusKm.trim() : "";
  const priceMinParam = typeof req.query.priceMin === "string" ? req.query.priceMin.trim() : "";
  const priceMaxParam = typeof req.query.priceMax === "string" ? req.query.priceMax.trim() : "";
  const geo = typeof req.query.geo === "string" ? req.query.geo.trim() : "";
  const tagParam = req.query.tag ?? req.query.tags;
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : Number.NaN;
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;

  const availabilityFilter = normalizeAvailability(availabilityParam);
  const responseFilter = normalizeResponseTime(responseParam);
  const radiusKm = parseNumber(radiusParam);
  const priceMin = parsePriceToCents(priceMinParam);
  const priceMax = parsePriceToCents(priceMaxParam);
  const tags = normalizeTags(tagParam);
  const normalizedQuery = q.toLowerCase();
  const viewerLocation = geo ? decodeGeohash(geo) : null;

  try {
    const [creators, minPrices] = await Promise.all([
      prisma.creator.findMany({
        where: {
          OR: [
            { profile: { visibilityMode: { in: ["PUBLIC", "DISCOVERABLE"] } } },
            { discoveryProfile: { isDiscoverable: true } },
          ],
        },
        select: {
          ...PUBLIC_CREATOR_SELECT,
          profile: {
            select: {
              ...PUBLIC_CREATOR_PROFILE_SELECT,
              visibilityMode: true,
              locationGeohash: true,
            },
          },
          discoveryProfile: {
            select: {
              isDiscoverable: true,
              niches: true,
            },
          },
        },
      }),
      prisma.catalogItem.groupBy({
        by: ["creatorId"],
        where: { isActive: true, isPublic: true },
        _min: { priceCents: true },
      }),
    ]);

    const minPriceMap = new Map<string, number | null>(
      minPrices.map((row) => [row.creatorId, row._min.priceCents ?? null])
    );

    const filtered = creators.filter((creator) => {
      const visibilityMode = creator.profile?.visibilityMode ?? "SOLO_LINK";
      if (visibilityMode === "INVISIBLE") return false;
      const isDiscoverable =
        visibilityMode === "PUBLIC" ||
        visibilityMode === "DISCOVERABLE" ||
        Boolean(creator.discoveryProfile?.isDiscoverable);
      if (!isDiscoverable) return false;

      const availabilityValue = normalizeAvailability(creator.profile?.availability) ?? "AVAILABLE";
      if (availabilityFilter && availabilityValue !== availabilityFilter) return false;

      const responseValue = normalizeResponseTime(creator.profile?.responseSla) ?? "LT_24H";
      if (responseFilter && responseValue !== responseFilter) return false;

      const creatorTags = normalizeTags(creator.discoveryProfile?.niches || "");
      if (tags.length > 0 && !tags.some((tag) => creatorTags.includes(tag))) return false;

      if (normalizedQuery) {
        const handle = slugifyHandle(creator.name || "creator");
        const haystack = `${creator.name || ""} ${handle} ${creatorTags.join(" ")}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }

      const priceFrom = minPriceMap.get(creator.id) ?? null;
      if ((priceMin || priceMax) && !Number.isFinite(priceFrom ?? NaN)) return false;
      if (priceMin && priceFrom !== null && priceFrom < priceMin) return false;
      if (priceMax && priceFrom !== null && priceFrom > priceMax) return false;

      if (Number.isFinite(radiusKm) && radiusKm > 0 && viewerLocation) {
        const profile = creator.profile;
        const visibility = (profile?.locationVisibility || "").toUpperCase();
        const locationEnabled =
          visibility !== "OFF" &&
          Boolean(profile?.locationGeohash) &&
          Boolean(profile?.locationLabel);
        const allowUse = locationEnabled && Boolean(profile?.allowDiscoveryUseLocation);
        const geohash = allowUse ? (profile?.locationGeohash || "").trim() : "";
        if (!geohash || !allowUse) return false;
        const distance = distanceKmFromGeohash(viewerLocation, geohash);
        if (!Number.isFinite(distance) || distance > radiusKm) return false;
      }

      return true;
    });

    const items: CreatorItem[] = filtered.map((creator) => {
      const profile = creator.profile;
      const availabilityValue = normalizeAvailability(profile?.availability) ?? "AVAILABLE";
      const responseValue = normalizeResponseTime(profile?.responseSla) ?? "LT_24H";
      const isVerified = Boolean(profile?.isVerified ?? creator.isVerified);
      const isPro = profile?.plan === "PRO";
      const locationVisibility = (profile?.locationVisibility || "").toUpperCase();
      const locationEnabled =
        locationVisibility !== "OFF" &&
        Boolean(profile?.locationGeohash) &&
        Boolean(profile?.locationLabel);
      const allowLocation = locationEnabled && Boolean(profile?.allowDiscoveryUseLocation);
      const locationLabel = allowLocation ? profile?.locationLabel ?? null : null;
      const distanceKm =
        viewerLocation && allowLocation && profile?.locationGeohash
          ? distanceKmFromGeohash(viewerLocation, profile.locationGeohash)
          : null;
      const avatarUrl = normalizeAvatarUrl(creator.bioLinkAvatarUrl || null);
      const priceFrom = minPriceMap.get(creator.id) ?? null;

      return {
        handle: slugifyHandle(creator.name || "creator"),
        displayName: creator.name || "Creador",
        avatarUrl,
        isVerified,
        isPro,
        availability: formatAvailabilityLabel(availabilityValue),
        responseTime: formatResponseTimeLabel(responseValue),
        locationLabel,
        distanceKm: Number.isFinite(distanceKm ?? NaN) ? roundDistance(distanceKm as number) : null,
        locationEnabled,
        allowLocation,
        priceFrom,
      };
    });

    const sorted = viewerLocation
      ? [...items].sort((a, b) => {
          const aDistance = Number.isFinite(a.distanceKm ?? NaN)
            ? (a.distanceKm as number)
            : Number.POSITIVE_INFINITY;
          const bDistance = Number.isFinite(b.distanceKm ?? NaN)
            ? (b.distanceKm as number)
            : Number.POSITIVE_INFINITY;
          if (aDistance !== bDistance) return aDistance - bDistance;
          return 0;
        })
      : items;

    const total = items.length;

    return res.status(200).json({ items: sorted.slice(0, limit), total });
  } catch (err) {
    console.error("Error loading discovery creators", err);
    return res.status(200).json({ items: [], total: 0 });
  }
}

function normalizeAvailability(value?: string | null): CreatorAvailability | null {
  const normalized = (value || "").toUpperCase();
  if (normalized === "AVAILABLE" || normalized === "ONLINE") return "AVAILABLE";
  if (normalized === "VIP_ONLY") return "VIP_ONLY";
  if (normalized === "OFFLINE" || normalized === "NOT_AVAILABLE") return "OFFLINE";
  return null;
}

function normalizeResponseTime(value?: string | null): CreatorResponseTime | null {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "INSTANT";
  if (normalized === "LT_24H") return "LT_24H";
  if (normalized === "LT_72H" || normalized === "LT_48H") return "LT_72H";
  return null;
}

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .flatMap((entry) => String(entry).split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseNumber(value?: string) {
  if (!value) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parsePriceToCents(value?: string) {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function formatAvailabilityLabel(value: CreatorAvailability) {
  if (value === "VIP_ONLY") return "Solo VIP";
  if (value === "OFFLINE") return "No disponible";
  return "Disponible";
}

function formatResponseTimeLabel(value: CreatorResponseTime) {
  if (value === "INSTANT") return "Responde al momento";
  if (value === "LT_72H") return "Responde <72h";
  return "Responde <24h";
}

function roundDistance(distanceKm: number) {
  return Math.round(distanceKm * 10) / 10;
}

function normalizeAvatarUrl(value: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const publicPath = path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
  if (!fs.existsSync(publicPath)) return null;
  return normalized;
}
