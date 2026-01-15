import { memo, useEffect, useMemo, useRef, useState, type MouseEventHandler, type ReactNode } from "react";
import clsx from "clsx";
import Image from "next/image";
import { useEmojiFavorites } from "../../hooks/useEmojiFavorites";
import { EmojiPicker } from "../EmojiPicker";
import { IconGlyph } from "../ui/IconGlyph";
import { readEmojiRecents, recordEmojiRecent } from "../../lib/emoji/recents";
import { getMineEmoji, type ReactionSummaryEntry } from "../../lib/messageReactions";

const OFFER_MARKER = "\n\n__NOVSY_OFFER__:";

type ViewerRole = "creator" | "fan";

export type OfferMeta = {
  id: string;
  title: string;
  price: string;
  thumb?: string | null;
};

const isOfferMeta = (value: unknown): value is OfferMeta => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfferMeta>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return false;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) return false;
  if (typeof candidate.price !== "string") return false;
  if (candidate.thumb !== undefined && candidate.thumb !== null && typeof candidate.thumb !== "string") return false;
  return true;
};

export function splitOffer(content: string): { textVisible: string; offerMeta: OfferMeta | null } {
  const idx = content.indexOf(OFFER_MARKER);
  if (idx === -1) {
    return { textVisible: content, offerMeta: null };
  }
  const textVisible = content.slice(0, idx);
  const raw = content.slice(idx + OFFER_MARKER.length).trim();
  if (!raw) {
    return { textVisible, offerMeta: null };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return { textVisible, offerMeta: isOfferMeta(parsed) ? parsed : null };
  } catch (_err) {
    return { textVisible, offerMeta: null };
  }
}

type LockedContentCardProps = {
  title: string;
  price: string;
  thumb?: string | null;
  status: "locked" | "unlocked";
  ctaLabel: string;
  onClick: () => void;
};

const LockedContentCard = ({
  title,
  price,
  thumb,
  status,
  ctaLabel,
  onClick,
}: LockedContentCardProps) => {
  const statusLabel = status === "locked" ? "Bloqueado" : "Desbloqueado";
  const statusClass =
    status === "locked"
      ? "border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.12)] text-[color:var(--warning)]"
      : "border-[color:rgba(34,197,94,0.6)] bg-[color:rgba(34,197,94,0.14)] text-[color:rgb(22,163,74)]";
  const ctaClass =
    status === "locked"
      ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.18)] text-[color:var(--text)]"
      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-left shadow-sm transition hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-2)]"
    >
      <div className="flex items-center gap-3">
        {thumb ? (
          <div className="relative h-11 w-11 overflow-hidden rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
            <Image src={thumb} alt={title} width={44} height={44} className="h-11 w-11 object-cover" />
          </div>
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[13px]">
            {status === "locked" ? "🔒" : "✅"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-[color:var(--text)]">{title}</div>
          {price.trim() ? (
            <div className="text-[11px] text-[color:var(--muted)]">{price}</div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={clsx("rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide", statusClass)}>
            {statusLabel}
          </span>
          <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold", ctaClass)}>
            {ctaLabel}
          </span>
        </div>
      </div>
    </button>
  );
};

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
  reactionsSummary?: ReactionSummaryEntry[];
  onReact?: (emoji: string) => void;
  actionMenu?: ReactNode;
  actionMenuAlign?: "left" | "right";
  onTouchLongPress?: () => void;
  forceReactionButton?: boolean;
  anchorId?: string;
  unlockedOfferIds?: Set<string>;
  onOfferClick?: (offer: OfferMeta, status: "locked" | "unlocked") => void;
  viewerRole: ViewerRole;
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
    reactionsSummary: reactionsSummaryProp,
    onReact,
    actionMenu,
    actionMenuAlign,
    onTouchLongPress,
    forceReactionButton = false,
    anchorId,
    unlockedOfferIds,
    onOfferClick,
    viewerRole,
  } = props;
  const isCreator = viewerRole === "creator";
  const isSticker = Boolean(stickerSrc);
  const { textVisible, offerMeta } = useMemo(
    () => (isSticker ? { textVisible: message, offerMeta: null } : splitOffer(message)),
    [isSticker, message]
  );
  const offerStatus = offerMeta && unlockedOfferIds?.has(offerMeta.id) ? "unlocked" : "locked";
  const offerCtaLabel = offerStatus === "unlocked" ? "Ver" : "Desbloquear";
  const bubbleClass =
    variant === "internal"
      ? "bg-[color:rgba(245,158,11,0.12)] text-[color:var(--text)] border border-[color:rgba(245,158,11,0.6)]"
      : me
      ? "bg-[color:var(--brand-weak)] text-[color:var(--text)] border border-[color:rgba(var(--brand-rgb),0.28)]"
      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border border-[color:var(--border)]";
  const bubblePadding = isSticker ? "p-2" : "px-4 py-2";
  const bubbleTone = isSticker ? "bg-[color:var(--surface-2)] border border-[color:var(--border)]" : bubbleClass;
  const reactionAlign = me ? "right-0" : "left-0";
  const actionAlign = (actionMenuAlign ?? (me ? "right" : "left")) === "right" ? "right-0" : "left-0";
  const canShowReactions =
    enableReactions && Boolean(messageId) && Boolean(onReact) && !isSticker && status !== "sending";
  const { favorites } = useEmojiFavorites();
  const [reactionRecents, setReactionRecents] = useState<string[]>([]);
  const reactionChoices = useMemo(() => {
    const deduped = favorites.concat(reactionRecents.filter((emoji) => !favorites.includes(emoji)));
    return deduped.slice(0, 6);
  }, [favorites, reactionRecents]);
  const reactionsSummary = useMemo(() => reactionsSummaryProp ?? [], [reactionsSummaryProp]);
  const [ isReactionBarOpen, setIsReactionBarOpen ] = useState(false);
  const [ isReactionPickerOpen, setIsReactionPickerOpen ] = useState(false);
  const [ isHovered, setIsHovered ] = useState(false);
  const reactionBarRef = useRef<HTMLDivElement | null>(null);
  const reactionPickerAnchorRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const actorReaction = useMemo(() => getMineEmoji(reactionsSummary), [reactionsSummary]);
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
    if (!messageId || !onReact) return;
    setReactionRecents((prev) => recordEmojiRecent(emoji, prev));
    onReact(emoji);
    setIsReactionBarOpen(false);
    setIsReactionPickerOpen(false);
  };

  const handleClearReaction = () => {
    if (!messageId || !onReact || !actorReaction) return;
    onReact(actorReaction);
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
    if (event.pointerType !== "touch") return;
    if (!canShowReactions && !onTouchLongPress) return;
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
      if (onTouchLongPress) {
        onTouchLongPress();
        return;
      }
      if (canShowReactions) {
        setIsReactionBarOpen(true);
        setIsReactionPickerOpen(false);
      }
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
        "group touch-pan-y select-none md:select-text"
      )}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="max-w-[75%]" data-message-id={messageId || undefined} data-message-anchor={anchorId}>
        <p
          className={`mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)] ${me ? "text-right" : ""}`}
        >
          <span>{me ? meLabel || "Tú" : fromLabel || "Fan"} • {time}</span>
          {badge && (
            <span className="ml-2 inline-flex items-center rounded-full border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-2 py-0.5 text-[9px] font-semibold text-[color:var(--warning)]">
              {badge}
            </span>
          )}
        </p>
        <div className="relative">
          {(canShowReactions || actionMenu) && (
            <div
              className={clsx(
                "absolute -top-3 flex items-center gap-1",
                actionAlign,
                isHovered || isReactionBarOpen || isReactionPickerOpen || forceReactionButton
                  ? "opacity-100"
                  : "opacity-0 pointer-events-none",
                "transition"
              )}
            >
              {actionMenu}
              {canShowReactions && (
                <button
                  type="button"
                  onClick={() => {
                    setIsReactionBarOpen((prev) => !prev);
                    setIsReactionPickerOpen(false);
                  }}
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-0)] text-xs text-[color:var(--text)] shadow"
                  )}
                  aria-label="Reaccionar"
                >
                  <IconGlyph name="smile" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {canShowReactions && isReactionBarOpen && (
            <div
              ref={reactionBarRef}
              className={clsx(
                "absolute z-20 -top-12 flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-1 shadow-xl",
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
                      : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  )}
                >
                  {emoji}
                </button>
              ))}
              {actorReaction && (
                <button
                  type="button"
                  onClick={handleClearReaction}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                  aria-label="Quitar reacción"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsReactionPickerOpen((prev) => !prev)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[12px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
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
              textVisible
            )}
          </div>
          {!isSticker && offerMeta && (
            <div className="mt-2">
              <LockedContentCard
                title={offerMeta.title}
                price={offerMeta.price}
                thumb={offerMeta.thumb ?? null}
                status={offerStatus}
                ctaLabel={offerCtaLabel}
                onClick={() => {
                  onOfferClick?.(offerMeta, offerStatus);
                }}
              />
            </div>
          )}
        </div>
        {isCreator && translatedText ? (
          <div className={`mt-1 text-[11px] text-[color:var(--muted)] ${me ? "text-right" : ""}`}>
            <button
              type="button"
              onClick={() => setIsTranslationOpen((prev) => !prev)}
              className="text-[11px] text-[color:var(--muted)] hover:text-[color:var(--text)] underline"
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
        {reactionsSummary.length > 0 && !isSticker && (
          <div className={clsx("mt-1 flex flex-wrap gap-1", me ? "justify-end" : "justify-start")}>
            {reactionsSummary.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                onClick={() => handleSelectReaction(entry.emoji)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                  actorReaction === entry.emoji
                    ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.14)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                )}
                aria-label={`Reacción ${entry.emoji}`}
              >
                <span>{entry.emoji}</span>
                <span className="text-[10px] text-[color:var(--muted)]">{entry.count}</span>
              </button>
            ))}
          </div>
        )}
        {status === "sending" && <div className="mt-1 text-[10px] text-[color:var(--muted)] text-right">Enviando...</div>}
        {status === "failed" && <div className="mt-1 text-[10px] text-[color:var(--danger)] text-right">Fallo al enviar</div>}
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
