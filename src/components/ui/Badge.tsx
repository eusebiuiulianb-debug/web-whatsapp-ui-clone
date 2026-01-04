import { type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";

export type BadgeTone = "muted" | "brand" | "amber" | "danger";
export type BadgeSize = "sm" | "md";

type BadgeProps = {
  children?: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeTone;
  size?: BadgeSize;
  leftGlyph?: IconName;
  title?: string;
  ariaLabel?: string;
  className?: string;
};

export function Badge({
  children,
  tone,
  variant,
  size = "sm",
  leftGlyph,
  title,
  ariaLabel,
  className,
}: BadgeProps) {
  const resolvedTone = tone ?? variant ?? "muted";
  const sizeClass = size === "md" ? "ui-badge--md" : "ui-badge--sm";
  const variantClass = `ui-badge--${resolvedTone}`;
  const label = title ?? ariaLabel;

  return (
    <span className={clsx("ui-badge", sizeClass, variantClass, className)} title={label} aria-label={ariaLabel}>
      {leftGlyph ? <IconGlyph name={leftGlyph} size="sm" className="text-current" ariaHidden /> : null}
      {children}
    </span>
  );
}
