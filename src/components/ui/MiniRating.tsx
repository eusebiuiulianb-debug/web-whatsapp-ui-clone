import clsx from "clsx";

type MiniRatingProps = {
  avg?: number | null;
  count?: number | null;
  className?: string;
  variant?: "inline" | "chip";
  emptyLabel?: string;
};

export function MiniRating({
  avg,
  count,
  className,
  variant = "inline",
  emptyLabel,
}: MiniRatingProps) {
  const hasValidAvg = typeof avg === "number" && Number.isFinite(avg);
  const hasCount = typeof count === "number" && count > 0;
  if (!hasValidAvg || !hasCount) {
    if (!emptyLabel) return null;
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1 text-[10px] font-semibold text-amber-200",
          variant === "chip" && "rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5",
          className
        )}
        aria-label={`Valoración ${emptyLabel}`}
      >
        <span aria-hidden="true">★</span>
        <span>{emptyLabel}</span>
      </span>
    );
  }
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-[10px] font-semibold text-amber-200",
        variant === "chip" && "rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5",
        className
      )}
      aria-label={`Valoración ${avg.toFixed(1)} con ${count} reseñas`}
    >
      <span aria-hidden="true">★</span>
      <span>{avg.toFixed(1)}</span>
      <span className="text-white/60">({count})</span>
    </span>
  );
}
