import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PublicCatalogItem,
  PublicPopClip,
  PublicProfileCopy,
  PublicProfileStats,
} from "../../types/publicProfile";

type Props = {
  copy: PublicProfileCopy;
  creatorName: string;
  creatorInitial: string;
  subtitle: string;
  avatarUrl?: string | null;
  stats?: PublicProfileStats;
  catalogItems?: PublicCatalogItem[];
  popClips?: PublicPopClip[];
  creatorHandle?: string;
};

type ClipPlaybackStatus = "loading" | "ready" | "playing" | "paused" | "error";

export default function PublicProfileView({
  copy,
  creatorName,
  creatorInitial,
  subtitle,
  avatarUrl,
  stats,
  catalogItems,
  popClips,
  creatorHandle,
}: Props) {
  const recommended = copy.packs.find((p) => p.id === copy.recommendedPackId) || copy.packs[0];
  const highlights = (recommended?.bullets ?? []).slice(0, 3);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const visiblePacks = copy.packs.filter((pack) => pack.visible !== false);
  const visibleChips = (copy.hero.chips || []).filter((chip) => chip.visible !== false);
  const visibleFreebies = (copy.freebies || []).filter((item) => item.visible !== false);
  const showStats = copy.hero.showStats !== false;
  const statsLine = showStats && stats ? buildStatsLine(stats) : "";
  const showCatalog = typeof catalogItems !== "undefined";
  const catalog = catalogItems ?? [];
  const groupedCatalog = groupCatalogItems(catalog);
  const hasCatalog = catalog.length > 0;
  const router = useRouter();
  const [popClipsLoading, setPopClipsLoading] = useState(() => typeof popClips === "undefined");
  const [popClipsError, setPopClipsError] = useState<string | null>(null);
  const [remotePopClips, setRemotePopClips] = useState<PublicPopClip[] | null>(null);
  const [popClipsRetryKey, setPopClipsRetryKey] = useState(0);
  const hasPopClipsProp = typeof popClips !== "undefined";
  const routerHandle = typeof router.query.handle === "string" ? router.query.handle : "";
  const effectiveHandle = (creatorHandle || routerHandle).trim();
  const resolvedPopClips = useMemo(
    () => (hasPopClipsProp ? popClips ?? [] : remotePopClips ?? []),
    [hasPopClipsProp, popClips, remotePopClips]
  );
  const sortedPopClips = useMemo(
    () => [ ...resolvedPopClips ].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [resolvedPopClips]
  );
  const showPopClipsSection =
    hasPopClipsProp || popClipsLoading || popClipsError !== null || remotePopClips !== null;
  const isPopClipsLoading = !hasPopClipsProp && popClipsLoading;
  const showPopClipsError = !hasPopClipsProp && popClipsError;
  const hasPopClips = sortedPopClips.length > 0;
  const clipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const lastActiveClipIdRef = useRef<string | null>(null);
  const [blockedClips, setBlockedClips] = useState<Record<string, boolean>>({});
  const [clipStatus, setClipStatus] = useState<Record<string, ClipPlaybackStatus>>({});
  const [visibleClips, setVisibleClips] = useState<Record<string, boolean>>({});
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [activePack, setActivePack] = useState<PublicPopClip | null>(null);

  const hasWhatInside = copy.hero.showWhatInside !== false && (copy.hero.whatInsideBullets?.length ?? 0) > 0;
  const heroBackgroundStyle =
    copy.hero.coverImageUrl && copy.hero.coverImageUrl.trim().length > 0
      ? {
          backgroundImage: `linear-gradient(135deg, rgba(11,20,26,0.8), rgba(11,20,26,0.65)), url('${copy.hero.coverImageUrl}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : undefined;
  const autoplayAllowed = isPageVisible && !activePack;

  const handlePopClipsRetry = useCallback(() => {
    setPopClipsRetryKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (hasPopClipsProp) return;
    if (!effectiveHandle || effectiveHandle === "creator") {
      setPopClipsError("No se pudo cargar PopClips.");
      setRemotePopClips([]);
      setPopClipsLoading(false);
      return;
    }
    const controller = new AbortController();
    setPopClipsLoading(true);
    setPopClipsError(null);
    setRemotePopClips(null);
    fetch(`/api/public/popclips?handle=${encodeURIComponent(effectiveHandle)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as { clips?: PublicPopClip[] };
        const clips = Array.isArray(data?.clips) ? data.clips : [];
        setRemotePopClips(clips);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPopClipsError("No se pudo cargar PopClips.");
        setRemotePopClips([]);
      })
      .finally(() => {
        setPopClipsLoading(false);
      });
    return () => controller.abort();
  }, [effectiveHandle, hasPopClipsProp, popClipsRetryKey]);

  useEffect(() => {
    if (!hasPopClipsProp) return;
    setPopClipsLoading(false);
    setPopClipsError(null);
  }, [hasPopClipsProp]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => setIsPageVisible(!document.hidden);
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (sortedPopClips.length === 0) return;
    setClipStatus((prev) => {
      const next: Record<string, ClipPlaybackStatus> = {};
      sortedPopClips.forEach((clip) => {
        next[clip.id] = prev[clip.id] ?? "loading";
      });
      return next;
    });
  }, [sortedPopClips]);

  const ensureVideoSource = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    const dataSrc = video.dataset.src;
    if (dataSrc && video.getAttribute("src") !== dataSrc) {
      video.src = dataSrc;
      video.load();
    }
  }, []);

  const updateClipStatus = useCallback((clipId: string, status: ClipPlaybackStatus) => {
    setClipStatus((prev) => {
      const current = prev[clipId];
      if (current === status) return prev;
      if (current === "playing" && status === "ready") return prev;
      if (current === "error" && status !== "loading") return prev;
      return { ...prev, [clipId]: status };
    });
  }, []);

  const pauseAllClips = useCallback(() => {
    sortedPopClips.forEach((clip) => {
      const video = videoRefs.current[clip.id];
      if (video) video.pause();
    });
  }, [sortedPopClips]);

  const attemptPlay = useCallback(
    (clipId: string) => {
      const video = videoRefs.current[clipId];
      if (!video) return;
      if (!autoplayAllowed) return;
      if (!visibleClips[clipId]) return;
      video.muted = true;
      ensureVideoSource(video);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            setBlockedClips((prev) => ({ ...prev, [clipId]: false }));
          })
          .catch(() => {
            setBlockedClips((prev) => ({ ...prev, [clipId]: true }));
            updateClipStatus(clipId, "paused");
          });
      }
    },
    [autoplayAllowed, ensureVideoSource, updateClipStatus, visibleClips]
  );

  const handleManualPlay = useCallback(
    (clipId: string) => {
      setBlockedClips((prev) => ({ ...prev, [clipId]: false }));
      setActiveClipId(clipId);
      attemptPlay(clipId);
    },
    [attemptPlay]
  );

  const retryClip = useCallback(
    (clipId: string) => {
      const video = videoRefs.current[clipId];
      if (!video) return;
      setBlockedClips((prev) => ({ ...prev, [clipId]: false }));
      updateClipStatus(clipId, "loading");
      ensureVideoSource(video);
      video.load();
      attemptPlay(clipId);
    },
    [attemptPlay, ensureVideoSource, updateClipStatus]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sortedPopClips.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleClips((prev) => {
          const next = { ...prev };
          entries.forEach((entry) => {
            const clipId = entry.target.getAttribute("data-clip-id");
            if (!clipId) return;
            next[clipId] = entry.isIntersecting;
            const video = videoRefs.current[clipId];
            if (!video) return;
            if (entry.isIntersecting) {
              ensureVideoSource(video);
              if (autoplayAllowed) {
                setActiveClipId((current) => (current === clipId ? current : clipId));
              }
            } else {
              video.pause();
              updateClipStatus(clipId, "paused");
            }
          });
          return next;
        });
      },
      { threshold: 0.6 }
    );
    sortedPopClips.forEach((clip) => {
      const node = clipRefs.current[clip.id];
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [autoplayAllowed, ensureVideoSource, sortedPopClips, updateClipStatus]);

  useEffect(() => {
    if (!activeClipId || !autoplayAllowed) return;
    if (!visibleClips[activeClipId]) return;
    sortedPopClips.forEach((clip) => {
      const video = videoRefs.current[clip.id];
      if (!video) return;
      if (clip.id === activeClipId) {
        attemptPlay(clip.id);
        return;
      }
      video.pause();
    });
  }, [activeClipId, attemptPlay, autoplayAllowed, sortedPopClips, visibleClips]);

  useEffect(() => {
    if (autoplayAllowed) {
      if (!activeClipId) {
        const fallback = lastActiveClipIdRef.current;
        const visibleEntry = fallback && visibleClips[fallback] ? fallback : null;
        const next = visibleEntry || Object.keys(visibleClips).find((id) => visibleClips[id]);
        if (next) setActiveClipId(next);
      }
      return;
    }
    if (activeClipId) {
      lastActiveClipIdRef.current = activeClipId;
      setActiveClipId(null);
    }
    pauseAllClips();
  }, [activeClipId, autoplayAllowed, pauseAllClips, visibleClips]);

  const packDraft = activePack ? buildPackDraft(activePack.pack) : "";
  const packChatHref =
    activePack && creatorHandle
      ? { pathname: `/go/${creatorHandle}`, query: { draft: packDraft } }
      : { pathname: "/" };
  const packLandingHref =
    activePack?.pack.route || (activePack && creatorHandle ? `/p/${creatorHandle}/${activePack.pack.id}` : "/");
  const packCoverUrl = activePack?.pack.coverUrl || activePack?.posterUrl || null;
  const packModal = activePack ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{activePack.pack.title}</h3>
            <p className="text-sm text-amber-300">
              {formatPriceCents(activePack.pack.priceCents, activePack.pack.currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActivePack(null)}
            className="text-[12px] font-semibold text-slate-300 hover:text-slate-100"
          >
            Cerrar
          </button>
        </div>
        {packCoverUrl && (
          <div
            className="mt-4 h-40 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80"
            style={{
              backgroundImage: `linear-gradient(135deg, rgba(11,20,26,0.85), rgba(11,20,26,0.55)), url('${packCoverUrl}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        {activePack.pack.description && (
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">{activePack.pack.description}</p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setActivePack(null)}
            className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/80"
          >
            Volver
          </button>
          <Link
            href={packLandingHref}
            className="inline-flex items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800/80"
          >
            Ver pack
          </Link>
          <Link
            href={packChatHref}
            className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Pedir
          </Link>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <header
          className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 p-6 md:p-8"
          style={heroBackgroundStyle}
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/20 pointer-events-none"
          />
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, #34d39922, transparent 40%), radial-gradient(circle at 80% 10%, #38bdf833, transparent 35%), linear-gradient(135deg, #0b141a 0%, #0f172a 60%)",
            }}
          />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-start">
            <div className={`flex flex-col gap-4 ${hasWhatInside ? "md:w-7/12" : "md:w-full"}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {avatarUrl ? (
                    <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-slate-900 overflow-hidden shadow-lg shadow-black/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatarUrl} alt={creatorName} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-gradient-to-br from-emerald-500/90 to-sky-500/90 text-white text-3xl font-semibold shadow-lg shadow-black/50">
                      {creatorInitial}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <h1 className="text-3xl md:text-4xl font-semibold leading-tight">{creatorName}</h1>
                  <p className="text-sm text-slate-200">{copy.hero.tagline || subtitle}</p>
                  {statsLine && <div className="text-xs text-slate-200">{statsLine}</div>}
                </div>
              </div>
              <p className="text-slate-200 text-base leading-relaxed whitespace-pre-line">{copy.hero.description}</p>
              <div className="flex flex-wrap gap-2">
                {visibleChips.map((chip, idx) => (
                  <span
                    key={`${chip.label}-${idx}`}
                    className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs text-slate-100"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400"
                >
                  {copy.hero.primaryCtaLabel || "Entrar al chat privado"}
                </Link>
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-amber-400/70 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
                >
                  {copy.hero.secondaryCtaLabel || "Seguir gratis"}
                </Link>
              </div>
            </div>

            {hasWhatInside && (
              <div className="md:w-5/12 w-full">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-xl shadow-black/30 backdrop-blur-sm">
                  <p className="text-sm font-semibold text-slate-100 mb-3">{copy.hero.whatInsideTitle || "Qué hay dentro"}</p>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {(copy.hero.whatInsideBullets || []).slice(0, 4).map((item, idx) => (
                      <li key={`${item}-${idx}`} className="flex items-start gap-2">
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Elige cómo entrar</h2>
          <div
            className={`grid gap-4 ${
              visiblePacks.length === 1
                ? "grid-cols-1"
                : visiblePacks.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {visiblePacks.map((pack) => (
              <div
                key={pack.id}
                className={`rounded-2xl bg-slate-900/70 border px-5 py-4 flex flex-col gap-3 shadow-lg shadow-black/20 ${
                  visiblePacks.length === 1 ? "max-w-xl mx-auto w-full" : ""
                }`}
                style={pack.id === recommended?.id ? { borderColor: "rgba(52,211,153,0.6)", boxShadow: "0 10px 30px rgba(16,185,129,0.15)" } : {}}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold">{pack.title}</h3>
                  {pack.badge && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-300 text-[11px] px-2 py-0.5">
                      {pack.badge}
                    </span>
                  )}
                  {pack.id === recommended?.id && (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-200 text-[11px] px-2 py-0.5">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{pack.bullets.slice(0, 1).join(" ")}</p>
                {pack.bullets.slice(1).length > 0 && (
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                    {pack.bullets.slice(1).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-2xl font-semibold text-amber-300">{pack.price}</span>
                  <button className="inline-flex items-center justify-center rounded-lg border border-amber-400/70 text-amber-200 bg-transparent hover:bg-amber-400/10 px-3 py-2 text-sm font-semibold transition">
                    {pack.ctaLabel}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {showPopClipsSection && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-semibold">PopClips</h2>
              {hasPopClips && <span className="text-xs text-slate-400">Desliza para ver más</span>}
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-3">
              {showPopClipsError && (
                <div className="flex h-[45vh] items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 text-center">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-rose-100">{popClipsError}</p>
                    <button
                      type="button"
                      onClick={handlePopClipsRetry}
                      className="rounded-full border border-rose-400/70 bg-rose-500/10 px-4 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              )}
              {isPopClipsLoading && (
                <div className="h-[80vh] md:h-[72vh] overflow-hidden space-y-6 pr-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={`popclip-skeleton-${idx}`}
                      className="h-[75vh] md:h-[70vh] rounded-2xl border border-slate-800 bg-slate-950/80 animate-pulse"
                    />
                  ))}
                </div>
              )}
              {!isPopClipsLoading && !showPopClipsError && !hasPopClips && (
                <div className="flex h-[45vh] items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40">
                  <p className="text-sm text-slate-300">Este creador aún no tiene PopClips.</p>
                </div>
              )}
              {!showPopClipsError && hasPopClips && (
                <div className="h-[80vh] md:h-[72vh] overflow-y-auto snap-y snap-mandatory space-y-6 pr-2">
                  {sortedPopClips.map((clip) => {
                    const clipTitle = clip.title?.trim() || clip.pack.title;
                    const priceLabel = formatPriceCents(clip.pack.priceCents, clip.pack.currency);
                    const isBlocked = Boolean(blockedClips[clip.id]);
                    const status = clipStatus[clip.id] ?? "loading";
                    const isLoading = status === "loading";
                    const isError = status === "error";
                    return (
                      <div
                        key={clip.id}
                        ref={(node) => {
                          clipRefs.current[clip.id] = node;
                        }}
                        data-clip-id={clip.id}
                        className="relative h-[75vh] md:h-[70vh] snap-start overflow-hidden rounded-2xl border border-slate-800 bg-black/80"
                      >
                        <video
                          ref={(node) => {
                            videoRefs.current[clip.id] = node;
                          }}
                          data-src={clip.videoUrl}
                          poster={clip.posterUrl?.trim() ? clip.posterUrl : undefined}
                          muted
                          loop
                          playsInline
                          preload="none"
                          onLoadStart={() => updateClipStatus(clip.id, "loading")}
                          onLoadedData={() => updateClipStatus(clip.id, "ready")}
                          onPlay={() => updateClipStatus(clip.id, "playing")}
                          onPause={() => updateClipStatus(clip.id, "paused")}
                          onError={() => updateClipStatus(clip.id, "error")}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-wide text-emerald-200">PopClip</p>
                            <h3 className="text-lg font-semibold text-white">{clipTitle}</h3>
                            <p className="text-sm text-amber-300">{priceLabel}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActivePack(clip)}
                            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                          >
                            Ver pack
                          </button>
                        </div>
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-semibold text-slate-100">
                            Cargando...
                          </div>
                        )}
                        {isError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
                            <p className="text-sm font-semibold text-slate-100">No se pudo cargar el clip.</p>
                            <button
                              type="button"
                              onClick={() => retryClip(clip.id)}
                              className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                            >
                              Reintentar
                            </button>
                          </div>
                        )}
                        {!isError && isBlocked && (
                          <button
                            type="button"
                            onClick={() => handleManualPlay(clip.id)}
                            className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white"
                          >
                            Toca para reproducir
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {showCatalog && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Catálogo</h2>
            {!hasCatalog && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">
                Aún no hay catálogo público.
              </div>
            )}
            {hasCatalog && (
              <div className="space-y-6">
                {renderCatalogGroup({
                  title: "Extras",
                  items: groupedCatalog.extras,
                  creatorHandle,
                })}
                {renderCatalogGroup({
                  title: "Bundles",
                  items: groupedCatalog.bundles,
                  creatorHandle,
                })}
                {renderCatalogGroup({
                  title: "Packs",
                  items: groupedCatalog.packs,
                  creatorHandle,
                })}
              </div>
            )}
          </section>
        )}

        {copy.freebiesSectionVisible !== false && visibleFreebies.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Para los que aún estáis curioseando 👀</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleFreebies.map((resource) => (
                <div
                  key={resource.id}
                  className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 flex flex-col gap-3 shadow-lg shadow-black/10"
                >
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-slate-50">{resource.title}</p>
                    <p className="text-slate-300 text-sm leading-relaxed">{resource.description}</p>
                  </div>
                  <button className="inline-flex w-full items-center justify-center rounded-lg border border-amber-400 text-amber-200 bg-transparent hover:bg-amber-400/10 px-3 py-2 text-sm font-semibold transition-colors">
                    {resource.ctaLabel}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {copy.faqSectionVisible !== false && copy.faq.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Dudas rápidas antes de entrar</h2>
            <div className="flex flex-col gap-3">
              {copy.faq.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div key={item.id} className="rounded-2xl bg-slate-900/60 border border-slate-800">
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between text-left"
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                    >
                      <span className="font-semibold text-slate-100">{item.question}</span>
                      <span className="text-slate-400">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-sm text-slate-300 leading-relaxed">{item.answer}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
      {packModal}
    </div>
  );
}

function buildStatsLine(stats: PublicProfileStats) {
  const parts: string[] = [];
  if (stats.activeMembers > 0) parts.push(`${stats.activeMembers}+ personas dentro`);
  if (stats.images > 0) parts.push(`${stats.images} fotos`);
  if (stats.videos > 0) parts.push(`${stats.videos} vídeos`);
  if (stats.audios > 0) parts.push(`${stats.audios} audios`);
  return parts.join(" · ");
}

function formatPriceCents(cents: number, currency = "EUR") {
  const amount = cents / 100;
  const hasDecimals = cents % 100 !== 0;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    const fixed = hasDecimals ? amount.toFixed(2) : Math.round(amount).toString();
    return `${fixed} ${currency}`;
  }
}

function groupCatalogItems(items: PublicCatalogItem[]) {
  return {
    extras: items.filter((item) => item.type === "EXTRA"),
    bundles: items.filter((item) => item.type === "BUNDLE"),
    packs: items.filter((item) => item.type === "PACK"),
  };
}

function buildCatalogDraft(item: PublicCatalogItem) {
  const typeLabel = item.type === "BUNDLE" ? "bundle" : item.type === "PACK" ? "pack" : "extra";
  const priceLabel = formatPriceCents(item.priceCents, item.currency);
  return `Quiero el ${typeLabel} "${item.title}" (${priceLabel}). ¿Me lo activas?`;
}

function buildPackDraft(pack: PublicPopClip["pack"]) {
  const priceLabel = formatPriceCents(pack.priceCents, pack.currency);
  const refParts = [`productId=${pack.id}`];
  if (pack.slug) refParts.push(`slug=${pack.slug}`);
  const refLine = refParts.length > 0 ? `\n\nRef pack: ${refParts.join(" ")}` : "";
  return `Quiero el pack "${pack.title}" (${priceLabel}). ¿Me lo activas?${refLine}`;
}

function formatIncludesPreview(includes: string[]) {
  if (includes.length === 0) return "";
  const preview = includes.slice(0, 2).join(", ");
  const remaining = Math.max(0, includes.length - 2);
  const tail = remaining > 0 ? ` y ${remaining} más` : "";
  return `Incluye: ${preview}${tail}.`;
}

function renderCatalogGroup({
  title,
  items,
  creatorHandle,
}: {
  title: string;
  items: PublicCatalogItem[];
  creatorHandle?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, index) => {
          const includesLine = item.type === "BUNDLE" ? formatIncludesPreview(item.includes) : "";
          const draft = buildCatalogDraft(item);
          const href =
            creatorHandle
              ? { pathname: `/go/${creatorHandle}`, query: { draft } }
              : { pathname: "/" };
          return (
            <div
              key={`${item.type}-${item.title}-${index}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3 shadow-lg shadow-black/20"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-slate-100">{item.title}</h4>
                  <span className="text-lg font-semibold text-amber-300">
                    {formatPriceCents(item.priceCents, item.currency)}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm text-slate-300 leading-relaxed">{item.description}</p>
                )}
                {includesLine && <p className="text-xs text-slate-400">{includesLine}</p>}
              </div>
              <Link
                href={href}
                className="inline-flex w-full items-center justify-center rounded-lg border border-emerald-400/70 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 transition"
              >
                Pedir
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
