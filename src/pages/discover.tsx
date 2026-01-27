import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import clsx from "clsx";
import { encode } from "ngeohash";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HomeSectionCard } from "../components/home/HomeSectionCard";
import { DesktopMenuNav } from "../components/navigation/DesktopMenuNav";
import { LocationMap } from "../components/public-profile/LocationMap";
import { IconGlyph } from "../components/ui/IconGlyph";
import { Skeleton } from "../components/ui/Skeleton";
import { normalizeImageSrc } from "../utils/normalizeImageSrc";

const DEFAULT_LIMIT = 12;
const DEFAULT_RADIUS_KM = 10;
const TAG_OPTIONS = [
  "Conversacion",
  "Compania",
  "Contenido",
  "ASMR",
  "Roleplay",
  "Gaming",
  "Lectura",
  "Fitness",
];

const AVAILABILITY_OPTIONS = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "VIP_ONLY", label: "Solo VIP" },
  { value: "OFFLINE", label: "No disponible" },
];

const RESPONSE_OPTIONS = [
  { value: "INSTANT", label: "Responde al momento" },
  { value: "LT_24H", label: "Responde <24h" },
  { value: "LT_72H", label: "Responde <72h" },
];

type CreatorResult = {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  availability: string;
  responseTime: string;
  locationLabel?: string | null;
  allowLocation?: boolean;
  distanceKm?: number | null;
  priceFrom?: number | null;
};

type FiltersState = {
  availability: string | null;
  responseTime: string | null;
  radiusKm: number;
  tags: string[];
  priceMin: string;
  priceMax: string;
  geo: string;
};

export default function DiscoverPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<FiltersState>({
    availability: null,
    responseTime: null,
    radiusKm: 0,
    tags: [],
    priceMin: "",
    priceMax: "",
    geo: "",
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<CreatorResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady || initializedRef.current) return;
    const q = getQueryString(router.query.q);
    const availability = normalizeAvailability(getQueryString(router.query.availability));
    const responseTime = normalizeResponseTime(getQueryString(router.query.responseTime));
    const radiusKm = parseNumber(getQueryString(router.query.radiusKm));
    const tags = normalizeTags(router.query.tag ?? router.query.tags);
    const priceMin = getQueryString(router.query.priceMin);
    const priceMax = getQueryString(router.query.priceMax);
    const geo = getQueryString(router.query.geo);

    setSearchInput(q);
    setDebouncedSearch(q);
    setFilters({
      availability,
      responseTime,
      radiusKm: Number.isFinite(radiusKm) ? Math.max(0, radiusKm) : 0,
      tags,
      priceMin,
      priceMax,
      geo,
    });
    initializedRef.current = true;
  }, [router.isReady, router.query]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!router.isReady || !initializedRef.current) return;
    const query = buildQuery({
      q: debouncedSearch,
      availability: filters.availability,
      responseTime: filters.responseTime,
      radiusKm: filters.radiusKm,
      tags: filters.tags,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      geo: filters.geo,
    });
    void router.replace({ pathname: "/discover", query }, undefined, {
      shallow: true,
      scroll: false,
    });
  }, [debouncedSearch, filters, router]);

  useEffect(() => {
    if (!router.isReady || !initializedRef.current) return;
    const controller = new AbortController();
    const params = buildQuery({
      q: debouncedSearch,
      availability: filters.availability,
      responseTime: filters.responseTime,
      radiusKm: filters.radiusKm,
      tags: filters.tags,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      geo: filters.geo,
      limit: DEFAULT_LIMIT,
    });
    const endpoint = `/api/public/discover/creators?${new URLSearchParams(params).toString()}`;
    setLoading(true);
    setError("");
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as
          | { items?: CreatorResult[]; total?: number }
          | null;
        if (!res.ok || !payload) {
          setItems([]);
          setTotal(0);
          setError("No se pudieron cargar los creadores.");
          return;
        }
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setTotal(typeof payload.total === "number" ? payload.total : 0);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
        setTotal(0);
        setError("No se pudieron cargar los creadores.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedSearch, filters, router.isReady]);

  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (debouncedSearch) {
      chips.push({
        id: "q",
        label: `Busqueda: ${debouncedSearch}`,
        onRemove: () => setSearchInput(""),
      });
    }
    if (filters.availability) {
      const label = AVAILABILITY_OPTIONS.find((option) => option.value === filters.availability)?.label;
      chips.push({
        id: "availability",
        label: label || "Disponibilidad",
        onRemove: () => setFilters((prev) => ({ ...prev, availability: null })),
      });
    }
    if (filters.responseTime) {
      const label = RESPONSE_OPTIONS.find((option) => option.value === filters.responseTime)?.label;
      chips.push({
        id: "response",
        label: label || "Respuesta",
        onRemove: () => setFilters((prev) => ({ ...prev, responseTime: null })),
      });
    }
    if (filters.radiusKm > 0) {
      chips.push({
        id: "radius",
        label: `Hasta ${filters.radiusKm} km`,
        onRemove: () => setFilters((prev) => ({ ...prev, radiusKm: 0, geo: "" })),
      });
    }
    if (filters.priceMin || filters.priceMax) {
      const min = filters.priceMin ? `${filters.priceMin}€` : "0€";
      const max = filters.priceMax ? `${filters.priceMax}€` : "--";
      chips.push({
        id: "price",
        label: `Precio ${min} - ${max}`,
        onRemove: () => setFilters((prev) => ({ ...prev, priceMin: "", priceMax: "" })),
      });
    }
    filters.tags.forEach((tag) => {
      chips.push({
        id: `tag-${tag}`,
        label: tag,
        onRemove: () =>
          setFilters((prev) => ({ ...prev, tags: prev.tags.filter((item) => item !== tag) })),
      });
    });
    return chips;
  }, [debouncedSearch, filters]);

  const handleApplyFilters = useCallback((next: FiltersState) => {
    setFilters(next);
    setFiltersOpen(false);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters({
      availability: null,
      responseTime: null,
      radiusKm: 0,
      tags: [],
      priceMin: "",
      priceMax: "",
      geo: "",
    });
    setSearchInput("");
    setDebouncedSearch("");
  }, []);

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Discovery · NOVSY</title>
      </Head>
      <div className="sticky top-0 z-40 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)] pb-3 md:px-6 lg:px-8">
          <Link href="/explore" legacyBehavior passHref>
            <a className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
              IntimiPop
            </a>
          </Link>
          <div className="hidden xl:flex">
            <DesktopMenuNav className="inline-flex" />
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <HomeSectionCard>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <label htmlFor="discover-search" className="sr-only">
                  Buscar
                </label>
                <input
                  id="discover-search"
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Buscar creadores"
                  className="h-11 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]"
                />
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:var(--surface-2)]"
                aria-label="Abrir filtros"
              >
                <IconGlyph name="dots" ariaHidden />
                Filtros
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeChips.length === 0 ? (
                <span className="text-xs text-[color:var(--muted)]">Sin filtros activos.</span>
              ) : (
                activeChips.map((chip) => (
                  <ActiveFilterChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
                ))
              )}
            </div>
          </div>
        </HomeSectionCard>

        <HomeSectionCard title={`Creadores (${total})`}>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={`discover-skeleton-${idx}`} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              No hay resultados con estos filtros.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {items.map((creator) => (
                <CreatorCard key={creator.handle} creator={creator} />
              ))}
            </div>
          )}
        </HomeSectionCard>
      </div>

      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        state={filters}
      />
    </div>
  );
}

function CreatorCard({ creator }: { creator: CreatorResult }) {
  const initial = creator.displayName?.trim()?.[0]?.toUpperCase() || "C";
  const [avatarFailed, setAvatarFailed] = useState(false);
  const allowLocation = creator.allowLocation !== false;
  const locationLabel = allowLocation ? creator.locationLabel?.trim() || "" : "";
  const showLocation = Boolean(locationLabel);
  const distanceLabel =
    allowLocation && Number.isFinite(creator.distanceKm ?? NaN)
      ? `≈${Math.round(creator.distanceKm as number)} km`
      : "";

  useEffect(() => {
    setAvatarFailed(false);
  }, [creator.avatarUrl]);

  const priceLabel = formatPriceFrom(creator.priceFrom);

  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
            {creator.avatarUrl && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={normalizeImageSrc(creator.avatarUrl)}
                alt={creator.displayName}
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--text)]">
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[color:var(--text)] truncate">{creator.displayName}</div>
            <div className="text-xs text-[color:var(--muted)] truncate">@{creator.handle}</div>
            {priceLabel ? (
              <div className="mt-1 text-xs text-[color:var(--muted)]">Desde {priceLabel}</div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href={`/c/${creator.handle}`}
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
          >
            Ver perfil
          </Link>
          <Link
            href={`/chat?with=${encodeURIComponent(creator.handle)}`}
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-3 py-1 text-xs font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
          >
            Abrir chat
          </Link>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
          {creator.availability}
        </span>
        <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
          {creator.responseTime}
        </span>
        {distanceLabel ? (
          <span className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            {distanceLabel}
          </span>
        ) : null}
        {showLocation ? (
          <span className="inline-flex min-w-0 max-w-full items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]">
            <span className="truncate">📍 {locationLabel} (aprox.)</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FiltersSheet({
  open,
  onClose,
  onApply,
  onReset,
  state,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (next: FiltersState) => void;
  onReset: () => void;
  state: FiltersState;
}) {
  const [draft, setDraft] = useState<FiltersState>(state);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(state);
    setGeoError("");
  }, [open, state]);

  const toggleTag = (tag: string) => {
    setDraft((prev) => {
      const exists = prev.tags.includes(tag);
      return {
        ...prev,
        tags: exists ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
      };
    });
  };

  const handleUseLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Ubicacion no disponible en este navegador.");
      return;
    }
    setGeoLoading(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const nextGeo = encode(latitude, longitude, 6);
        setDraft((prev) => ({
          ...prev,
          geo: nextGeo,
          radiusKm: prev.radiusKm > 0 ? prev.radiusKm : DEFAULT_RADIUS_KM,
        }));
        setGeoLoading(false);
      },
      () => {
        setGeoError("No se pudo obtener tu ubicacion.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  };

  const handleReset = () => {
    onReset();
    setDraft({
      availability: null,
      responseTime: null,
      radiusKm: 0,
      tags: [],
      priceMin: "",
      priceMax: "",
      geo: "",
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--text)]">Filtros</h2>
          <p className="text-xs text-[color:var(--muted)]">Personaliza tu busqueda</p>
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
          <p className="text-xs font-semibold text-[color:var(--muted)]">Categoria / Tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={clsx(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
                  draft.tags.includes(tag)
                    ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-[color:var(--muted)]" htmlFor="price-min">
              Precio minimo
            </label>
            <input
              id="price-min"
              type="number"
              min={0}
              value={draft.priceMin}
              onChange={(event) => setDraft((prev) => ({ ...prev, priceMin: event.target.value }))}
              placeholder="0"
              className="mt-1 h-10 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-sm text-[color:var(--text)]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[color:var(--muted)]" htmlFor="price-max">
              Precio maximo
            </label>
            <input
              id="price-max"
              type="number"
              min={0}
              value={draft.priceMax}
              onChange={(event) => setDraft((prev) => ({ ...prev, priceMax: event.target.value }))}
              placeholder="100"
              className="mt-1 h-10 w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-sm text-[color:var(--text)]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[color:var(--muted)]">Distancia</p>
            <span className="text-xs text-[color:var(--muted)]">
              {draft.radiusKm > 0 ? `${draft.radiusKm} km` : "Desactivado"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={draft.radiusKm}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, radiusKm: Number(event.target.value) }))
            }
            className="mt-2 w-full"
          />
          <div className="mt-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3">
            <p className="text-xs font-semibold text-[color:var(--text)]">Mapa aproximado</p>
            <p className="mt-1 text-[11px] text-[color:var(--muted)]">
              Usa tu ubicacion para filtrar por distancia.
            </p>
            <div className="mt-3 h-[180px] overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
              {draft.geo ? (
                <LocationMap geohash={draft.geo} radiusKm={draft.radiusKm || DEFAULT_RADIUS_KM} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--muted)]">
                  Ubicacion no configurada.
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseLocation}
                disabled={geoLoading}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {geoLoading ? "Cargando..." : "Usar ubicacion"}
              </button>
              {geoError ? <span className="text-[11px] text-[color:var(--danger)]">{geoError}</span> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-[color:var(--muted)]">Disponibilidad</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVAILABILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      availability: prev.availability === option.value ? null : option.value,
                    }))
                  }
                  className={clsx(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
                    draft.availability === option.value
                      ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[color:var(--muted)]">Tiempo de respuesta</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RESPONSE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      responseTime: prev.responseTime === option.value ? null : option.value,
                    }))
                  }
                  className={clsx(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
                    draft.responseTime === option.value
                      ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          Reiniciar filtros
        </button>
        <button
          type="button"
          onClick={() => onApply(draft)}
          className="inline-flex h-10 items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
        >
          Aplicar filtros
        </button>
      </div>
    </BottomSheet>
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

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Quitar filtro ${label}`}
      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <span aria-hidden="true">×</span>
    </button>
  );
}

function buildQuery({
  q,
  availability,
  responseTime,
  radiusKm,
  tags,
  priceMin,
  priceMax,
  geo,
  limit,
}: {
  q?: string;
  availability?: string | null;
  responseTime?: string | null;
  radiusKm?: number;
  tags?: string[];
  priceMin?: string;
  priceMax?: string;
  geo?: string;
  limit?: number;
}) {
  const query: Record<string, string> = {};
  if (q) query.q = q;
  if (availability) query.availability = availability;
  if (responseTime) query.responseTime = responseTime;
  if (radiusKm && radiusKm > 0) query.radiusKm = String(radiusKm);
  if (tags && tags.length > 0) query.tag = tags.join(",");
  const minValue = parseNumber(priceMin);
  const maxValue = parseNumber(priceMax);
  if (Number.isFinite(minValue)) query.priceMin = String(minValue);
  if (Number.isFinite(maxValue)) query.priceMax = String(maxValue);
  if (geo) query.geo = geo;
  if (Number.isFinite(limit)) query.limit = String(limit);
  return query;
}

function getQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim?.() ?? "";
  return "";
}

function parseNumber(value: string | undefined) {
  if (!value) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .flatMap((entry) => String(entry).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAvailability(value: string) {
  const normalized = (value || "").toUpperCase();
  if (normalized === "AVAILABLE" || normalized === "ONLINE") return "AVAILABLE";
  if (normalized === "VIP_ONLY") return "VIP_ONLY";
  if (normalized === "OFFLINE" || normalized === "NOT_AVAILABLE") return "OFFLINE";
  return null;
}

function normalizeResponseTime(value: string) {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "INSTANT";
  if (normalized === "LT_24H") return "LT_24H";
  if (normalized === "LT_72H" || normalized === "LT_48H") return "LT_72H";
  return null;
}

function formatPriceFrom(priceFrom?: number | null) {
  if (!Number.isFinite(priceFrom)) return "";
  const amount = (priceFrom as number) / 100;
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amount);
  } catch (_err) {
    return `${amount.toFixed(2)} EUR`;
  }
}
