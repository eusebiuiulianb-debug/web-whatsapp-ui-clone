import type { NextApiRequest, NextApiResponse } from "next";

type ReverseResult = {
  label: string;
  placeId?: string;
};

type CacheEntry = {
  expiresAt: number;
  data: ReverseResult;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function parseNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed as number) ? (parsed as number) : null;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse<ReverseResult>) {
  if (req.method !== "GET") {
    res.status(405).json({ label: "" });
    return;
  }

  const lat = parseNumber(req.query.lat);
  const lng = parseNumber(req.query.lng);
  if (lat === null || lng === null) {
    res.status(400).json({ label: "" });
    return;
  }

  const language = typeof req.query.lang === "string" ? req.query.lang.trim() : "es";
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${language}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.status(200).json(cached);
    return;
  }

  const now = Date.now();
  if (now - lastRequestAt < 1000) {
    res.status(200).json(cached || { label: "" });
    return;
  }
  lastRequestAt = now;

  try {
    const params = new URLSearchParams({
      format: "json",
      lat: String(lat),
      lon: String(lng),
      addressdetails: "1",
      zoom: "10",
    });
    if (language) params.set("accept-language", language);
    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
    const headers: Record<string, string> = {
      "User-Agent": "IntimiPop (dev)",
    };
    if (language) {
      headers["Accept-Language"] = language;
    }
    const response = await fetch(url, { headers });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      res.status(200).json({ label: "" });
      return;
    }
    const entry = payload as Record<string, unknown>;
    const label = resolveDisplay(entry);
    const result = {
      label,
      placeId: typeof entry.place_id !== "undefined" ? String(entry.place_id) : undefined,
    };
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, data: result });
    res.status(200).json(result);
  } catch (_err) {
    res.status(200).json({ label: "" });
  }
}
