import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { readEmojiRecents, recordEmojiRecent } from "../lib/emoji/recents";
import { useEmojiFavorites } from "../hooks/useEmojiFavorites";
import { EmojiPicker } from "./EmojiPicker";
import type { StickerItem } from "../lib/stickers";

type EmojiSelectPayload = {
  native?: string;
  emoji?: string;
};

const StickerPicker = dynamic(
  () => import("./chat/StickerPicker").then((mod) => mod.StickerPicker),
  { ssr: false }
);

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
}: ChatComposerBarProps) {
  const isInternalMode = audience === "INTERNAL";
  const isInputDisabled = (isChatBlocked && !isInternalMode) || isInternalPanelOpen;
  const [ isEmojiOpen, setIsEmojiOpen ] = useState(false);
  const [ isStickerOpen, setIsStickerOpen ] = useState(false);
  const [ isEditingFavorites, setIsEditingFavorites ] = useState(false);
  const [ emojiPickerMode, setEmojiPickerMode ] = useState<"insert" | "favorite">("insert");
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const stickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const [ emojiRecents, setEmojiRecents ] = useState<string[]>([]);
  const { favorites, addFavorite, removeFavorite, replaceFavorites, isAtMax } = useEmojiFavorites();
  const draggedEmojiRef = useRef<string | null>(null);
  const canUseEmoji = showEmoji && !!onEmojiSelect;

  useEffect(() => {
    if (!isEmojiOpen && !isStickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const element = target as Element;
      if (emojiButtonRef.current?.contains(target)) return;
      if (emojiAddButtonRef.current?.contains(target)) return;
      if (stickerButtonRef.current?.contains(target)) return;
      if (element.closest?.("[data-emoji-picker=\"true\"]")) return;
      if (element.closest?.("[data-sticker-picker=\"true\"]")) return;
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
    if (!isEmojiOpen) return;
    setEmojiRecents(readEmojiRecents());
  }, [isEmojiOpen]);

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
                <StickerPicker
                  isOpen={isStickerOpen}
                  anchorRef={stickerButtonRef}
                  onClose={() => setIsStickerOpen(false)}
                  onSelect={handleStickerSelect}
                />
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
