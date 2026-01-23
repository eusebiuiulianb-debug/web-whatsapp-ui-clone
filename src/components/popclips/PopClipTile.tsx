import clsx from "clsx";
import { Bookmark, BookmarkCheck, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { formatCount } from "../../utils/formatCount";

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
    avgResponseHours?: number | null;
    isAvailable?: boolean;
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
};

export function PopClipTile({
  item,
  onOpen,
  profileHref,
  chatHref,
  isSaved = false,
  onToggleSave,
  onOpenCaption,
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
  const showSavesCount = savesCount > 0;
  const showCaption = Boolean(caption);
  const showCaptionMore = caption.length > 80;
  const isFastResponder = Number.isFinite(item.creator.avgResponseHours ?? NaN)
    ? (item.creator.avgResponseHours as number) <= 24
    : false;
  const badges = [
    item.creator.isAvailable ? "Disponible" : "",
    isFastResponder ? "Responde <24h" : "",
  ].filter(Boolean);
  const creatorInitial = item.creator.displayName?.trim()?.[0]?.toUpperCase() || "C";

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
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[color:var(--surface-2)] to-[color:var(--surface-1)] text-xs font-semibold text-[color:var(--muted)]">
            PopClip
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
                  {formatCount(savesCount)}
                </span>
              ) : null}
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

      <div className="flex flex-col gap-2 border-t border-white/10 bg-[color:rgba(8,12,20,0.85)] px-3 py-3 text-white/90">
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
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
        <div className="flex flex-wrap items-center gap-2">
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
  );
}
