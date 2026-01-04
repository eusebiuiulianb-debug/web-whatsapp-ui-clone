import { type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";
import { Tooltip } from "./Tooltip";
import { focusRing, microInteractionSoft } from "./microInteractions";

export type IconBadgeIcon = IconName;
export type IconBadgeVariant = "subtle" | "muted" | "accent";
export type IconBadgeSize = "sm" | "md";

type IconBadgeProps = {
  label: string;
  icon: IconBadgeIcon | ReactNode;
  variant?: IconBadgeVariant;
  size?: IconBadgeSize;
  title?: string;
  ariaLabel?: string;
  className?: string;
  showTooltip?: boolean;
};

export function IconBadge({
  label,
  icon,
  variant = "muted",
  size = "sm",
  title,
  ariaLabel,
  className,
  showTooltip = true,
}: IconBadgeProps) {
  const paddingClass = size === "md" ? "p-1" : "p-0.5";
  const variantClass =
    variant === "accent"
      ? "border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.16)] text-[color:var(--text)]"
    : variant === "subtle"
      ? "border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
      : "border border-transparent bg-transparent text-[color:var(--muted)]";
  const iconNode =
    typeof icon === "string" ? <IconGlyph name={icon as IconName} size={size} /> : icon;

  const badge = (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      title={title ?? (showTooltip ? undefined : label)}
      className={clsx(
        "relative inline-flex items-center justify-center rounded-md",
        microInteractionSoft,
        focusRing,
        paddingClass,
        variantClass,
        className
      )}
    >
      <span aria-hidden="true">{iconNode}</span>
    </button>
  );

  if (!showTooltip) return badge;

  return <Tooltip content={label}>{badge}</Tooltip>;
}
