import clsx from "clsx";
import { Bookmark, BookmarkCheck, MessageCircle, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { IconGlyph } from "../ui/IconGlyph";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

type PopClipTileItem = {
  id: string;
  title?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  previewImageUrl?: string | null;
  savesCount?: number | null;
  creator: {
    handle: string;
    displayName: string;
    avatarUrl?: string | null;
    vipEnabled?: boolean;
    isAvailable?: boolean;
    responseTime?: string | null;
    locationLabel?: string | null;
  };
};

type Props = {
  item: PopClipTileItem;
  onOpen: () => void;
  profileHref: string;
  chatHref: string;
  isSaved?: boolean;
  onToggleSave?: () => void;
  onOpenCaption?: () => void;
  onCopyLink?: () => void;
  onShare?: () => void;
  onReport?: () => void;
};

export function PopClipTile({
  item,
  onOpen,
  profileHref,
  chatHref,
  isSaved = false,
  onToggleSave,
  onOpenCaption,
  onCopyLink,
  onShare,
  onReport,
}: Props) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const title = item.title?.trim() || "PopClip";
  const caption = (item.caption || "").trim() || item.title?.trim() || "";
  const previewSrc = item.thumbnailUrl || item.posterUrl || item.previewImageUrl || "";
  const showImage = Boolean(previewSrc) && !thumbFailed;
  const avatarSrc = item.creator.avatarUrl || "";
  const showAvatar = Boolean(avatarSrc) && !avatarFailed;
  const savesCount = Number.isFinite(item.savesCount ?? NaN) ? (item.savesCount as number) : 0;
  const showSavesCount = savesCount > 5;
  const savesBadgeLabel = savesCount > 99 ? "99+" : String(savesCount);
  const showCaption = Boolean(caption);
  const showCaptionMore = caption.length > 80;
  const responseLabel = (item.creator.responseTime || "").trim();
  const locationLabel = (item.creator.locationLabel || "").trim();
  const badges = [
    item.creator.isAvailable ? "Disponible" : "",
    responseLabel,
    locationLabel ? `📍 ${locationLabel} (aprox.)` : "",
  ].filter(Boolean);
  const creatorInitial = item.creator.displayName?.trim()?.[0]?.toUpperCase() || "C";
  const quickActions: ContextMenuItem[] = [];
  if (onCopyLink) {
    quickActions.push({ label: "Copiar link", icon: "link", onClick: onCopyLink });
  }
  if (onShare) {
    quickActions.push({ label: "Compartir", icon: "send", onClick: onShare });
  }
  if (onReport) {
    if (quickActions.length > 0) quickActions.push({ label: "divider", divider: true });
    quickActions.push({
      label: "Reportar",
      icon: "alert",
      onClick: onReport,
      danger: true,
    });
  }

  return (
    <div className="group flex w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[color:rgba(var(--brand-rgb),0.18)]">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        aria-label={`Abrir ${title}`}
        className="relative aspect-[10/13] w-full cursor-pointer overflow-hidden focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)] sm:aspect-[3/4] md:aspect-[4/5]"
      >
        {showImage ? (
          <Image
            src={normalizeImageSrc(previewSrc)}
            alt={title}
            layout="fill"
            objectFit="cover"
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            onError={() => setThumbFailed(true)}
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
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-80 transition duration-200 md:opacity-70 md:group-hover:opacity-90" />

        <div className="absolute inset-x-0 top-0 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={profileHref}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Ver perfil de @${item.creator.handle}`}
              className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2 py-1.5 text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10">
                  {showAvatar ? (
                    <Image
                      src={normalizeImageSrc(avatarSrc)}
                      alt={item.creator.displayName}
                      width={28}
                      height={28}
                      className="h-full w-full object-cover"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">
                      {creatorInitial}
                    </span>
                  )}
                </span>
                <span className="truncate text-xs font-semibold text-white">@{item.creator.handle}</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              {quickActions.length > 0 ? (
                <ContextMenu
                  buttonAriaLabel="Acciones rápidas"
                  items={quickActions}
                  align="right"
                  closeOnScroll
                  menuClassName="right-auto left-1/2 -translate-x-1/2 min-w-[160px] w-[min(90vw,220px)] top-9 sm:left-auto sm:right-0 sm:translate-x-0 sm:top-7"
                  renderButton={({ ref, onClick, ariaLabel, ariaExpanded, ariaHaspopup, title }) => (
                    <button
                      ref={ref}
                      type="button"
                      aria-label={ariaLabel}
                      aria-expanded={ariaExpanded}
                      aria-haspopup={ariaHaspopup}
                      title={title}
                      onClick={onClick}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
                    >
                      <IconGlyph name="dots" ariaHidden />
                    </button>
                  )}
                />
              ) : null}
              <div className="relative">
              <button
                type="button"
                aria-label={isSaved ? "Quitar guardado" : "Guardar clip"}
                title={isSaved ? "Quitar guardado" : "Guardar clip"}
                aria-pressed={isSaved}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleSave?.();
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className={clsx(
                  "inline-flex h-11 w-11 items-center justify-center rounded-full border text-white backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40",
                  isSaved ? "border-white/40 bg-white/15" : "border-white/15 bg-black/40"
                )}
              >
                {isSaved ? (
                  <BookmarkCheck className="h-5 w-5 text-white" aria-hidden="true" />
                ) : (
                  <Bookmark className="h-5 w-5 text-white/80" aria-hidden="true" />
                )}
              </button>
              {showSavesCount ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-white/30 bg-black/70 px-1 text-[10px] font-semibold text-white"
                >
                  {savesBadgeLabel}
                </span>
              ) : null}
              </div>
            </div>
          </div>
        </div>
        {showCaption ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 transition md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0">
            <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-[11px] text-white/90 backdrop-blur-sm">
              <p className="line-clamp-2 leading-snug md:line-clamp-1">{caption}</p>
              {showCaptionMore ? (
                <button
                  type="button"
                  aria-label="Ver más"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenCaption?.();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="pointer-events-auto mt-1 text-[11px] font-semibold text-white/80 underline decoration-white/40 underline-offset-2 transition hover:text-white focus:outline-none focus:ring-1 focus:ring-white/50"
                >
                  Ver más
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 bg-[color:rgba(8,12,20,0.85)] px-3 pb-3 pt-3 text-white/90 sm:p-4">
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/90"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 gap-y-2">
          <div className="inline-flex flex-wrap items-center gap-2">
            <Link
              href={chatHref}
              onClick={(event) => event.stopPropagation()}
              aria-label="Abrir chat"
              title="Abrir chat"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--brand-strong)] bg-[color:var(--brand-strong)] text-white shadow-sm transition hover:bg-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              href={profileHref}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-11 min-w-[140px] flex-1 items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
            >
              Ver perfil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
