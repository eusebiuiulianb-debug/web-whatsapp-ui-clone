import type { NextApiRequest, NextApiResponse } from "next";

type GeoSearchResult = {
  id: string;
  placeId?: string;
  display: string;
  subtitle?: string;
  lat: number;
  lon: number;
  type?: string;
  importance?: number;
};

type CacheEntry = {
  expiresAt: number;
  data: GeoSearchResult[];
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;
const SETTLEMENT_TYPES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "locality",
]);
const SETTLEMENT_CLASSES = new Set(["place", "boundary"]);

function getCached(query: string) {
  const entry = cache.get(query);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(query);
    return null;
  }
  return entry.data;
}

function pickAddressField(address: Record<string, unknown> | undefined, keys: string[]) {
  if (!address) return "";
  for (const key of keys) {
    const value = address[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function compactDisplayName(displayName: string) {
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join(", ");
}

function resolveDisplay(entry: Record<string, unknown>) {
  const address = entry.address as Record<string, unknown> | undefined;
  const city = pickAddressField(address, [
    "city",
    "town",
    "village",
    "hamlet",
    "municipality",
    "locality",
  ]);
  if (city) return city;
  const displayName = typeof entry.display_name === "string" ? entry.display_name : "";
  return compactDisplayName(displayName) || "Ubicacion";
}

function resolveSubtitle(entry: Record<string, unknown>, countryCode: string) {
  const address = entry.address as Record<string, unknown> | undefined;
  const region = pickAddressField(address, ["province", "county", "state", "region"]);
  const addressCountry = pickAddressField(address, ["country"]);
  const normalizedCountry = countryCode.toLowerCase();
  const country =
    normalizedCountry === "es" ? "España" : addressCountry;
  if (region && country) return `${region}, ${country}`;
  if (region) return normalizedCountry === "es" ? `${region}, España` : region;
  if (country) return country;
  if (normalizedCountry === "es") return "España";
  return "";
}

function isSettlement(entry: Record<string, unknown>) {
  const address = entry.address as Record<string, unknown> | undefined;
  const classValue = typeof entry.class === "string" ? entry.class : "";
  const typeValue = typeof entry.type === "string" ? entry.type : "";
  const hasLocality = Boolean(
    pickAddressField(address, [
      "city",
      "town",
      "village",
      "hamlet",
      "municipality",
      "locality",
    ])
  );
  if (!SETTLEMENT_CLASSES.has(classValue)) return false;
  if (SETTLEMENT_TYPES.has(typeValue)) return true;
  return hasLocality;
}

function parseNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed as number) ? (parsed as number) : null;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<GeoSearchResult[]>) {
  if (req.method !== "GET") {
    res.status(405).json([]);
    return;
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 2) {
    res.status(200).json([]);
    return;
  }

  const mode = typeof req.query.mode === "string" ? req.query.mode.trim().toLowerCase() : "";
  const countryCode = typeof req.query.country === "string" ? req.query.country.trim().toLowerCase() : "";
  const language = typeof req.query.lang === "string" ? req.query.lang.trim() : "es";
  const centerLat = parseNumber(req.query.lat);
  const centerLng = parseNumber(req.query.lng);
  const hasCenter = centerLat !== null && centerLng !== null;
  const centerKey = hasCenter ? `${centerLat!.toFixed(2)},${centerLng!.toFixed(2)}` : "";
  const cacheKey = [query.toLowerCase(), mode, countryCode, language, centerKey].filter(Boolean).join("|");
  const cached = getCached(cacheKey);
  if (cached) {
    res.status(200).json(cached);
    return;
  }

  const now = Date.now();
  if (now - lastRequestAt < 1000) {
    res.status(200).json(cached || []);
    return;
  }
  lastRequestAt = now;

  try {
    const params = new URLSearchParams({
      format: "json",
      q: query,
      limit: "5",
      addressdetails: "1",
    });
    if (countryCode) params.set("countrycodes", countryCode);
    if (language) params.set("accept-language", language);
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const headers: Record<string, string> = {
      "User-Agent": "IntimiPop (dev)",
    };
    if (language) {
      headers["Accept-Language"] = language;
    } else {
      const acceptLanguage = req.headers["accept-language"];
      if (typeof acceptLanguage === "string" && acceptLanguage.trim()) {
        headers["Accept-Language"] = acceptLanguage;
      }
    }
    const response = await fetch(url, { headers });
    const payload = await response.json().catch(() => []);
    const entries = Array.isArray(payload) ? payload : [];
    const normalized = entries
      .map((entry: Record<string, unknown>) => {
        const lat = Number(entry.lat);
        const lon = Number(entry.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        if (mode === "settlement" && !isSettlement(entry)) return null;
        const distance = hasCenter ? distanceKm({ lat: centerLat as number, lng: centerLng as number }, { lat, lng: lon }) : null;
        return {
          id: String(entry.place_id ?? `${lat},${lon}`),
          placeId: typeof entry.place_id !== "undefined" ? String(entry.place_id) : undefined,
          display: resolveDisplay(entry),
          subtitle: resolveSubtitle(entry, countryCode),
          lat,
          lon,
          type: typeof entry.type === "string" ? entry.type : undefined,
          importance: typeof entry.importance === "number" ? entry.importance : undefined,
          ...(distance !== null ? { distance } : {}),
        } as GeoSearchResult;
      })
      .filter((entry): entry is GeoSearchResult => Boolean(entry));

    let sorted = normalized;
    if (hasCenter) {
      sorted = [...normalized].sort((a, b) => {
        const aDistance = (a as GeoSearchResult & { distance?: number }).distance;
        const bDistance = (b as GeoSearchResult & { distance?: number }).distance;
        if (typeof aDistance !== "number" && typeof bDistance !== "number") return 0;
        if (typeof aDistance !== "number") return 1;
        if (typeof bDistance !== "number") return -1;
        return aDistance - bDistance;
      });
    }
    const finalResults = sorted.slice(0, 6);
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, data: finalResults });
    res.status(200).json(finalResults);
  } catch (_err) {
    res.status(200).json([]);
  }
}
