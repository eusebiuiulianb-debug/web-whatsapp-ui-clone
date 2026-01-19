import type { NextApiRequest, NextApiResponse } from "next";

type GeoSearchResult = {
  id: string;
  display: string;
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

function getCached(query: string) {
  const entry = cache.get(query);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(query);
    return null;
  }
  return entry.data;
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
  if (address) {
    const city =
      (address.city as string | undefined) ||
      (address.town as string | undefined) ||
      (address.village as string | undefined) ||
      (address.hamlet as string | undefined) ||
      (address.municipality as string | undefined);
    if (city && city.trim()) return city.trim();
  }
  const displayName = typeof entry.display_name === "string" ? entry.display_name : "";
  return compactDisplayName(displayName) || "Ubicacion";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<GeoSearchResult[]>) {
  if (req.method !== "GET") {
    res.status(405).json([]);
    return;
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 3) {
    res.status(200).json([]);
    return;
  }

  const cacheKey = query.toLowerCase();
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
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    const headers: Record<string, string> = {
      "User-Agent": "IntimiPop (dev)",
    };
    const acceptLanguage = req.headers["accept-language"];
    if (typeof acceptLanguage === "string" && acceptLanguage.trim()) {
      headers["Accept-Language"] = acceptLanguage;
    }
    const response = await fetch(url, { headers });
    const payload = await response.json().catch(() => []);
    const entries = Array.isArray(payload) ? payload : [];
    const normalized = entries
      .map((entry: Record<string, unknown>) => {
        const lat = Number(entry.lat);
        const lon = Number(entry.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
          id: String(entry.place_id ?? `${lat},${lon}`),
          display: resolveDisplay(entry),
          lat,
          lon,
          type: typeof entry.type === "string" ? entry.type : undefined,
          importance: typeof entry.importance === "number" ? entry.importance : undefined,
        } as GeoSearchResult;
      })
      .filter((entry): entry is GeoSearchResult => Boolean(entry));

    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, data: normalized });
    res.status(200).json(normalized);
  } catch (_err) {
    res.status(200).json([]);
  }
}
