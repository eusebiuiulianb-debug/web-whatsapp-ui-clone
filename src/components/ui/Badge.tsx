import { type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";

export type BadgeTone = "muted" | "accent" | "warn" | "danger";
export type BadgeSize = "sm" | "md";

type BadgeProps = {
  children?: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  leftGlyph?: IconName;
  title?: string;
  ariaLabel?: string;
  className?: string;
};

export function Badge({
  children,
  tone = "muted",
  size = "sm",
  leftGlyph,
  title,
  ariaLabel,
  className,
}: BadgeProps) {
  const sizeClass = size === "md" ? "ui-badge--md" : "ui-badge--sm";
  const variantClass = `ui-badge--${tone}`;
  const label = title ?? ariaLabel;

  return (
    <span className={clsx("ui-badge", sizeClass, variantClass, className)} title={label} aria-label={ariaLabel}>
      {leftGlyph ? <IconGlyph name={leftGlyph} size="sm" className="text-current" ariaHidden /> : null}
      {children}
    </span>
  );
}
