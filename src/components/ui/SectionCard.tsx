import { type ReactNode } from "react";
import clsx from "clsx";

export type SectionCardVariant = "default" | "muted";

type SectionCardProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  variant?: SectionCardVariant;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
};

const VARIANT_STYLES: Record<SectionCardVariant, string> = {
  default: "border-[color:var(--surface-border)] bg-[var(--surface-1)]",
  muted: "border-[color:var(--surface-border)] bg-[var(--surface-2)]",
};

export function SectionCard({
  eyebrow,
  title,
  subtitle,
  actions,
  footer,
  children,
  variant = "default",
  className,
  headerClassName,
  bodyClassName,
}: SectionCardProps) {
  const hasHeader = Boolean(eyebrow || title || subtitle || actions);

  return (
    <div
      className={clsx(
        "rounded-2xl border p-4 sm:p-6 transition hover:border-[color:var(--surface-border-hover)] hover:ring-1 hover:ring-[color:var(--surface-ring)]",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {hasHeader && (
        <div className={clsx("flex flex-wrap items-center justify-between gap-3", headerClassName)}>
          <div>
            {eyebrow ? (
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{eyebrow}</div>
            ) : null}
            {title ? <div className="text-lg font-semibold text-white">{title}</div> : null}
            {subtitle ? <div className="text-sm text-slate-300">{subtitle}</div> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={clsx(hasHeader && "mt-4", bodyClassName)}>{children}</div>
      {footer ? <div className="mt-4 border-t border-slate-800/80 pt-3">{footer}</div> : null}
    </div>
  );
}
