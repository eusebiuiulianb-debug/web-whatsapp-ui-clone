import { decode } from "ngeohash";

export type LatLng = { lat: number; lng: number };

export function decodeGeohash(value: string): LatLng | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  try {
    const decoded = decode(trimmed);
    if (!decoded || !Number.isFinite(decoded.latitude) || !Number.isFinite(decoded.longitude)) {
      return null;
    }
    return { lat: decoded.latitude, lng: decoded.longitude };
  } catch (_err) {
    return null;
  }
}

export function haversineKm(from: LatLng, to: LatLng) {
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLng = (to.lng - from.lng) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

export function distanceKmFromGeohash(from: LatLng, toGeohash: string) {
  const to = decodeGeohash(toGeohash);
  if (!to) return Number.NaN;
  return haversineKm(from, to);
}
