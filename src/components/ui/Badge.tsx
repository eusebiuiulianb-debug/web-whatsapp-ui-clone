import { type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";

export type BadgeVariant = "success" | "info" | "warn" | "danger" | "neutral" | "brand" | "muted";
export type BadgeSize = "sm" | "md";

type BadgeProps = {
  children?: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  leftGlyph?: IconName;
  title?: string;
  ariaLabel?: string;
  className?: string;
};

export function Badge({
  children,
  variant = "neutral",
  size = "sm",
  leftGlyph,
  title,
  ariaLabel,
  className,
}: BadgeProps) {
  const sizeClass = size === "md" ? "ui-badge--md" : "ui-badge--sm";
  const variantClass = `ui-badge--${variant}`;
  const label = title ?? ariaLabel;

  return (
    <span className={clsx("ui-badge", sizeClass, variantClass, className)} title={label} aria-label={ariaLabel}>
      {leftGlyph ? <IconGlyph name={leftGlyph} size="sm" ariaHidden /> : null}
      {children}
    </span>
  );
}
