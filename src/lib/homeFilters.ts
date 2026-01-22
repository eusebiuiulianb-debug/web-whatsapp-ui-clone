import type { ParsedUrlQuery } from "querystring";

export type HomeFilters = {
  km?: number;
  lat?: number;
  lng?: number;
  loc?: string;
  avail?: boolean;
  r24?: boolean;
  vip?: boolean;
};

const DEFAULT_KM = 25;
const MIN_KM = 5;
const MAX_KM = 200;

export function parseHomeFilters(query: ParsedUrlQuery): HomeFilters {
  const kmRaw = parseNumber(getQueryString(query.km));
  const km = normalizeKm(kmRaw);
  const latRaw = parseNumber(getQueryString(query.lat));
  const lngRaw = parseNumber(getQueryString(query.lng));
  const hasCoords = Number.isFinite(latRaw) && Number.isFinite(lngRaw);
  const locRaw = getQueryString(query.loc);

  return {
    km,
    lat: hasCoords ? (latRaw as number) : undefined,
    lng: hasCoords ? (lngRaw as number) : undefined,
    loc: hasCoords && locRaw ? locRaw : undefined,
    avail: parseFlag(query.avail) || undefined,
    r24: parseFlag(query.r24) || undefined,
    vip: parseFlag(query.vip) || undefined,
  };
}

export function toHomeFiltersQuery(filters: HomeFilters): Record<string, string> {
  const query: Record<string, string> = {};
  const km = normalizeKm(filters.km);
  if (Number.isFinite(km) && km !== DEFAULT_KM) {
    query.km = String(km);
  }

  const lat = typeof filters.lat === "number" && Number.isFinite(filters.lat) ? filters.lat : null;
  const lng = typeof filters.lng === "number" && Number.isFinite(filters.lng) ? filters.lng : null;
  const hasCoords = lat !== null && lng !== null;
  if (hasCoords) {
    query.lat = String(lat);
    query.lng = String(lng);
    const loc = (filters.loc || "").trim();
    if (loc) query.loc = loc;
  }

  if (filters.avail) query.avail = "1";
  if (filters.r24) query.r24 = "1";
  if (filters.vip) query.vip = "1";

  return query;
}

export function countActiveFilters(filters: HomeFilters): number {
  let count = 0;
  const km = normalizeKm(filters.km);
  if (Number.isFinite(km) && km !== DEFAULT_KM) count += 1;

  const hasCoords =
    typeof filters.lat === "number" &&
    Number.isFinite(filters.lat) &&
    typeof filters.lng === "number" &&
    Number.isFinite(filters.lng);
  if (hasCoords) count += 1;
  if (filters.avail) count += 1;
  if (filters.r24) count += 1;
  if (filters.vip) count += 1;
  return count;
}

function getQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim?.() ?? "";
  return "";
}

function parseFlag(value: unknown): boolean {
  const raw = getQueryString(value);
  return raw === "1";
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
