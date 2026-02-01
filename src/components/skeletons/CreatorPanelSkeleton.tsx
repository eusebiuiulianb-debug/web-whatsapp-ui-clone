import clsx from "clsx";
import { Skeleton, SkeletonCircle, SkeletonText } from "../ui/Skeleton";

type CreatorPanelSkeletonProps = {
  className?: string;
};

export function CreatorPanelSkeleton({ className }: CreatorPanelSkeletonProps) {
  return (
    <div className={clsx("min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]", className)}>
      <div className="sticky top-0 z-20 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-1)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:py-5">
          <div className="flex items-center gap-3">
            <SkeletonCircle className="h-12 w-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-2 w-24" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-1">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="ml-2 h-8 w-20 rounded-full" />
            <Skeleton className="ml-2 h-8 w-24 rounded-full" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={`creator-panel-metric-${idx}`}
              className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div
              key={`creator-panel-section-${idx}`}
              className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5"
            >
              <Skeleton className="h-4 w-32" />
              <SkeletonText className="mt-3" lines={3} widths={["w-5/6", "w-3/4", "w-2/3"]} />
              <Skeleton className="mt-4 h-9 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
