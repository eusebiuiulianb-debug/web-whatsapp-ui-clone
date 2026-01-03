import { type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";
import { focusRing, focusRingAmber, focusRingEmerald, microInteractionSoft } from "./microInteractions";

export type ChipVariant = "neutral" | "emerald" | "amber" | "danger" | "subtle";
export type ChipSize = "xs" | "sm" | "md";

type ChipProps = {
  children?: ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  leftGlyph?: IconName;
  title?: string;
  ariaLabel?: string;
  className?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
};

export function Chip({
  children,
  variant = "neutral",
  size = "sm",
  leftGlyph,
  title,
  ariaLabel,
  className,
  onClick,
  disabled = false,
}: ChipProps) {
  const isInteractive = typeof onClick === "function";
  const sizeClass =
    size === "xs" ? "px-2 py-0.5 text-[10px]" : size === "md" ? "px-3.5 py-1.5 text-[12px]" : "px-3 py-1 text-[11px]";
  const variantClass =
    variant === "emerald"
      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100"
    : variant === "amber"
      ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
    : variant === "danger"
      ? "border-rose-400/70 bg-rose-500/15 text-rose-100"
    : variant === "subtle"
      ? "border-slate-700/60 bg-slate-900/40 text-slate-300/80"
      : "border-slate-700 bg-slate-900/70 text-slate-200";
  const interactiveClass =
    variant === "emerald"
      ? "hover:bg-emerald-500/25 hover:border-emerald-300/70"
    : variant === "amber"
      ? "hover:bg-amber-500/25 hover:border-amber-300/70"
    : variant === "danger"
      ? "hover:bg-rose-500/25 hover:border-rose-300/70"
    : variant === "subtle"
      ? "hover:bg-slate-800/60 hover:border-slate-600/70"
      : "hover:bg-slate-800/70 hover:border-slate-600/70";
  const ringClass =
    variant === "emerald" ? focusRingEmerald : variant === "amber" ? focusRingAmber : focusRing;
  const iconSize = size === "md" ? "md" : "sm";
  const chipTitle = title ?? ariaLabel;
  const content = (
    <>
      {leftGlyph ? (
        <IconGlyph
          name={leftGlyph}
          size={iconSize}
          className={clsx(size === "xs" ? "h-3 w-3" : undefined)}
          ariaHidden
        />
      ) : null}
      {children !== undefined && children !== null ? <span>{children}</span> : null}
    </>
  );
  const baseClass = clsx(
    "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
    sizeClass,
    variantClass,
    className
  );

  if (!isInteractive) {
    return (
      <span className={baseClass} title={chipTitle} aria-label={ariaLabel}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={chipTitle}
      className={clsx(
        baseClass,
        microInteractionSoft,
        ringClass,
        interactiveClass,
        disabled && "cursor-not-allowed opacity-60 hover:border-slate-700/60 hover:bg-slate-900/40"
      )}
    >
      {content}
    </button>
  );
}
