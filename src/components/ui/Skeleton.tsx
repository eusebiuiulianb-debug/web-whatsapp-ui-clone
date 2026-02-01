import clsx from "clsx";

type SkeletonProps = {
  className?: string;
};

type SkeletonTextProps = {
  lines?: number;
  className?: string;
  lineClassName?: string;
  widths?: string[];
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={clsx("animate-pulse rounded-lg bg-[color:var(--border)]", className)} />;
}

export function SkeletonCircle({ className }: SkeletonProps) {
  return <Skeleton className={clsx("rounded-full", className)} />;
}

export function SkeletonText({
  lines = 3,
  className,
  lineClassName,
  widths,
}: SkeletonTextProps) {
  const fallbackWidths = ["w-3/4", "w-2/3", "w-4/5", "w-1/2"];
  return (
    <div className={clsx("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton
          key={`skeleton-line-${idx}`}
          className={clsx("h-3", lineClassName, widths?.[idx] ?? fallbackWidths[idx % fallbackWidths.length])}
        />
      ))}
    </div>
  );
}
