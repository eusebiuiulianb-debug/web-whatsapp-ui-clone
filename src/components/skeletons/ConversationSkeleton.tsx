import clsx from "clsx";
import { Skeleton, SkeletonCircle } from "../ui/Skeleton";

type ConversationSkeletonProps = {
  className?: string;
  showBack?: boolean;
};

export function ConversationSkeleton({ className, showBack = false }: ConversationSkeletonProps) {
  const bubbles = Array.from({ length: 9 });

  return (
    <div className={clsx("relative flex flex-col w-full h-[100dvh] max-h-[100dvh]", className)}>
      {showBack ? (
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-[color:var(--surface-2)] border-b border-[color:var(--border)] backdrop-blur">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </header>
      ) : null}
      <div className="flex flex-1 min-h-0 min-w-0">
        <div className="relative flex flex-col flex-1 min-h-0 min-w-0 h-full">
          <header className="sticky top-0 z-20 backdrop-blur">
            <div className="max-w-4xl mx-auto w-full bg-[color:var(--surface-2)] border-b border-[color:var(--border)] px-4 py-3 md:px-6 md:py-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SkeletonCircle className="h-10 w-10" />
                  <div className="flex flex-col min-w-0 flex-1 gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 md:gap-x-6">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-48 md:col-span-2" />
              </div>
            </div>
          </header>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="relative flex flex-col flex-1 min-h-0">
              <div
                className="flex flex-col w-full flex-1 min-h-0 overflow-y-auto"
                style={{ backgroundImage: "var(--chat-pattern)" }}
              >
                <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
                  <div className="space-y-4">
                    {bubbles.map((_, idx) => (
                      <div
                        key={`conversation-skeleton-bubble-${idx}`}
                        className={clsx("flex", idx % 2 === 0 ? "justify-start" : "justify-end")}
                      >
                        <Skeleton
                          className={clsx(
                            "h-10 rounded-2xl",
                            idx % 2 === 0 ? "w-[68%]" : "w-[52%]"
                          )}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col bg-[color:var(--surface-1)] w-full h-auto py-3 px-4 text-[color:var(--muted)] gap-3 flex-shrink-0 overflow-visible">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 flex-1 rounded-full" />
              <Skeleton className="h-11 w-11 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
