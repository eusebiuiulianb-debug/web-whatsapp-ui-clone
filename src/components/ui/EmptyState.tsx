import { type ReactNode } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName | ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  const iconNode = typeof icon === "string" ? <IconGlyph name={icon as IconName} size="md" /> : icon;

  return (
    <div
      className={clsx(
        "rounded-2xl border border-dashed border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-6 text-center",
        className
      )}
    >
      {iconNode ? <div className="mx-auto mb-3 w-fit text-[color:var(--muted)]">{iconNode}</div> : null}
      <div className="text-base font-semibold text-[color:var(--text)]">{title}</div>
      {description ? <div className="mt-1 text-sm text-[color:var(--muted)]">{description}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
