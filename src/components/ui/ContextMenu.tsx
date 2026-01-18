import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type Ref } from "react";
import clsx from "clsx";
import { IconGlyph, type IconName } from "./IconGlyph";
import { focusRing, microInteractionSoft } from "./microInteractions";

type ContextMenuItem = {
  label: string;
  icon?: IconName | ReactNode;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  closeOnSelect?: boolean;
  divider?: boolean;
  title?: string;
  labelClassName?: string;
  labelSrOnly?: boolean;
};

type ContextMenuButtonRenderProps = {
  ref: Ref<HTMLButtonElement>;
  open: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  ariaLabel: string;
  ariaExpanded: boolean;
  ariaHaspopup: "menu";
  title: string;
};

type ContextMenuProps = {
  buttonAriaLabel: string;
  items: ContextMenuItem[];
  align?: "left" | "right";
  buttonClassName?: string;
  buttonIcon?: IconName | ReactNode;
  buttonIconClassName?: string;
  renderButton?: (props: ContextMenuButtonRenderProps) => ReactNode;
  menuClassName?: string;
};

export function ContextMenu({
  buttonAriaLabel,
  items,
  align = "right",
  buttonClassName,
  buttonIcon,
  buttonIconClassName,
  renderButton,
  menuClassName,
}: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const hasItems = items.length > 0;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!hasItems) return null;
  const resolvedButtonIcon = buttonIcon ?? "chevronDown";
  const buttonIconNode =
    typeof resolvedButtonIcon === "string" ? (
      <IconGlyph
        name={resolvedButtonIcon as IconName}
        size="sm"
        className={buttonIconClassName}
      />
    ) : (
      resolvedButtonIcon
    );
  const handleButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setOpen((prev) => !prev);
  };
  const buttonProps: ContextMenuButtonRenderProps = {
    ref: buttonRef,
    open,
    onClick: handleButtonClick,
    ariaLabel: buttonAriaLabel,
    ariaExpanded: open,
    ariaHaspopup: "menu",
    title: buttonAriaLabel,
  };

  return (
    <div className="relative inline-flex">
      {renderButton ? (
        renderButton(buttonProps)
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label={buttonAriaLabel}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={handleButtonClick}
          className={clsx(
            "inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] hover:border-[color:var(--surface-border-hover)] hover:text-[color:var(--text)]",
            microInteractionSoft,
            focusRing,
            buttonClassName
          )}
          title={buttonAriaLabel}
        >
          {buttonIconNode}
        </button>
      )}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={clsx(
            "absolute z-50 min-w-[190px] rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-1 shadow-lg",
            align === "right" ? "right-0 top-7" : "left-0 top-7",
            menuClassName
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {items.map((item, idx) => {
            if (item.divider) {
              return <div key={`divider-${idx}`} className="my-1 h-px bg-[color:var(--surface-border)]" />;
            }
            const iconNode =
              typeof item.icon === "string" ? (
                <IconGlyph name={item.icon as IconName} size="sm" />
              ) : (
                item.icon
              );
            const labelClassName = clsx(item.labelSrOnly && "sr-only", item.labelClassName);
            return (
              <button
                key={`${item.label}-${idx}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title ?? item.label}
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.disabled) return;
                  void item.onClick?.();
                  if (item.closeOnSelect !== false) {
                    setOpen(false);
                  }
                }}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium",
                  item.labelSrOnly && "justify-center",
                  microInteractionSoft,
                  focusRing,
                  item.danger
                    ? "text-[color:var(--danger)] hover:bg-[color:rgba(244,63,94,0.12)]"
                    : "text-[color:var(--text)]",
                  item.disabled
                    ? "cursor-not-allowed opacity-60"
                    : "hover:bg-[color:var(--surface-2)]"
                )}
              >
                {iconNode ? <span aria-hidden="true">{iconNode}</span> : null}
                <span className={labelClassName}>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { ContextMenuItem };
