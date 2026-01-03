import { type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";
import { focusRing, focusRingAmber, focusRingEmerald, microInteractionSoft } from "./microInteractions";

export type ChipVariant = "default" | "subtle" | "accent" | "muted";
export type ChipTone = "neutral" | "emerald" | "amber" | "danger" | "sky";
export type ChipSize = "xs" | "sm" | "md";

type ChipProps = {
  children?: ReactNode;
  variant?: ChipVariant;
  tone?: ChipTone;
  size?: ChipSize;
  leftGlyph?: IconName;
  active?: boolean;
  selected?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
};

const TONE_STYLES: Record<
  ChipTone,
  {
    accent: string;
    accentHover: string;
    subtle: string;
    subtleHover: string;
    ring: string;
  }
> = {
  neutral: {
    accent: "border-slate-600/60 bg-slate-800/45 text-slate-100",
    accentHover: "hover:bg-slate-800/60 hover:border-slate-500/70",
    subtle: "border-slate-700/30 bg-slate-900/10 text-slate-400/80",
    subtleHover: "hover:bg-slate-800/20 hover:border-slate-600/40",
    ring: focusRing,
  },
  emerald: {
    accent: "border-emerald-400/60 bg-emerald-500/18 text-emerald-100",
    accentHover: "hover:bg-emerald-500/25 hover:border-emerald-300/70",
    subtle: "border-emerald-400/25 bg-emerald-500/8 text-emerald-200/75",
    subtleHover: "hover:bg-emerald-500/14 hover:border-emerald-300/45",
    ring: focusRingEmerald,
  },
  amber: {
    accent: "border-amber-400/60 bg-amber-500/18 text-amber-100",
    accentHover: "hover:bg-amber-500/25 hover:border-amber-300/70",
    subtle: "border-amber-400/25 bg-amber-500/8 text-amber-200/75",
    subtleHover: "hover:bg-amber-500/14 hover:border-amber-300/45",
    ring: focusRingAmber,
  },
  danger: {
    accent: "border-rose-400/60 bg-rose-500/18 text-rose-100",
    accentHover: "hover:bg-rose-500/25 hover:border-rose-300/70",
    subtle: "border-rose-400/25 bg-rose-500/8 text-rose-200/75",
    subtleHover: "hover:bg-rose-500/14 hover:border-rose-300/45",
    ring: focusRing,
  },
  sky: {
    accent: "border-sky-400/60 bg-sky-500/18 text-sky-100",
    accentHover: "hover:bg-sky-500/25 hover:border-sky-300/70",
    subtle: "border-sky-400/25 bg-sky-500/8 text-sky-200/75",
    subtleHover: "hover:bg-sky-500/14 hover:border-sky-300/45",
    ring: focusRing,
  },
};

const MUTED_STYLES = {
  base: "border-slate-700/30 bg-slate-900/20 text-slate-400/70",
  hover: "hover:bg-slate-900/30 hover:border-slate-600/40",
};

export function Chip({
  children,
  variant = "default",
  tone,
  size = "sm",
  leftGlyph,
  active,
  selected,
  title,
  ariaLabel,
  className,
  onClick,
  disabled = false,
}: ChipProps) {
  const isInteractive = typeof onClick === "function";
  const resolvedActive = active ?? selected;
  const sizeClass =
    size === "xs"
      ? "px-2 py-0.5 text-[10px] leading-[1.1]"
      : size === "md"
      ? "px-3.5 py-1.5 text-[12px] leading-[1.1]"
      : "px-2.5 py-1 text-[11px] leading-[1.1]";
  const resolvedTone = tone ?? (variant === "accent" ? "emerald" : "neutral");
  const toneStyles = TONE_STYLES[resolvedTone];
  const variantClass =
    variant === "accent"
      ? toneStyles.accent
    : variant === "subtle"
      ? toneStyles.subtle
    : variant === "muted"
      ? MUTED_STYLES.base
      : TONE_STYLES.neutral.accent;
  const interactiveClass =
    variant === "accent"
      ? toneStyles.accentHover
    : variant === "subtle"
      ? toneStyles.subtleHover
    : variant === "muted"
      ? MUTED_STYLES.hover
      : TONE_STYLES.neutral.accentHover;
  const ringClass = toneStyles.ring;
  const iconSize = size === "md" ? "md" : "sm";
  const chipTitle = title ?? ariaLabel;
  const activeClass = resolvedActive ? "ring-1 ring-[color:var(--surface-border-hover)]" : "";
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
    activeClass,
    className
  );

  if (!isInteractive) {
    return (
      <span className={baseClass} title={chipTitle} aria-label={ariaLabel} data-active={resolvedActive || undefined}>
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
      aria-pressed={resolvedActive}
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
