import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Circle as LeafletCircle, Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "../../lib/mapTiles";

type GeoSearchResult = {
  id: string;
  placeId?: string;
  display: string;
  subtitle?: string;
  lat: number;
  lon: number;
};

type LocationValue = {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
  placeId?: string | null;
};

type DraftState = {
  lat: number | null;
  lng: number | null;
  label: string;
  placeId: string;
  radiusKm: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  value: LocationValue;
  radiusKm: number;
  onConfirm: (next: LocationValue & { radiusKm: number }) => void;
  mode?: "geo" | "search";
  title?: string;
  subtitle?: string;
  radiusLabel?: string;
  minRadiusKm?: number;
  maxRadiusKm?: number;
  stepKm?: number;
  showRadius?: boolean;
  allowClear?: boolean;
  showUseLocation?: boolean;
  primaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  overlayHint?: string;
  errorMessage?: string;
};

type LeafletModule = typeof import("leaflet");

const DEFAULT_LOCATION_CENTER = { lat: 40.4168, lng: -3.7038 };
const DEFAULT_TITLE = "Ubicación aproximada";
const DEFAULT_OVERLAY = "Elige una ciudad o usa tu ubicación";
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

export function LocationPickerDialog({
  open,
  onClose,
  value,
  radiusKm,
  onConfirm,
  mode = "search",
  title = DEFAULT_TITLE,
  subtitle,
  radiusLabel = "Radio",
  minRadiusKm = 3,
  maxRadiusKm = 200,
  stepKm = 1,
  showRadius = true,
  allowClear = true,
  showUseLocation = true,
  primaryActionLabel = "Usar ubicación",
  primaryActionDisabled = false,
  overlayHint = DEFAULT_OVERLAY,
  errorMessage,
}: Props) {
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [queryDirty, setQueryDirty] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [draft, setDraft] = useState<DraftState>(() => ({
    lat: typeof value.lat === "number" && Number.isFinite(value.lat) ? value.lat : null,
    lng: typeof value.lng === "number" && Number.isFinite(value.lng) ? value.lng : null,
    label: (value.label || "").trim(),
    placeId: (value.placeId || "").trim(),
    radiusKm,
  }));
  const [mapSessionId, setMapSessionId] = useState(0);
  const geoRequestRef = useRef(0);
  const lastResultsRef = useRef<GeoSearchResult[]>([]);
  const lastReverseLabelRef = useRef<string>("");
  const prevOpenRef = useRef(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const circleRef = useRef<LeafletCircle | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const autoGeoRef = useRef(false);
  const commitCenterRef = useRef<
    (
      next: { lat: number; lng: number },
      nextLabel?: string,
      nextPlaceId?: string,
      options?: { updateQuery?: boolean }
    ) => void
  >(() => {});
  const safeClose = useCallback(
    (event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (typeof window === "undefined") {
        onClose();
        return;
      }
      window.setTimeout(() => {
        onClose();
      }, 0);
    },
    [onClose]
  );

  const lat = typeof draft.lat === "number" && Number.isFinite(draft.lat) ? draft.lat : null;
  const lng = typeof draft.lng === "number" && Number.isFinite(draft.lng) ? draft.lng : null;
  const label = draft.label.trim();
  const placeId = draft.placeId.trim();
  const hasCoords = lat !== null && lng !== null;
  const resolvedLabel = label || (hasCoords ? "Mi ubicación" : "Sin ubicación");
  const resolvedSubtitle =
    subtitle || `${resolvedLabel}${hasCoords ? ` (aprox.) · ${draft.radiusKm} km` : ""}`;
  const centerLabel = label || "Mi ubicación";
  const mapCenter = useMemo(
    () => (hasCoords ? { lat: lat as number, lng: lng as number } : DEFAULT_LOCATION_CENTER),
    [hasCoords, lat, lng]
  );
  const radiusMeters = useMemo(() => {
    if (!Number.isFinite(draft.radiusKm)) return MIN_RADIUS_METERS;
    return Math.max(MIN_RADIUS_METERS, draft.radiusKm * 1000);
  }, [draft.radiusKm]);
  const mapCenterRef = useRef(mapCenter);
  const radiusMetersRef = useRef(radiusMeters);
  useEffect(() => {
    mapCenterRef.current = mapCenter;
  }, [mapCenter]);
  useEffect(() => {
    radiusMetersRef.current = radiusMeters;
  }, [radiusMeters]);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const nextDraft = {
        lat: typeof value.lat === "number" && Number.isFinite(value.lat) ? value.lat : null,
        lng: typeof value.lng === "number" && Number.isFinite(value.lng) ? value.lng : null,
        label: (value.label || "").trim(),
        placeId: (value.placeId || "").trim(),
        radiusKm,
      };
      setDraft(nextDraft);
      setGeoQuery(nextDraft.label);
      setGeoResults([]);
      setSearchLoading(false);
      setGeoError("");
      setQueryDirty(false);
      setSelectionError("");
      setMapSessionId((prev) => prev + 1);
      prevOpenRef.current = true;
      autoGeoRef.current = false;
    }
    if (!open && prevOpenRef.current) {
      prevOpenRef.current = false;
      autoGeoRef.current = false;
    }
  }, [open, radiusKm, value.label, value.lat, value.lng, value.placeId]);

  useEffect(() => {
    if (!open) return;
    const trimmed = geoQuery.trim();
    if (trimmed.length < 2) {
      setGeoResults([]);
      setSearchLoading(false);
      return;
    }
    const requestId = geoRequestRef.current + 1;
    geoRequestRef.current = requestId;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({
          q: trimmed,
          country: "es",
          lang: "es",
          mode: "settlement",
        });
        if (hasCoords) {
          params.set("lat", String(lat));
          params.set("lng", String(lng));
        }
        const res = await fetch(`/api/geo/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (geoRequestRef.current !== requestId) return;
        if (res.status === 304) {
          setGeoResults(lastResultsRef.current);
          return;
        }
        const data = await res.json().catch(() => []);
        if (!res.ok || !Array.isArray(data)) {
          setGeoResults([]);
          return;
        }
        const results = data as GeoSearchResult[];
        lastResultsRef.current = results;
        setGeoResults(results);
      } catch (_err) {
        if (!controller.signal.aborted && geoRequestRef.current === requestId) {
          setGeoResults([]);
        }
      } finally {
        if (geoRequestRef.current === requestId) setSearchLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [geoQuery, hasCoords, lat, lng, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const commitCenter = useCallback(
    (
      next: { lat: number; lng: number },
      nextLabel?: string,
      nextPlaceId?: string,
      options?: { updateQuery?: boolean }
    ) => {
      const resolvedLabel = (nextLabel || label || "Ubicación aproximada").trim();
      const resolvedPlaceId = (nextPlaceId || placeId || "").trim();
      setDraft((prev) => ({
        ...prev,
        lat: next.lat,
        lng: next.lng,
        label: resolvedLabel,
        placeId: resolvedPlaceId,
      }));
      if (options?.updateQuery) {
        setGeoQuery(resolvedLabel);
      }
      setQueryDirty(false);
      setSelectionError("");
    },
    [label, placeId]
  );
  useEffect(() => {
    commitCenterRef.current = commitCenter;
  }, [commitCenter]);

  useEffect(() => {
    if (!open || mapSessionId === 0) return;
    const container = mapContainerRef.current;
    if (!container) return;
    let cancelled = false;
    let timeoutId = 0;
    let raf1 = 0;
    let raf2 = 0;
    let map: LeafletMap | null = null;
    let marker: LeafletMarker | null = null;
    let circle: LeafletCircle | null = null;

    const initMap = async () => {
      const leafletModule = await import("leaflet");
      if (cancelled) return;
      const L = ((leafletModule as unknown as { default?: LeafletModule }).default ?? leafletModule) as LeafletModule;
      leafletRef.current = L;

      const initialCenter = mapCenterRef.current;
      const initialRadius = radiusMetersRef.current;
      const markerIcon = L.divIcon({
        className: "",
        html:
          '<div style="width:16px;height:16px;border-radius:999px;background:#0ea5e9;border:2px solid #0f172a;box-shadow:0 0 0 4px rgba(14,165,233,0.25);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      map = L.map(container, { zoomControl: true, attributionControl: false, scrollWheelZoom: true });
      mapRef.current = map;
      L.tileLayer(MAP_TILE_URL, { attribution: MAP_ATTRIBUTION }).addTo(map);

      marker = L.marker([initialCenter.lat, initialCenter.lng], { draggable: true, icon: markerIcon }).addTo(map);
      circle = L.circle([initialCenter.lat, initialCenter.lng], {
        radius: Math.max(MIN_RADIUS_METERS, initialRadius),
        color: "#0ea5e9",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 0.18,
      }).addTo(map);
      markerRef.current = marker;
      circleRef.current = circle;

      const safeRadius = Math.max(MIN_RADIUS_METERS, initialRadius);
      const bounds = L.latLng(initialCenter.lat, initialCenter.lng).toBounds(safeRadius * 2);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });

      map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
        commitCenterRef.current(
          { lat: event.latlng.lat, lng: event.latlng.lng },
          undefined,
          undefined,
          { updateQuery: true }
        );
      });
      marker.on("dragend", () => {
        const next = marker?.getLatLng();
        if (!next) return;
        commitCenterRef.current({ lat: next.lat, lng: next.lng }, undefined, undefined, { updateQuery: true });
      });

      map.whenReady(() => {
        if (cancelled || !map) return;
        timeoutId = window.setTimeout(() => {
          raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
              if (cancelled || !map) return;
              safeInvalidate(map);
            });
          });
        }, 80);
      });
    };

    void initMap();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      if (marker) {
        marker.off();
      }
      if (map) {
        map.off();
        map.remove();
      }
      if (mapRef.current === map) {
        mapRef.current = null;
      }
      markerRef.current = null;
      circleRef.current = null;
      const containerEl = container as HTMLElement & { _leaflet_id?: number };
      if (containerEl._leaflet_id) {
        delete containerEl._leaflet_id;
      }
    };
  }, [open, mapSessionId]);

  useEffect(() => {
    if (!open) return;
    const mapInstance = mapRef.current;
    const markerInstance = markerRef.current;
    const circleInstance = circleRef.current;
    const L = leafletRef.current;
    if (!mapInstance || !markerInstance || !circleInstance || !L) return;
    const nextCenter: [number, number] = [mapCenter.lat, mapCenter.lng];
    markerInstance.setLatLng(nextCenter);
    circleInstance.setLatLng(nextCenter);
    circleInstance.setRadius(Math.max(MIN_RADIUS_METERS, radiusMeters));
    const bounds = L.latLng(nextCenter[0], nextCenter[1]).toBounds(Math.max(MIN_RADIUS_METERS, radiusMeters) * 2);
    mapInstance.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }, [open, mapCenter.lat, mapCenter.lng, radiusMeters]);

  useEffect(() => {
    if (!open || mode !== "search") return;
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [open, mode]);

  const handleUseLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Ubicación no disponible en este navegador.");
      return;
    }
    setGeoLoading(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let resolvedLabel = "Mi ubicación";
        let resolvedPlaceId = "";
        try {
          const params = new URLSearchParams({
            lat: String(latitude),
            lng: String(longitude),
            lang: "es",
          });
          const res = await fetch(`/api/geo/reverse?${params.toString()}`, { cache: "no-store" });
          if (res.status !== 304) {
            const data = await res.json().catch(() => null);
            if (res.ok && data && typeof data.label === "string" && data.label.trim()) {
              resolvedLabel = data.label.trim();
              resolvedPlaceId = typeof data.placeId === "string" ? data.placeId : "";
              lastReverseLabelRef.current = resolvedLabel;
            }
          } else if (lastReverseLabelRef.current) {
            resolvedLabel = lastReverseLabelRef.current;
          }
        } catch (_err) {
          // ignore reverse lookup errors
        }
        commitCenter({ lat: latitude, lng: longitude }, resolvedLabel, resolvedPlaceId, { updateQuery: true });
        setGeoLoading(false);
      },
      () => {
        setGeoError("No pudimos obtener tu ubicación. Busca una ciudad.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  }, [commitCenter]);

  useEffect(() => {
    if (!open || mode !== "geo") return;
    if (autoGeoRef.current) return;
    autoGeoRef.current = true;
    handleUseLocation();
  }, [handleUseLocation, mode, open]);

  const handleSelectGeoResult = (result: GeoSearchResult) => {
    commitCenter({ lat: result.lat, lng: result.lon }, result.display, result.placeId, { updateQuery: true });
    setGeoResults([]);
  };

  const handleClearLocation = () => {
    setGeoQuery("");
    setGeoResults([]);
    setDraft((prev) => ({
      ...prev,
      lat: null,
      lng: null,
      label: "",
      placeId: "",
    }));
    setQueryDirty(false);
    setSelectionError("");
  };

  const selectionInvalid = queryDirty && geoQuery.trim().length > 0;
  const onPrimary = () => {
    if (selectionInvalid) {
      setSelectionError("Selecciona una sugerencia válida.");
      return;
    }
    if (!hasCoords) {
      setSelectionError("Selecciona una ubicación.");
      return;
    }
    const payload = {
      lat,
      lng,
      label: label || geoQuery.trim(),
      placeId: placeId || null,
      radiusKm: draft.radiusKm,
    };
    onConfirm(payload);
    onClose();
  };

  const isPrimaryDisabled = primaryActionDisabled || selectionInvalid;
  const shouldRenderMap = open && mapSessionId > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()} modal>
      <Dialog.Portal>
        {open ? (
          <>
            <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm" />
            <Dialog.Content
              aria-label={title}
              className="fixed inset-0 z-[1000] flex items-end justify-center p-3 sm:items-center sm:p-6"
              onPointerDownOutside={(event) => safeClose(event)}
              onInteractOutside={(event) => safeClose(event)}
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                safeClose(event);
              }}
            >
              <div className="w-full sm:w-[560px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[color:var(--surface-1)] shadow-2xl">
                <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-5 sm:pb-5 space-y-4">
                  <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{title}</p>
                      <p className="text-xs text-[color:var(--muted)]">{resolvedSubtitle}</p>
                      <p className="text-xs text-[color:var(--muted)]">Centro aprox.: {centerLabel}</p>
                      <p className="text-xs text-[color:var(--muted)]">Zona aproximada por privacidad.</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Cerrar"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => safeClose(event)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                    >
                      X
                    </button>
                  </div>

                  <div className="space-y-2 relative z-30">
                    <label
                      className="text-xs font-semibold text-[color:var(--muted)]"
                      htmlFor="location-picker-search"
                    >
                      Buscar ciudad
                    </label>
                    <div className="relative">
                      <input
                        id="location-picker-search"
                        ref={searchInputRef}
                        value={geoQuery}
                        onChange={(event) => {
                          setGeoQuery(event.target.value);
                          setQueryDirty(true);
                          setSelectionError("");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && geoResults.length > 0) {
                            event.preventDefault();
                            handleSelectGeoResult(geoResults[0]);
                          }
                        }}
                        placeholder="Madrid, Valencia..."
                        className="h-10 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-sm text-[color:var(--text)]"
                      />
                      {geoResults.length > 0 && (
                        <div className="absolute z-[1001] mt-1 w-full max-h-56 overflow-auto rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-lg">
                          {geoResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleSelectGeoResult(result);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                            >
                              <span className="block text-sm font-semibold text-[color:var(--text)]">
                                {result.display}
                              </span>
                              {result.subtitle ? (
                                <span className="block text-[11px] text-[color:var(--muted)]">
                                  {result.subtitle}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {searchLoading ? (
                      <span className="text-[11px] text-[color:var(--muted)]">Buscando...</span>
                    ) : null}
                    {selectionInvalid ? (
                      <span className="text-[11px] text-[color:var(--danger)]">
                        {selectionError || "Selecciona una sugerencia para guardar."}
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 space-y-3">
                    <p className="text-xs font-semibold text-[color:var(--text)]">Mapa aproximado</p>
                    <div className="relative z-0 h-[260px] w-full max-w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] isolate sm:h-[320px] [&_.leaflet-control-attribution]:hidden">
                      {shouldRenderMap ? (
                        <div key={`location-map-${mapSessionId}`} ref={mapContainerRef} className="h-full w-full" />
                      ) : null}
                      {!hasCoords ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[color:var(--muted)] bg-[linear-gradient(180deg,rgba(15,23,42,0.4),rgba(15,23,42,0.6))]">
                          {overlayHint}
                        </div>
                      ) : null}
                    </div>
                    {showRadius ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-[color:var(--muted)]">{radiusLabel}</p>
                          <span className="text-xs text-[color:var(--muted)]">{draft.radiusKm} km</span>
                        </div>
                        <input
                          type="range"
                          min={minRadiusKm}
                          max={maxRadiusKm}
                          step={stepKm}
                          value={draft.radiusKm}
                          onChange={(event) => {
                            const nextKm = Number(event.target.value);
                            setDraft((prev) => ({ ...prev, radiusKm: nextKm }));
                          }}
                          className="w-full"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {showUseLocation ? (
                        <button
                          type="button"
                          onClick={handleUseLocation}
                          disabled={geoLoading}
                          className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {geoLoading ? "Cargando..." : "Usar mi ubicación"}
                        </button>
                      ) : null}
                      {allowClear && hasCoords ? (
                        <button
                          type="button"
                          onClick={handleClearLocation}
                          className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                        >
                          Quitar ubicación
                        </button>
                      ) : null}
                      {geoError ? (
                        <span className="text-[11px] text-[color:var(--danger)]">{geoError}</span>
                      ) : null}
                    </div>
                  </div>

                  {errorMessage ? <div className="text-xs text-[color:var(--danger)]">{errorMessage}</div> : null}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => safeClose(event)}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={onPrimary}
                      disabled={isPrimaryDisabled}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                    >
                      {primaryActionLabel}
                    </button>
                  </div>
                </div>
              </div>
            </Dialog.Content>
          </>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Verification checklist:
// - [ ] Location dialog opens without Leaflet _leaflet_pos errors
// - [ ] Closing and reopening does not reuse a stale map instance
// - [ ] Map renders after open animation with correct size
