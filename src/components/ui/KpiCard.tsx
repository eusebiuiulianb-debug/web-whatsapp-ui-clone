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
  default: "border-slate-800/80 bg-slate-900/70 text-slate-100 hover:border-slate-700/80 hover:bg-slate-900/80",
  accent: "border-emerald-500/50 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/70 hover:bg-emerald-500/15",
  muted: "border-slate-800/60 bg-slate-950/60 text-slate-200 hover:border-slate-700/70 hover:bg-slate-950/70",
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
      ? "focus-visible:ring-1 focus-visible:ring-emerald-400/45"
      : "focus-visible:ring-1 focus-visible:ring-slate-400/40";

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{title}</div>
        {iconNode ? <span className="text-slate-500">{iconNode}</span> : null}
      </div>
      <div className={clsx("mt-2 font-semibold text-white", size === "sm" ? "text-lg" : "text-2xl")}>
        {value}
      </div>
      {(hint || delta) && (
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>{hint}</span>
          {delta ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
              {delta}
            </span>
          ) : null}
        </div>
      )}
      {supporting ? <div className="mt-1 text-[11px] text-slate-400">{supporting}</div> : null}
    </>
  );

  const baseClass = clsx(
    "group w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition",
    "min-h-[108px]",
    VARIANT_STYLES[variant],
    interactive && "cursor-pointer hover:-translate-y-[1px] focus-visible:outline-none",
    interactive && interactiveRingClass,
    size === "sm" ? "min-h-[96px]" : "min-h-[108px]",
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
