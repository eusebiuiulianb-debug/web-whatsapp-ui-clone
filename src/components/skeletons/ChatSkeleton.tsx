import clsx from "clsx";
import { Skeleton, SkeletonCircle } from "../ui/Skeleton";

type ChatSkeletonProps = {
  className?: string;
  mobileView?: "board" | "chat";
};

export function ChatSkeleton({ className, mobileView = "board" }: ChatSkeletonProps) {
  const sidebarItems = Array.from({ length: 8 });
  const bubbles = Array.from({ length: 9 });

  return (
    <div className={clsx("flex justify-center", className)}>
      <div className="flex flex-col w-full xl:container min-h-screen overflow-y-auto lg:overflow-hidden">
        <div className="flex flex-col md:flex-row w-full flex-1 min-h-0 lg:h-[100dvh] lg:max-h-[100dvh] xl:py-4">
          <div className={clsx("flex", mobileView === "chat" ? "hidden lg:flex" : "flex")}>
            <div
              className="flex flex-col w-full md:w-[480px] lg:min-w-[420px] shrink-0 bg-[color:var(--surface-1)] min-h-[320px] md:h-full"
              style={{ borderRight: "1px solid var(--border)" }}
            >
              <div className="px-4 py-4 border-b border-[color:var(--surface-border)]">
                <div className="flex items-center gap-3">
                  <SkeletonCircle className="h-10 w-10" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-2 w-36" />
                  </div>
                </div>
              </div>
              <div className="px-3 py-4 space-y-4">
                {sidebarItems.map((_, idx) => (
                  <div key={`chat-skeleton-row-${idx}`} className="flex items-center gap-3">
                    <SkeletonCircle className="h-9 w-9" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="mt-2 h-2 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className={clsx(
              "relative flex flex-col w-full md:w-[70%] bg-[color:var(--surface-1)] flex-1 min-h-0 overflow-hidden",
              mobileView === "board" ? "hidden lg:flex" : "flex"
            )}
          >
            <div className="flex-1 overflow-hidden px-4 py-6 space-y-4">
              {bubbles.map((_, idx) => (
                <div
                  key={`chat-skeleton-bubble-${idx}`}
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
            <div className="border-t border-[color:var(--surface-border)] p-4">
              <Skeleton className="h-11 w-full rounded-full" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="h-3 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
