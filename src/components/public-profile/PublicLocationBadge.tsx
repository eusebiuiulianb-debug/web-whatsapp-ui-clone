import { useEffect, useState } from "react";
import type { CreatorLocation } from "../../types/creatorLocation";
import { LocationMap } from "./LocationMap";

const DEFAULT_AREA_RADIUS_KM = 5;

type Props = {
  location?: CreatorLocation | null;
  align?: "start" | "center";
  variant?: "badge" | "chip";
};

export function PublicLocationBadge({ location, align = "start", variant = "badge" }: Props) {
  const [open, setOpen] = useState(false);
  const visibility = location?.visibility ?? "OFF";
  const label = (location?.label || "").trim();
  const geohash = (location?.geohash || "").trim();
  const hasMap = Boolean(geohash);
  const canShowMap = visibility === "AREA" && hasMap;
  const resolvedRadiusKm = location?.radiusKm ?? DEFAULT_AREA_RADIUS_KM;
  const alignClass = align === "center" ? "justify-center" : "justify-start";
  const chipClass = variant === "chip"
    ? "border-white/10 bg-white/5 text-white/80"
    : "border-white/10 bg-white/5 text-white/80";
  const pillBaseClass = "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs";
  const mutedClass = "text-white/50";
  const shouldRender = visibility !== "OFF" && Boolean(label);

  useEffect(() => {
    if (!canShowMap && open) setOpen(false);
  }, [canShowMap, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!shouldRender) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${alignClass}`}>
      {canShowMap ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Ver zona aproximada de ${label}`}
          className={`${pillBaseClass} ${chipClass} cursor-pointer hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30`}
        >
          <span>📍 {label}</span>
          <span className={mutedClass}>(aprox.)</span>
          <span className="text-white/60" aria-hidden="true">›</span>
        </button>
      ) : (
        <span className={`${pillBaseClass} ${chipClass} opacity-90`}>
          <span>📍 {label}</span>
          <span className={mutedClass}>(aprox.)</span>
        </span>
      )}

      {open && canShowMap && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Ubicación aproximada"
              onClick={(event) => event.stopPropagation()}
              className="w-full sm:w-[520px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[color:var(--surface-1)] shadow-2xl"
            >
              <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-5 sm:pb-5 space-y-3">
                <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[color:var(--text)]">Ubicación aproximada</p>
                    <p className="text-xs text-[color:var(--muted)]">
                      {label} · radio aprox. {resolvedRadiusKm} km
                    </p>
                    <p className="text-xs text-[color:var(--muted)]">Zona aproximada por privacidad.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  >
                    X
                  </button>
                </div>
                <div className="h-[260px] sm:h-[340px] w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
                  <LocationMap geohash={geohash} radiusKm={resolvedRadiusKm} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
