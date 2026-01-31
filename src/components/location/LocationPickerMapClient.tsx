import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "../../lib/mapTiles";

type Props = {
  center: { lat: number; lng: number };
  radiusKm: number;
  onCenterChange: (next: { lat: number; lng: number }) => void;
  onMapReady?: (map: LeafletMap) => void;
};

const MIN_RADIUS_METERS = 500;

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

export default function LocationPickerMapClient({ center, radiusKm, onCenterChange, onMapReady }: Props) {
  const centerPoint = useMemo(() => [center.lat, center.lng] as [number, number], [center.lat, center.lng]);
  const radiusMeters = useMemo(() => {
    if (!Number.isFinite(radiusKm)) return MIN_RADIUS_METERS;
    return Math.max(MIN_RADIUS_METERS, radiusKm * 1000);
  }, [radiusKm]);
  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html:
          '<div style="width:16px;height:16px;border-radius:999px;background:#0ea5e9;border:2px solid #0f172a;box-shadow:0 0 0 4px rgba(14,165,233,0.25);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    []
  );

  return (
    <MapContainer
      center={centerPoint}
      zoom={12}
      scrollWheelZoom
      attributionControl={false}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
      inertia={false}
      className="h-full w-full"
    >
      <MapReady onReady={onMapReady} />
      <MapInvalidateSize />
      <MapFitBounds center={centerPoint} radiusMeters={radiusMeters} />
      <MapClickHandler onCenterChange={onCenterChange} />
      <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
      <Circle
        center={centerPoint}
        radius={radiusMeters}
        pathOptions={{ color: "#0ea5e9", weight: 2, fillColor: "#38bdf8", fillOpacity: 0.18 }}
      />
      <DraggableMarker center={centerPoint} icon={markerIcon} onCenterChange={onCenterChange} />
    </MapContainer>
  );
}

function DraggableMarker({
  center,
  icon,
  onCenterChange,
}: {
  center: [number, number];
  icon: L.DivIcon;
  onCenterChange: (next: { lat: number; lng: number }) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (!marker) return;
        const { lat, lng } = marker.getLatLng();
        onCenterChange({ lat, lng });
      },
    }),
    [onCenterChange]
  );

  return <Marker draggable position={center} icon={icon} ref={markerRef} eventHandlers={eventHandlers} />;
}

function MapClickHandler({
  onCenterChange,
}: {
  onCenterChange: (next: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(event) {
      onCenterChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
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

function MapFitBounds({
  center,
  radiusMeters,
}: {
  center: [number, number];
  radiusMeters: number;
}) {
  const map = useMap();
  useEffect(() => {
    const safeRadius = Math.max(MIN_RADIUS_METERS, radiusMeters);
    const bounds = L.latLng(center[0], center[1]).toBounds(safeRadius * 2);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }, [center, map, radiusMeters]);
  return null;
}
