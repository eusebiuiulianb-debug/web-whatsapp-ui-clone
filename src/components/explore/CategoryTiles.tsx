import clsx from "clsx";
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

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:gap-3 md:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            aria-pressed={active}
            className={clsx(
              "group flex min-h-[92px] w-24 shrink-0 flex-col items-start gap-2 rounded-2xl border px-3 py-3 text-left transition sm:min-h-[120px] sm:w-full sm:gap-3",
              active
                ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] shadow-sm"
                : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:-translate-y-0.5 hover:border-[color:rgba(var(--brand-rgb),0.3)] hover:shadow-md"
            )}
          >
            <span
              className={clsx(
                "inline-flex h-8 w-8 items-center justify-center rounded-xl border",
                active
                  ? "border-[color:rgba(var(--brand-rgb),0.45)] bg-white/70 text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
              )}
            >
              <IconGlyph name={item.icon} size="sm" ariaHidden />
            </span>
            <span className="text-[12px] font-semibold leading-snug text-[color:var(--text)] break-words sm:text-sm">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
