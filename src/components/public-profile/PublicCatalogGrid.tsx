import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "../ui/Skeleton";
import { PublicCatalogCard, type PublicCatalogCardItem } from "./PublicCatalogCard";

type CatalogFilter = "all" | "pack" | "sub" | "extra" | "popclip";

const DEFAULT_FILTERS: Array<{ id: CatalogFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "pack", label: "Packs" },
  { id: "sub", label: "Suscripciones" },
  { id: "extra", label: "Extras" },
];

type Props = {
  items: PublicCatalogCardItem[];
  popclipItems?: PublicCatalogCardItem[];
  chatHref: string;
  filters?: Array<{ id: CatalogFilter; label: string }>;
  defaultFilter?: CatalogFilter;
  featuredIds?: string[];
  isLoading?: boolean;
  error?: string | null;
  popclipLoading?: boolean;
  popclipError?: string | null;
  onRetry?: () => void;
};

export function PublicCatalogGrid({
  items,
  popclipItems,
  chatHref,
  filters,
  defaultFilter,
  featuredIds,
  isLoading,
  error,
  popclipLoading,
  popclipError,
  onRetry,
}: Props) {
  const resolvedFilters = filters ?? DEFAULT_FILTERS;
  const [activeFilter, setActiveFilter] = useState<CatalogFilter>(
    defaultFilter ?? resolvedFilters[0]?.id ?? "all"
  );

  useEffect(() => {
    if (!resolvedFilters.some((filter) => filter.id === activeFilter)) {
      setActiveFilter(resolvedFilters[0]?.id ?? "all");
    }
  }, [activeFilter, resolvedFilters]);

  const featuredSet = useMemo(() => new Set(featuredIds ?? []), [featuredIds]);
  const normalizedPopclips = popclipItems ?? [];
  const filteredCatalogItems = useMemo(() => {
    if (activeFilter === "all") return items;
    if (activeFilter === "popclip") return [];
    return items.filter((item) => item.kind === activeFilter);
  }, [activeFilter, items]);
  const orderedCatalogItems = useMemo(() => {
    if (featuredSet.size === 0) return filteredCatalogItems;
    const nonFeatured = filteredCatalogItems.filter((item) => !featuredSet.has(item.id));
    const featured = filteredCatalogItems.filter((item) => featuredSet.has(item.id));
    return [...nonFeatured, ...featured];
  }, [featuredSet, filteredCatalogItems]);
  const filteredPopclips = useMemo(() => {
    if (activeFilter === "popclip") return normalizedPopclips;
    if (activeFilter === "all") return normalizedPopclips;
    return [];
  }, [activeFilter, normalizedPopclips]);

  const hasItems = items.length > 0;
  const hasPopclips = normalizedPopclips.length > 0;
  const showCatalogEmpty =
    !isLoading && !error && orderedCatalogItems.length === 0 && (activeFilter !== "all" || !hasPopclips);
  const emptyCopy = hasItems
    ? "No hay elementos en esta categoría."
    : "Aún no hay items disponibles en el catálogo.";
  const shouldShowPopclips = resolvedFilters.some((filter) => filter.id === "popclip");

  const renderGrid = (gridItems: PublicCatalogCardItem[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {gridItems.map((item) =>
        item.href ? (
          <a key={item.id} href={item.href} className="block min-w-0">
            <PublicCatalogCard item={item} />
          </a>
        ) : (
          <PublicCatalogCard key={item.id} item={item} />
        )
      )}
    </div>
  );

  const renderSkeleton = (length: number) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length }).map((_, index) => (
        <div
          key={`catalog-skeleton-${index}`}
          className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-3"
        >
          <Skeleton className="h-24 w-full" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );

  return (
    <section id="catalog" className="space-y-4 scroll-mt-24 min-w-0 w-full">
      <div className="flex flex-wrap gap-2">
        {resolvedFilters.map((filter) => {
          const isActive = filter.id === activeFilter;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={clsx(
                "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                isActive
                  ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {activeFilter === "popclip" ? (
        <div className="space-y-2">
          {popclipError ? (
            <div className="text-xs text-[color:var(--danger)]">{popclipError}</div>
          ) : popclipLoading ? (
            renderSkeleton(6)
          ) : filteredPopclips.length === 0 ? (
            <div className="text-xs text-[color:var(--muted)]">Sin PopClips todavía.</div>
          ) : (
            renderGrid(filteredPopclips)
          )}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.08)] px-4 py-3 text-xs text-[color:var(--text)] flex items-center justify-between gap-3">
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-[color:rgba(244,63,94,0.6)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.16)]"
            >
              Reintentar
            </button>
          )}
        </div>
      ) : isLoading ? (
        renderSkeleton(8)
      ) : showCatalogEmpty ? (
        <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-6 text-center space-y-3">
          <p className="text-sm text-[color:var(--muted)]">{emptyCopy}</p>
          <a
            href={chatHref}
            className="inline-flex items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
          >
            Abrir chat
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {orderedCatalogItems.length > 0 && renderGrid(orderedCatalogItems)}
          {activeFilter === "all" && shouldShowPopclips && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[color:var(--text)]">PopClips</div>
              {popclipError ? (
                <div className="text-xs text-[color:var(--danger)]">{popclipError}</div>
              ) : popclipLoading ? (
                renderSkeleton(4)
              ) : filteredPopclips.length === 0 ? (
                <div className="text-xs text-[color:var(--muted)]">Sin PopClips todavía.</div>
              ) : (
                renderGrid(filteredPopclips)
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
