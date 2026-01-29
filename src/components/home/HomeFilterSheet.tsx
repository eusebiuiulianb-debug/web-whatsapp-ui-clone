import clsx from "clsx";
import { ReactNode, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { HomeFilters } from "../../lib/homeFilters";

type Props = {
  open: boolean;
  initialFilters: HomeFilters;
  onApply: (filters: HomeFilters) => void;
  onClear: () => void;
  onClose: () => void;
  onUseMyLocation: () => void;
  onSearchCity: () => void;
  onEditLocation: () => void;
  onClearLocation: () => void;
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
  onUseMyLocation,
  onSearchCity,
  onEditLocation,
  onClearLocation,
}: Props) {
  const normalizedInitialFilters = useMemo(() => normalizeFilters(initialFilters), [initialFilters]);
  const [draft, setDraft] = useState<HomeFilters>(() => normalizeFilters(initialFilters));

  useEffect(() => {
    if (!open) return;
    setDraft(normalizedInitialFilters);
  }, [open, normalizedInitialFilters]);

  const kmValue = normalizeKm(draft.km);
  const hasLocation = hasCoords(draft);
  const locationLabel = (draft.loc || "").trim();
  const locationDisplay = locationLabel || (hasLocation ? "Mi ubicación" : "Sin ubicación");
  const handleCallback =
    (callback: () => void) => (event?: ReactMouseEvent<HTMLButtonElement>) => {
      event?.stopPropagation();
      callback();
    };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex h-full flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80 md:hidden" />
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
                disabled={!hasLocation}
                className="mt-2 w-full disabled:cursor-not-allowed disabled:opacity-60"
              />
              {hasLocation ? (
                <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                  Mostraremos resultados dentro de {kmValue} km desde {locationDisplay} (aprox.).
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                  Usa una ubicación para filtrar por cercanía.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[color:var(--muted)]">Ubicación</p>
              </div>
              <div className="mt-3 space-y-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3">
                {hasLocation ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[color:var(--text)]">{locationDisplay}</span>
                      <span className="text-[color:var(--muted)]">{kmValue} km</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCallback(onEditLocation)}
                        className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={handleCallback(onClearLocation)}
                        className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Quitar ubicación
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[color:var(--muted)]">Sin ubicación</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCallback(onUseMyLocation)}
                        className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Usar mi ubicación
                      </button>
                      <button
                        type="button"
                        onClick={handleCallback(onSearchCity)}
                        className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Buscar ciudad
                      </button>
                    </div>
                  </div>
                )}
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
        </div>

        <div className="border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
        </div>
      </div>
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
      <div className="absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <div className="w-full max-h-[70vh] overflow-hidden rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl md:max-h-[80vh] md:w-[calc(100vw-32px)] md:max-w-[720px] md:rounded-2xl">
          {children}
        </div>
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
