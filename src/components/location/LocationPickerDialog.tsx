import { useEffect, useRef, useState } from "react";
import { LocationPickerMap } from "../home/LocationPickerMap";

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

type Props = {
  open: boolean;
  onClose: () => void;
  value: LocationValue;
  radiusKm: number;
  onChange: (next: LocationValue) => void;
  onRadiusChange?: (nextKm: number) => void;
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
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  overlayHint?: string;
  errorMessage?: string;
};

const DEFAULT_LOCATION_CENTER = { lat: 40.4168, lng: -3.7038 };
const DEFAULT_TITLE = "Ubicación aproximada";
const DEFAULT_OVERLAY = "Elige una ciudad o usa tu ubicación";

export function LocationPickerDialog({
  open,
  onClose,
  value,
  radiusKm,
  onChange,
  onRadiusChange,
  title = DEFAULT_TITLE,
  subtitle,
  radiusLabel = "Radio",
  minRadiusKm = 3,
  maxRadiusKm = 200,
  stepKm = 1,
  showRadius = true,
  allowClear = true,
  showUseLocation = true,
  primaryActionLabel = "Listo",
  onPrimaryAction,
  primaryActionDisabled = false,
  overlayHint = DEFAULT_OVERLAY,
  errorMessage,
}: Props) {
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [mapCenter, setMapCenter] = useState(DEFAULT_LOCATION_CENTER);
  const geoRequestRef = useRef(0);

  const lat = typeof value.lat === "number" && Number.isFinite(value.lat) ? value.lat : null;
  const lng = typeof value.lng === "number" && Number.isFinite(value.lng) ? value.lng : null;
  const label = (value.label || "").trim();
  const placeId = (value.placeId || "").trim();
  const hasCoords = lat !== null && lng !== null;
  const resolvedLabel = label || (hasCoords ? "Mi ubicación" : "Sin ubicación");
  const resolvedSubtitle =
    subtitle || `${resolvedLabel}${hasCoords ? ` (aprox.) · ${radiusKm} km` : ""}`;
  const centerLabel = label || "Mi ubicación";

  useEffect(() => {
    if (!open) return;
    setGeoQuery(label);
    setGeoResults([]);
    setSearchLoading(false);
    setGeoError("");
  }, [open, label]);

  useEffect(() => {
    if (!open) return;
    if (hasCoords && lat !== null && lng !== null) {
      setMapCenter({ lat, lng });
    } else {
      setMapCenter(DEFAULT_LOCATION_CENTER);
    }
  }, [hasCoords, lat, lng, open]);

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
        });
        const data = await res.json().catch(() => []);
        if (geoRequestRef.current !== requestId) return;
        if (!res.ok || !Array.isArray(data)) {
          setGeoResults([]);
          return;
        }
        setGeoResults(data as GeoSearchResult[]);
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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const commitCenter = (next: { lat: number; lng: number }, nextLabel?: string, nextPlaceId?: string) => {
    const resolvedLabel = (nextLabel || label || "Ubicación aproximada").trim();
    const resolvedPlaceId = (nextPlaceId || placeId || "").trim();
    setMapCenter(next);
    onChange({ lat: next.lat, lng: next.lng, label: resolvedLabel, placeId: resolvedPlaceId || null });
  };

  const handleSelectGeoResult = (result: GeoSearchResult) => {
    commitCenter({ lat: result.lat, lng: result.lon }, result.display, result.placeId);
    setGeoQuery(result.display);
    setGeoResults([]);
  };

  const handleMapCenterChange = (next: { lat: number; lng: number }) => {
    commitCenter(next);
  };

  const handleUseLocation = () => {
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
          const res = await fetch(`/api/geo/reverse?${params.toString()}`);
          const data = await res.json().catch(() => null);
          if (res.ok && data && typeof data.label === "string" && data.label.trim()) {
            resolvedLabel = data.label.trim();
            resolvedPlaceId = typeof data.placeId === "string" ? data.placeId : "";
          }
        } catch (_err) {
          // ignore reverse lookup errors
        }
        commitCenter({ lat: latitude, lng: longitude }, resolvedLabel, resolvedPlaceId);
        setGeoQuery(resolvedLabel);
        setGeoLoading(false);
      },
      () => {
        setGeoError("No pudimos obtener tu ubicación. Busca una ciudad.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  };

  const handleClearLocation = () => {
    onChange({ lat: null, lng: null, label: "", placeId: null });
    setGeoQuery("");
    setGeoResults([]);
    setMapCenter(DEFAULT_LOCATION_CENTER);
  };

  if (!open) return null;

  const onPrimary = onPrimaryAction || onClose;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
          className="w-full sm:w-[560px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[color:var(--surface-1)] shadow-2xl"
        >
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
                onClick={onClose}
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
              >
                X
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[color:var(--muted)]" htmlFor="location-picker-search">
                Buscar ciudad
              </label>
              <div className="relative">
                <input
                  id="location-picker-search"
                  value={geoQuery}
                  onChange={(event) => setGeoQuery(event.target.value)}
                  placeholder="Madrid, Valencia..."
                  className="h-10 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-sm text-[color:var(--text)]"
                />
                {geoResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-lg">
                    {geoResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleSelectGeoResult(result)}
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
            </div>

            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3 space-y-3">
              <p className="text-xs font-semibold text-[color:var(--text)]">Mapa aproximado</p>
              <div className="relative h-[220px] w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] [&_.leaflet-control-attribution]:hidden">
                <LocationPickerMap center={mapCenter} radiusKm={radiusKm} onCenterChange={handleMapCenterChange} />
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
                    <span className="text-xs text-[color:var(--muted)]">{radiusKm} km</span>
                  </div>
                  <input
                    type="range"
                    min={minRadiusKm}
                    max={maxRadiusKm}
                    step={stepKm}
                    value={radiusKm}
                    onChange={(event) => onRadiusChange?.(Number(event.target.value))}
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
                    {geoLoading ? "Cargando..." : "Usar ubicación"}
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
                {geoError ? <span className="text-[11px] text-[color:var(--danger)]">{geoError}</span> : null}
              </div>
            </div>

            {errorMessage ? (
              <div className="text-xs text-[color:var(--danger)]">{errorMessage}</div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onPrimary}
                disabled={primaryActionDisabled}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
              >
                {primaryActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
