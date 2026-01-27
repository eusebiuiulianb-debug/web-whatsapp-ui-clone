import clsx from "clsx";
import { BadgeCheck } from "lucide-react";

type Props = {
  collapseAt?: "lg" | "xl";
  label?: string;
  className?: string;
  labelClassName?: string;
};

const COLLAPSE_CLASSES: Record<NonNullable<Props["collapseAt"]>, { pill: string; icon: string }> = {
  lg: { pill: "lg:hidden", icon: "hidden lg:inline-flex" },
  xl: { pill: "xl:hidden", icon: "hidden xl:inline-flex" },
};

export function VerifiedInlineBadge({
  collapseAt = "lg",
  label = "VERIFICADO",
  className,
  labelClassName,
}: Props) {
  const collapseClasses = COLLAPSE_CLASSES[collapseAt];
  return (
    <>
      <span
        role="img"
        aria-label={label}
        title={label}
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:rgba(var(--brand-rgb),0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text)] leading-none",
          collapseClasses.pill,
          className
        )}
      >
        <BadgeCheck className="h-4 w-4 text-[color:var(--brand)]" aria-hidden="true" />
        <span className={clsx("leading-none", labelClassName)}>{label}</span>
      </span>
      <span
        role="img"
        aria-label={label}
        title={label}
        className={clsx(
          "inline-flex items-center justify-center text-[color:var(--brand)] leading-none",
          collapseClasses.icon,
          className
        )}
      >
        <BadgeCheck className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    </>
  );
}
