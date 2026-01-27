import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { MessageCircle, Sparkles, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { IconGlyph } from "../ui/IconGlyph";
import { VerifiedInlineBadge } from "../ui/VerifiedInlineBadge";
import { PopClipMediaActions, popClipMediaActionButtonClass } from "./PopClipMediaActions";
import type { PopClipTileItem } from "./PopClipTile";

const CAPTION_PREVIEW_LIMIT = 140;
const WHEEL_LOCK_MS = 450;
const WHEEL_THRESHOLD = 32;
const SWIPE_THRESHOLD = 48;

type Props = {
  open: boolean;
  items: PopClipTileItem[];
  activeIndex: number;
  onOpenChange: (open: boolean) => void;
  onNavigate: (nextIndex: number) => void;
  onToggleSave?: (item: PopClipTileItem) => void;
  isSaved?: (item: PopClipTileItem) => boolean;
  menuItems?: (item: PopClipTileItem) => ContextMenuItem[];
  buildChatHref: (item: PopClipTileItem) => string;
  buildProfileHref: (item: PopClipTileItem) => string;
};

export function PopClipViewer({
  open,
  items,
  activeIndex,
  onOpenChange,
  onNavigate,
  onToggleSave,
  isSaved,
  menuItems,
  buildChatHref,
  buildProfileHref,
}: Props) {
  const activeItem = items[activeIndex];
  const wheelLockRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);
  const touchLastRef = useRef<number | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [menuPortalEl, setMenuPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setCaptionExpanded(false);
  }, [activeItem?.id]);

  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    };
  }, [open]);

  const canNavigate = items.length > 1;

  const handleNavigate = useCallback(
    (direction: "next" | "prev") => {
      if (!canNavigate) return;
      const delta = direction === "next" ? 1 : -1;
      const nextIndex = activeIndex + delta;
      if (nextIndex < 0 || nextIndex >= items.length) return;
      onNavigate(nextIndex);
    },
    [activeIndex, canNavigate, items.length, onNavigate]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!open || !canNavigate) return;
      const delta = event.deltaY;
      if (Math.abs(delta) < WHEEL_THRESHOLD) return;
      const now = Date.now();
      if (now - wheelLockRef.current < WHEEL_LOCK_MS) return;
      wheelLockRef.current = now;
      event.preventDefault();
      handleNavigate(delta > 0 ? "next" : "prev");
    },
    [canNavigate, handleNavigate, open]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!canNavigate) return;
      const touch = event.touches[0];
      if (!touch) return;
      touchStartRef.current = touch.clientY;
      touchLastRef.current = touch.clientY;
    },
    [canNavigate]
  );

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchLastRef.current = touch.clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!canNavigate) return;
    const startY = touchStartRef.current;
    if (startY === null) return;
    const endY = touchLastRef.current ?? startY;
    touchStartRef.current = null;
    touchLastRef.current = null;
    const delta = endY - startY;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    const now = Date.now();
    if (now - wheelLockRef.current < WHEEL_LOCK_MS) return;
    wheelLockRef.current = now;
    handleNavigate(delta > 0 ? "prev" : "next");
  }, [canNavigate, handleNavigate]);

  const setMenuPortalRef = useCallback((node: HTMLDivElement | null) => {
    setMenuPortalEl(node ?? null);
  }, []);

  const previewSrc =
    activeItem?.thumbnailUrl || activeItem?.posterUrl || activeItem?.previewImageUrl || "";
  const showImage = Boolean(previewSrc);
  const captionText = (activeItem?.caption ?? "").trim() || (activeItem?.title ?? "PopClip");
  const isCaptionLong = captionText.length > CAPTION_PREVIEW_LIMIT;
  const visibleCaption = captionExpanded || !isCaptionLong
    ? captionText
    : `${captionText.slice(0, CAPTION_PREVIEW_LIMIT).trimEnd()}…`;
  const resolvedMenuItems = useMemo(
    () => (activeItem && menuItems ? menuItems(activeItem) : []),
    [activeItem, menuItems]
  );

  if (!open || !activeItem) return null;

  const isClipSaved = isSaved ? isSaved(activeItem) : false;
  const handleClose = () => onOpenChange(false);
  const chatHref = buildChatHref(activeItem);
  const profileHref = buildProfileHref(activeItem);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 lg:items-center lg:p-6 pointer-events-none">
          <Dialog.Content
            role="dialog"
            aria-label={`PopClip de @${activeItem.creator.handle}`}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="pointer-events-auto relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--surface-1)] text-[color:var(--text)] lg:h-auto lg:max-h-[90vh] lg:w-[min(92vw,430px)] lg:rounded-3xl lg:border lg:border-[color:var(--surface-border)] lg:shadow-2xl"
          >
            <div className="flex flex-col gap-4 p-4 pt-5 lg:p-5">
              <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
                {showImage ? (
                  <Image
                    src={normalizeImageSrc(previewSrc)}
                    alt={activeItem.title?.trim() || "PopClip"}
                    layout="fill"
                    objectFit="cover"
                    sizes="(max-width: 1024px) 100vw, 430px"
                    className="object-cover"
                  />
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[color:rgba(10,14,24,0.9)] via-[color:rgba(18,24,38,0.9)] to-[color:rgba(6,9,18,0.95)] text-white/60">
                    <div className="absolute inset-0 opacity-60">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_55%)]" />
                      <div className="absolute inset-0 animate-pulse bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.16),transparent)]" />
                    </div>
                    <div className="relative flex flex-col items-center gap-1">
                      <Sparkles className="h-6 w-6 text-white/70" aria-hidden="true" />
                      <span className="text-[11px] font-semibold text-white/70">PopClip</span>
                    </div>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Cerrar"
                    className={clsx(popClipMediaActionButtonClass, "absolute left-3 top-3")}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </Dialog.Close>
                <PopClipMediaActions
                  isSaved={isClipSaved}
                  onToggleSave={onToggleSave ? () => onToggleSave(activeItem) : undefined}
                  menu={
                    resolvedMenuItems.length > 0 ? (
                      <ContextMenu
                        buttonAriaLabel="Acciones rápidas"
                        items={resolvedMenuItems}
                        align="right"
                        closeOnScroll
                        portalTarget={menuPortalEl}
                        menuClassName="popclip-viewer-menu min-w-[160px] w-[min(90vw,220px)]"
                        renderButton={({ ref, onClick, onPointerDown, ariaLabel, ariaExpanded, ariaHaspopup, title }) => (
                          <button
                            ref={ref}
                            type="button"
                            aria-label={ariaLabel}
                            aria-expanded={ariaExpanded}
                            aria-haspopup={ariaHaspopup}
                            title={title}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onPointerDown(event);
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              onClick(event);
                            }}
                            className={popClipMediaActionButtonClass}
                          >
                            <IconGlyph name="dots" ariaHidden />
                          </button>
                        )}
                      />
                    ) : null
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[color:var(--text)]">
                    @{activeItem.creator.handle}
                  </span>
                  {activeItem.creator.isVerified ? (
                    <VerifiedInlineBadge collapseAt="lg" className="shrink-0" />
                  ) : null}
                </div>
                <div className="text-sm text-[color:var(--muted)]">
                  <p className={clsx(!captionExpanded && "line-clamp-3")}>{visibleCaption}</p>
                  {isCaptionLong ? (
                    <button
                      type="button"
                      onClick={() => setCaptionExpanded((prev) => !prev)}
                      className="mt-2 text-xs font-semibold text-[color:var(--text)] underline decoration-[color:var(--surface-border)] underline-offset-4"
                    >
                      {captionExpanded ? "Ver menos" : "Ver más"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Link
                  href={chatHref}
                  onClick={handleClose}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--brand-strong)] bg-[color:var(--brand-strong)] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
                >
                  <span className="inline-flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    <span>Abrir chat</span>
                  </span>
                </Link>
                <Link
                  href={profileHref}
                  onClick={handleClose}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>Ver perfil</span>
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </div>
            </div>
            <div ref={setMenuPortalRef} className="contents" />
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
