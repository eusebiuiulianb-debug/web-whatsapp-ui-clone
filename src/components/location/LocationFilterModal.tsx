import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import type { Map as LeafletMap } from "leaflet";
import { LocationPickerMap } from "./LocationPickerMap";
import { buildExploreSearchParams } from "../../lib/geoQuery";

type GeoSearchResult = {
  id: string;
  placeId?: string;
  display: string;
  subtitle?: string;
  lat: number;
  lon: number;
};

type LocationDraft = {
  lat: number | null;
  lng: number | null;
  label: string;
  radiusKm: number;
  placeId?: string | null;
};

type LocationApplyPayload = {
  lat: number;
  lng: number;
  label: string;
  radiusKm: number;
  placeId?: string | null;
};

type Props = {
  open: boolean;
  mode?: "geo" | "search" | null;
  initialValue?: {
    lat?: number | null;
    lng?: number | null;
    label?: string | null;
    radiusKm?: number | null;
    placeId?: string | null;
  };
  minRadiusKm?: number;
  maxRadiusKm?: number;
  stepKm?: number;
  onApply?: (value: LocationApplyPayload) => void;
  onClose: () => void;
};

const DEFAULT_LOCATION_CENTER = { lat: 40.4168, lng: -3.7038 };
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_MIN_RADIUS = 1;
const DEFAULT_MAX_RADIUS = 200;
const DEFAULT_STEP = 1;
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

function normalizeRadius(value: number | null | undefined, minKm: number, maxKm: number) {
  const raw = Number.isFinite(value ?? NaN) ? (value as number) : DEFAULT_RADIUS_KM;
  const rounded = Math.round(raw);
  if (rounded < minKm) return minKm;
  if (rounded > maxKm) return maxKm;
  return rounded;
}

function buildDraft(
  initialValue: Props["initialValue"],
  minKm: number,
  maxKm: number
): LocationDraft {
  const lat = typeof initialValue?.lat === "number" && Number.isFinite(initialValue.lat)
    ? initialValue.lat
    : null;
  const lng = typeof initialValue?.lng === "number" && Number.isFinite(initialValue.lng)
    ? initialValue.lng
    : null;
  const label = (initialValue?.label || "").trim();
  return {
    lat,
    lng,
    label,
    radiusKm: normalizeRadius(initialValue?.radiusKm ?? null, minKm, maxKm),
    placeId: initialValue?.placeId ?? null,
  };
}

const DEBUG_LOC = process.env.NEXT_PUBLIC_DEBUG_LOC === "1";

export function LocationFilterModal({
  open,
  mode = null,
  initialValue,
  minRadiusKm = DEFAULT_MIN_RADIUS,
  maxRadiusKm = DEFAULT_MAX_RADIUS,
  stepKm = DEFAULT_STEP,
  onApply,
  onClose,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<LocationDraft>(() => buildDraft(initialValue, minRadiusKm, maxRadiusKm));
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [sessionId, setSessionId] = useState(0);
  const [applyPending, setApplyPending] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const radiusRef = useRef(DEFAULT_RADIUS_KM);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const modeHandledRef = useRef(false);
  const geoRequestRef = useRef(0);
  const geoLocateRequestRef = useRef(0);
  const reverseAbortRef = useRef<AbortController | null>(null);

  const hasCoords =
    typeof draft.lat === "number" &&
    Number.isFinite(draft.lat) &&
    typeof draft.lng === "number" &&
    Number.isFinite(draft.lng);

  const mapCenter = useMemo(() => {
    if (hasCoords && draft.lat !== null && draft.lng !== null) {
      return { lat: draft.lat, lng: draft.lng };
    }
    return DEFAULT_LOCATION_CENTER;
  }, [draft.lat, draft.lng, hasCoords]);

  const resolvedLabel = draft.label || (hasCoords ? "Mi ubicaciรณn" : "");

  const applyLocationToUrl = useCallback(
    ({ lat, lng, radiusKm, locLabel }: { lat: number; lng: number; radiusKm: number; locLabel: string }) => {
      const params = buildExploreSearchParams(router.asPath || "", {
        lat,
        lng,
        radiusKm,
        locLabel,
      });

      // Avoid router loop: construir nextUrl y comparar con router.asPath
      const nextSearch = params.toString();
      const nextUrl = nextSearch ? `${router.pathname}?${nextSearch}` : router.pathname;
      const currentUrl = router.asPath;

      if (nextUrl === currentUrl) {
        if (DEBUG_LOC) console.log("[loc] applyLocationToUrl skipped (URL unchanged)", nextUrl);
        return;
      }

      if (DEBUG_LOC) {
        console.log("[loc] currentUrl", currentUrl, "→ nextUrl", nextUrl);
      }

      // Fire-and-forget: no await, solo .catch()
      const nextQuery: Record<string, string> = {};
      params.forEach((value, key) => {
        nextQuery[key] = value;
      });

      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
        shallow: true,
        scroll: false,
      }).catch((err) => {
        console.error("[LocationFilterModal] router.replace failed", err);
      });
    },
    [router]
  );

  const applyAndClose = useCallback(
    (payload: LocationApplyPayload) => {
      setApplyPending(true);
      
      // Fire-and-forget URL update
      applyLocationToUrl({
        lat: payload.lat,
        lng: payload.lng,
        radiusKm: payload.radiusKm,
        locLabel: payload.label,
      });
      
      // Callback y cierre INMEDIATO sin await
      onApply?.(payload);
      onClose();
      
      // Reset pending después de un breve delay para mostrar feedback
      setTimeout(() => {
        setApplyPending(false);
      }, 300);
    },
    [applyLocationToUrl, onApply, onClose]
  );

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      if (DEBUG_LOC) {
        console.log("[loc] modal open");
      }
      const nextDraft = buildDraft(initialValue, minRadiusKm, maxRadiusKm);
      setDraft(nextDraft);
      setGeoQuery(nextDraft.label || "");
      setGeoResults([]);
      setSearchLoading(false);
      setGeoError("");
      setApplyPending(false);
      setSessionId((prev) => prev + 1);
      modeHandledRef.current = false;
    }
    if (!open) {
      if (DEBUG_LOC && wasOpenRef.current) {
        console.log("[loc] modal close");
      }
      mapRef.current = null;
      setApplyPending(false);
      setGeoLoading(false);
    }
    wasOpenRef.current = open;
  }, [initialValue, maxRadiusKm, minRadiusKm, open]);

  useEffect(() => {
    radiusRef.current = draft.radiusKm;
  }, [draft.radiusKm]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const handleUseLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Ubicaciรณn no disponible en este navegador.");
      return;
    }
    if (DEBUG_LOC) {
      console.log("[loc] use my location");
    }
    setGeoLoading(true);
    setGeoError("");
    const requestId = geoLocateRequestRef.current + 1;
    geoLocateRequestRef.current = requestId;
    try {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (geoLocateRequestRef.current !== requestId) return;
          const { latitude, longitude } = position.coords;
          let resolved = "Tu ubicaciรณn";
          let resolvedPlaceId = "";
          reverseAbortRef.current?.abort();
          const reverseController = new AbortController();
          reverseAbortRef.current = reverseController;
          try {
            const params = new URLSearchParams({
              lat: String(latitude),
              lng: String(longitude),
              lang: "es",
            });
            const res = await fetch(`/api/geo/reverse?${params.toString()}`, {
              cache: "no-store",
              signal: reverseController.signal,
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data && typeof data.label === "string" && data.label.trim()) {
              resolved = data.label.trim();
              resolvedPlaceId = typeof data.placeId === "string" ? data.placeId : "";
            }
          } catch (err) {
            if (!(err instanceof DOMException && err.name === "AbortError")) {
              console.error("[LocationFilterModal] reverse geocode failed", err);
            }
          }
          const resolvedRadiusKm = normalizeRadius(radiusRef.current, minRadiusKm, maxRadiusKm);
          setDraft((prev) => ({
            ...prev,
            lat: latitude,
            lng: longitude,
            label: resolved,
            placeId: resolvedPlaceId || null,
            radiusKm: resolvedRadiusKm,
          }));
          setGeoQuery(resolved);
          setGeoResults([]);
          setGeoLoading(false);
          // Removed auto-apply to prevent closing modal
        },
        (err) => {
          if (geoLocateRequestRef.current !== requestId) return;
          console.error("[LocationFilterModal] geolocation failed", err);
          setGeoError("No pudimos obtener tu ubicaciรณn. Busca una ciudad.");
          setGeoLoading(false);
        },
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
      );
    } catch (err) {
      console.error("[LocationFilterModal] geolocation failed", err);
      setGeoError("No pudimos obtener tu ubicaciรณn. Busca una ciudad.");
      setGeoLoading(false);
    }
  }, [maxRadiusKm, minRadiusKm]);

  useEffect(() => {
    if (!open) return;
    if (modeHandledRef.current) return;
    if (mode === "geo") {
      modeHandledRef.current = true;
      handleUseLocation();
      return;
    }
    if (mode === "search") {
      modeHandledRef.current = true;
      inputRef.current?.focus();
    }
  }, [handleUseLocation, mode, open]);

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
        if (hasCoords && draft.lat !== null && draft.lng !== null) {
          params.set("lat", String(draft.lat));
          params.set("lng", String(draft.lng));
        }
        const res = await fetch(`/api/geo/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await res.json().catch(() => []);
        if (geoRequestRef.current !== requestId) return;
        if (!res.ok || !Array.isArray(data)) {
          setGeoResults([]);
          return;
        }
        setGeoResults(data as GeoSearchResult[]);
      } catch (err) {
        if (!controller.signal.aborted && geoRequestRef.current === requestId) {
          console.error("[LocationFilterModal] geo search failed", err);
          setGeoResults([]);
        }
      } finally {
        if (geoRequestRef.current === requestId) setSearchLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [draft.lat, draft.lng, geoQuery, hasCoords, open]);

  useEffect(() => {
    if (!open || !mapRef.current) return;
    let timeoutId = 0;
    let raf1 = 0;
    let raf2 = 0;
    let cancelled = false;
    const map = mapRef.current;
    map.whenReady(() => {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(() => {
            if (cancelled) return;
            safeInvalidate(map);
          });
        });
      }, 90);
    });
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [open, sessionId]);

  const handleSelectGeoResult = (result: GeoSearchResult) => {
    if (DEBUG_LOC) {
      console.log("[loc] select suggestion", result.display);
    }
    setDraft((prev) => ({
      ...prev,
      lat: result.lat,
      lng: result.lon,
      label: result.display,
      placeId: result.placeId ?? null,
    }));
    setGeoQuery(result.display);
    setGeoResults([]);
    setGeoError("");
  };

  const handleMapCenterChange = (next: { lat: number; lng: number }) => {
    setDraft((prev) => ({
      ...prev,
      lat: next.lat,
      lng: next.lng,
      label: prev.label || "Ubicaciรณn aproximada",
    }));
  };

  const handleApply = () => {
    if (!hasCoords || draft.lat === null || draft.lng === null) return;
    const label = resolvedLabel || "Ubicación aproximada";
    if (DEBUG_LOC) {
      console.log("[loc] apply click", { lat: draft.lat, lng: draft.lng, radiusKm: draft.radiusKm, label });
    }
    const payload: LocationApplyPayload = {
      lat: draft.lat,
      lng: draft.lng,
      label,
      radiusKm: normalizeRadius(draft.radiusKm, minRadiusKm, maxRadiusKm),
      placeId: draft.placeId ?? null,
    };
    applyAndClose(payload);
  };

  // Resetear applyPending cuando el modal se cierra
  useEffect(() => {
    if (!open) {
      setApplyPending(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="absolute inset-0 flex items-end justify-center p-3 sm:items-center sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ubicaciรณn"
          onClick={(event) => event.stopPropagation()}
          className="flex w-full max-h-[90vh] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[color:var(--surface-1)] shadow-2xl sm:w-[620px] sm:rounded-2xl"
        >
          <div className="px-4 pt-4 pb-3 sm:px-5">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[color:var(--text)]">Ubicaciรณn</p>
                <p className="text-xs text-[color:var(--muted)]">
                  {resolvedLabel ? `Cerca de ${resolvedLabel}` : "Elige un centro aproximado"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
              >
                X
              </button>
            </div>
            <div className="relative mt-3">
              <input
                ref={inputRef}
                value={geoQuery}
                onChange={(event) => {
                  setGeoQuery(event.target.value);
                  setGeoError("");
                }}
                placeholder="ยฟDรณnde?"
                aria-label="Buscar ubicaciรณn"
                className="h-10 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-sm text-[color:var(--text)]"
              />
              {geoResults.length > 0 ? (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-lg">
                  {geoResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectGeoResult(result);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                    >
                      <span className="block text-sm font-semibold text-[color:var(--text)]">{result.display}</span>
                      {result.subtitle ? (
                        <span className="block text-[11px] text-[color:var(--muted)]">{result.subtitle}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {searchLoading ? (
              <span className="mt-2 block text-[11px] text-[color:var(--muted)]">Buscando...</span>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[color:var(--muted)]">Mapa aproximado</p>
              <div className="relative h-[260px] w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] sm:h-[320px]">
                <LocationPickerMap
                  key={sessionId}
                  center={mapCenter}
                  radiusKm={draft.radiusKm}
                  onCenterChange={handleMapCenterChange}
                  onMapReady={(map) => {
                    mapRef.current = map;
                    map.whenReady(() => {
                      window.setTimeout(() => {
                        window.requestAnimationFrame(() => safeInvalidate(map));
                      }, 80);
                    });
                  }}
                />
                {!hasCoords ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(15,23,42,0.35),rgba(15,23,42,0.55))] text-xs text-white/80">
                    Pulsa en el mapa para elegir centro
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[color:var(--muted)]">Radio</p>
                <span className="text-xs text-[color:var(--muted)]">+{draft.radiusKm} km</span>
              </div>
              <input
                type="range"
                min={minRadiusKm}
                max={maxRadiusKm}
                step={stepKm}
                value={draft.radiusKm}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    radiusKm: normalizeRadius(Number(event.target.value), minRadiusKm, maxRadiusKm),
                  }))
                }
                className="w-full"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseLocation}
                disabled={geoLoading}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {geoLoading ? "Cargando..." : "Usar mi ubicaciรณn"}
              </button>
              {geoError ? <span className="text-[11px] text-[color:var(--danger)]">{geoError}</span> : null}
            </div>
          </div>

          <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!hasCoords || applyPending || geoLoading}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {applyPending ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
