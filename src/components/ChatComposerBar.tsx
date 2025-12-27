import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import Image from "next/image";
import { readEmojiRecents, recordEmojiRecent } from "../lib/emoji/recents";
import { useEmojiFavorites } from "../hooks/useEmojiFavorites";
import { STICKER_PACKS, STICKERS, type StickerIntent, type StickerItem, type StickerPackId } from "../lib/emoji/stickers";
import { EmojiPicker } from "./EmojiPicker";

const HIDDEN_POPOVER_STYLE: React.CSSProperties = { position: "fixed", left: -9999, top: -9999 };

type EmojiSelectPayload = {
  native?: string;
  emoji?: string;
};
type StickerIntentFilter = "all" | StickerIntent;

const STICKER_PACK_STORAGE_KEY = "stickerPackId";
const STICKER_INTENT_STORAGE_KEY = "stickerIntent";
const SORTED_STICKER_PACKS = [...STICKER_PACKS].sort((a, b) => a.order - b.order);
const DEFAULT_STICKER_PACK_ID: StickerPackId = SORTED_STICKER_PACKS[0]?.id ?? "flirt_v1";
const STICKER_INTENT_OPTIONS: Array<{ id: StickerIntentFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "mirada", label: "Mirada" },
  { id: "cita", label: "Cita" },
  { id: "cierre", label: "Cierre" },
];
const STICKER_INTENT_IDS: StickerIntentFilter[] = STICKER_INTENT_OPTIONS.map((option) => option.id);
const isStickerPackId = (value: string): value is StickerPackId =>
  SORTED_STICKER_PACKS.some((pack) => pack.id === value);
const isStickerIntentFilter = (value: string): value is StickerIntentFilter =>
  STICKER_INTENT_IDS.includes(value as StickerIntentFilter);

type ComposerAudience = "CREATOR" | "INTERNAL";

type ChatComposerBarProps = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  sendDisabled: boolean;
  placeholder: string;
  actionLabel: string;
  audience: ComposerAudience;
  onAudienceChange: (mode: ComposerAudience) => void;
  canAttach: boolean;
  onAttach: () => void;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  maxHeight: number;
  isChatBlocked: boolean;
  isInternalPanelOpen: boolean;
  showAudienceToggle?: boolean;
  showAttach?: boolean;
  showEmoji?: boolean;
  onEmojiSelect?: (emoji: string) => void;
  showStickers?: boolean;
  onStickerSelect?: (sticker: StickerItem) => void;
  stickerDraft?: StickerItem | null;
  onStickerDraftClear?: () => void;
};

export function ChatComposerBar({
  value,
  onChange,
  onKeyDown,
  onSend,
  sendDisabled,
  placeholder,
  actionLabel,
  audience,
  onAudienceChange,
  canAttach,
  onAttach,
  inputRef,
  maxHeight,
  isChatBlocked,
  isInternalPanelOpen,
  showAudienceToggle = true,
  showAttach = true,
  showEmoji = false,
  onEmojiSelect,
  showStickers = false,
  onStickerSelect,
  stickerDraft = null,
  onStickerDraftClear,
}: ChatComposerBarProps) {
  const isInternalMode = audience === "INTERNAL";
  const isInputDisabled = (isChatBlocked && !isInternalMode) || isInternalPanelOpen;
  const [ isEmojiOpen, setIsEmojiOpen ] = useState(false);
  const [ isStickerOpen, setIsStickerOpen ] = useState(false);
  const [ isEditingFavorites, setIsEditingFavorites ] = useState(false);
  const [ emojiPickerMode, setEmojiPickerMode ] = useState<"insert" | "favorite">("insert");
  const [ stickerPackId, setStickerPackId ] = useState<StickerPackId>(DEFAULT_STICKER_PACK_ID);
  const [ stickerIntent, setStickerIntent ] = useState<StickerIntentFilter>("all");
  const [ stickerShuffleSeed, setStickerShuffleSeed ] = useState(0);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const stickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const stickerPopoverRef = useRef<HTMLDivElement | null>(null);
  const stickerSheetRef = useRef<HTMLDivElement | null>(null);
  const [ stickerPopoverStyle, setStickerPopoverStyle ] = useState<React.CSSProperties | null>(null);
  const [ emojiRecents, setEmojiRecents ] = useState<string[]>([]);
  const { favorites, addFavorite, removeFavorite, replaceFavorites, isAtMax } = useEmojiFavorites();
  const draggedEmojiRef = useRef<string | null>(null);
  const canUseEmoji = showEmoji && !!onEmojiSelect;
  const filteredStickers = useMemo(() => {
    return STICKERS.filter((item) => {
      const packId = item.packId ?? DEFAULT_STICKER_PACK_ID;
      const intent = item.intent ?? "mirada";
      if (packId !== stickerPackId) return false;
      if (stickerIntent !== "all" && intent !== stickerIntent) return false;
      return true;
    });
  }, [stickerPackId, stickerIntent]);
  const shuffledStickers = useMemo(() => {
    if (stickerShuffleSeed === 0) return filteredStickers;
    const next = [...filteredStickers];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }, [filteredStickers, stickerShuffleSeed]);

  useEffect(() => {
    if (!isEmojiOpen && !isStickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const element = target as Element;
      if (emojiButtonRef.current?.contains(target)) return;
      if (emojiAddButtonRef.current?.contains(target)) return;
      if (stickerButtonRef.current?.contains(target)) return;
      if (stickerPopoverRef.current?.contains(target)) return;
      if (stickerSheetRef.current?.contains(target)) return;
      if (element.closest?.("[data-emoji-picker=\"true\"]")) return;
      setIsEmojiOpen(false);
      setIsStickerOpen(false);
      setEmojiPickerMode("insert");
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEmojiOpen(false);
        setIsStickerOpen(false);
        setEmojiPickerMode("insert");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEmojiOpen, isStickerOpen]);

  useEffect(() => {
    if (!showEmoji || isInputDisabled) {
      setIsEmojiOpen(false);
      setEmojiPickerMode("insert");
    }
  }, [showEmoji, isInputDisabled]);

  useEffect(() => {
    if (!showStickers || isInputDisabled) {
      setIsStickerOpen(false);
    }
  }, [showStickers, isInputDisabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedPackId = window.localStorage.getItem(STICKER_PACK_STORAGE_KEY);
    if (storedPackId && isStickerPackId(storedPackId)) {
      setStickerPackId(storedPackId);
    }
    const storedIntent = window.localStorage.getItem(STICKER_INTENT_STORAGE_KEY);
    if (storedIntent && isStickerIntentFilter(storedIntent)) {
      setStickerIntent(storedIntent);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STICKER_PACK_STORAGE_KEY, stickerPackId);
  }, [stickerPackId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STICKER_INTENT_STORAGE_KEY, stickerIntent);
  }, [stickerIntent]);

  useEffect(() => {
    setStickerShuffleSeed(0);
  }, [stickerPackId, stickerIntent]);

  useEffect(() => {
    if (!isEmojiOpen) return;
    setEmojiRecents(readEmojiRecents());
  }, [isEmojiOpen]);

  useLayoutEffect(() => {
    if (!isStickerOpen || typeof window === "undefined") return;
    const anchor = stickerButtonRef.current;
    const popover = stickerPopoverRef.current;
    if (!anchor || !popover) return;

    const padding = 8;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const minLeft = padding;
    const maxLeft = Math.max(padding, viewportWidth - popoverRect.width - padding);
    const nextLeft = Math.min(Math.max(anchorRect.left, minLeft), maxLeft);

    const preferredTop = anchorRect.top - popoverRect.height - padding;
    const minTop = padding;
    const maxTop = Math.max(padding, viewportHeight - popoverRect.height - padding);
    let nextTop = preferredTop;
    if (nextTop < minTop) {
      nextTop = anchorRect.bottom + padding;
    }
    nextTop = Math.min(Math.max(nextTop, minTop), maxTop);

    setStickerPopoverStyle({
      position: "fixed",
      left: nextLeft,
      top: nextTop,
    });
  }, [isStickerOpen]);

  useEffect(() => {
    if (!isStickerOpen || typeof window === "undefined") return;
    const handleReposition = () => {
      const anchor = stickerButtonRef.current;
      const popover = stickerPopoverRef.current;
      if (!anchor || !popover) return;

      const padding = 8;
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const minLeft = padding;
      const maxLeft = Math.max(padding, viewportWidth - popoverRect.width - padding);
      const nextLeft = Math.min(Math.max(anchorRect.left, minLeft), maxLeft);

      const preferredTop = anchorRect.top - popoverRect.height - padding;
      const minTop = padding;
      const maxTop = Math.max(padding, viewportHeight - popoverRect.height - padding);
      let nextTop = preferredTop;
      if (nextTop < minTop) {
        nextTop = anchorRect.bottom + padding;
      }
      nextTop = Math.min(Math.max(nextTop, minTop), maxTop);

      setStickerPopoverStyle({
        position: "fixed",
        left: nextLeft,
        top: nextTop,
      });
    };
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    const raf = window.requestAnimationFrame(handleReposition);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      window.cancelAnimationFrame(raf);
    };
  }, [isStickerOpen]);

  const handleEmojiSelect = (payload: EmojiSelectPayload | string) => {
    const emoji =
      typeof payload === "string"
        ? payload
        : payload?.native || payload?.emoji || "";
    if (!emoji) return;
    if (emojiPickerMode === "favorite") {
      if (!isAtMax) {
        addFavorite(emoji);
      }
      return;
    }
    if (!onEmojiSelect) return;
    onEmojiSelect(emoji);
    setEmojiRecents((prev) => recordEmojiRecent(emoji, prev));
  };

  const handleQuickEmojiInsert = (emoji: string) => {
    if (!onEmojiSelect || isInputDisabled) return;
    onEmojiSelect(emoji);
    setEmojiRecents((prev) => recordEmojiRecent(emoji, prev));
  };
  const handleRecentEmojiInsert = (emoji: string) => {
    if (emojiPickerMode === "favorite") {
      if (!isAtMax) {
        addFavorite(emoji);
      }
      handleEmojiPickerClose();
      return;
    }
    handleQuickEmojiInsert(emoji);
    handleEmojiPickerClose();
  };

  const handleEmojiToggle = () => {
    if (isInputDisabled || !onEmojiSelect) return;
    setEmojiPickerMode("insert");
    setIsStickerOpen(false);
    setIsEmojiOpen((prev) => !prev);
  };

  const handleEmojiPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleEmojiPickerClose = () => {
    setIsEmojiOpen(false);
    setEmojiPickerMode("insert");
  };

  const handleStickerToggle = () => {
    if (isInputDisabled || !onStickerSelect) return;
    setIsEmojiOpen(false);
    setEmojiPickerMode("insert");
    setIsStickerOpen((prev) => !prev);
  };

  const handleStickerSelect = (sticker: StickerItem) => {
    if (!onStickerSelect) return;
    onStickerSelect(sticker);
    setIsStickerOpen(false);
  };

  const handleAddFavoriteClick = () => {
    if (isInputDisabled || isAtMax) return;
    setEmojiPickerMode("favorite");
    setIsStickerOpen(false);
    setIsEmojiOpen(true);
  };

  const handleRemoveFavorite = (emoji: string) => {
    removeFavorite(emoji);
  };

  const handleFavoriteDragStart = (emoji: string) => (event: React.DragEvent<HTMLButtonElement>) => {
    if (!isEditingFavorites) return;
    draggedEmojiRef.current = emoji;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", emoji);
  };

  const handleFavoriteDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isEditingFavorites) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleFavoriteDrop = (targetEmoji: string) => (event: React.DragEvent<HTMLDivElement>) => {
    if (!isEditingFavorites) return;
    event.preventDefault();
    const sourceEmoji = draggedEmojiRef.current || event.dataTransfer.getData("text/plain");
    draggedEmojiRef.current = null;
    if (!sourceEmoji || sourceEmoji === targetEmoji) return;
    const next = favorites.filter((item) => item !== sourceEmoji);
    const targetIndex = next.indexOf(targetEmoji);
    if (targetIndex < 0) {
      replaceFavorites([...next, sourceEmoji]);
      return;
    }
    next.splice(targetIndex, 0, sourceEmoji);
    replaceFavorites(next);
  };

  const handleFavoriteDragEnd = () => {
    draggedEmojiRef.current = null;
  };

  const renderEmojiRecents = () => {
    if (!emojiRecents.length) return null;
    return (
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-slate-800/70 bg-slate-900/60 px-2 py-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Recientes</span>
        {emojiRecents.map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            type="button"
            onClick={() => handleRecentEmojiInsert(emoji)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 text-sm text-slate-100 hover:bg-slate-800/80"
            aria-label={`Emoji reciente ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  };

  const emojiPickerTopContent = (
    <>
      {emojiPickerMode === "favorite" && (
        <div className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
          {isAtMax ? "Límite de favoritos alcanzado." : "Selecciona un emoji para favoritos."}
        </div>
      )}
      {renderEmojiRecents()}
    </>
  );

  return (
    <div
      className={clsx(
        "mt-1.5 flex flex-col gap-2 rounded-2xl border px-3 py-2.5 transition backdrop-blur",
        "shadow-[0_-12px_22px_-16px_rgba(0,0,0,0.55)]",
        isInternalMode
          ? "bg-gradient-to-r from-amber-500/12 via-slate-900/75 to-amber-500/12 border-amber-400/50"
          : "bg-gradient-to-r from-slate-900/55 via-slate-900/75 to-slate-900/55 border-slate-700/70",
        isInternalMode
          ? "focus-within:border-amber-400/70 focus-within:ring-1 focus-within:ring-amber-400/25"
          : "focus-within:border-emerald-400/70 focus-within:ring-1 focus-within:ring-emerald-400/25",
        isChatBlocked && !isInternalMode && "opacity-70"
      )}
    >
      {canUseEmoji && (
        <div className="flex flex-col gap-2 px-1 pt-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Favoritos</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsEditingFavorites((prev) => {
                  if (prev) {
                    setIsEmojiOpen(false);
                    setEmojiPickerMode("insert");
                  }
                  return !prev;
                });
              }}
              className="text-[10px] font-semibold text-slate-400 hover:text-slate-200"
            >
              {isEditingFavorites ? "Listo" : "Editar"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1" onDragOver={handleFavoriteDragOver}>
            {favorites.length === 0 && (
              <span className="text-[11px] text-slate-500">Sin favoritos todavía.</span>
            )}
            {favorites.map((emoji) => (
              <div
                key={emoji}
                className="relative"
                onDrop={handleFavoriteDrop(emoji)}
              >
                <button
                  type="button"
                  onClick={() => handleQuickEmojiInsert(emoji)}
                  disabled={isInputDisabled}
                  draggable={isEditingFavorites}
                  onDragStart={handleFavoriteDragStart(emoji)}
                  onDragEnd={handleFavoriteDragEnd}
                  className={clsx(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-sm",
                    isInputDisabled
                      ? "border-slate-800/60 bg-slate-900/30 text-slate-500 cursor-not-allowed"
                      : "border-slate-700/70 bg-slate-900/60 text-slate-100 hover:bg-slate-800/80"
                  )}
                  aria-label={`Emoji favorito ${emoji}`}
                >
                  {emoji}
                </button>
                {isEditingFavorites && (
                  <button
                    type="button"
                    onClick={() => handleRemoveFavorite(emoji)}
                    className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-[9px] text-slate-200 hover:bg-slate-800"
                    aria-label={`Eliminar favorito ${emoji}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {isEditingFavorites && (
              <button
                type="button"
                ref={emojiAddButtonRef}
                onClick={handleAddFavoriteClick}
                disabled={isInputDisabled || isAtMax}
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-semibold",
                  isInputDisabled || isAtMax
                    ? "border-slate-800/60 bg-slate-900/30 text-slate-500 cursor-not-allowed"
                    : "border-dashed border-slate-600/70 bg-slate-900/40 text-slate-200 hover:bg-slate-800/80"
                )}
                aria-label="Añadir favorito"
              >
                +
              </button>
            )}
          </div>
        </div>
      )}
      {stickerDraft && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2">
          <div className="flex items-center gap-3">
            <Image
              src={stickerDraft.file}
              alt={stickerDraft.label}
              width={48}
              height={48}
              unoptimized
              className="h-12 w-12 rounded-lg border border-slate-800/70 bg-slate-900/60 object-contain"
            />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Sticker listo</div>
              <div className="text-xs text-slate-100">{stickerDraft.label}</div>
            </div>
          </div>
          {onStickerDraftClear && (
            <button
              type="button"
              onClick={onStickerDraftClear}
              className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800/80"
            >
              Quitar
            </button>
          )}
        </div>
      )}
      <textarea
        ref={inputRef}
        rows={1}
        className={clsx(
          "w-full min-h-[48px] resize-none overflow-y-auto bg-transparent border-0 outline-none ring-0",
          "px-1 pt-3 pb-2 text-sm leading-6 text-slate-50 whitespace-pre-wrap break-words",
          "placeholder:text-slate-300/95",
          isInternalMode ? "caret-amber-300" : "caret-emerald-400",
          isInputDisabled && "cursor-not-allowed"
        )}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onChange={onChange}
        value={value}
        disabled={isInputDisabled}
        style={{ maxHeight: `${maxHeight}px` }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {showAttach && (
            <button
              type="button"
              onClick={onAttach}
              disabled={!canAttach}
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2",
                canAttach
                  ? "border-slate-800/70 bg-slate-900/50 text-slate-200 hover:border-slate-600/80 hover:bg-slate-800/70 focus-visible:ring-emerald-400/30"
                  : "border-slate-800/50 bg-slate-900/30 text-slate-500 cursor-not-allowed"
              )}
              title={canAttach ? "Adjuntar contenido" : "Solo disponible cuando escribes al fan."}
              aria-label="Adjuntar contenido"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          )}
          {showEmoji && (
            <div className="relative">
              <button
                type="button"
                ref={emojiButtonRef}
                onPointerDown={handleEmojiPointerDown}
                onClick={handleEmojiToggle}
                disabled={isInputDisabled || !onEmojiSelect}
                className={clsx(
                  "flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2",
                  !isInputDisabled && onEmojiSelect
                    ? "border-slate-800/70 bg-slate-900/50 text-slate-200 hover:border-slate-600/80 hover:bg-slate-800/70 focus-visible:ring-emerald-400/30"
                    : "border-slate-800/50 bg-slate-900/30 text-slate-500 cursor-not-allowed"
                )}
                title="Insertar emoji"
                aria-label="Insertar emoji"
              >
                <span className="text-lg leading-none">🙂</span>
              </button>
              <EmojiPicker
                isOpen={isEmojiOpen}
                anchorRef={emojiPickerMode === "favorite" ? emojiAddButtonRef : emojiButtonRef}
                onClose={handleEmojiPickerClose}
                onSelect={handleEmojiSelect}
                mode="insert"
                topContent={emojiPickerTopContent}
                perLine={9}
              />
            </div>
          )}
          {showStickers && (
            <div className="relative">
              <button
                type="button"
                ref={stickerButtonRef}
                onClick={handleStickerToggle}
                disabled={isInputDisabled || !onStickerSelect}
                className={clsx(
                  "h-9 px-3 rounded-full border text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2",
                  !isInputDisabled && onStickerSelect
                    ? "border-slate-800/70 bg-slate-900/50 text-slate-200 hover:border-slate-600/80 hover:bg-slate-800/70 focus-visible:ring-emerald-400/30"
                    : "border-slate-800/50 bg-slate-900/30 text-slate-500 cursor-not-allowed"
                )}
                title="Stickers"
                aria-label="Stickers"
              >
                Stickers
              </button>
              {isStickerOpen && (
                <>
                  {typeof document !== "undefined" &&
                    createPortal(
                      <div
                        ref={stickerPopoverRef}
                        className="hidden sm:block z-[9999]"
                        style={stickerPopoverStyle ?? HIDDEN_POPOVER_STYLE}
                      >
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/95 p-3 shadow-2xl min-w-[320px] w-[360px] max-w-[calc(100vw-16px)] max-h-[420px] overflow-hidden">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold text-slate-300">Stickers</div>
                            <button
                              type="button"
                              onClick={() => setStickerShuffleSeed((prev) => prev + 1)}
                              className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-800/80"
                            >
                              Barajar
                            </button>
                          </div>
                          <div className="mb-2 flex flex-wrap items-center gap-1">
                            {SORTED_STICKER_PACKS.map((pack) => (
                              <button
                                key={pack.id}
                                type="button"
                                onClick={() => setStickerPackId(pack.id)}
                                className={clsx(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                  stickerPackId === pack.id
                                    ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
                                    : "border-slate-700/70 bg-slate-900/60 text-slate-300 hover:text-slate-100"
                                )}
                              >
                                {pack.label}
                              </button>
                            ))}
                          </div>
                          <div className="mb-2 flex flex-wrap items-center gap-1">
                            {STICKER_INTENT_OPTIONS.map((intentOption) => (
                              <button
                                key={intentOption.id}
                                type="button"
                                onClick={() => setStickerIntent(intentOption.id)}
                                className={clsx(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                  stickerIntent === intentOption.id
                                    ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
                                    : "border-slate-700/70 bg-slate-900/60 text-slate-300 hover:text-slate-100"
                                )}
                              >
                                {intentOption.label}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-2 max-h-[320px] overflow-y-auto pr-1">
                            {shuffledStickers.map((sticker) => (
                              <button
                                key={sticker.id}
                                type="button"
                                onClick={() => handleStickerSelect(sticker)}
                                className="group flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-800/70 bg-slate-900/60 p-2 hover:bg-slate-800/80"
                              >
                                <Image
                                  src={sticker.file}
                                  alt={sticker.label}
                                  width={60}
                                  height={60}
                                  unoptimized
                                  className="h-16 w-16 object-contain transition-transform group-hover:scale-105"
                                />
                                <span className="text-[10px] text-slate-300">{sticker.label}</span>
                                <span className="text-[10px] text-emerald-200/80 group-hover:text-emerald-100">Insertar</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/60">
                    <div
                      ref={stickerSheetRef}
                      className="w-full max-w-lg rounded-t-2xl border border-slate-800/80 bg-slate-950/95 p-3 shadow-2xl"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-slate-300">Stickers</div>
                        <button
                          type="button"
                          onClick={() => setStickerShuffleSeed((prev) => prev + 1)}
                          className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-800/80"
                        >
                          Barajar
                        </button>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-1">
                        {SORTED_STICKER_PACKS.map((pack) => (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() => setStickerPackId(pack.id)}
                            className={clsx(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              stickerPackId === pack.id
                                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
                                : "border-slate-700/70 bg-slate-900/60 text-slate-300 hover:text-slate-100"
                            )}
                          >
                            {pack.label}
                          </button>
                        ))}
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-1">
                        {STICKER_INTENT_OPTIONS.map((intentOption) => (
                          <button
                            key={intentOption.id}
                            type="button"
                            onClick={() => setStickerIntent(intentOption.id)}
                            className={clsx(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              stickerIntent === intentOption.id
                                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
                                : "border-slate-700/70 bg-slate-900/60 text-slate-300 hover:text-slate-100"
                            )}
                          >
                            {intentOption.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 max-h-[320px] overflow-y-auto pr-1">
                        {shuffledStickers.map((sticker) => (
                          <button
                            key={sticker.id}
                            type="button"
                            onClick={() => handleStickerSelect(sticker)}
                            className="group flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-800/70 bg-slate-900/60 p-2 hover:bg-slate-800/80"
                          >
                            <Image
                              src={sticker.file}
                              alt={sticker.label}
                              width={60}
                              height={60}
                              unoptimized
                              className="h-16 w-16 object-contain transition-transform group-hover:scale-105"
                            />
                            <span className="text-[10px] text-slate-300">{sticker.label}</span>
                            <span className="text-[10px] text-emerald-200/80 group-hover:text-emerald-100">Insertar</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {showAudienceToggle && (
            <div
              className={clsx(
                "inline-flex h-8 items-center rounded-full border p-0.5 shrink-0",
                isInternalMode
                  ? "border-amber-400/60 bg-amber-500/12"
                  : "border-slate-800/70 bg-slate-900/50"
              )}
            >
              <button
                type="button"
                onClick={() => onAudienceChange("CREATOR")}
                className={clsx(
                  "h-7 rounded-full px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30",
                  audience === "CREATOR"
                    ? "bg-emerald-500/20 text-emerald-100"
                    : "text-slate-300 hover:text-slate-100"
                )}
              >
                Al fan
              </button>
              <button
                type="button"
                onClick={() => onAudienceChange("INTERNAL")}
                className={clsx(
                  "h-7 rounded-full px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30",
                  audience === "INTERNAL"
                    ? "bg-amber-500/20 text-amber-100"
                    : "text-slate-300 hover:text-slate-100"
                )}
                title="No se envía al fan. Se prepara en el Manager interno."
              >
                Interno/Manager
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          aria-label={actionLabel}
          className={clsx(
            "h-9 px-4 rounded-full text-sm font-semibold shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2",
            isInternalMode
              ? "bg-amber-400 text-slate-950 hover:bg-amber-300 focus-visible:ring-amber-400/40"
              : "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
