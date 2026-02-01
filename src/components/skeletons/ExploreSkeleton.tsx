import clsx from "clsx";
import { Skeleton } from "../ui/Skeleton";

type ExploreSkeletonProps = {
  className?: string;
  cardCount?: number;
  variant?: "full" | "grid";
};

export function ExploreSkeleton({ className, cardCount = 9, variant = "full" }: ExploreSkeletonProps) {
  return (
    <div className={clsx("space-y-6", className)}>
      {variant === "full" ? (
        <div className="space-y-3">
          <ExploreSkeletonSearch />
          <ExploreSkeletonChips />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
        {Array.from({ length: cardCount }).map((_, idx) => (
          <div
            key={`explore-skeleton-card-${idx}`}
            className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3"
          >
            <Skeleton className="aspect-[10/13] w-full rounded-xl sm:aspect-[3/4] md:aspect-[4/5]" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1 rounded-full" />
              <Skeleton className="h-9 flex-1 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExploreSkeletonSearch() {
  return <Skeleton className="h-10 w-full rounded-full sm:h-11" />;
}

export function ExploreSkeletonChips() {
  const chips = ["w-20", "w-24", "w-16", "w-28", "w-20"];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((width, idx) => (
        <Skeleton key={`explore-skeleton-chip-${idx}`} className={clsx("h-7 rounded-full", width)} />
      ))}
    </div>
  );
}
