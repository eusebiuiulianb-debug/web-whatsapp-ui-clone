import type { ParsedUrlQuery } from "querystring";
import { getSearchParamsFromAsPath } from "./urlSearchParams";

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

const API_QUERY_KEYS = [
  "q",
  "take",
  "cursor",
  "category",
  "sort",
  "lat",
  "lng",
  "radiusKm",
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

function toSearchParams(input: ParsedUrlQuery | string | URLSearchParams) {
  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input.toString());
  }
  if (typeof input === "string") {
    return new URLSearchParams(getSearchParamsFromAsPath(input).toString());
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
  console.log("[EXPLORE-LOC] buildExploreSearchParams INPUT:", {
    baseParamsType: typeof baseParams,
    baseParams: baseParams instanceof URLSearchParams ? baseParams.toString() : baseParams,
    locationParams
  });
  const params = toSearchParams(baseParams);
  console.log("[EXPLORE-LOC] After toSearchParams:", params.toString());
  
  // Eliminar keys de ubicación existentes
  LOCATION_QUERY_KEYS.forEach((key) => params.delete(key));
  
  // Sanitizar SOLO keys que sean claramente paths (empiezan con "/" pero NO son valores)
  // NO eliminar keys normales como lat, lng, etc.
  const keysToDelete: string[] = [];
  params.forEach((_, key) => {
    // Solo borrar si empieza con "/" (es un path accidental)
    if (key.startsWith("/")) {
      keysToDelete.push(key);
    }
  });
  console.log("[EXPLORE-LOC] Keys to delete (paths):", keysToDelete);
  keysToDelete.forEach((key) => params.delete(key));
  
  // Agregar nuevos parámetros de ubicación si existen
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
  
  const finalParams = params.toString();
  console.log("[EXPLORE-LOC] buildExploreSearchParams OUTPUT:", finalParams);
  
  // Verificar que lat y lng están presentes
  const hasLat = params.has("lat");
  const hasLng = params.has("lng");
  console.log("[EXPLORE-LOC] Final params verification:", { 
    hasLat, 
    hasLng,
    lat: params.get("lat"),
    lng: params.get("lng"),
    radiusKm: params.get("radiusKm"),
    locLabel: params.get("locLabel")
  });
  
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

type ExploreApiQueryOptions = {
  location?: ExploreLocation | null;
};

export function buildExploreApiQueryFromSearchParams(
  params: URLSearchParams,
  options?: ExploreApiQueryOptions
) {
  const values: Partial<Record<(typeof API_QUERY_KEYS)[number], string>> = {};
  const q = (params.get("q") || "").trim();
  if (q) values.q = q;

  const takeRaw = params.get("take");
  const takeValue = takeRaw ? Number.parseInt(takeRaw, 10) : NaN;
  if (Number.isFinite(takeValue)) values.take = String(takeValue);

  const cursor = (params.get("cursor") || "").trim();
  if (cursor) values.cursor = cursor;

  const category = (params.get("category") || params.get("cat") || "").trim();
  if (category) values.category = category;

  const sort = (params.get("sort") || "").trim();
  if (sort) values.sort = sort;

  const latRaw = params.get("lat");
  const lngRaw = params.get("lng");
  const radiusRaw = params.get("radiusKm") ?? params.get("km") ?? params.get("r");

  const latValue = latRaw ? Number.parseFloat(latRaw) : NaN;
  const lngValue = lngRaw ? Number.parseFloat(lngRaw) : NaN;
  const radiusValue = radiusRaw ? Number.parseInt(radiusRaw, 10) : NaN;

  const hasCoords = Number.isFinite(latValue) && Number.isFinite(lngValue);
  if (hasCoords) {
    values.lat = String(latValue);
    values.lng = String(lngValue);
    if (Number.isFinite(radiusValue)) values.radiusKm = String(radiusValue);
  }

  if (options?.location) {
    const locationLat = Number.parseFloat(String(options.location.lat));
    const locationLng = Number.parseFloat(String(options.location.lng));
    const locationHasCoords = Number.isFinite(locationLat) && Number.isFinite(locationLng);
    if (locationHasCoords) {
      values.lat = String(locationLat);
      values.lng = String(locationLng);
      if (Number.isFinite(options.location.radiusKm ?? NaN)) {
        const locationRadius = Number.parseInt(String(options.location.radiusKm), 10);
        if (Number.isFinite(locationRadius)) values.radiusKm = String(locationRadius);
      }
    }
  }

  const orderedParams = new URLSearchParams();
  API_QUERY_KEYS.forEach((key) => {
    const value = values[key];
    if (typeof value === "string" && value !== "") {
      orderedParams.set(key, value);
    }
  });

  return orderedParams.toString();
}

export function buildExploreApiQueryFromAsPath(asPath: string, options?: ExploreApiQueryOptions) {
  const params = getSearchParamsFromAsPath(asPath);
  return buildExploreApiQueryFromSearchParams(params, options);
}

/**
 * buildExploreApiParams: construye params SOLO para API (sin locLabel ni claves UI)
 * locLabel es solo para mostrar en UI, NO debe enviarse al backend
 */
export function buildExploreApiParams(
  baseParams: ParsedUrlQuery | string | URLSearchParams,
  locationParams?: ExploreLocation | null
): URLSearchParams {
  console.log("[EXPLORE-LOC] buildExploreApiParams INPUT:", {
    baseParamsType: typeof baseParams,
    locationParams
  });
  const params = toSearchParams(baseParams);
  const queryString = buildExploreApiQueryFromSearchParams(params, { location: locationParams ?? null });
  const apiParams = new URLSearchParams(queryString);

  console.log("[EXPLORE-LOC] buildExploreApiParams OUTPUT:", queryString);
  console.log("[EXPLORE-LOC] API params verification:", {
    hasLat: apiParams.has("lat"),
    hasLng: apiParams.has("lng"),
    hasLocLabel: apiParams.has("locLabel"), // debe ser false
    lat: apiParams.get("lat"),
    lng: apiParams.get("lng"),
    radiusKm: apiParams.get("radiusKm")
  });

  return apiParams;
}
