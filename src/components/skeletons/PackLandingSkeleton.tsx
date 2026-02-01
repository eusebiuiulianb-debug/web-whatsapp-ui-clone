import { Skeleton, SkeletonText } from "../ui/Skeleton";

export function PackLandingSkeleton() {
  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <div className="mx-auto max-w-4xl px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+96px)] sm:pb-12 space-y-8">
        <div className="overflow-hidden rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
          <Skeleton className="h-[180px] w-full rounded-none sm:h-[220px] lg:h-[240px]" />
          <div className="px-6 py-5 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>

        <div className="hidden sm:flex flex-wrap items-center gap-3">
          <Skeleton className="h-11 w-44 rounded-xl" />
          <Skeleton className="h-11 w-56 rounded-xl" />
          <Skeleton className="h-11 w-32 rounded-xl" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
              <Skeleton className="h-4 w-24" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
              <Skeleton className="h-4 w-28" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
              <Skeleton className="h-4 w-32" />
              <SkeletonText className="mt-4" lines={3} />
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
              <Skeleton className="h-4 w-32" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-24" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <Skeleton className="h-11 w-full rounded-xl" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
