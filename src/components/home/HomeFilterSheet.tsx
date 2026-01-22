import clsx from "clsx";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { encode } from "ngeohash";
import { LocationMap } from "../public-profile/LocationMap";
import type { HomeFilters } from "../../lib/homeFilters";

type Props = {
  open: boolean;
  initialFilters: HomeFilters;
  onApply: (filters: HomeFilters) => void;
  onClear: () => void;
  onClose: () => void;
  openLocationOnMount?: boolean;
};

type GeoSearchResult = {
  id: string;
  display: string;
  lat: number;
  lon: number;
  type?: string;
  importance?: number;
};

const DEFAULT_KM = 25;
const MIN_KM = 5;
const MAX_KM = 200;

export function HomeFilterSheet({
  open,
  initialFilters,
  onApply,
  onClear,
  onClose,
  openLocationOnMount = false,
}: Props) {
  const [draft, setDraft] = useState<HomeFilters>(() => normalizeFilters(initialFilters));
  const [locationOpen, setLocationOpen] = useState(false);
  const locationOpenOnceRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeFilters(initialFilters));
  }, [
    open,
    initialFilters.km,
    initialFilters.lat,
    initialFilters.lng,
    initialFilters.loc,
    initialFilters.avail,
    initialFilters.r24,
    initialFilters.vip,
  ]);

  useEffect(() => {
    if (!open) {
      locationOpenOnceRef.current = false;
      return;
    }
    if (!openLocationOnMount || locationOpenOnceRef.current) return;
    locationOpenOnceRef.current = true;
    setLocationOpen(true);
  }, [open, openLocationOnMount]);

  useEffect(() => {
    if (!open) setLocationOpen(false);
  }, [open]);

  const kmValue = normalizeKm(draft.km);
  const hasLocation = hasCoords(draft);
  const locationLabel = (draft.loc || "").trim();

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--text)]">Filtros</h2>
          <p className="text-xs text-[color:var(--muted)]">Ajusta la búsqueda a tu estilo</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar filtros"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
        >
          X
        </button>
      </div>

      <div className="mt-4 space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[color:var(--muted)]">Radio</p>
            <span className="text-xs text-[color:var(--muted)]">{kmValue} km</span>
          </div>
          <input
            type="range"
            min={MIN_KM}
            max={MAX_KM}
            step={5}
            value={kmValue}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, km: Number(event.target.value) }))
            }
            className="mt-2 w-full"
          />
          <p className="mt-2 text-[11px] text-[color:var(--muted)]">
            Usa una ubicación para filtrar por cercanía.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-[color:var(--muted)]">Ubicación</p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            {locationLabel || "Sin ubicación"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLocationOpen(true)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
                locationLabel
                  ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
              )}
            >
              Elegir en mapa
            </button>
            {hasLocation ? (
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({ ...prev, lat: undefined, lng: undefined, loc: undefined }))
                }
                className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Quitar
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-[color:var(--muted)]">Preferencias</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ToggleChip
              label="Disponible"
              active={Boolean(draft.avail)}
              onClick={() => setDraft((prev) => ({ ...prev, avail: !prev.avail }))}
            />
            <ToggleChip
              label="Responde <24h"
              active={Boolean(draft.r24)}
              onClick={() => setDraft((prev) => ({ ...prev, r24: !prev.r24 }))}
            />
            <ToggleChip
              label="Solo VIP"
              active={Boolean(draft.vip)}
              onClick={() => setDraft((prev) => ({ ...prev, vip: !prev.vip }))}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => {
            setDraft({ km: DEFAULT_KM });
            onClear();
            onClose();
          }}
          className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          Limpiar filtros
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(normalizeFilters(draft));
            onClose();
          }}
          className="inline-flex h-10 items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
        >
          Aplicar
        </button>
      </div>

      <LocationPickerModal
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        km={kmValue}
        location={{ lat: draft.lat, lng: draft.lng, loc: draft.loc }}
        onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
      />
    </BottomSheet>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
          : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
      )}
    >
      {label}
    </button>
  );
}

function LocationPickerModal({
  open,
  onClose,
  km,
  location,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  km: number;
  location: Pick<HomeFilters, "lat" | "lng" | "loc">;
  onChange: (next: Pick<HomeFilters, "lat" | "lng" | "loc">) => void;
}) {
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const geoRequestRef = useRef(0);

  const lat = typeof location.lat === "number" && Number.isFinite(location.lat) ? location.lat : null;
  const lng = typeof location.lng === "number" && Number.isFinite(location.lng) ? location.lng : null;
  const locLabel = (location.loc || "").trim();
  const hasCoords = lat !== null && lng !== null;
  const geohash = useMemo(() => {
    if (!hasCoords) return "";
    try {
      return encode(lat, lng, 5);
    } catch (_err) {
      return "";
    }
  }, [hasCoords, lat, lng]);

  useEffect(() => {
    if (!open) return;
    setGeoQuery(locLabel);
    setGeoResults([]);
    setSearchLoading(false);
    setGeoError("");
  }, [open, locLabel]);

  useEffect(() => {
    if (!open) return;
    const trimmed = geoQuery.trim();
    if (trimmed.length < 3) {
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
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(trimmed)}`, {
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
  }, [geoQuery, open]);

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

  const handleSelectGeoResult = (result: GeoSearchResult) => {
    onChange({ lat: result.lat, lng: result.lon, loc: result.display });
    setGeoQuery(result.display);
    setGeoResults([]);
  };

  const handleUseLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Ubicación no disponible en este navegador.");
      return;
    }
    setGeoLoading(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onChange({ lat: latitude, lng: longitude, loc: "Mi ubicación" });
        setGeoQuery("Mi ubicación");
        setGeoLoading(false);
      },
      () => {
        setGeoError("No se pudo obtener tu ubicación.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  };

  const handleClearLocation = () => {
    onChange({ lat: undefined, lng: undefined, loc: undefined });
    setGeoQuery("");
    setGeoResults([]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ubicación aproximada"
          onClick={(event) => event.stopPropagation()}
          className="w-full sm:w-[560px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[color:var(--surface-1)] shadow-2xl"
        >
          <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-5 sm:pb-5 space-y-4">
            <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[color:var(--text)]">Ubicación aproximada</p>
                <p className="text-xs text-[color:var(--muted)]">
                  {locLabel || "Define tu zona"} {hasCoords ? `· radio ${km} km` : ""}
                </p>
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
              <label className="text-xs font-semibold text-[color:var(--muted)]" htmlFor="home-location-search">
                Buscar ciudad
              </label>
              <div className="relative">
                <input
                  id="home-location-search"
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
                        <span className="block">{result.display}</span>
                        {result.type ? (
                          <span className="block text-[11px] text-[color:var(--muted)] capitalize">
                            {result.type}
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
              <div className="h-[220px] w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] [&_.leaflet-control-attribution]:hidden">
                {geohash ? (
                  <LocationMap geohash={geohash} radiusKm={km} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--muted)]">
                    Ubicación no configurada.
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseLocation}
                  disabled={geoLoading}
                  className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {geoLoading ? "Cargando..." : "Usar ubicación"}
                </button>
                {hasCoords ? (
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

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomSheet({
  open,
  onClose,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[color:var(--surface-overlay)]"
        onClick={dismissible ? onClose : undefined}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pb-6 pt-4">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80" />
        {children}
      </div>
    </div>
  );
}

function normalizeFilters(filters: HomeFilters): HomeFilters {
  const lat = typeof filters.lat === "number" && Number.isFinite(filters.lat) ? filters.lat : undefined;
  const lng = typeof filters.lng === "number" && Number.isFinite(filters.lng) ? filters.lng : undefined;
  const hasLocation = typeof lat === "number" && typeof lng === "number";
  const loc = hasLocation ? (filters.loc || "").trim() : "";

  return {
    km: normalizeKm(filters.km),
    lat: hasLocation ? lat : undefined,
    lng: hasLocation ? lng : undefined,
    loc: loc || undefined,
    avail: filters.avail || undefined,
    r24: filters.r24 || undefined,
    vip: filters.vip || undefined,
  };
}

function normalizeKm(value?: number): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_KM;
  const rounded = Math.round(value as number);
  if (rounded < MIN_KM) return MIN_KM;
  if (rounded > MAX_KM) return MAX_KM;
  return rounded;
}

function hasCoords(filters: HomeFilters) {
  return (
    typeof filters.lat === "number" &&
    Number.isFinite(filters.lat) &&
    typeof filters.lng === "number" &&
    Number.isFinite(filters.lng)
  );
}
