import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { decode } from "ngeohash";

const DEFAULT_CITY_RADIUS_METERS = 2000;

type Props = {
  geohash: string;
  radiusKm?: number | null;
};

export default function LocationMapClient({ geohash, radiusKm }: Props) {
  const center = useMemo(() => decodeGeohash(geohash), [geohash]);
  if (!center) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--muted)]">
        No hay mapa disponible.
      </div>
    );
  }

  const radiusMeters = Number.isFinite(radiusKm) && (radiusKm as number) > 0
    ? (radiusKm as number) * 1000
    : DEFAULT_CITY_RADIUS_METERS;
  const centerPoint = useMemo(() => [center.lat, center.lng] as [number, number], [center]);

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
      className="h-full w-full"
    >
      <MapInvalidateSize />
      <FitCircleBounds center={centerPoint} radiusMeters={radiusMeters} />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
    const timeout = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(timeout);
  }, [map]);
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
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24] });
    };
    map.whenReady(() => {
      window.requestAnimationFrame(run);
    });
  }, [map, center, radiusMeters]);
  return null;
}
