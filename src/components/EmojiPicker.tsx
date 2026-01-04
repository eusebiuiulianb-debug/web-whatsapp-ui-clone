import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { readEmojiRecents, recordEmojiRecent } from "../lib/emoji/recents";
import { useEmojiFavorites } from "../hooks/useEmojiFavorites";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const HIDDEN_POPOVER_STYLE: CSSProperties = { position: "fixed", left: -9999, top: -9999 };
const REACTION_CATEGORIES = ["frequent", "people", "nature", "foods", "symbols"];

type EmojiPickerMode = "insert" | "reaction";

type EmojiPickerProps = {
  isOpen: boolean;
  anchorRef?: React.RefObject<HTMLElement>;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  mode: EmojiPickerMode;
  topContent?: ReactNode;
  perLine?: number;
};

export function EmojiPicker({
  isOpen,
  anchorRef,
  onClose,
  onSelect,
  mode,
  topContent,
  perLine,
}: EmojiPickerProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const desktopContentRef = useRef<HTMLDivElement | null>(null);
  const [ popoverStyle, setPopoverStyle ] = useState<CSSProperties | null>(null);
  const [ contentMaxHeight, setContentMaxHeight ] = useState<number | null>(null);
  const [ contentMaxWidth, setContentMaxWidth ] = useState<number | null>(null);
  const [ EmojiMartPicker, setEmojiMartPicker ] = useState<ComponentType<any> | null>(null);
  const [ emojiPickerData, setEmojiPickerData ] = useState<any | null>(null);
  const [ isCentered, setIsCentered ] = useState(false);
  const [ emojiRecents, setEmojiRecents ] = useState<string[]>([]);
  const [ portalTarget, setPortalTarget ] = useState<HTMLElement | null>(null);
  const { favorites } = useEmojiFavorites();
  const isReactionMode = mode === "reaction";
  const pickerPerLine = perLine ?? (isReactionMode ? 8 : 9);

  useEffect(() => {
    if (!isOpen || emojiPickerData) return;
    let isActive = true;
    import("@emoji-mart/data")
      .then((mod) => {
        if (!isActive) return;
        setEmojiPickerData(mod.default ?? mod);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [emojiPickerData, isOpen]);

  useEffect(() => {
    if (!isOpen || EmojiMartPicker) return;
    let isActive = true;
    import("@emoji-mart/react")
      .then((mod) => {
        if (!isActive) return;
        setEmojiMartPicker(() => (mod.default ?? mod));
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [EmojiMartPicker, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setEmojiRecents(readEmojiRecents());
  }, [isOpen]);

  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") return;
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const element = target as Element;
      if (popoverRef.current?.contains(target)) return;
      if (sheetRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      if (element.closest?.("[data-emoji-picker=\"true\"]")) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setIsCentered(false);
      setPopoverStyle(null);
    }
  }, [isOpen]);

  const updatePosition = useCallback(() => {
    if (!isOpen || typeof window === "undefined") return;
    const anchor = anchorRef?.current;
    const content = desktopContentRef.current;
    if (!content) return;

    const padding = isReactionMode ? 8 : 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.max(0, viewportWidth - padding * 2);
    const maxHeight = Math.max(0, viewportHeight - padding * 2);

    if (!anchor) {
      setIsCentered(true);
      setPopoverStyle(null);
      setContentMaxWidth(maxWidth);
      setContentMaxHeight(maxHeight);
      return;
    }

    const naturalWidth = content.scrollWidth;
    const naturalHeight = content.scrollHeight;
    const anchorRect = anchor.getBoundingClientRect();
    const spaceAbove = anchorRect.top - padding;
    const spaceBelow = viewportHeight - anchorRect.bottom - padding;
    const preferTop = !isReactionMode;
    let placement: "top" | "bottom" = preferTop ? "top" : "bottom";
    const fitsAbove = naturalHeight <= spaceAbove;
    const fitsBelow = naturalHeight <= spaceBelow;

    if (placement === "top" && !fitsAbove && fitsBelow) placement = "bottom";
    if (placement === "bottom" && !fitsBelow && fitsAbove) placement = "top";
    if (!fitsAbove && !fitsBelow) {
      placement = spaceBelow >= spaceAbove ? "bottom" : "top";
    }

    const availableHeight = placement === "top" ? spaceAbove : spaceBelow;
    const resolvedMaxHeight = Math.min(maxHeight, Math.max(availableHeight, 0));
    const widthFits = naturalWidth <= maxWidth;
    const heightFits = naturalHeight <= maxHeight && naturalHeight <= availableHeight;
    const shouldCenter = !widthFits || !heightFits;

    if (shouldCenter) {
      setIsCentered(true);
      setPopoverStyle(null);
      setContentMaxWidth(maxWidth);
      setContentMaxHeight(maxHeight);
      return;
    }

    const popoverWidth = Math.min(naturalWidth, maxWidth);
    const popoverHeight = Math.min(naturalHeight, resolvedMaxHeight);
    let nextLeft = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
    nextLeft = Math.min(Math.max(nextLeft, padding), viewportWidth - popoverWidth - padding);
    let nextTop =
      placement === "top"
        ? anchorRect.top - popoverHeight - padding
        : anchorRect.bottom + padding;
    nextTop = Math.min(Math.max(nextTop, padding), viewportHeight - popoverHeight - padding);

    setIsCentered(false);
    setContentMaxWidth(maxWidth);
    setContentMaxHeight(resolvedMaxHeight);
    setPopoverStyle({
      position: "fixed",
      left: nextLeft,
      top: nextTop,
    });
  }, [anchorRef, isOpen, isReactionMode]);

  useIsomorphicLayoutEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    updatePosition();
  }, [EmojiMartPicker, isOpen, updatePosition, emojiPickerData, topContent, emojiRecents, favorites.length]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const raf = window.requestAnimationFrame(updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.cancelAnimationFrame(raf);
    };
  }, [isOpen, updatePosition]);

  const handleEmojiSelect = useCallback((payload: { native?: string; emoji?: string } | string) => {
    const selected =
      typeof payload === "string"
        ? payload
        : payload?.native || payload?.emoji || "";
    if (!selected) return;
    if (isReactionMode) {
      setEmojiRecents((prev) => recordEmojiRecent(selected, prev));
    }
    onSelect(selected);
    onClose();
  }, [isReactionMode, onClose, onSelect]);

  const panelStyle: CSSProperties = {
    maxHeight: contentMaxHeight ? `${contentMaxHeight}px` : undefined,
    maxWidth: contentMaxWidth ? `${contentMaxWidth}px` : undefined,
  };

  const reactionTopContent = useMemo(() => {
    if (!isReactionMode) return null;
    const recentItems = emojiRecents.slice(0, 10);
    const favoriteItems = favorites.slice(0, 10);
    if (recentItems.length === 0 && favoriteItems.length === 0) return null;
    return (
      <div className="mb-2 flex flex-col gap-2">
        {favoriteItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Favoritos</span>
            {favoriteItems.map((emoji, idx) => (
              <button
                key={`${emoji}-${idx}`}
                type="button"
                onClick={() => handleEmojiSelect(emoji)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                aria-label={`Emoji favorito ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {recentItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Recientes</span>
            {recentItems.map((emoji, idx) => (
              <button
                key={`${emoji}-${idx}`}
                type="button"
                onClick={() => handleEmojiSelect(emoji)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-sm text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                aria-label={`Emoji reciente ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }, [emojiRecents, favorites, handleEmojiSelect, isReactionMode]);

  const mergedTopContent = useMemo(() => {
    if (!reactionTopContent && !topContent) return null;
    return (
      <>
        {topContent}
        {reactionTopContent}
      </>
    );
  }, [reactionTopContent, topContent]);

  const loadingContent = (
    <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-[color:var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--surface-border-hover)] border-t-transparent" />
      <span>Cargando emojis…</span>
    </div>
  );

  const renderPicker = (style?: CSSProperties) => {
    if (!EmojiMartPicker || !emojiPickerData) return loadingContent;
    return (
      <EmojiMartPicker
        data={emojiPickerData}
        theme="dark"
        onEmojiSelect={handleEmojiSelect}
        previewPosition="none"
        perLine={pickerPerLine}
        maxFrequentRows={isReactionMode ? 2 : undefined}
        navPosition={isReactionMode ? "none" : undefined}
        searchPosition={isReactionMode ? "none" : undefined}
        categories={isReactionMode ? REACTION_CATEGORIES : undefined}
        emojiButtonSize={isReactionMode ? 30 : undefined}
        emojiSize={isReactionMode ? 20 : undefined}
        autoFocus={false}
        style={style}
      />
    );
  };

  if (!isOpen || !portalTarget) return null;

  return createPortal(
    <>
      {!isCentered && (
        <div
          ref={popoverRef}
          className="hidden sm:block z-[9999]"
          style={popoverStyle ?? HIDDEN_POPOVER_STYLE}
          data-emoji-picker="true"
        >
          <div
            ref={desktopContentRef}
            className={clsx(
              "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-2 shadow-2xl overflow-y-auto",
              isReactionMode
                ? "w-[260px] max-w-[calc(100vw-16px)]"
                : "min-w-[360px] w-[360px] max-w-[calc(100vw-16px)]"
            )}
            style={panelStyle}
          >
            {mergedTopContent}
            {renderPicker({ width: "100%" })}
          </div>
        </div>
      )}
      {isCentered && (
        <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center bg-[color:var(--surface-overlay)] px-3 py-4">
          <div
            ref={popoverRef}
            data-emoji-picker="true"
          >
            <div
              ref={desktopContentRef}
              className={clsx(
                "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-2xl overflow-y-auto",
                isReactionMode
                  ? "w-[260px] max-w-[calc(100vw-16px)]"
                  : "min-w-[360px] w-[360px] max-w-[calc(100vw-16px)]"
              )}
              style={panelStyle}
            >
              {mergedTopContent}
              {renderPicker({ width: "100%" })}
            </div>
          </div>
        </div>
      )}
      <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--surface-overlay)]">
        <div
          ref={sheetRef}
          className="w-full max-w-lg rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-2xl max-h-[75vh] overflow-y-auto"
          data-emoji-picker="true"
        >
          {mergedTopContent}
          {renderPicker()}
        </div>
      </div>
    </>,
    portalTarget
  );
}
