import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { ChevronDown, ChevronUp, MessageCircle, Play, RotateCcw, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent, type WheelEvent } from "react";
import { useAdultGate } from "../../hooks/useAdultGate";
import { emitFollowChange, setFollowSnapshot } from "../../lib/followEvents";
import { useFollowState } from "../../lib/useFollowState";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { formatDistanceKm } from "../../utils/formatDistanceKm";
import { usePopClipFeedContext } from "./PopClipFeedContext";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { FollowButtonLabel } from "../follow/FollowButtonLabel";
import { IconGlyph } from "../ui/IconGlyph";
import { MetaChip } from "../ui/MetaChip";
import { VerifiedInlineBadge } from "../ui/VerifiedInlineBadge";
import { PopClipMediaActions, popClipMediaActionButtonClass } from "./PopClipMediaActions";
import { ServicesSheet } from "./ServicesSheet";
import type { PopClipTileItem } from "./PopClipTile";

const CAPTION_PREVIEW_LIMIT = 140;
const WHEEL_LOCK_MS = 450;
const WHEEL_THRESHOLD = 32;
const SWIPE_THRESHOLD = 60;
const MIN_FOLLOW_MUTATION_MS = 400;
const EMPTY_FEED_IDS: string[] = [];

type Props = {
  open: boolean;
  items: PopClipTileItem[];
  activeIndex: number;
  onOpenChange: (open: boolean) => void;
  onNavigate: (nextIndex: number) => void;
  onToggleSave?: (item: PopClipTileItem) => void;
  isSaved?: (item: PopClipTileItem) => boolean;
  hasLocationCenter?: boolean;
  hasHydrated?: boolean;
  locationActive?: boolean;
  onRequestLocation?: () => void;
  showFollow?: boolean;
  isFollowing?: (item: PopClipTileItem) => boolean;
  onFollowChange?: (creatorId: string, isFollowing: boolean) => void;
  onFollowError?: (message: string) => void;
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
  hasLocationCenter = false,
  hasHydrated = true,
  locationActive,
  onRequestLocation,
  showFollow = false,
  isFollowing,
  onFollowChange,
  onFollowError,
  menuItems,
  buildChatHref,
  buildProfileHref,
}: Props) {
  const router = useRouter();
  const activeItem = items[activeIndex] ?? null;
  const wheelLockRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);
  const touchLastRef = useRef<number | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [menuPortalEl, setMenuPortalEl] = useState<HTMLElement | null>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px) and (pointer: fine)");
  const feedContext = usePopClipFeedContext();
  const resolvedHasHydrated = feedContext?.hasHydrated ?? hasHydrated;
  const resolvedLocationActive = resolvedHasHydrated
    ? feedContext?.locationActive ?? locationActive ?? hasLocationCenter
    : false;
  const requestLocation = feedContext?.onRequestLocation ?? onRequestLocation;
  const canRequestLocation = typeof requestLocation === "function";
  const handleGateCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const { adultOk, openGate, requireAdultGate, modal: adultGateModal } = useAdultGate({
    onCancel: handleGateCancel,
  });

  useEffect(() => {
    setCaptionExpanded(false);
    setServicesOpen(false);
  }, [activeItem?.id]);

  useEffect(() => {
    setHasScrolled(false);
  }, [open, activeItem?.id]);

  useEffect(() => {
    setIsPaused(false);
    setIsEnded(false);
  }, [open, activeItem?.id]);

  useEffect(() => {
    setFollowPending(false);
  }, [activeItem?.creatorId]);

  useEffect(() => {
    if (!open) setServicesOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || !isDesktop) {
      setCanScroll(false);
      return;
    }
    const node = contentScrollRef.current;
    if (!node) {
      setCanScroll(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      const maxScroll = node.scrollHeight - node.clientHeight;
      setCanScroll(maxScroll > 8);
    };
    const scheduleMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [open, activeItem?.id, isDesktop]);

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

  const feedIds = feedContext?.ids ?? EMPTY_FEED_IDS;
  const feedIndex = typeof feedContext?.currentIndex === "number" ? feedContext.currentIndex : activeIndex;
  const showFeedControls = feedIds.length > 1 && feedIndex >= 0;
  const canGoPrev = showFeedControls && feedIndex > 0;
  const canGoNext = showFeedControls && feedIndex < feedIds.length - 1;

  const canNavigate = items.length > 1 && showFeedControls;

  const updateRouteForClip = useCallback(
    (clipId: string) => {
      if (!clipId) return;
      const nextQuery: Record<string, string | string[]> = {};
      Object.entries(router.query).forEach(([key, value]) => {
        if (value === undefined) return;
        nextQuery[key] = value;
      });
      nextQuery.popclip = clipId;
      void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [router]
  );

  const handleNavigate = useCallback(
    (direction: "next" | "prev") => {
      if (!canNavigate) return;
      const delta = direction === "next" ? 1 : -1;
      const nextIndex = activeIndex + delta;
      if (nextIndex < 0 || nextIndex >= items.length) return;
      onNavigate(nextIndex);
      feedContext?.setCurrentIndex(nextIndex);
      if (showFeedControls) {
        const nextId = feedIds[nextIndex] ?? items[nextIndex]?.id ?? "";
        updateRouteForClip(nextId);
      }
    },
    [activeIndex, canNavigate, feedContext, feedIds, items, onNavigate, showFeedControls, updateRouteForClip]
  );

  useEffect(() => {
    if (!open || !showFeedControls) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        handleNavigate("prev");
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        handleNavigate("next");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNavigate, open, showFeedControls]);

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
  const rawVideoUrl = (activeItem?.videoUrl || "").trim();
  const isVideo =
    activeItem?.mediaType === "VIDEO" ||
    activeItem?.assetType === "video" ||
    Boolean(rawVideoUrl);
  const videoSrc = normalizeMediaSrc(rawVideoUrl);
  const showImage = Boolean(previewSrc);
  const captionText = (activeItem?.caption ?? "").trim() || (activeItem?.title ?? "PopClip");
  const isCaptionLong = captionText.length > CAPTION_PREVIEW_LIMIT;
  const visibleCaption = captionExpanded || !isCaptionLong
    ? captionText
    : `${captionText.slice(0, CAPTION_PREVIEW_LIMIT).trimEnd()}…`;
  const resolvedMenuItems = activeItem && menuItems ? menuItems(activeItem) : [];
  const creatorId = (activeItem?.creatorId || "").trim();
  const hasCreatorId = Boolean(creatorId);
  const initialFollowing =
    Boolean(showFollow && activeItem && isFollowing ? isFollowing(activeItem) : false);
  const followState = useFollowState(showFollow ? creatorId : "", { isFollowing: initialFollowing });
  const following = followState.isFollowing;
  const allowLocation = activeItem?.creator?.allowLocation !== false;
  const rawDistance =
    activeItem?.distanceKm ??
    (activeItem as { distance_km?: number | null } | null)?.distance_km ??
    (activeItem as { meta?: { distanceKm?: number | null; distance_km?: number | null } } | null)?.meta
      ?.distanceKm ??
    (activeItem as { meta?: { distanceKm?: number | null; distance_km?: number | null } } | null)?.meta
      ?.distance_km ??
    null;
  const rawLocationLabel =
    activeItem?.creator?.locationLabel ??
    (activeItem as { locationLabel?: string | null } | null)?.locationLabel ??
    (activeItem as { meta?: { locationLabel?: string | null } } | null)?.meta?.locationLabel ??
    "";
  const locationLabel = allowLocation ? rawLocationLabel.trim() : "";
  const hasDistance = Number.isFinite(rawDistance ?? NaN);
  const showDistancePlaceholder =
    allowLocation && locationLabel && !hasDistance && (resolvedLocationActive || !resolvedHasHydrated);
  const distanceLabel =
    allowLocation && hasDistance ? formatDistanceKm(rawDistance as number) : showDistancePlaceholder ? "… km" : "";
  const locationChipLabel = locationLabel ? (
    <span className="inline-flex items-center gap-1">
      <span>📍 {locationLabel} (aprox.)</span>
      {distanceLabel ? (
        <span
          className={clsx(
            "transition-opacity duration-200",
            hasDistance ? "opacity-100" : "opacity-60"
          )}
        >
          · {distanceLabel}
        </span>
      ) : null}
    </span>
  ) : null;
  const showActivateLocation = allowLocation && locationLabel && resolvedHasHydrated && !resolvedLocationActive && canRequestLocation;
  const availableLabel = activeItem?.creator?.isAvailable ? "Disponible" : "";
  const responseLabel = (activeItem?.creator?.responseTime || "").trim();
  const chipEntries: Array<{ key: string; label?: ReactNode; node?: ReactNode }> = [
    ...(availableLabel ? [{ key: "available", label: availableLabel }] : []),
    ...(responseLabel ? [{ key: "response", label: responseLabel }] : []),
    ...(locationChipLabel ? [{ key: "location", label: locationChipLabel }] : []),
    ...(showActivateLocation
      ? [
          {
            key: "activate-location",
            node: (
              <button
                type="button"
                onClick={() => requestLocation?.()}
                aria-label="Activa ubicación"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90 hover:bg-white/15"
              >
                Activa ubicación
              </button>
            ),
          },
        ]
      : []),
  ];
  const serviceTags = normalizeServiceTags(activeItem?.creator?.offerTags);
  const visibleServiceTags = serviceTags.slice(0, 3);
  const hiddenServiceCount = Math.max(0, serviceTags.length - visibleServiceTags.length);
  const serviceChipClassName =
    "inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--text)]";
  const requiresAdultGate = Boolean(activeItem?.isSensitive || activeItem?.creator?.isAdult);
  const showScrollHint = isDesktop && canScroll && !hasScrolled;
  const showVideoOverlay = isVideo && (isPaused || isEnded) && (!requiresAdultGate || adultOk);

  useEffect(() => {
    if (!open || !requiresAdultGate || adultOk) return;
    openGate();
  }, [adultOk, open, openGate, requiresAdultGate]);

  useEffect(() => {
    if (!open || !isVideo || !videoSrc || (requiresAdultGate && !adultOk)) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.muted = true;
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => null);
    }
    return () => {
      videoEl.pause();
      videoEl.currentTime = 0;
    };
  }, [open, activeItem?.id, adultOk, isVideo, requiresAdultGate, videoSrc]);

  useEffect(() => {
    if (open) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.pause();
    videoEl.currentTime = 0;
  }, [open]);

  const handleVideoToggle = () => {
    if (!canShowVideo) {
      if (requiresAdultGate) openGate();
      return;
    }
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.paused) {
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => null);
      }
    } else {
      videoEl.pause();
    }
  };

  const handleVideoOverlayClick = () => {
    if (!canShowVideo) {
      if (requiresAdultGate) openGate();
      return;
    }
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (isEnded) {
      videoEl.currentTime = 0;
    }
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => null);
    }
  };

  const handleToggleFollow = async () => {
    if (!showFollow || !hasCreatorId || followPending) return;
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

  if (!open || !activeItem) return null;

  const canViewMedia = !requiresAdultGate || adultOk;
  const canShowVideo = isVideo && videoSrc && canViewMedia;
  const showSensitiveOverlay = requiresAdultGate && !adultOk;
  const isClipSaved = isSaved ? isSaved(activeItem) : false;
  const handleClose = () => onOpenChange(false);
  const chatHref = buildChatHref(activeItem);
  const profileHref = buildProfileHref(activeItem);

  const navigateFromViewer = (href: string) => {
    if (!href) return;
    handleClose();
    if (typeof window === "undefined") {
      void router.push(href);
      return;
    }
    window.requestAnimationFrame(() => {
      void router.push(href);
    });
  };

  const handleProfileClick = () => {
    if (!profileHref) return;
    const go = () => {
      if (typeof window === "undefined") {
        void router.push(profileHref);
        return;
      }
      window.requestAnimationFrame(() => {
        void router.push(profileHref);
      });
    };
    if (requiresAdultGate) {
      requireAdultGate(go);
      return;
    }
    go();
  };

  const handleChatClick = () => {
    if (!chatHref) return;
    if (requiresAdultGate) {
      requireAdultGate(() => {
        navigateFromViewer(chatHref);
      });
      return;
    }
    navigateFromViewer(chatHref);
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          />
          <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 lg:items-center lg:p-6 pointer-events-none">
            <Dialog.Content
              role="dialog"
              aria-label={`PopClip de @${activeItem.creator.handle}`}
              onWheel={handleWheel}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="pointer-events-auto relative flex h-screen min-h-screen h-[100dvh] min-h-[100dvh] w-full max-h-[100dvh] flex-col bg-[color:var(--surface-1)] text-[color:var(--text)] lg:h-auto lg:max-h-[90vh] lg:w-[min(92vw,430px)] lg:rounded-3xl lg:border lg:border-[color:var(--surface-border)] lg:shadow-2xl [--bottom-nav-h:72px] xl:[--bottom-nav-h:0px]"
            >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex-shrink-0 px-4 pt-5 lg:px-5 lg:pt-5">
                <div className="relative aspect-[9/16] w-full max-h-[70dvh] overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
                  {canShowVideo ? (
                    <video
                      ref={videoRef}
                      src={videoSrc}
                      poster={showImage ? normalizeImageSrc(previewSrc) : undefined}
                      muted
                      playsInline
                      loop
                      autoPlay
                      preload="metadata"
                      controls={false}
                      onClick={handleVideoToggle}
                      onPlay={() => {
                        setIsPaused(false);
                        setIsEnded(false);
                      }}
                      onPause={() => {
                        const ended = videoRef.current?.ended ?? false;
                        setIsEnded(ended);
                        setIsPaused(!ended);
                      }}
                      onEnded={() => {
                        setIsEnded(true);
                        setIsPaused(false);
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : showImage ? (
                    <Image
                      src={normalizeImageSrc(previewSrc)}
                      alt={activeItem.title?.trim() || "PopClip"}
                      layout="fill"
                      objectFit="cover"
                      sizes="(max-width: 1024px) 100vw, 430px"
                      className={`object-cover${showSensitiveOverlay ? " blur-sm scale-105" : ""}`}
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
                  {showSensitiveOverlay ? (
                    <button
                      type="button"
                      onClick={openGate}
                      className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 text-white/90 backdrop-blur-sm"
                    >
                      <span className="rounded-full border border-white/30 bg-black/50 px-4 py-2 text-[11px] font-semibold">
                        Confirmar 18+ para ver
                      </span>
                    </button>
                  ) : null}
                  {showVideoOverlay ? (
                    <button
                      type="button"
                      aria-label={isEnded ? "Repetir" : "Reproducir"}
                      onClick={handleVideoOverlayClick}
                      className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 text-white/90 backdrop-blur-sm transition-opacity"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/60 shadow-lg">
                        {isEnded ? (
                          <RotateCcw className="h-6 w-6" aria-hidden="true" />
                        ) : (
                          <Play className="ml-0.5 h-6 w-6" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  ) : null}
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Cerrar"
                      className={clsx(popClipMediaActionButtonClass, "absolute left-3 top-3 z-30")}
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
              </div>
              <div
                ref={contentScrollRef}
                onScroll={() => {
                  if (!hasScrolled && (contentScrollRef.current?.scrollTop ?? 0) > 2) {
                    setHasScrolled(true);
                  }
                }}
                className="relative min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom)+var(--bottom-nav-h,0px))] pt-4 lg:px-5 lg:pb-5 lg:pt-5 lg:[scrollbar-width:thin] lg:[&::-webkit-scrollbar]:w-1.5 lg:[&::-webkit-scrollbar-thumb]:bg-white/20 lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-track]:bg-transparent"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[color:var(--text)]">
                          @{activeItem.creator.handle}
                        </span>
                        {activeItem.creator.isVerified ? (
                          <VerifiedInlineBadge collapseAt="lg" className="shrink-0" />
                        ) : null}
                      </div>
                      {showFollow && hasCreatorId ? (
                        <button
                          type="button"
                          onClick={handleToggleFollow}
                          disabled={followPending}
                          aria-pressed={following}
                          aria-label={following ? "Dejar de seguir" : "Seguir"}
                          className={clsx(
                            "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition",
                            following
                              ? "border-[color:var(--brand-strong)] bg-[color:var(--brand-strong)] text-white hover:bg-[color:var(--brand)]"
                              : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-3)]",
                            followPending && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          <FollowButtonLabel
                            isFollowing={following}
                            isPending={followPending}
                            followLabel="Seguir"
                            followingLabel="Siguiendo"
                          />
                        </button>
                      ) : null}
                    </div>
                    {chipEntries.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-white/80">
                        {chipEntries.map((entry) =>
                          entry.node ? (
                            <span key={entry.key}>{entry.node}</span>
                          ) : (
                            <MetaChip key={entry.key} label={entry.label ?? ""} />
                          )
                        )}
                      </div>
                    ) : null}
                    {serviceTags.length > 0 ? (
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-[color:var(--muted)]">
                        <span className="shrink-0">Servicios</span>
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
                          {visibleServiceTags.map((tag, index) => (
                            <span
                              key={`${tag}-${index}`}
                              className={serviceChipClassName}
                              aria-label={`Servicio: ${tag}`}
                              title={tag}
                            >
                              <span className="max-w-[120px] truncate">{tag}</span>
                            </span>
                          ))}
                          {hiddenServiceCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setServicesOpen(true)}
                              className={serviceChipClassName}
                              aria-label={`Ver ${hiddenServiceCount} servicios más`}
                              title={`Ver ${hiddenServiceCount} servicios más`}
                            >
                              +{hiddenServiceCount}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
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
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleChatClick}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--brand-strong)] bg-[color:var(--brand-strong)] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
                    >
                      <span className="inline-flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        <span>Abrir chat</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleProfileClick}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 text-[12px] font-semibold text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="truncate">Ver perfil</span>
                        <span aria-hidden="true">→</span>
                      </span>
                    </button>
                  </div>
                </div>
                {showScrollHint ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0">
                    <div className="h-12 w-full bg-gradient-to-t from-[color:var(--surface-1)] to-transparent opacity-90" />
                    <div className="absolute inset-x-0 bottom-3 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-[color:var(--muted)] opacity-80">
                        Desliza
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {showFeedControls ? (
              <div className="pointer-events-auto absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2">
                <button
                  type="button"
                  aria-label="PopClip anterior"
                  onClick={() => handleNavigate("prev")}
                  disabled={!canGoPrev}
                  className={clsx(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full border bg-[color:rgba(0,0,0,0.45)] text-white/90 shadow-lg backdrop-blur-sm transition",
                    canGoPrev
                      ? "border-white/20 hover:bg-[color:rgba(0,0,0,0.6)]"
                      : "border-white/10 opacity-40 cursor-not-allowed"
                  )}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="PopClip siguiente"
                  onClick={() => handleNavigate("next")}
                  disabled={!canGoNext}
                  className={clsx(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full border bg-[color:rgba(0,0,0,0.45)] text-white/90 shadow-lg backdrop-blur-sm transition",
                    canGoNext
                      ? "border-white/20 hover:bg-[color:rgba(0,0,0,0.6)]"
                      : "border-white/10 opacity-40 cursor-not-allowed"
                  )}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}
            <div ref={setMenuPortalRef} className="contents" />
          </Dialog.Content>
            <ServicesSheet open={servicesOpen} onOpenChange={setServicesOpen} tags={serviceTags} />
          </div>
        </Dialog.Portal>
      </Dialog.Root>
      {adultGateModal}
    </>
  );
}

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

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element instanceof HTMLInputElement) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (element.isContentEditable) return true;
  return Boolean(element.closest('[contenteditable="true"]'));
}

function normalizeMediaSrc(src?: string | null): string {
  const trimmed = (src || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function normalizeServiceTags(value?: string[] | null): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => Boolean(tag));
}
