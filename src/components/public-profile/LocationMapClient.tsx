import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { decode } from "ngeohash";
import type { Map as LeafletMap } from "leaflet";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "../../lib/mapTiles";

const DEFAULT_CITY_RADIUS_METERS = 2000;

function safeInvalidate(map: LeafletMap) {
  try {
    const el = map.getContainer?.();
    if (!el || !el.isConnected) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    map.invalidateSize({ animate: false });
  } catch {
    // ignore invalidation errors
  }
}

type Props = {
  geohash: string;
  radiusKm?: number | null;
  onMapReady?: (map: LeafletMap) => void;
};

export default function LocationMapClient({ geohash, radiusKm, onMapReady }: Props) {
  const center = useMemo(() => decodeGeohash(geohash), [geohash]);
  const radiusMeters = useMemo(() => {
    if (Number.isFinite(radiusKm) && (radiusKm as number) > 0) {
      return (radiusKm as number) * 1000;
    }
    return DEFAULT_CITY_RADIUS_METERS;
  }, [radiusKm]);
  const centerPoint = useMemo(
    () => (center ? ([center.lat, center.lng] as [number, number]) : null),
    [center]
  );

  if (!centerPoint) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--muted)]">
        No hay mapa disponible.
      </div>
    );
  }

  return (
    <MapContainer
      center={centerPoint}
      zoom={12}
      scrollWheelZoom={false}
      zoomControl={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      dragging={false}
      keyboard={false}
      attributionControl={false}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
      inertia={false}
      className="h-full w-full"
    >
      <MapReady onReady={onMapReady} />
      <MapInvalidateSize />
      <FitCircleBounds center={centerPoint} radiusMeters={radiusMeters} />
      <TileLayer
        url={MAP_TILE_URL}
        attribution={MAP_ATTRIBUTION}
      />
      <Circle
        center={centerPoint}
        radius={radiusMeters}
        pathOptions={{ color: "#7dd3fc", weight: 2, fillColor: "#38bdf8", fillOpacity: 0.12 }}
      />
    </MapContainer>
  );
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

function MapInvalidateSize() {
  const map = useMap();
  useEffect(() => {
    let cancelled = false;
    const raf = window.requestAnimationFrame(() => {
      if (cancelled) return;
      safeInvalidate(map);
    });
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      safeInvalidate(map);
    }, 160);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [map]);
  return null;
}

function MapReady({ onReady }: { onReady?: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onReady) return;
    onReady(map);
  }, [map, onReady]);
  return null;
}

function FitCircleBounds({
  center,
  radiusMeters,
}: {
  center: [number, number];
  radiusMeters: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const run = () => {
      const safeRadius = Math.max(50, radiusMeters || 1000);
      const bounds = L.latLng(center[0], center[1]).toBounds(safeRadius * 2);
      safeInvalidate(map);
      map.fitBounds(bounds, { padding: [24, 24] });
    };
    map.whenReady(() => {
      window.requestAnimationFrame(run);
    });
  }, [map, center, radiusMeters]);
  return null;
}
