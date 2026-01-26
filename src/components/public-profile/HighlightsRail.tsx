import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Skeleton } from "../ui/Skeleton";

type RailItem = {
  id: string;
  node: ReactNode;
};

type Props = {
  items?: RailItem[];
  isLoading?: boolean;
  skeletonCount?: number;
  showViewAll?: boolean;
  viewAllLabel?: string;
  viewAllCount?: number;
  onViewAll?: () => void;
  tileWidthClass?: string;
  tileAspectClass?: string;
  maxWidthClass?: string;
  showTrack?: boolean;
  trackClassName?: string;
};

const DEFAULT_TILE_WIDTH = "w-[clamp(150px,18vw,220px)]";
const DEFAULT_TILE_ASPECT = "aspect-[3/4]";
const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function HighlightsRail({
  items = [],
  isLoading = false,
  skeletonCount = 4,
  showViewAll = false,
  viewAllLabel = "Ver todo",
  viewAllCount,
  onViewAll,
  tileWidthClass = DEFAULT_TILE_WIDTH,
  tileAspectClass = DEFAULT_TILE_ASPECT,
  maxWidthClass = "max-w-[960px]",
  showTrack = true,
  trackClassName = "hidden md:block",
}: Props) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startThumbLeft: number;
    maxThumbLeft: number;
    scrollMax: number;
  } | null>(null);
  const [scrollState, setScrollState] = useState({
    show: false,
    thumbWidth: 0,
    thumbLeft: 0,
    scrollLeft: 0,
    scrollMax: 0,
  });
  const [dragging, setDragging] = useState(false);

  const updateScrollState = useCallback(() => {
    const container = railRef.current;
    if (!container) {
      setScrollState((prev) =>
        prev.show ? { show: false, thumbWidth: 0, thumbLeft: 0, scrollLeft: 0, scrollMax: 0 } : prev
      );
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const scrollMax = Math.max(0, scrollWidth - clientWidth);
    if (scrollMax <= 1) {
      setScrollState((prev) =>
        prev.show ? { show: false, thumbWidth: 0, thumbLeft: 0, scrollLeft: 0, scrollMax: 0 } : prev
      );
      return;
    }
    const trackWidth = trackRef.current?.clientWidth || clientWidth;
    if (!trackWidth) {
      setScrollState((prev) =>
        prev.show ? { show: false, thumbWidth: 0, thumbLeft: 0, scrollLeft: 0, scrollMax: 0 } : prev
      );
      return;
    }
    const rawThumbWidth = trackWidth * (clientWidth / scrollWidth);
    const thumbWidth = clampValue(rawThumbWidth, 28, Math.min(72, trackWidth));
    const maxLeft = Math.max(0, trackWidth - thumbWidth);
    const thumbLeft = maxLeft > 0 ? (scrollLeft / scrollMax) * maxLeft : 0;
    setScrollState((prev) => {
      if (
        prev.show &&
        Math.abs(prev.thumbWidth - thumbWidth) < 0.5 &&
        Math.abs(prev.thumbLeft - thumbLeft) < 0.5 &&
        Math.abs(prev.scrollLeft - scrollLeft) < 0.5 &&
        Math.abs(prev.scrollMax - scrollMax) < 0.5
      ) {
        return prev;
      }
      return { show: true, thumbWidth, thumbLeft, scrollLeft, scrollMax };
    });
  }, []);

  const scheduleScrollUpdate = useCallback(() => {
    if (typeof window === "undefined") return;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateScrollState();
    });
  }, [updateScrollState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = railRef.current;
    if (!container) return;
    const handleScroll = () => scheduleScrollUpdate();
    const handleResize = () => scheduleScrollUpdate();
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    scheduleScrollUpdate();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scheduleScrollUpdate]);

  useEffect(() => {
    scheduleScrollUpdate();
  }, [items.length, isLoading, showViewAll, scheduleScrollUpdate]);

  const handleTrackPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = railRef.current;
    const track = trackRef.current;
    if (!container || !track) return;
    const scrollMax = Math.max(0, container.scrollWidth - container.clientWidth);
    if (scrollMax <= 0) return;
    const trackRect = track.getBoundingClientRect();
    const trackWidth = trackRect.width;
    if (!trackWidth) return;
    const rawThumbWidth = trackWidth * (container.clientWidth / container.scrollWidth);
    const thumbWidth = clampValue(rawThumbWidth, 28, Math.min(72, trackWidth));
    const maxLeft = Math.max(0, trackWidth - thumbWidth);
    const targetLeft = clampValue(event.clientX - trackRect.left - thumbWidth / 2, 0, maxLeft);
    const ratio = maxLeft > 0 ? targetLeft / maxLeft : 0;
    container.scrollTo({ left: ratio * scrollMax, behavior: "smooth" });
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleThumbPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = railRef.current;
    const track = trackRef.current;
    if (!container || !track) return;
    const scrollMax = Math.max(0, container.scrollWidth - container.clientWidth);
    if (scrollMax <= 0) return;
    const trackRect = track.getBoundingClientRect();
    const trackWidth = trackRect.width;
    if (!trackWidth) return;
    const rawThumbWidth = trackWidth * (container.clientWidth / container.scrollWidth);
    const thumbWidth = clampValue(rawThumbWidth, 28, Math.min(72, trackWidth));
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
    const startThumbLeft = maxThumbLeft > 0 ? (container.scrollLeft / scrollMax) * maxThumbLeft : 0;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startThumbLeft,
      maxThumbLeft,
      scrollMax,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleThumbPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const container = railRef.current;
    if (!container) return;
    const deltaX = event.clientX - dragState.startX;
    const nextThumbLeft = clampValue(dragState.startThumbLeft + deltaX, 0, dragState.maxThumbLeft);
    const ratio = dragState.maxThumbLeft > 0 ? nextThumbLeft / dragState.maxThumbLeft : 0;
    container.scrollLeft = ratio * dragState.scrollMax;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleThumbPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const shouldRenderViewAll = Boolean(showViewAll && onViewAll);
  const shouldRenderRail = isLoading || items.length > 0 || shouldRenderViewAll;
  if (!shouldRenderRail) return null;

  return (
    <div className={clsx("relative w-full", maxWidthClass)}>
      <div
        ref={railRef}
        className="no-scrollbar flex flex-nowrap gap-3 overflow-x-auto pb-2 pr-4 scroll-pr-4 snap-x snap-mandatory scroll-smooth"
        style={dragging ? { scrollSnapType: "none", scrollBehavior: "auto" } : undefined}
      >
        {isLoading
          ? Array.from({ length: skeletonCount }).map((_, idx) => (
              <Skeleton
                key={`rail-skeleton-${idx}`}
                className={`${tileAspectClass} ${tileWidthClass} shrink-0 snap-start rounded-2xl`}
              />
            ))
          : items.map(({ id, node }) => (
              <div key={id} className={`${tileWidthClass} shrink-0 snap-start`}>
                {node}
              </div>
            ))}
        {!isLoading && shouldRenderViewAll ? (
          <div className={`${tileWidthClass} shrink-0 snap-start`}>
            <button
              type="button"
              onClick={onViewAll}
              className={`relative ${tileAspectClass} w-full overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[color:rgba(10,14,24,0.9)] via-[color:rgba(18,24,38,0.9)] to-[color:rgba(6,9,18,0.95)]" />
              <div className="relative flex h-full flex-col items-center justify-center gap-0.5 px-2 text-white/90">
                <span className="text-center text-[11px] font-semibold">{viewAllLabel}</span>
                {typeof viewAllCount === "number" && viewAllCount > 0 ? (
                  <span className="text-[10px] text-white/70">({viewAllCount})</span>
                ) : null}
              </div>
            </button>
          </div>
        ) : null}
        <div className="w-4 shrink-0" />
      </div>
      {showTrack ? (
        <div
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          className={clsx(
            "relative mt-2 h-1 w-full select-none rounded-full bg-white/10 transition-opacity",
            trackClassName,
            scrollState.show ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {scrollState.show ? (
            <div
              role="slider"
              aria-label="Scroll de destacados"
              aria-valuemin={0}
              aria-valuemax={Math.round(scrollState.scrollMax)}
              aria-valuenow={Math.round(scrollState.scrollLeft)}
              onPointerDown={handleThumbPointerDown}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
              onPointerCancel={handleThumbPointerUp}
              className={`absolute left-0 top-0 h-full rounded-full bg-white/30 shadow-[0_0_6px_rgba(255,255,255,0.35)] touch-none${
                dragging ? " cursor-grabbing" : " cursor-grab transition-[transform,width] duration-150"
              }`}
              style={{
                width: `${scrollState.thumbWidth}px`,
                transform: `translateX(${scrollState.thumbLeft}px)`,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
