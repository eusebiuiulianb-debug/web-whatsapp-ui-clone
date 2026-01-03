import { forwardRef, type MouseEventHandler, type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";
import { focusRing, focusRingAmber, focusRingEmerald, microInteraction } from "./microInteractions";

export type IconButtonSize = "sm" | "md";
export type IconButtonTone = "neutral" | "emerald" | "amber";

type IconButtonProps = {
  icon: IconName | ReactNode;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  active?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  ariaExpanded?: boolean;
  ariaHaspopup?: "menu";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    size = "sm",
    tone = "neutral",
    active = false,
    disabled = false,
    ariaLabel,
    title,
    onClick,
    className,
    ariaExpanded,
    ariaHaspopup,
  },
  ref
) {
  const sizeClass = size === "md" ? "h-8 w-8" : "h-7 w-7";
  const iconSize = size === "md" ? "md" : "sm";
  const toneClass =
    tone === "amber"
      ? "hover:border-amber-300 hover:text-amber-100"
    : tone === "emerald"
      ? "hover:border-[color:var(--brand)] hover:text-[color:var(--text)]"
      : "hover:border-[color:var(--border-a)] hover:text-[color:var(--text)]";
  const ringClass =
    tone === "amber" ? focusRingAmber : tone === "emerald" ? focusRingEmerald : focusRing;
  const activeClass =
    active && tone === "amber"
      ? "border-amber-400/70 text-amber-100"
    : active && tone === "emerald"
      ? "border-[color:var(--brand)] text-[color:var(--text)]"
    : active
      ? "border-[color:var(--border-a)] text-[color:var(--text)]"
      : "border-[color:var(--border)] text-slate-300";
  const iconNode =
    typeof icon === "string" ? <IconGlyph name={icon as IconName} size={iconSize} /> : icon;

  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      title={title ?? ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center rounded-full border bg-slate-900/70",
        microInteraction,
        ringClass,
        sizeClass,
        toneClass,
        activeClass,
        disabled && "cursor-not-allowed opacity-60 hover:border-slate-700 hover:text-slate-300",
        className
      )}
    >
      <span aria-hidden="true">{iconNode}</span>
    </button>
  );
});
