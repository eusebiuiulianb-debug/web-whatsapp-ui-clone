import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import Image from "next/image";
import {
  STICKER_COLLECTIONS,
  STICKER_PACKS,
  STICKERS,
  type StickerCollectionId,
  type StickerItem,
  type StickerPackId,
} from "../../lib/stickers";

const HIDDEN_POPOVER_STYLE: CSSProperties = { position: "fixed", left: -9999, top: -9999 };

type StickerPickerProps = {
  isOpen: boolean;
  anchorRef?: React.RefObject<HTMLElement>;
  onClose: () => void;
  onSelect: (sticker: StickerItem) => void;
};

export function StickerPicker({ isOpen, anchorRef, onClose, onSelect }: StickerPickerProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const desktopContentRef = useRef<HTMLDivElement | null>(null);
  const [ popoverStyle, setPopoverStyle ] = useState<CSSProperties | null>(null);
  const [ contentMaxHeight, setContentMaxHeight ] = useState<number | null>(null);
  const [ contentMaxWidth, setContentMaxWidth ] = useState<number | null>(null);
  const [ isCentered, setIsCentered ] = useState(false);

  const defaultCollectionId = STICKER_COLLECTIONS[0]?.id ?? "suave";
  const defaultPackId = STICKER_PACKS[0]?.id ?? "mirada";
  const [ collectionId, setCollectionId ] = useState<StickerCollectionId>(defaultCollectionId);
  const [ packId, setPackId ] = useState<StickerPackId>(defaultPackId);

  const filteredStickers = useMemo(
    () =>
      STICKERS.filter((item) => item.collectionId === collectionId && item.packId === packId),
    [collectionId, packId]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const element = target as Element;
      if (popoverRef.current?.contains(target)) return;
      if (sheetRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      if (element.closest?.("[data-sticker-picker=\"true\"]")) return;
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

    const padding = 10;
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
    let placement: "top" | "bottom" = "bottom";
    const fitsAbove = naturalHeight <= spaceAbove;
    const fitsBelow = naturalHeight <= spaceBelow;

    if (!fitsBelow && fitsAbove) placement = "top";
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
  }, [anchorRef, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    updatePosition();
  }, [collectionId, packId, isOpen, updatePosition]);

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

  const handleSelect = (sticker: StickerItem) => {
    onSelect(sticker);
    onClose();
  };

  const panelStyle: CSSProperties = {
    maxHeight: contentMaxHeight ? `${contentMaxHeight}px` : undefined,
    maxWidth: contentMaxWidth ? `${contentMaxWidth}px` : undefined,
  };

  const content = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[color:var(--muted)]">Stickers</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          Cerrar
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {STICKER_COLLECTIONS.map((collection) => {
          const isActive = collection.id === collectionId;
          const isSuave = collection.id === "suave";
          return (
            <button
              key={collection.id}
              type="button"
              onClick={() => setCollectionId(collection.id)}
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                isActive
                  ? isSuave
                    ? "border-[color:var(--brand)] bg-[color:var(--brand-weak)] text-[color:var(--text)]"
                    : "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
              )}
            >
              {collection.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {STICKER_PACKS.map((pack) => {
          const isActive = pack.id === packId;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={() => setPackId(pack.id)}
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                isActive
                  ? "border-[color:var(--surface-border-hover)]/80 bg-[color:var(--surface-2)] text-[color:var(--text)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
              )}
            >
              {pack.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 overflow-y-auto pr-1">
        {filteredStickers.map((sticker) => (
          <button
            key={`${sticker.collectionId}-${sticker.packId}-${sticker.id}`}
            type="button"
            onClick={() => handleSelect(sticker)}
            className="group flex flex-col items-center justify-center gap-1 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-2 hover:bg-[color:var(--surface-2)]"
          >
            <Image
              src={sticker.src}
              alt={sticker.label}
              width={72}
              height={72}
              loading="lazy"
              unoptimized
              className="h-16 w-16 object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-[10px] text-[color:var(--muted)]">{sticker.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <>
      {!isCentered && (
        <div
          ref={popoverRef}
          className="hidden sm:block z-[9999]"
          style={popoverStyle ?? HIDDEN_POPOVER_STYLE}
          data-sticker-picker="true"
        >
          <div
            ref={desktopContentRef}
            className={clsx(
              "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-2xl overflow-y-auto",
              "w-[320px] max-w-[calc(100vw-16px)]"
            )}
            style={panelStyle}
          >
            {content}
          </div>
        </div>
      )}
      {isCentered && (
        <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center bg-[color:var(--surface-overlay)] px-3 py-4">
          <div ref={popoverRef} data-sticker-picker="true">
            <div
              ref={desktopContentRef}
              className={clsx(
                "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-2xl overflow-y-auto",
                "w-[320px] max-w-[calc(100vw-16px)]"
              )}
              style={panelStyle}
            >
              {content}
            </div>
          </div>
        </div>
      )}
      <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--surface-overlay)]">
        <div
          ref={sheetRef}
          className="w-full max-w-lg rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-2xl max-h-[75vh] overflow-y-auto"
          data-sticker-picker="true"
        >
          {content}
        </div>
      </div>
    </>,
    document.body
  );
}
