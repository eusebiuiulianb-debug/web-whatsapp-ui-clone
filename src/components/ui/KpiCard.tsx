import { type MouseEventHandler, type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";

export type KpiCardVariant = "default" | "accent" | "muted";
export type KpiCardSize = "sm" | "md";

type KpiCardProps = {
  title: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  supporting?: ReactNode;
  delta?: ReactNode;
  icon?: IconName | ReactNode;
  variant?: KpiCardVariant;
  size?: KpiCardSize;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  titleAttr?: string;
  ariaPressed?: boolean;
  className?: string;
};

const VARIANT_STYLES: Record<KpiCardVariant, string> = {
  default:
    "border-[color:var(--surface-border)] bg-[var(--surface-1)] text-slate-100 hover:border-[color:var(--surface-border-hover)]",
  accent:
    "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)] hover:border-[color:var(--brand-strong)] hover:bg-[color:rgba(var(--brand-rgb),0.18)]",
  muted:
    "border-[color:var(--surface-border)] bg-[var(--surface-2)] text-slate-200 hover:border-[color:var(--surface-border-hover)]",
};

export function KpiCard({
  title,
  value,
  hint,
  supporting,
  delta,
  icon,
  variant = "default",
  size = "md",
  onClick,
  titleAttr,
  ariaPressed,
  className,
}: KpiCardProps) {
  const interactive = typeof onClick === "function";
  const iconNode =
    typeof icon === "string" ? <IconGlyph name={icon as IconName} size="sm" /> : icon;
  const interactiveRingClass =
    variant === "accent"
      ? "hover:ring-1 hover:ring-[color:var(--ring)] focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]"
      : "hover:ring-1 hover:ring-[color:var(--surface-ring)] focus-visible:ring-1 focus-visible:ring-[color:var(--surface-ring)]";

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">{title}</div>
        {iconNode ? <span className="text-[color:var(--muted)]">{iconNode}</span> : null}
      </div>
      <div
        className={clsx(
          "mt-2 font-semibold text-[color:var(--text)] tracking-tight tabular-nums leading-tight",
          size === "sm" ? "text-2xl" : "text-3xl"
        )}
      >
        {value}
      </div>
      {(hint || delta) && (
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[color:var(--muted)]">
          <span>{hint}</span>
          {delta ? (
            <span className="inline-flex items-center rounded-full border border-[color:rgba(var(--brand-rgb),0.4)] bg-[color:rgba(var(--brand-rgb),0.12)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
              {delta}
            </span>
          ) : null}
        </div>
      )}
      {supporting ? <div className="mt-1 text-[10px] text-[color:var(--muted)]">{supporting}</div> : null}
    </>
  );

  const baseClass = clsx(
    "group w-full rounded-2xl border p-4 text-left transition",
    VARIANT_STYLES[variant],
    interactive && "cursor-pointer hover:-translate-y-[1px] focus-visible:outline-none",
    interactive && interactiveRingClass,
    size === "sm" ? "min-h-[104px]" : "min-h-[116px]",
    className
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={titleAttr}
        aria-pressed={ariaPressed}
        className={baseClass}
      >
        {content}
      </button>
    );
  }

  return (
    <div title={titleAttr} className={baseClass}>
      {content}
    </div>
  );
}
