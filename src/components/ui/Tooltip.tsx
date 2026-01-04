import { type ReactNode } from "react";
import clsx from "clsx";

type TooltipProps = {
  content: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

export function Tooltip({ content, children, className, disabled = false }: TooltipProps) {
  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <span className={clsx("relative inline-flex group", className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className={clsx(
          "pointer-events-none absolute left-0 top-[-34px] z-50 whitespace-nowrap",
          "rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text)] shadow-lg",
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        )}
      >
        {content}
      </span>
    </span>
  );
}
