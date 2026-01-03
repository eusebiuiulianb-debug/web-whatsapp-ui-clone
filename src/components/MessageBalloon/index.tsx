import { memo, useEffect, useMemo, useRef, useState, type MouseEventHandler } from "react";
import clsx from "clsx";
import Image from "next/image";
import { useEmojiFavorites } from "../../hooks/useEmojiFavorites";
import { EmojiPicker } from "../EmojiPicker";
import { IconGlyph } from "../ui/IconGlyph";
import { readEmojiRecents, recordEmojiRecent } from "../../lib/emoji/recents";
import {
  getActorReaction,
  getReactionSummary,
  type MessageReaction,
  toggleMessageReaction,
} from "../../lib/emoji/reactions";

interface MessageBalloonProps {
  me: boolean;
  message: string;
  messageId?: string;
  seen?: boolean;
  time?: string;
  fromLabel?: string;
  meLabel?: string;
  status?: "sending" | "failed" | "sent";
  translatedText?: string;
  badge?: string;
  variant?: "default" | "internal";
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  stickerSrc?: string | null;
  stickerAlt?: string | null;
  enableReactions?: boolean;
  reactionActor?: string;
  reactions?: MessageReaction[];
  reactionFanId?: string;
}

const MessageBalloon = memo(function MessageBalloon(props: MessageBalloonProps) {
  const [time, setTime] = useState("");
  const [isTranslationOpen, setIsTranslationOpen] = useState(false);
  const {
    me,
    message,
    messageId,
    seen,
    fromLabel,
    meLabel,
    status,
    translatedText,
    badge,
    variant = "default",
    onContextMenu,
    stickerSrc,
    stickerAlt,
    enableReactions = false,
    reactionActor = "creator",
    reactions: reactionsProp,
    reactionFanId,
  } = props;
  const isSticker = Boolean(stickerSrc);
  const bubbleClass =
    variant === "internal"
      ? "bg-amber-500/15 text-amber-50 border border-amber-400/60"
      : me
      ? "bg-[color:var(--brand-weak)] text-[color:var(--text)] border border-[color:rgba(var(--brand-rgb),0.28)]"
      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border border-[color:var(--border)]";
  const bubblePadding = isSticker ? "p-2" : "px-4 py-2";
  const bubbleTone = isSticker ? "bg-[color:var(--surface-2)] border border-[color:var(--border)]" : bubbleClass;
  const reactionAlign = me ? "right-0" : "left-0";
  const canShowReactions = enableReactions && Boolean(messageId) && Boolean(reactionFanId) && !isSticker;
  const { favorites } = useEmojiFavorites();
  const [reactionRecents, setReactionRecents] = useState<string[]>([]);
  const reactionChoices = useMemo(() => {
    const deduped = favorites.concat(reactionRecents.filter((emoji) => !favorites.includes(emoji)));
    return deduped.slice(0, 6);
  }, [favorites, reactionRecents]);
  const reactions = useMemo(() => reactionsProp ?? [], [reactionsProp]);
  const [ isReactionBarOpen, setIsReactionBarOpen ] = useState(false);
  const [ isReactionPickerOpen, setIsReactionPickerOpen ] = useState(false);
  const [ isHovered, setIsHovered ] = useState(false);
  const reactionBarRef = useRef<HTMLDivElement | null>(null);
  const reactionPickerAnchorRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const reactionSummary = useMemo(() => getReactionSummary(reactions), [reactions]);
  const actorReaction = useMemo(() => getActorReaction(reactions, reactionActor), [reactions, reactionActor]);
  const LONG_PRESS_DELAY = 350;
  const LONG_PRESS_MOVE_THRESHOLD = 12;

  useEffect(() => {
    if (props.time) {
      setTime(props.time);
    } else {
      setTime(refreshTime());
    }
  }, [props.time])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressStartRef.current = null;
    };
  }, []);

  function refreshTime() {
    const date = new Date();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const formattedString = `${hours}:${minutes}`;
    return formattedString;
  }

  useEffect(() => {
    if (!canShowReactions) return;
    if (!isReactionBarOpen && !isReactionPickerOpen) return;
    setReactionRecents(readEmojiRecents());
  }, [canShowReactions, isReactionBarOpen, isReactionPickerOpen]);

  useEffect(() => {
    if (!canShowReactions) return;
    if (!isReactionBarOpen && !isReactionPickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const element = target as Element;
      if (reactionBarRef.current?.contains(target)) return;
      if (reactionPickerAnchorRef.current?.contains(target)) return;
      if (element.closest?.("[data-emoji-picker=\"true\"]")) return;
      setIsReactionBarOpen(false);
      setIsReactionPickerOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [canShowReactions, isReactionBarOpen, isReactionPickerOpen]);

  const handleSelectReaction = (emoji: string) => {
    if (!messageId || !reactionFanId) return;
    setReactionRecents((prev) => recordEmojiRecent(emoji, prev));
    toggleMessageReaction(reactionFanId, messageId, emoji, reactionActor);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const handleClearReaction = () => {
    if (!messageId || !reactionFanId || !actorReaction) return;
    toggleMessageReaction(reactionFanId, messageId, actorReaction, reactionActor);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canShowReactions) return;
    if (event.pointerType !== "touch") return;
    if (isReactionBarOpen || isReactionPickerOpen) return;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      setIsReactionBarOpen(true);
      setIsReactionPickerOpen(false);
    }, LONG_PRESS_DELAY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    const start = longPressStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) >= LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPressTimer();
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    clearLongPressTimer();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    clearLongPressTimer();
  };

  return (
    <div
      className={clsx(
        me ? "flex justify-end" : "flex justify-start",
        "touch-pan-y select-none md:select-text"
      )}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="max-w-[75%]">
        <p
          className={`mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)] ${me ? "text-right" : ""}`}
        >
          <span>{me ? meLabel || "Tú" : fromLabel || "Fan"} • {time}</span>
          {badge && (
            <span className="ml-2 inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-200">
              {badge}
            </span>
          )}
        </p>
        <div className="relative">
          {canShowReactions && (
            <button
              type="button"
              onClick={() => {
                setIsReactionBarOpen((prev) => !prev);
                setIsReactionPickerOpen(false);
              }}
              className={clsx(
                "absolute -top-3 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-xs text-slate-200 shadow transition",
                reactionAlign,
                isHovered || isReactionBarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
              aria-label="Reaccionar"
            >
              <IconGlyph name="smile" className="h-3.5 w-3.5" />
            </button>
          )}
          {canShowReactions && isReactionBarOpen && (
            <div
              ref={reactionBarRef}
              className={clsx(
                "absolute z-20 -top-12 flex items-center gap-1 rounded-full border border-slate-800/80 bg-slate-950/95 px-2 py-1 shadow-xl",
                reactionAlign
              )}
            >
              {reactionChoices.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectReaction(emoji)}
                  className={clsx(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-sm",
                    actorReaction === emoji
                      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)]"
                      : "border-slate-700/70 bg-slate-900/70 text-slate-100 hover:bg-slate-800/80"
                  )}
                >
                  {emoji}
                </button>
              ))}
              {actorReaction && (
                <button
                  type="button"
                  onClick={handleClearReaction}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
                  aria-label="Quitar reacción"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsReactionPickerOpen((prev) => !prev)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 text-[12px] font-semibold text-slate-100 hover:bg-slate-800/80"
                aria-label="Más reacciones"
                ref={reactionPickerAnchorRef}
              >
                +
              </button>
            </div>
          )}
          {canShowReactions && (
            <EmojiPicker
              isOpen={isReactionPickerOpen}
              anchorRef={reactionPickerAnchorRef}
              onClose={() => setIsReactionPickerOpen(false)}
              onSelect={handleSelectReaction}
              mode="reaction"
            />
          )}
          <div
            className={clsx(
              "rounded-2xl text-sm shadow whitespace-pre-wrap",
              bubblePadding,
              bubbleTone
            )}
          >
            {isSticker ? (
              <Image
                src={stickerSrc ?? ""}
                alt={stickerAlt ?? "Sticker"}
                width={144}
                height={144}
                unoptimized
                className="h-36 w-36 object-contain"
              />
            ) : (
              message
            )}
          </div>
        </div>
        {translatedText ? (
          <div className={`mt-1 text-[11px] text-slate-300 ${me ? "text-right" : ""}`}>
            <button
              type="button"
              onClick={() => setIsTranslationOpen((prev) => !prev)}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline"
            >
              {isTranslationOpen ? "Ocultar traducción" : "Ver traducción"}
            </button>
            {isTranslationOpen && (
              <div className="mt-1">
                <span className="font-semibold">Traducción:</span> {translatedText}
              </div>
            )}
          </div>
        ) : null}
        {reactionSummary.length > 0 && !isSticker && (
          <div className={clsx("mt-1 flex flex-wrap gap-1", me ? "justify-end" : "justify-start")}>
            {reactionSummary.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                onClick={() => handleSelectReaction(entry.emoji)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                  actorReaction === entry.emoji
                    ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)]"
                    : "border-slate-700/70 bg-slate-900/70 text-slate-100 hover:bg-slate-800/80"
                )}
                aria-label={`Reacción ${entry.emoji}`}
              >
                <span>{entry.emoji}</span>
                <span className="text-[10px] text-slate-300">{entry.count}</span>
              </button>
            ))}
          </div>
        )}
        {status === "sending" && <div className="mt-1 text-[10px] text-[color:var(--muted)] text-right">Enviando...</div>}
        {status === "failed" && <div className="mt-1 text-[10px] text-rose-300 text-right">Fallo al enviar</div>}
        {me && seen ? (
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[color:var(--muted)]">
            <span className="inline-flex -space-x-1">
              <IconGlyph name="check" className="h-3 w-3" />
              <IconGlyph name="check" className="h-3 w-3" />
            </span>
            <span>Visto</span>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default MessageBalloon;
