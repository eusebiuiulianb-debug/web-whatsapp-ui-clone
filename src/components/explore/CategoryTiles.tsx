import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconGlyph, type IconName } from "../ui/IconGlyph";
import type { HomeFilters } from "../../lib/homeFilters";

export type CategoryTile = {
  id: string;
  label: string;
  icon: IconName;
  kind: "search" | "filter" | "near" | "scroll" | "filters";
  searchValue?: string;
  filterKey?: "avail" | "r24" | "vip";
};

type Props = {
  items: CategoryTile[];
  filters: HomeFilters;
  activeSearch: string;
  hasLocation: boolean;
  hasActiveFilters?: boolean;
  onSelect: (item: CategoryTile) => void;
};

export function CategoryTiles({
  items,
  filters,
  activeSearch,
  hasLocation,
  hasActiveFilters,
  onSelect,
}: Props) {
  const normalizedSearch = activeSearch.trim().toLowerCase();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showArrows, setShowArrows] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const isActive = (item: CategoryTile) => {
    if (item.kind === "filter" && item.filterKey) {
      return Boolean(filters[item.filterKey]);
    }
    if (item.kind === "filters") return Boolean(hasActiveFilters);
    if (item.kind === "near") return hasLocation;
    if (item.kind === "search") {
      const token = (item.searchValue || item.label).toLowerCase();
      return Boolean(token) && normalizedSearch.includes(token);
    }
    return false;
  };

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const hasOverflow = maxScrollLeft > 1;
    setShowArrows(hasOverflow);
    if (!hasOverflow) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const handleScroll = () => updateScrollState();
    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [updateScrollState, items.length]);

  const handleScrollBy = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === "left" ? -delta : delta, behavior: "smooth" });
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="no-scrollbar flex flex-row flex-nowrap gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
        role="list"
        aria-label="Explora por"
      >
        {items.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              aria-pressed={active}
              className={clsx(
                "group flex min-h-[110px] w-[240px] shrink-0 snap-start flex-col items-start gap-3 rounded-2xl border px-4 py-4 text-left transition",
                active
                  ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] shadow-sm"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:-translate-y-0.5 hover:border-[color:rgba(var(--brand-rgb),0.3)] hover:shadow-md"
              )}
            >
              <span
                className={clsx(
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl border",
                  active
                    ? "border-[color:rgba(var(--brand-rgb),0.45)] bg-white/70 text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                )}
              >
                <IconGlyph name={item.icon} size="sm" ariaHidden />
              </span>
              <span className="text-sm font-semibold leading-snug text-[color:var(--text)] break-words">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      {showArrows ? (
        <>
          <button
            type="button"
            aria-label="Scroll izquierda"
            disabled={!canScrollLeft}
            onClick={() => handleScrollBy("left")}
            className={clsx(
              "absolute left-0 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] shadow-sm transition hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
              !canScrollLeft && "cursor-not-allowed opacity-50"
            )}
          >
            <IconGlyph name="chevronLeft" ariaHidden />
          </button>
          <button
            type="button"
            aria-label="Scroll derecha"
            disabled={!canScrollRight}
            onClick={() => handleScrollBy("right")}
            className={clsx(
              "absolute right-0 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] shadow-sm transition hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
              !canScrollRight && "cursor-not-allowed opacity-50"
            )}
          >
            <IconGlyph name="chevronRight" ariaHidden />
          </button>
        </>
      ) : null}
      {showArrows && canScrollLeft ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-0 w-10 bg-gradient-to-r from-[color:var(--surface-1)] to-transparent" />
      ) : null}
      {showArrows && canScrollRight ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-0 w-10 bg-gradient-to-l from-[color:var(--surface-1)] to-transparent" />
      ) : null}
    </div>
  );
}
