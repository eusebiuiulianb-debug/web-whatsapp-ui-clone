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
    accent: "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)]",
    accentHover: "hover:bg-[color:var(--surface-1)] hover:border-[color:var(--surface-border-hover)]",
    subtle: "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)]",
    subtleHover: "hover:bg-[color:var(--surface-2)] hover:border-[color:var(--surface-border-hover)]",
    ring: focusRing,
  },
  emerald: {
    accent: "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]",
    accentHover:
      "hover:bg-[color:rgba(var(--brand-rgb),0.24)] hover:border-[color:var(--brand-strong)]",
    subtle:
      "border-[color:rgba(var(--brand-rgb),0.22)] bg-[color:rgba(var(--brand-rgb),0.08)] text-[color:rgba(var(--brand-rgb),0.85)]",
    subtleHover:
      "hover:bg-[color:rgba(var(--brand-rgb),0.12)] hover:border-[color:rgba(var(--brand-rgb),0.4)]",
    ring: focusRingEmerald,
  },
  amber: {
    accent:
      "border-[color:rgba(245,158,11,0.6)] bg-[color:rgba(245,158,11,0.18)] text-[color:var(--text)]",
    accentHover:
      "hover:bg-[color:rgba(245,158,11,0.26)] hover:border-[color:rgba(245,158,11,0.75)]",
    subtle:
      "border-[color:rgba(245,158,11,0.3)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--warning)]",
    subtleHover:
      "hover:bg-[color:rgba(245,158,11,0.14)] hover:border-[color:rgba(245,158,11,0.45)]",
    ring: focusRingAmber,
  },
  danger: {
    accent:
      "border-[color:rgba(244,63,94,0.6)] bg-[color:rgba(244,63,94,0.18)] text-[color:var(--text)]",
    accentHover:
      "hover:bg-[color:rgba(244,63,94,0.26)] hover:border-[color:rgba(244,63,94,0.75)]",
    subtle:
      "border-[color:rgba(244,63,94,0.3)] bg-[color:rgba(244,63,94,0.08)] text-[color:var(--danger)]",
    subtleHover:
      "hover:bg-[color:rgba(244,63,94,0.14)] hover:border-[color:rgba(244,63,94,0.45)]",
    ring: focusRing,
  },
  sky: {
    accent: "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]",
    accentHover:
      "hover:bg-[color:rgba(var(--brand-rgb),0.24)] hover:border-[color:var(--brand-strong)]",
    subtle:
      "border-[color:rgba(var(--brand-rgb),0.22)] bg-[color:rgba(var(--brand-rgb),0.08)] text-[color:rgba(var(--brand-rgb),0.85)]",
    subtleHover:
      "hover:bg-[color:rgba(var(--brand-rgb),0.12)] hover:border-[color:rgba(var(--brand-rgb),0.4)]",
    ring: focusRingEmerald,
  },
};

const MUTED_STYLES = {
  base: "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]",
  hover: "hover:bg-[color:var(--surface-1)] hover:border-[color:var(--surface-border-hover)]",
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
  const activeClass = resolvedActive ? "ring-1 ring-[color:var(--ring)]" : "";
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
        disabled &&
          "cursor-not-allowed opacity-60 hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-2)]"
      )}
    >
      {content}
    </button>
  );
}
