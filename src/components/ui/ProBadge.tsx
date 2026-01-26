import clsx from "clsx";
import { Sparkles } from "lucide-react";

type Props = {
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
};

export function ProBadge({ className, iconClassName, labelClassName }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-[color:rgba(245,158,11,0.45)] bg-[color:rgba(245,158,11,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text)]",
        className
      )}
      aria-label="Cuenta PRO"
      title="Cuenta PRO"
    >
      <Sparkles className={clsx("h-3.5 w-3.5 text-[color:rgba(245,158,11,0.9)]", iconClassName)} aria-hidden="true" />
      <span className={clsx("leading-none", labelClassName)}>PRO</span>
    </span>
  );
}
