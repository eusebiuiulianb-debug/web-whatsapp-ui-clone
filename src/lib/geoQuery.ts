import type { ParsedUrlQuery } from "querystring";

export type ExploreLocationQuery = {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  locLabel?: string;
};

export type ExploreLocation = {
  lat: number;
  lng: number;
  radiusKm?: number;
  locLabel?: string;
};

const LOCATION_QUERY_KEYS = [
  "lat",
  "lng",
  "radiusKm",
  "locLabel",
  "r",
  "km",
  "loc",
  "center",
  "centerLat",
  "centerLng",
] as const;

function pickQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNumberInt(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed);
}

function parseQueryString(input: string) {
  const queryIndex = input.indexOf("?");
  const hashIndex = input.indexOf("#");
  const endIndex = hashIndex >= 0 ? hashIndex : undefined;
  const queryString = queryIndex >= 0 ? input.slice(queryIndex + 1, endIndex) : input;
  return new URLSearchParams(queryString);
}

function toSearchParams(input: ParsedUrlQuery | string | URLSearchParams) {
  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input.toString());
  }
  if (typeof input === "string") {
    return parseQueryString(input);
  }
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined) return;
    const resolved = pickQueryValue(value as string | string[] | undefined);
    if (resolved !== "") params.set(key, resolved);
  });
  return params;
}

export function parseExploreLocationFromUrl(
  input: ParsedUrlQuery | string | URLSearchParams
): ExploreLocation | null {
  const params = toSearchParams(input);
  const lat = parseNumber(params.get("lat") || "");
  const lng = parseNumber(params.get("lng") || "");
  if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) return null;
  const radiusKm = parseNumberInt(params.get("radiusKm") || "");
  const locLabel = (params.get("locLabel") || "").trim();
  const location: ExploreLocation = { lat: lat as number, lng: lng as number };
  if (Number.isFinite(radiusKm ?? NaN)) location.radiusKm = radiusKm as number;
  if (locLabel) location.locLabel = locLabel;
  return location;
}

export function buildExploreSearchParams(
  baseParams: ParsedUrlQuery | string | URLSearchParams,
  locationParams?: ExploreLocation | null
) {
  const params = toSearchParams(baseParams);
  LOCATION_QUERY_KEYS.forEach((key) => params.delete(key));
  if (
    locationParams &&
    Number.isFinite(locationParams.lat) &&
    Number.isFinite(locationParams.lng)
  ) {
    params.set("lat", String(locationParams.lat));
    params.set("lng", String(locationParams.lng));
    if (Number.isFinite(locationParams.radiusKm ?? NaN)) {
      params.set("radiusKm", String(Math.round(locationParams.radiusKm as number)));
    }
    if (locationParams.locLabel) {
      const trimmed = locationParams.locLabel.trim();
      if (trimmed) params.set("locLabel", trimmed);
    }
  }
  return params;
}

export function parseExploreLocation(input: ParsedUrlQuery | string): ExploreLocationQuery {
  const parsed = parseExploreLocationFromUrl(input);
  if (!parsed) return {};
  return {
    lat: parsed.lat,
    lng: parsed.lng,
    radiusKm: parsed.radiusKm,
    locLabel: parsed.locLabel,
  };
}

export function writeExploreLocationToQuery(
  prevQuery: ParsedUrlQuery,
  next: ExploreLocationQuery
) {
  const location =
    typeof next.lat === "number" && typeof next.lng === "number"
      ? {
          lat: next.lat,
          lng: next.lng,
          radiusKm: next.radiusKm,
          locLabel: next.locLabel,
        }
      : null;
  const params = buildExploreSearchParams(prevQuery, location);
  const nextQuery: Record<string, string> = {};
  params.forEach((value, key) => {
    nextQuery[key] = value;
  });
  return nextQuery;
}

export function serializeExploreLocation(input: ParsedUrlQuery | string) {
  const params = buildExploreSearchParams(input, parseExploreLocationFromUrl(input));
  return params;
}
