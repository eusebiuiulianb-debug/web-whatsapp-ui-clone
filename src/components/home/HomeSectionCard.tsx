import clsx from "clsx";
import { ReactNode } from "react";

type HomeSectionCardProps = {
  title?: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function HomeSectionCard({ title, subtitle, rightSlot, children, className }: HomeSectionCardProps) {
  const showHeader = Boolean(title) || Boolean(subtitle) || Boolean(rightSlot);
  return (
    <section
      className={clsx(
        "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5 shadow-sm sm:p-6",
        className
      )}
    >
      {showHeader ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            {title ? <h2 className="text-lg font-semibold text-[color:var(--text)]">{title}</h2> : null}
            {subtitle ? <p className="text-xs text-[color:var(--muted)]">{subtitle}</p> : null}
          </div>
          {rightSlot}
        </div>
      ) : null}
      {children}
    </section>
  );
}
