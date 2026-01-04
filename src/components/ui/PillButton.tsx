import clsx from "clsx";
import { ButtonHTMLAttributes, ReactNode } from "react";

type Intent = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

type PillButtonProps = {
  children: ReactNode;
  intent?: Intent;
  size?: Size;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

export function PillButton({
  children,
  intent = "secondary",
  size = "sm",
  className,
  disabled,
  onClick,
  ...rest
}: PillButtonProps) {
  const intentClass = (() => {
    if (intent === "primary") {
      return "border-[color:var(--brand)] bg-[color:var(--brand-strong)] text-[color:var(--text)] hover:bg-[color:var(--brand)]";
    }
    if (intent === "ghost") {
      return "border-[color:var(--surface-border)] bg-transparent text-[color:var(--text)] hover:bg-[color:var(--surface-2)]";
    }
    return "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]";
  })();

  const sizeClass = size === "md" ? "px-4 py-2 text-sm h-10" : "px-3 py-1.5 text-xs h-9";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center rounded-full border transition whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)] disabled:opacity-60 disabled:cursor-not-allowed",
        intentClass,
        sizeClass,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
