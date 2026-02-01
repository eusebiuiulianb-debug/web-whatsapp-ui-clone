import clsx from "clsx";
import { Skeleton, SkeletonCircle, SkeletonText } from "../ui/Skeleton";

type ExploreSkeletonProps = {
  className?: string;
  cardCount?: number;
};

export function ExploreSkeleton({ className, cardCount = 9 }: ExploreSkeletonProps) {
  return (
    <div className={clsx("flex min-h-[100dvh] min-h-screen w-full flex-col", className)}>
      <div className="sticky top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="pt-[env(safe-area-inset-top)]">
          <div className="py-4">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-3 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <ExploreSkeletonSearch />
              <div className="mt-2.5">
                <ExploreSkeletonChips />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 overflow-x-hidden [--bottom-nav-h:72px] pb-[calc(var(--bottom-nav-h,72px)+env(safe-area-inset-bottom))] xl:[--bottom-nav-h:0px]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
          {Array.from({ length: cardCount }).map((_, idx) => (
            <div
              key={`explore-skeleton-card-${idx}`}
              className="flex flex-col gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3"
            >
              <div className="flex items-center gap-2">
                <SkeletonCircle className="h-8 w-8" />
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="aspect-[10/13] w-full rounded-xl sm:aspect-[3/4] md:aspect-[4/5]" />
              <SkeletonText lines={2} widths={["w-5/6", "w-2/3"]} />
              <Skeleton className="h-9 w-full rounded-full" />
            </div>
          ))}
        </div>
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
