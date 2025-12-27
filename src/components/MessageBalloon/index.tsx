import { memo, useEffect, useMemo, useRef, useState, type MouseEventHandler } from "react";
import clsx from "clsx";
import Image from "next/image";
import { useEmojiFavorites } from "../../hooks/useEmojiFavorites";
import { EmojiPicker } from "../EmojiPicker";
import {
  getActorReaction,
  getReactionSummary,
  type MessageReaction,
  readMessageReactions,
  subscribeMessageReactions,
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
  } = props;
  const isSticker = Boolean(stickerSrc);
  const bubbleClass =
    variant === "internal"
      ? "bg-amber-500/15 text-amber-50 border border-amber-400/60"
      : me
      ? "bg-emerald-600 text-white"
      : "bg-slate-800 text-slate-50";
  const bubblePadding = isSticker ? "p-2" : "px-4 py-2";
  const bubbleTone = isSticker ? "bg-slate-900/70 border border-slate-800/60" : bubbleClass;
  const reactionAlign = me ? "right-0" : "left-0";
  const canShowReactions = enableReactions && Boolean(messageId) && !isSticker;
  const { favorites } = useEmojiFavorites();
  const reactionChoices = favorites.slice(0, 6);
  const [ reactions, setReactions ] = useState<MessageReaction[]>([]);
  const [ isReactionBarOpen, setIsReactionBarOpen ] = useState(false);
  const [ isReactionPickerOpen, setIsReactionPickerOpen ] = useState(false);
  const [ isHovered, setIsHovered ] = useState(false);
  const reactionBarRef = useRef<HTMLDivElement | null>(null);
  const reactionPickerAnchorRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const reactionSummary = useMemo(() => getReactionSummary(reactions), [reactions]);
  const actorReaction = useMemo(() => getActorReaction(reactions, reactionActor), [reactions, reactionActor]);

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
    if (!canShowReactions || !messageId) return;
    setReactions(readMessageReactions(messageId));
    return subscribeMessageReactions(() => {
      setReactions(readMessageReactions(messageId));
    });
  }, [canShowReactions, messageId]);

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
    if (!messageId) return;
    const next = toggleMessageReaction(messageId, emoji, reactionActor);
    setReactions(next);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const handleClearReaction = () => {
    if (!messageId || !actorReaction) return;
    const next = toggleMessageReaction(messageId, actorReaction, reactionActor);
    setReactions(next);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const handleTouchStart = () => {
    if (!canShowReactions) return;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      setIsReactionBarOpen(true);
      setIsReactionPickerOpen(false);
    }, 420);
  };

  const handleTouchEnd = () => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  return (
    <div
      className={me ? "flex justify-end" : "flex justify-start"}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="max-w-[75%]">
        <p
          className={`mb-1 text-[10px] uppercase tracking-wide text-slate-400 ${me ? "text-right" : ""}`}
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
              🙂
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
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100"
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
                width={96}
                height={96}
                unoptimized
                className="h-24 w-24 object-contain"
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
                    ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100"
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
        {status === "sending" && <div className="mt-1 text-[10px] text-slate-400 text-right">Enviando...</div>}
        {status === "failed" && <div className="mt-1 text-[10px] text-rose-300 text-right">Fallo al enviar</div>}
        {me && seen ? <div className="mt-1 text-[10px] text-[#8edafc] text-right">✔✔ Visto</div> : null}
      </div>
    </div>
  );
});

export default MessageBalloon;
