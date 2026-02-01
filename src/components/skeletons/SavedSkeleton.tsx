import clsx from "clsx";
import { Skeleton, SkeletonCircle, SkeletonText } from "../ui/Skeleton";

type SavedSkeletonProps = {
  className?: string;
  itemCount?: number;
};

export function SavedSkeleton({ className, itemCount = 9 }: SavedSkeletonProps) {
  return (
    <div className={clsx("min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="hidden xl:flex">
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={`saved-tab-skeleton-${idx}`} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4">
          <div className="mb-4">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
            {Array.from({ length: itemCount }).map((_, idx) => (
              <div
                key={`saved-skeleton-card-${idx}`}
                className="flex flex-col gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3"
              >
                <div className="flex items-center gap-2">
                  <SkeletonCircle className="h-7 w-7" />
                  <Skeleton className="h-3 w-20 rounded-full" />
                </div>
                <Skeleton className="aspect-[10/13] w-full rounded-xl sm:aspect-[3/4] md:aspect-[4/5]" />
                <SkeletonText lines={2} widths={["w-5/6", "w-2/3"]} />
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
