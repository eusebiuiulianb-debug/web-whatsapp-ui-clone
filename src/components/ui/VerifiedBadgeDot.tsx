import clsx from "clsx";
import { BadgeCheck } from "lucide-react";

type Props = {
  className?: string;
};

export function VerifiedBadgeDot({ className }: Props) {
  return (
    <span
      role="img"
      aria-label="Verificado"
      className={clsx(
        "pointer-events-none absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:var(--surface-0)] text-[color:var(--brand)] shadow-sm ring-2 ring-[color:var(--surface-0)]",
        className
      )}
    >
      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Verificado</span>
    </span>
  );
}
