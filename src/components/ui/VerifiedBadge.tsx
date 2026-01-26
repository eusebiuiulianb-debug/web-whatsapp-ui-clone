import clsx from "clsx";
import { BadgeCheck } from "lucide-react";

type Props = {
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
};

export function VerifiedBadge({ className, iconClassName, labelClassName }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text)]",
        className
      )}
      aria-label="Cuenta verificada"
      title="Cuenta verificada"
    >
      <BadgeCheck className={clsx("h-3 w-3", iconClassName)} aria-hidden="true" />
      <span className={clsx("leading-none", labelClassName)}>Verificado</span>
    </span>
  );
}
