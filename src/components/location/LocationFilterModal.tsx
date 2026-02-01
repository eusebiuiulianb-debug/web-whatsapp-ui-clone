import { useCallback, useEffect, useRef, useState } from "react";

type GeoSearchResult = {
  id: string;
  placeId?: string;
  display: string;
  subtitle?: string;
  lat: number;
  lon: number;
};

type LocationApplyPayload = {
  lat: number;
  lng: number;
  label: string;
  radiusKm: number;
  placeId?: string | null;
};

type SelectedPlace = {
  lat: number;
  lng: number;
  label: string;
  placeId?: string | null;
};

type Props = {
  open: boolean;
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
  onApply?: (value: LocationApplyPayload | null) => void;
  onClose: () => void;
};

const DEFAULT_RADIUS_KM = 25;
const DEFAULT_MIN_RADIUS = 1;
const DEFAULT_MAX_RADIUS = 200;
const DEFAULT_STEP = 1;

function normalizeRadius(value: number | null | undefined, minKm: number, maxKm: number) {
  const raw = Number.isFinite(value ?? NaN) ? (value as number) : DEFAULT_RADIUS_KM;
  const rounded = Math.round(raw);
  if (rounded < minKm) return minKm;
  if (rounded > maxKm) return maxKm;
  return rounded;
}

function resolveInitialSelection(
  initialValue: Props["initialValue"],
  minKm: number,
  maxKm: number
) {
  const lat = typeof initialValue?.lat === "number" && Number.isFinite(initialValue.lat)
    ? initialValue.lat
    : null;
  const lng = typeof initialValue?.lng === "number" && Number.isFinite(initialValue.lng)
    ? initialValue.lng
    : null;
  const label = (initialValue?.label || "").trim();
  const selectedPlace =
    typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
      ? {
          lat,
          lng,
          label,
          placeId: initialValue?.placeId ?? null,
        }
      : null;
  return {
    label,
    selectedPlace,
    radiusKm: normalizeRadius(initialValue?.radiusKm ?? null, minKm, maxKm),
  };
}


export function LocationFilterModal({
  open,
  initialValue,
  minRadiusKm = DEFAULT_MIN_RADIUS,
  maxRadiusKm = DEFAULT_MAX_RADIUS,
  stepKm = DEFAULT_STEP,
  onApply,
  onClose,
}: Props) {
  const [radiusKm, setRadiusKm] = useState(() =>
    normalizeRadius(initialValue?.radiusKm ?? null, minRadiusKm, maxRadiusKm)
  );
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [applyPending, setApplyPending] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const geoRequestRef = useRef(0);

  const trimmedQuery = geoQuery.trim();

  const hasSelectedPlace =
    typeof selectedPlace?.lat === "number" &&
    Number.isFinite(selectedPlace.lat) &&
    typeof selectedPlace?.lng === "number" &&
    Number.isFinite(selectedPlace.lng);

  const resolvedLabel = hasSelectedPlace ? selectedPlace?.label || "Ubicacion seleccionada" : "";

  const applyAndClose = useCallback(
    (payload: LocationApplyPayload | null) => {
      setApplyPending(true);
      try {
        onApply?.(payload);
      } finally {
        setApplyPending(false);
        onClose();
      }
    },
    [onApply, onClose]
  );

  const clearLocationAndClose = useCallback(() => {
    setApplyPending(true);
    try {
      setSelectedPlace(null);
      setGeoQuery("");
      setGeoResults([]);
      onApply?.(null);
    } finally {
      setApplyPending(false);
      onClose();
    }
  }, [onApply, onClose]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const nextState = resolveInitialSelection(initialValue, minRadiusKm, maxRadiusKm);
      setRadiusKm(nextState.radiusKm);
      setGeoQuery(nextState.label || "");
      setGeoResults([]);
      setSearchLoading(false);
      setApplyPending(false);
      setIsOpen(false);
      setSelectedPlace(nextState.selectedPlace);
    }
    if (!open) {
      setApplyPending(false);
      setIsOpen(false);
    }
    wasOpenRef.current = open;
  }, [initialValue, maxRadiusKm, minRadiusKm, open]);

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

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (trimmedQuery.length < 2) {
      geoRequestRef.current += 1;
      setGeoResults([]);
      setSearchLoading(false);
      setIsOpen(false);
      return;
    }
    if (hasSelectedPlace && selectedPlace && trimmedQuery === selectedPlace.label.trim()) {
      geoRequestRef.current += 1;
      setGeoResults([]);
      setSearchLoading(false);
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    const requestId = geoRequestRef.current + 1;
    geoRequestRef.current = requestId;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          country: "es",
          lang: "es",
          mode: "settlement",
        });
        if (hasSelectedPlace && selectedPlace) {
          params.set("lat", String(selectedPlace.lat));
          params.set("lng", String(selectedPlace.lng));
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
  }, [trimmedQuery, hasSelectedPlace, open, selectedPlace]);

  const handleSelectGeoResult = (result: GeoSearchResult) => {
    geoRequestRef.current += 1;
    setSelectedPlace({
      lat: result.lat,
      lng: result.lon,
      label: result.display,
      placeId: result.placeId ?? null,
    });
    setGeoQuery(result.display);
    setIsOpen(false);
    setGeoResults([]);
    setSearchLoading(false);
  };

  const handleApply = () => {
    if (!hasSelectedPlace || !selectedPlace) return;
    const label = selectedPlace.label || resolvedLabel || "Ubicacion aproximada";
    const payload: LocationApplyPayload = {
      lat: selectedPlace.lat,
      lng: selectedPlace.lng,
      label,
      radiusKm: normalizeRadius(radiusKm, minRadiusKm, maxRadiusKm),
      placeId: selectedPlace.placeId ?? null,
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
          aria-label="Ubicacion"
          onClick={(event) => event.stopPropagation()}
          className="flex w-full max-h-[90vh] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[color:var(--surface-1)] shadow-2xl sm:w-[620px] sm:rounded-2xl"
        >
          <div className="px-4 pt-4 pb-3 sm:px-5">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[color:var(--text)]">Ubicacion</p>
                <p className="text-xs text-[color:var(--muted)]">
                  {resolvedLabel ? `Cerca de ${resolvedLabel}` : "Selecciona una ciudad"}
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
                  const nextValue = event.target.value;
                  setGeoQuery(nextValue);
                  if (selectedPlace && nextValue !== selectedPlace.label) {
                    setSelectedPlace(null);
                  }
                  setIsOpen(nextValue.trim().length >= 2);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const hasSuggestions = isOpen && geoResults.length > 0;
                    const queryMatches =
                      hasSelectedPlace &&
                      selectedPlace &&
                      geoQuery.trim() === selectedPlace.label.trim();
                    if (hasSuggestions && !queryMatches) {
                      event.preventDefault();
                      handleSelectGeoResult(geoResults[0]);
                    }
                    return;
                  }
                  if (event.key === "Escape") {
                    if (isOpen || geoResults.length > 0) {
                      event.preventDefault();
                      geoRequestRef.current += 1;
                      setGeoResults([]);
                      setSearchLoading(false);
                      setIsOpen(false);
                    }
                  }
                }}
                placeholder="Buscar ciudad"
                aria-label="Buscar ciudad"
                className="h-10 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-sm text-[color:var(--text)]"
              />
              {isOpen && geoResults.length > 0 ? (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-lg">
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
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[color:var(--muted)]">Radio</p>
                <span className="text-xs text-[color:var(--muted)]">+{radiusKm} km</span>
              </div>
              <input
                type="range"
                min={minRadiusKm}
                max={maxRadiusKm}
                step={stepKm}
                value={radiusKm}
                onChange={(event) => {
                  setRadiusKm(normalizeRadius(Number(event.target.value), minRadiusKm, maxRadiusKm));
                }}
                className="w-full"
              />
            </div>
            {!hasSelectedPlace ? (
              <p className="text-[11px] text-[color:var(--muted)]">
                Selecciona una ciudad de la lista para continuar.
              </p>
            ) : null}
          </div>

          <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {hasSelectedPlace ? (
                <button
                  type="button"
                  onClick={clearLocationAndClose}
                  disabled={applyPending}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-sm font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Quitar ubicacion
                </button>
              ) : null}
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
                disabled={!hasSelectedPlace || applyPending}
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
