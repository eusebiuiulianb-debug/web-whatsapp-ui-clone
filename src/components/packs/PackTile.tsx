import { Lock, MessageCircle, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { Skeleton } from "../ui/Skeleton";

export type PackTileItem = {
  id: string;
  kind: "pack" | "sub" | "extra";
  title: string;
  priceLabel?: string;
  thumbUrl?: string | null;
};

type Props = {
  item: PackTileItem;
  onOpen: (item: PackTileItem) => void;
  chatHref: string;
  detailHref?: string;
  variant?: "explore" | "profileCompact" | "profileMinimal";
  primaryLabel?: string;
  secondaryLabel?: string;
  showLockedOverlay?: boolean;
  lockedCtaLabel?: string;
};

const SECONDARY_LABEL_BY_KIND: Record<PackTileItem["kind"], string> = {
  pack: "Ver pack",
  sub: "Ver suscripción",
  extra: "Ver extra",
};

export function PackTile({
  item,
  onOpen,
  chatHref,
  detailHref,
  variant = "explore",
  primaryLabel = "Abrir chat",
  secondaryLabel,
  showLockedOverlay = false,
  lockedCtaLabel = "Ver acceso",
}: Props) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.thumbUrl) && !imageFailed;
  const thumbSrc = item.thumbUrl || "";
  const fallbackLabel = item.kind === "sub" ? "Suscripción" : item.kind === "extra" ? "Extra" : "Pack";
  const resolvedSecondaryLabel = secondaryLabel ?? SECONDARY_LABEL_BY_KIND[item.kind];
  const isProfileCompact = variant === "profileCompact";
  const isProfileMinimal = variant === "profileMinimal";

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [item.thumbUrl]);

  return (
    <div
      style={{ contentVisibility: "auto", containIntrinsicSize: "360px 680px", contain: "layout paint" }}
      role={isProfileMinimal ? "button" : undefined}
      tabIndex={isProfileMinimal ? 0 : undefined}
      onClick={
        isProfileMinimal
          ? () => {
              onOpen(item);
            }
          : undefined
      }
      onKeyDown={
        isProfileMinimal
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(item);
              }
            }
          : undefined
      }
      className={`group flex w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[color:rgba(var(--brand-rgb),0.18)]${
        isProfileMinimal ? " cursor-pointer" : ""
      }`}
    >
      <div className={isProfileMinimal ? "p-0" : "px-3 pt-3"}>
        <div
          role={isProfileMinimal ? undefined : "button"}
          tabIndex={isProfileMinimal ? -1 : 0}
          onClick={isProfileMinimal ? undefined : () => onOpen(item)}
          onKeyDown={
            isProfileMinimal
              ? undefined
              : (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(item);
                  }
                }
          }
          aria-label={isProfileMinimal ? undefined : `Abrir ${item.title}`}
          className={`relative w-full overflow-hidden rounded-2xl focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)] ${
            isProfileMinimal
              ? "aspect-[3/4] sm:aspect-[16/10]"
              : isProfileCompact
                ? "h-[180px] sm:h-auto sm:aspect-[3/4] md:aspect-[4/5]"
                : "aspect-[10/13] sm:aspect-[3/4] md:aspect-[4/5]"
          }${isProfileMinimal ? "" : " cursor-pointer"}`}
        >
          {showImage ? (
            <>
              <Image
                src={normalizeImageSrc(thumbSrc)}
                alt={item.title}
                layout="fill"
                objectFit="cover"
                sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                className={`object-cover transition duration-300 group-hover:scale-[1.02] ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                onLoadingComplete={() => setImageLoaded(true)}
                onError={() => {
                  setImageFailed(true);
                  setImageLoaded(true);
                }}
              />
              <Skeleton
                aria-hidden="true"
                className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
                  imageLoaded ? "opacity-0" : "opacity-100"
                }`}
              />
            </>
          ) : isProfileMinimal ? (
            <div className="h-full w-full bg-[color:var(--surface-2)]" />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[color:rgba(10,14,24,0.9)] via-[color:rgba(18,24,38,0.9)] to-[color:rgba(6,9,18,0.95)] text-white/60">
              <div className="absolute inset-0 opacity-60">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_55%)]" />
                <div className="absolute inset-0 animate-pulse bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.16),transparent)]" />
              </div>
              <div className="relative flex flex-col items-center gap-1">
                <Sparkles className="h-6 w-6 text-white/70" aria-hidden="true" />
                <span className="text-[11px] font-semibold text-white/70">{fallbackLabel}</span>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-80 transition duration-200 md:opacity-70 md:group-hover:opacity-90" />
          {!isProfileMinimal && item.priceLabel ? (
            <span className="absolute right-2 top-2 rounded-full border border-[color:rgba(15,23,42,0.4)] bg-[color:rgba(15,23,42,0.7)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
              {item.priceLabel}
            </span>
          ) : null}
          {isProfileMinimal ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2">
              <p className="text-[11px] font-semibold text-white/90 line-clamp-1" title={item.title}>
                {item.title}
              </p>
            </div>
          ) : null}
          {!isProfileMinimal && showLockedOverlay ? (
            <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2">
              <div className="pointer-events-auto flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Bloqueado
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpen(item);
                  }}
                  className="inline-flex h-7 items-center justify-center rounded-full border border-white/15 bg-white/10 px-2.5 text-[10px] font-semibold text-white/90 hover:bg-white/20"
                >
                  {lockedCtaLabel}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {!isProfileMinimal ? (
        <div
          className={`flex flex-col gap-2 border-t border-white/10 bg-[color:rgba(8,12,20,0.85)] px-3 text-white/90 sm:p-4 ${
            isProfileCompact ? "pb-2 pt-2" : "pb-3 pt-3"
          }`}
        >
          <p className="min-h-[32px] text-[12px] font-semibold text-white/90 line-clamp-2 leading-snug">
            {item.title}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <Link
              href={chatHref}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label={primaryLabel}
              title={primaryLabel}
              className="flex w-full"
            >
              <span className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--brand-strong)] bg-[color:var(--brand-strong)] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {primaryLabel}
              </span>
            </Link>
            {detailHref ? (
              <Link
                href={detailHref}
                prefetch={false}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={resolvedSecondaryLabel}
                className="flex w-full"
              >
                <span className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40">
                  {resolvedSecondaryLabel}
                  <span aria-hidden="true">→</span>
                </span>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
