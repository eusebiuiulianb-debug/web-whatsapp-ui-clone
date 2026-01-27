import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { MessageCircle, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { Skeleton } from "../ui/Skeleton";
import { IconGlyph } from "../ui/IconGlyph";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { emitFollowChange, setFollowSnapshot } from "../../lib/followEvents";
import { useFollowState } from "../../lib/useFollowState";
import { FollowButtonLabel } from "../follow/FollowButtonLabel";
import { VerifiedInlineBadge } from "../ui/VerifiedInlineBadge";
import { PopClipMediaActions, popClipMediaActionButtonClass } from "./PopClipMediaActions";

export type PopClipTileItem = {
  id: string;
  creatorId?: string;
  title?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  previewImageUrl?: string | null;
  savesCount?: number | null;
  distanceKm?: number | null;
  creator: {
    handle: string;
    displayName: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    isPro?: boolean;
    vipEnabled?: boolean;
    isAvailable?: boolean;
    responseTime?: string | null;
    locationLabel?: string | null;
    allowLocation?: boolean;
  };
};

type Props = {
  item: PopClipTileItem;
  onOpen: (item: PopClipTileItem) => void;
  profileHref: string;
  chatHref: string;
  variant?: "explore" | "profileCompact" | "profileMinimal";
  secondaryCta?: {
    label: string;
    href?: string;
    ariaLabel?: string;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  } | null;
  followButtonVariant?: "primary" | "secondary";
  isFollowing?: boolean;
  onFollowChange?: (creatorId: string, isFollowing: boolean) => void;
  onFollowError?: (message: string) => void;
  isSaved?: boolean;
  onToggleSave?: (item: PopClipTileItem) => void;
  onOrganize?: (savedItemId: string, collectionId: string | null) => void;
  organizerItemId?: string | null;
  organizerCollectionId?: string | null;
  onOpenCaption?: (item: PopClipTileItem) => void;
  onCopyLink?: (item: PopClipTileItem) => void;
  onShare?: (item: PopClipTileItem) => void;
  onReport?: (item: PopClipTileItem) => void;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQueryList = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQueryList.matches);
    updateMatch();
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener("change", updateMatch);
      return () => mediaQueryList.removeEventListener("change", updateMatch);
    }
    mediaQueryList.addListener(updateMatch);
    return () => mediaQueryList.removeListener(updateMatch);
  }, [query]);

  return matches;
}

export const PopClipTile = memo(function PopClipTile({
  item,
  onOpen,
  profileHref,
  chatHref,
  variant = "explore",
  secondaryCta,
  followButtonVariant = "primary",
  isFollowing = false,
  onFollowChange,
  onFollowError,
  isSaved = false,
  onToggleSave,
  onOrganize,
  organizerItemId,
  organizerCollectionId,
  onCopyLink,
  onShare,
  onReport,
}: Props) {
  const isProfileCompact = variant === "profileCompact";
  const isProfileMinimal = variant === "profileMinimal";
  const showHeader = !isProfileCompact && !isProfileMinimal;
  const [thumbFailed, setThumbFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const creatorId = (item.creatorId || "").trim();
  const hasCreatorId = Boolean(creatorId);
  const followState = useFollowState(creatorId, { isFollowing });
  const following = followState.isFollowing;
  const [followPending, setFollowPending] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false);
  const [isCaptionOpen, setIsCaptionOpen] = useState(false);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const captionPanelRef = useRef<HTMLDivElement | null>(null);
  const captionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const title = item.title?.trim() || "PopClip";
  const caption = (item.caption ?? "").trim();
  const previewSrc = item.thumbnailUrl || item.posterUrl || item.previewImageUrl || "";
  const showImage = Boolean(previewSrc) && !thumbFailed;
  const avatarSrc = item.creator.avatarUrl || "";
  const showAvatar = Boolean(avatarSrc) && !avatarFailed;
  const CAPTION_PREVIEW_LIMIT = 80;
  const hasCaption = caption.length > 0;
  const isCaptionLong = caption.length > CAPTION_PREVIEW_LIMIT;
  const showCaptionMore = isCaptionLong;
  const captionPreview = isCaptionLong ? caption.slice(0, CAPTION_PREVIEW_LIMIT).trimEnd() : caption;
  const captionOverlayText = isCaptionLong ? `${captionPreview}…` : captionPreview;
  const showCaption = hasCaption;
  const allowLocation = item.creator.allowLocation !== false;
  const availableLabel = item.creator.isAvailable ? "Disponible" : "";
  const responseLabel = (item.creator.responseTime || "").trim();
  const locationLabel = allowLocation ? (item.creator.locationLabel || "").trim() : "";
  const distanceLabel =
    allowLocation && Number.isFinite(item.distanceKm ?? NaN)
      ? `≈${Math.round(item.distanceKm as number)} km`
      : "";
  const locationChipLabel = locationLabel ? `📍 ${locationLabel} (aprox.)` : "";
  const chipItems = [availableLabel, responseLabel, distanceLabel, locationChipLabel].filter(Boolean);
  const isDesktopLg = useMediaQuery("(min-width: 1024px)");
  const isTabletUp = useMediaQuery("(min-width: 768px)");
  const maxChips = isDesktopLg ? 3 : isTabletUp ? 4 : 5;
  const visibleChips = chipItems.slice(0, maxChips);
  const hiddenChips = chipItems.slice(maxChips);
  const hiddenCount = hiddenChips.length;
  const chipItemsTitle = chipItems.join(" • ");
  const overflowChipClass =
    "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[11px] leading-none font-medium text-white/90 min-w-[44px] shrink-0";
  const creatorInitial = item.creator.displayName?.trim()?.[0]?.toUpperCase() || "C";
  const quickActions: ContextMenuItem[] = [];
  const canOrganize = Boolean(isSaved && onOrganize && organizerItemId);
  const canToggleSave = Boolean(isSaved && onToggleSave);
  const hasSavedActions = canOrganize || canToggleSave;
  const MIN_FOLLOW_MUTATION_MS = 400;
  const resolvedSecondaryCta =
    secondaryCta === undefined
      ? {
          label: "Ver perfil",
          href: profileHref,
        }
      : secondaryCta;
  const followButtonBaseClass =
    followButtonVariant === "secondary"
      ? "inline-flex h-10 min-w-[110px] items-center justify-center rounded-full border px-4 text-[12px] font-semibold transition duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--surface-1)]"
      : "inline-flex min-w-[84px] items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold transition duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--surface-1)]";
  const followButtonStateClass = following
    ? "border-[color:var(--brand-strong)] bg-[color:var(--brand-strong)] text-white hover:bg-[color:var(--brand)]"
    : followButtonVariant === "secondary"
      ? "border-white/20 bg-white/5 text-white/90 hover:bg-white/10"
      : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-3)]";
  if (canOrganize && organizerItemId && onOrganize) {
    quickActions.push({
      label: "Mover a...",
      icon: "folder",
      onClick: () => onOrganize(organizerItemId, organizerCollectionId ?? null),
    });
  }
  if (canToggleSave && onToggleSave) {
    quickActions.push({
      label: "Quitar de guardados",
      icon: "alert",
      danger: true,
      onClick: () => onToggleSave(item),
    });
  }
  if (hasSavedActions && (onCopyLink || onShare || onReport)) {
    quickActions.push({ label: "divider", divider: true });
  }
  if (onCopyLink) {
    quickActions.push({ label: "Copiar link", icon: "link", onClick: () => onCopyLink(item) });
  }
  if (onShare) {
    quickActions.push({ label: "Compartir", icon: "send", onClick: () => onShare(item) });
  }
  if (onReport) {
    if (quickActions.length > 0) quickActions.push({ label: "divider", divider: true });
    quickActions.push({
      label: "Reportar",
      icon: "alert",
      onClick: () => onReport(item),
      danger: true,
    });
  }

  useEffect(() => {
    if (!showCaptionMore && isCaptionOpen) setIsCaptionOpen(false);
  }, [showCaptionMore, isCaptionOpen]);

  useEffect(() => {
    setImageLoaded(false);
  }, [previewSrc]);

  useEffect(() => {
    if (!isCaptionOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (captionPanelRef.current?.contains(target)) return;
      if (captionTriggerRef.current?.contains(target)) return;
      setIsCaptionOpen(false);
      if (mediaContainerRef.current?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCaptionOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCaptionOpen]);

  useEffect(() => {
    if (hiddenCount === 0 && chipsOpen) setChipsOpen(false);
  }, [chipsOpen, hiddenCount]);

  const handleToggleFollow = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasCreatorId || followPending) return;
    const prevFollowing = following;
    const nextFollowing = !prevFollowing;
    const startTime = Date.now();
    emitFollowChange(creatorId, { isFollowing: nextFollowing, updatedAt: startTime });
    setFollowPending(true);
    try {
      const res = await fetch("/api/follow/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId }),
      });
      if (res.status === 401) throw new Error("AUTH_REQUIRED");
      if (!res.ok) throw new Error("request failed");
      const payload = (await res.json().catch(() => null)) as
        | { isFollowing?: boolean; following?: boolean; followersCount?: number }
        | null;
      const resolvedFollowing =
        typeof payload?.isFollowing === "boolean"
          ? payload.isFollowing
          : typeof payload?.following === "boolean"
          ? payload.following
          : nextFollowing;
      const resolvedFollowersCount =
        typeof payload?.followersCount === "number" && Number.isFinite(payload.followersCount)
          ? payload.followersCount
          : undefined;
      const resolvedAt = Math.max(Date.now(), startTime + 1);
      onFollowChange?.(creatorId, resolvedFollowing);
      emitFollowChange(creatorId, {
        isFollowing: resolvedFollowing,
        followersCount: resolvedFollowersCount,
        updatedAt: resolvedAt,
      });
      setFollowSnapshot(creatorId, {
        isFollowing: resolvedFollowing,
        followersCount: resolvedFollowersCount,
        updatedAt: resolvedAt,
      });
    } catch (err) {
      emitFollowChange(creatorId, {
        isFollowing: prevFollowing,
        updatedAt: Math.max(Date.now(), startTime + 1),
      });
      if (err instanceof Error && err.message === "AUTH_REQUIRED") {
        onFollowError?.("Inicia sesion para seguir.");
      } else {
        onFollowError?.("No se pudo actualizar el seguimiento.");
      }
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_FOLLOW_MUTATION_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_FOLLOW_MUTATION_MS - elapsed));
      }
      setFollowPending(false);
    }
  };

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
      className={clsx(
        "group flex w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[color:rgba(var(--brand-rgb),0.18)]",
        isProfileMinimal && "cursor-pointer"
      )}
    >
      {showHeader ? (
        <div className="flex items-center justify-between gap-3 px-3 pt-3">
          <Link
            href={profileHref}
            prefetch={false}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={`Ver perfil de @${item.creator.handle}`}
            className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1.5 text-[color:var(--text)] transition hover:bg-[color:var(--surface-3)]"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
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
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-[color:var(--text)]">
                    {creatorInitial}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-xs font-semibold text-[color:var(--text)]">
                  @{item.creator.handle}
                </span>
                {item.creator.isVerified ? (
                  <VerifiedInlineBadge collapseAt="lg" className="shrink-0" />
                ) : null}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {hasCreatorId ? (
            <button
              type="button"
              aria-pressed={following}
              aria-label={following ? "Dejar de seguir" : "Seguir creador"}
              disabled={followPending}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleToggleFollow}
              onKeyDown={(event) => event.stopPropagation()}
              className={clsx(followButtonBaseClass, followButtonStateClass)}
            >
              <FollowButtonLabel isFollowing={following} isPending={followPending} />
            </button>
          ) : null}
          </div>
        </div>
      ) : null}
      <div className={isProfileMinimal ? "p-0" : clsx("px-3", isProfileCompact ? "pt-3" : "pt-2")}>
        <div
          ref={mediaContainerRef}
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
          aria-label={isProfileMinimal ? undefined : `Abrir ${title}`}
          className={clsx(
            "relative w-full overflow-hidden rounded-2xl focus:outline-none focus:ring-1 focus:ring-[color:var(--ring)]",
            isProfileMinimal
              ? "aspect-[3/4]"
              : isProfileCompact
                ? "h-[180px] sm:h-auto sm:aspect-[3/4] md:aspect-[4/5]"
                : "aspect-[10/13] sm:aspect-[3/4] md:aspect-[4/5]",
            !isProfileMinimal && "cursor-pointer"
          )}
        >
          {showHeader ? (
            <PopClipMediaActions
              isSaved={isSaved}
              onToggleSave={onToggleSave ? () => onToggleSave(item) : undefined}
              menu={
                quickActions.length > 0 ? (
                  <ContextMenu
                    buttonAriaLabel="Acciones rápidas"
                    items={quickActions}
                    align="right"
                    closeOnScroll
                    menuClassName="min-w-[160px] w-[min(90vw,220px)]"
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
          ) : null}
          {showImage ? (
            <>
              <Image
                src={normalizeImageSrc(previewSrc)}
                alt={title}
                layout="fill"
                objectFit="cover"
                sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                className={clsx(
                  "object-cover transition duration-300 group-hover:scale-[1.02]",
                  imageLoaded ? "opacity-100" : "opacity-0"
                )}
                onLoadingComplete={() => setImageLoaded(true)}
                onError={() => {
                  setThumbFailed(true);
                  setImageLoaded(true);
                }}
              />
              <Skeleton
                aria-hidden="true"
                className={clsx(
                  "absolute inset-0 h-full w-full transition-opacity duration-300",
                  imageLoaded ? "opacity-0" : "opacity-100"
                )}
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
                <span className="text-[11px] font-semibold text-white/70">PopClip</span>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-80 transition duration-200 md:opacity-70 md:group-hover:opacity-90" />
          {isProfileMinimal ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2">
              <p className="text-[11px] font-semibold text-white/90 line-clamp-1" title={title}>
                {title}
              </p>
            </div>
          ) : showCaption && (!showCaptionMore || !isCaptionOpen) ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 min-h-[44px] bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 transition">
              <div className="pointer-events-auto text-[11px] text-white/90">
                <p className="min-h-[28px] line-clamp-2 leading-snug md:line-clamp-1">
                  {captionOverlayText}
                </p>
                {showCaptionMore ? (
                  <button
                    ref={captionTriggerRef}
                    type="button"
                    aria-label="Ver más"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsCaptionOpen((prev) => !prev);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsCaptionOpen((prev) => !prev);
                      }
                    }}
                    className="mt-1 text-[11px] font-semibold text-white/80 underline decoration-white/40 underline-offset-2 transition hover:text-white focus:outline-none focus:ring-1 focus:ring-white/50"
                  >
                    Ver más
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {!isProfileMinimal && showCaptionMore && isCaptionOpen ? (
            <div
              ref={captionPanelRef}
              role="dialog"
              aria-label="Descripción"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex max-h-[45%] flex-col rounded-xl border border-white/10 bg-black/70 p-3 text-[11px] text-white/90 shadow-xl backdrop-blur-sm"
            >
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-white/80">
                <span>Descripción</span>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsCaptionOpen(false);
                  }}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-white/80 hover:bg-white/10"
                >
                  X
                </button>
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                <p className="whitespace-pre-wrap leading-snug">{caption}</p>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  aria-label="Ver menos"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsCaptionOpen(false);
                  }}
                  className="text-[11px] font-semibold text-white/80 underline decoration-white/40 underline-offset-2 transition hover:text-white"
                >
                  Ver menos
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!isProfileMinimal ? (
        <div
          className={clsx(
            "flex flex-col gap-2 border-t border-white/10 bg-[color:rgba(8,12,20,0.85)] px-3 text-white/90 sm:p-4",
            isProfileCompact ? "pb-2 pt-2" : "pb-3 pt-3"
          )}
        >
          {chipItems.length > 0 ? (
            <div className="relative flex flex-wrap items-center gap-2">
              {visibleChips.map((badge, index) => (
                <span
                  key={`${badge}-${index}`}
                  className="whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/90"
                >
                  {badge}
                </span>
              ))}
              {hiddenCount > 0 ? (
                <>
                  {isTabletUp ? (
                    <Popover.Root open={chipsOpen} onOpenChange={setChipsOpen}>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          aria-label={`Ver ${hiddenCount} etiquetas más`}
                          title={chipItemsTitle}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.stopPropagation();
                            }
                          }}
                          className={overflowChipClass}
                        >
                          +{hiddenCount}
                          <span className="hidden md:inline">&nbsp;más</span>
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          side="top"
                          align="end"
                          sideOffset={8}
                          collisionPadding={12}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          className="z-50 max-h-[180px] w-[min(90vw,280px)] overflow-auto rounded-xl border border-white/10 bg-[color:rgba(8,12,20,0.95)] p-3 shadow-xl"
                        >
                          <div className="flex flex-wrap gap-2">
                            {hiddenChips.map((badge, index) => (
                              <span
                                key={`${badge}-${index}`}
                                className="whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/90"
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  ) : (
                    <Dialog.Root open={chipsOpen} onOpenChange={setChipsOpen}>
                      <Dialog.Trigger asChild>
                        <button
                          type="button"
                          aria-label={`Ver ${hiddenCount} etiquetas más`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.stopPropagation();
                            }
                          }}
                          className={overflowChipClass}
                        >
                          +{hiddenCount}
                          <span className="hidden md:inline">&nbsp;más</span>
                        </button>
                      </Dialog.Trigger>
                      <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                        <Dialog.Content
                          role="dialog"
                          aria-label="Etiquetas"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] w-full overflow-auto rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
                        >
                          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Etiquetas</p>
                            <Dialog.Close asChild>
                              <button
                                type="button"
                                aria-label="Cerrar"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                              >
                                ✕
                              </button>
                            </Dialog.Close>
                          </div>
                          <div className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              {hiddenChips.map((badge, index) => (
                                <span
                                  key={`${badge}-${index}`}
                                  className="whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/90"
                                >
                                  {badge}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <Link
              href={chatHref}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label="Abrir chat"
              title="Abrir chat"
              className="flex w-full"
            >
              <span className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--brand-strong)] bg-[color:var(--brand-strong)] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Abrir chat
              </span>
            </Link>
            {resolvedSecondaryCta ? (
              resolvedSecondaryCta.href ? (
                <Link
                  href={resolvedSecondaryCta.href}
                  prefetch={false}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={resolvedSecondaryCta.ariaLabel || resolvedSecondaryCta.label}
                  className="flex w-full"
                >
                  <span className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40">
                    {resolvedSecondaryCta.label}
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  aria-label={resolvedSecondaryCta.ariaLabel || resolvedSecondaryCta.label}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    resolvedSecondaryCta.onClick?.(event);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
                >
                  {resolvedSecondaryCta.label}
                  <span aria-hidden="true">→</span>
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});
