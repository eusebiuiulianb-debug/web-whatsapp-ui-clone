import clsx from "clsx";
import type { ReactNode } from "react";

type MetaChipProps = {
  label: ReactNode;
  icon?: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function MetaChip({ label, icon, className, ariaLabel }: MetaChipProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90",
        className
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </span>
  );
}
