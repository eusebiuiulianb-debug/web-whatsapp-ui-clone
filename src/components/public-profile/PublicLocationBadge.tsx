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
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const visibility = location?.visibility ?? "OFF";
  const label = (location?.label ?? "").trim();
  const geohash = (location?.geohash ?? "").trim();
  const rawEnabled = location?.enabled;
  const allowLocation = Boolean(
    typeof rawEnabled === "boolean" ? rawEnabled : location?.allowDiscoveryUseLocation
  );
  const resolvedLabel = label || "Mi ubicación";
  const hasMap = visibility === "AREA" && Boolean(geohash);
  const resolvedRadiusKm = location?.precisionKm ?? location?.radiusKm ?? DEFAULT_AREA_RADIUS_KM;
  const alignClass = align === "center" ? "justify-center" : "justify-start";
  const isChip = variant === "chip";
  const chipClass = isChip
    ? "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)]"
    : "border-white/10 bg-white/5 text-white/80";
  const pillBaseClass = isChip
    ? "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[11px] font-semibold"
    : "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs";
  const mutedClass = isChip ? "text-[color:var(--muted)]" : "text-white/50";
  const shouldRender = Boolean(location) && allowLocation && visibility !== "OFF" && Boolean(resolvedLabel);
  const showModal = open || isVisible;
  const overlayMotionClass = prefersReducedMotion ? "" : "transition-opacity duration-200";
  const overlayStateClass = open ? "opacity-100" : "opacity-0 pointer-events-none";
  const panelMotionClass = prefersReducedMotion ? "" : "transition duration-200 ease-out";
  const panelStateClass = prefersReducedMotion
    ? (open ? "opacity-100" : "opacity-0")
    : (open
      ? "opacity-100 translate-y-0 sm:scale-100"
      : "opacity-0 translate-y-4 sm:translate-y-2 sm:scale-95");

  useEffect(() => {
    if (open || !isVisible) return;
    if (prefersReducedMotion) {
      setIsVisible(false);
      return;
    }
    const timeout = window.setTimeout(() => setIsVisible(false), 180);
    return () => window.clearTimeout(timeout);
  }, [open, isVisible, prefersReducedMotion]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleOpen = () => {
    setIsVisible(true);
    if (prefersReducedMotion || typeof window === "undefined") {
      setOpen(true);
      return;
    }
    window.requestAnimationFrame(() => setOpen(true));
  };

  const handleClose = () => {
    setOpen(false);
  };

  if (!shouldRender) return null;

  const mapSearchUrl = resolvedLabel
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(resolvedLabel)}`
    : "";
  const buttonClass = isChip
    ? "cursor-pointer hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
    : "cursor-pointer hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${alignClass}`}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Ver mapa de ${resolvedLabel}`}
        title="Ver mapa"
        className={`${pillBaseClass} ${chipClass} ${buttonClass}`}
      >
        <span>📍 {resolvedLabel}</span>
        <span className={mutedClass}>(aprox.)</span>
        <span className={isChip ? "text-[color:var(--muted)]" : "text-white/60"} aria-hidden="true">
          ›
        </span>
      </button>

      {showModal && (
        <div
          className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm ${overlayMotionClass} ${overlayStateClass}`}
          onClick={handleClose}
        >
          <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Ubicación aproximada"
              onClick={(event) => event.stopPropagation()}
              className={`w-full sm:w-[520px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[color:var(--surface-1)] shadow-2xl ${panelMotionClass} ${panelStateClass}`}
            >
                <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-5 sm:pb-5 space-y-3">
                  <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[color:var(--text)]">Ubicación aproximada</p>
                      <p className="text-xs text-[color:var(--muted)]">
                      {resolvedLabel}
                      {hasMap ? ` · radio aprox. ${resolvedRadiusKm} km` : ""}
                      </p>
                      <p className="text-xs text-[color:var(--muted)]">Zona aproximada por privacidad.</p>
                    </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Cerrar"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  >
                    X
                  </button>
                </div>
                {hasMap ? (
                  <div className="h-[260px] sm:h-[340px] w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] [&_.leaflet-control-attribution]:hidden">
                    <LocationMap geohash={geohash} radiusKm={resolvedRadiusKm} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 text-xs text-[color:var(--muted)] space-y-3">
                    <p>No hay mapa embebido para esta ubicación, pero puedes abrirlo en OpenStreetMap.</p>
                    {mapSearchUrl && (
                      <a
                        href={mapSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-fit items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                      >
                        Abrir mapa
                      </a>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-[color:var(--muted)] opacity-80">
                  ©{" "}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    OpenStreetMap
                  </a>
                  {" · "}
                  ©{" "}
                  <a
                    href="https://carto.com/attributions"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    CARTO
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
