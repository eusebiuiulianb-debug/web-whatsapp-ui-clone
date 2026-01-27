import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
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
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
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
  closeOnScroll?: boolean;
  portalTarget?: HTMLElement | null;
};

const MENU_GAP = 8;
const MENU_PADDING = 12;

export function ContextMenu({
  buttonAriaLabel,
  items,
  align = "right",
  buttonClassName,
  buttonIcon,
  buttonIconClassName,
  renderButton,
  menuClassName,
  closeOnScroll = false,
  portalTarget: portalTargetProp,
}: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; visibility: "visible" | "hidden" }>({
    top: 0,
    left: 0,
    visibility: "hidden",
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const hasItems = items.length > 0;

  const updateMenuPosition = useCallback(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const trigger = buttonRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left =
      align === "left" ? triggerRect.left : triggerRect.right - menuRect.width;
    if (align === "left") {
      if (left + menuRect.width > viewportW - MENU_PADDING) {
        left = triggerRect.right - menuRect.width;
      }
    } else if (left < MENU_PADDING) {
      left = triggerRect.left;
    }
    left = Math.max(MENU_PADDING, Math.min(left, viewportW - menuRect.width - MENU_PADDING));
    let top = triggerRect.bottom + MENU_GAP;
    if (top + menuRect.height > viewportH - MENU_PADDING) {
      top = triggerRect.top - menuRect.height - MENU_GAP;
    }
    top = Math.max(MENU_PADDING, Math.min(top, viewportH - menuRect.height - MENU_PADDING));
    setMenuStyle({ top, left, visibility: "visible" });
  }, [align, open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (portalTargetProp) {
      setPortalTarget(portalTargetProp);
      return;
    }
    if (typeof document === "undefined") return;
    setPortalTarget(document.body);
  }, [portalTargetProp]);

  useEffect(() => {
    if (!open) return;
    setMenuStyle((prev) => ({
      top: prev?.top ?? 0,
      left: prev?.left ?? 0,
      visibility: "hidden",
    }));
    let frame = window.requestAnimationFrame(function attemptPosition() {
      if (!buttonRef.current || !menuRef.current) {
        frame = window.requestAnimationFrame(attemptPosition);
        return;
      }
      updateMenuPosition();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updateMenuPosition]);

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

  useEffect(() => {
    if (!open) return;
    if (!closeOnScroll) return;
    const handleScroll = () => setOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open, closeOnScroll]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])'
      );
      if (firstItem) {
        firstItem.focus();
        return;
      }
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      buttonRef.current?.focus();
    }
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
    event.preventDefault();
    event.stopPropagation();
    setOpen((prev) => !prev);
  };
  const handleButtonPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };
  const buttonProps: ContextMenuButtonRenderProps = {
    ref: buttonRef,
    open,
    onClick: handleButtonClick,
    onPointerDown: handleButtonPointerDown,
    ariaLabel: buttonAriaLabel,
    ariaExpanded: open,
    ariaHaspopup: "menu",
    title: buttonAriaLabel,
  };

  const menuPanel = open ? (
    <div
      ref={menuRef}
      role="menu"
      className={clsx(
        "fixed z-[9999] min-w-[190px] rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-1 shadow-lg",
        menuClassName
      )}
      style={{
        ...menuStyle,
        pointerEvents: menuStyle.visibility === "hidden" ? "none" : "auto",
      }}
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
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
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
  ) : null;

  return (
    <div className="relative inline-flex" onPointerDown={(event) => event.stopPropagation()}>
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
          onPointerDown={handleButtonPointerDown}
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
      {open && portalTarget ? createPortal(menuPanel, portalTarget) : menuPanel}
    </div>
  );
}

export type { ContextMenuItem };
