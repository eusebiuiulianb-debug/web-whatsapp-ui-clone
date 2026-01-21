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
  const popClipsById = useMemo(
    () => new Map(sortedPopClips.map((clip) => [clip.id, clip])),
    [sortedPopClips]
  );
  const clipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const clipErrorFetchRef = useRef<Record<string, boolean>>({});
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const lastActiveClipIdRef = useRef<string | null>(null);
  const [blockedClips, setBlockedClips] = useState<Record<string, boolean>>({});
  const [clipStatus, setClipStatus] = useState<Record<string, ClipPlaybackStatus>>({});
  const [visibleClips, setVisibleClips] = useState<Record<string, boolean>>({});
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [activePack, setActivePack] = useState<PublicPopClip | null>(null);
  const [clipErrorDetails, setClipErrorDetails] = useState<Record<string, { url: string; status?: number | null }>>({});

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
  const isDev = process.env.NODE_ENV === "development";
  const logFetchFailure = useCallback(
    (endpoint: string, status?: number | null, error?: unknown) => {
      if (!isDev) return;
      const message = error instanceof Error ? error.message : error ? String(error) : "";
      console.warn("[public] fetch failed", {
        endpoint,
        status: status ?? null,
        error: message || undefined,
      });
    },
    [isDev]
  );

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
    const endpoint = `/api/public/popclips?handle=${encodeURIComponent(effectiveHandle)}`;
    let responseStatus: number | null = null;
    setPopClipsLoading(true);
    setPopClipsError(null);
    setRemotePopClips(null);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as { clips?: PublicPopClip[]; popclips?: PublicPopClip[] };
        const clips = Array.isArray(data?.popclips)
          ? data.popclips
          : Array.isArray(data?.clips)
          ? data.clips
          : [];
        setRemotePopClips(clips);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logFetchFailure(endpoint, responseStatus, err);
        setPopClipsError("No se pudo cargar PopClips.");
        setRemotePopClips([]);
      })
      .finally(() => {
        setPopClipsLoading(false);
      });
    return () => controller.abort();
  }, [effectiveHandle, hasPopClipsProp, logFetchFailure, popClipsRetryKey]);

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

  const seekToStart = useCallback((clipId: string, startAtSec: number) => {
    const video = videoRefs.current[clipId];
    if (!video) return;
    if (!Number.isFinite(startAtSec) || startAtSec <= 0) return;
    if (video.readyState < 1) return;
    const safeStart = Math.max(0, startAtSec);
    if (Math.abs(video.currentTime - safeStart) > 0.2) {
      try {
        video.currentTime = safeStart;
      } catch (_err) {
        // ignore seek errors on some browsers
      }
    }
  }, []);

  const handleTimeUpdate = useCallback(
    (clipId: string, startAtSec: number, durationSec?: number | null) => {
      if (!durationSec || durationSec <= 0) return;
      const video = videoRefs.current[clipId];
      if (!video) return;
      const endAt = startAtSec + durationSec;
      if (video.currentTime >= endAt) {
        video.pause();
        updateClipStatus(clipId, "paused");
        seekToStart(clipId, startAtSec);
      }
    },
    [seekToStart, updateClipStatus]
  );

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
      if (clipStatus[clipId] === "error") return;
      const clip = popClipsById.get(clipId);
      const startAt = clip ? Math.max(0, Number(clip.startAtSec ?? 0)) : 0;
      video.muted = true;
      ensureVideoSource(video);
      if (video.readyState >= 1) {
        seekToStart(clipId, startAt);
      }
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
    [autoplayAllowed, clipStatus, ensureVideoSource, popClipsById, seekToStart, updateClipStatus, visibleClips]
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
      setClipErrorDetails((prev) => {
        if (!prev[clipId]) return prev;
        const next = { ...prev };
        delete next[clipId];
        return next;
      });
      if (clipErrorFetchRef.current[clipId]) {
        delete clipErrorFetchRef.current[clipId];
      }
      ensureVideoSource(video);
      video.load();
      attemptPlay(clipId);
    },
    [attemptPlay, ensureVideoSource, updateClipStatus]
  );

  const handleClipError = useCallback(
    async (clipId: string, url: string) => {
      updateClipStatus(clipId, "error");
      if (!isDev || !url) return;
      setClipErrorDetails((prev) => {
        if (prev[clipId]) return prev;
        return { ...prev, [clipId]: { url } };
      });
      if (clipErrorFetchRef.current[clipId]) return;
      clipErrorFetchRef.current[clipId] = true;
      try {
        const headRes = await fetch(url, { method: "HEAD", cache: "no-store" });
        let status = headRes.status;
        if (status === 405 || status === 501) {
          const rangeRes = await fetch(url, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
            cache: "no-store",
          });
          status = rangeRes.status;
        }
        setClipErrorDetails((prev) => {
          if (prev[clipId]?.status !== undefined) return prev;
          return { ...prev, [clipId]: { url, status } };
        });
      } catch (err) {
        logFetchFailure(url, null, err);
        setClipErrorDetails((prev) => {
          if (prev[clipId]?.status !== undefined) return prev;
          return { ...prev, [clipId]: { url, status: null } };
        });
      }
    },
    [isDev, logFetchFailure, updateClipStatus]
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-overlay)] px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--text)]">{activePack.pack.title}</h3>
            <p className="text-sm text-[color:var(--warning)]">
              {formatPriceCents(activePack.pack.priceCents, activePack.pack.currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActivePack(null)}
            className="text-[12px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
          >
            Cerrar
          </button>
        </div>
        {packCoverUrl && (
          <div
            className="mt-4 h-40 w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]"
            style={{
              backgroundImage: `linear-gradient(135deg, rgba(11,20,26,0.85), rgba(11,20,26,0.55)), url('${packCoverUrl}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        {activePack.pack.description && (
          <p className="mt-3 text-sm text-[color:var(--muted)] leading-relaxed">{activePack.pack.description}</p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setActivePack(null)}
            className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
          >
            Volver
          </button>
          <Link
            href={packLandingHref}
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
          >
            Ver pack
          </Link>
          <Link
            href={packChatHref}
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
          >
            Pedir
          </Link>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <header
          className="relative overflow-hidden rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-6 md:p-8"
          style={heroBackgroundStyle}
        >
          <div className="absolute inset-0 bg-[color:var(--surface-overlay)] pointer-events-none" />
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(var(--brand-rgb), 0.12), transparent 40%), radial-gradient(circle at 80% 10%, rgba(var(--brand-rgb), 0.08), transparent 35%), linear-gradient(135deg, var(--surface-0) 0%, var(--surface-1) 60%)",
            }}
          />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-start">
            <div className={`flex flex-col gap-4 ${hasWhatInside ? "md:w-7/12" : "md:w-full"}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {avatarUrl ? (
                    <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] overflow-hidden shadow-lg shadow-black/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatarUrl} alt={creatorName} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full border border-[color:var(--surface-border)] bg-gradient-to-br from-[color:rgba(var(--brand-rgb),0.9)] to-[color:rgba(var(--brand-rgb),0.45)] text-[color:var(--text)] text-3xl font-semibold shadow-lg shadow-black/50">
                      {creatorInitial}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <h1 className="text-3xl md:text-4xl font-semibold leading-tight">{creatorName}</h1>
                  <p className="text-sm text-[color:var(--text)]">{copy.hero.tagline || subtitle}</p>
                  {statsLine && <div className="text-xs text-[color:var(--text)]">{statsLine}</div>}
                </div>
              </div>
              <p className="text-[color:var(--text)] text-base leading-relaxed whitespace-pre-line">{copy.hero.description}</p>
              <div className="flex flex-wrap gap-2">
                {visibleChips.map((chip, idx) => (
                  <span
                    key={`${chip.label}-${idx}`}
                    className="inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--text)]"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-[color:var(--brand-strong)] px-5 py-3 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)]"
                >
                  {copy.hero.primaryCtaLabel || "Entrar al chat privado"}
                </Link>
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-[color:rgba(245,158,11,0.7)] bg-[color:rgba(245,158,11,0.08)] px-5 py-3 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:rgba(245,158,11,0.16)]"
                >
                  {copy.hero.secondaryCtaLabel || "Seguir gratis"}
                </Link>
              </div>
            </div>

            {hasWhatInside && (
              <div className="md:w-5/12 w-full">
                <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-5 shadow-xl shadow-black/30 backdrop-blur-sm">
                  <p className="text-sm font-semibold text-[color:var(--text)] mb-3">{copy.hero.whatInsideTitle || "Qué hay dentro"}</p>
                  <ul className="space-y-2 text-sm text-[color:var(--muted)]">
                    {(copy.hero.whatInsideBullets || []).slice(0, 4).map((item, idx) => (
                      <li key={`${item}-${idx}`} className="flex items-start gap-2">
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-[color:var(--brand)]" />
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
                className={`rounded-2xl bg-[color:var(--surface-1)] border px-5 py-4 flex flex-col gap-3 shadow-lg shadow-black/20 ${
                  visiblePacks.length === 1 ? "max-w-xl mx-auto w-full" : ""
                }`}
                style={pack.id === recommended?.id ? { borderColor: "rgba(52,211,153,0.6)", boxShadow: "0 10px 30px rgba(16,185,129,0.15)" } : {}}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold">{pack.title}</h3>
                  {pack.badge && (
                    <span className="inline-flex items-center rounded-full bg-[color:rgba(245,158,11,0.08)] text-[color:var(--warning)] text-[11px] px-2 py-0.5">
                      {pack.badge}
                    </span>
                  )}
                  {pack.id === recommended?.id && (
                    <span className="inline-flex items-center rounded-full bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--brand)] text-[11px] px-2 py-0.5">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-[color:var(--muted)] text-sm leading-relaxed">{pack.bullets.slice(0, 1).join(" ")}</p>
                {pack.bullets.slice(1).length > 0 && (
                  <ul className="text-sm text-[color:var(--muted)] space-y-1 list-disc list-inside">
                    {pack.bullets.slice(1).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-2xl font-semibold text-[color:var(--warning)]">{pack.price}</span>
                  <button className="inline-flex items-center justify-center rounded-lg border border-[color:rgba(245,158,11,0.7)] text-[color:var(--warning)] bg-transparent hover:bg-[color:rgba(245,158,11,0.08)] px-3 py-2 text-sm font-semibold transition">
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
              {hasPopClips && <span className="text-xs text-[color:var(--muted)]">Desliza para ver más</span>}
            </div>
            <div className="rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
              {showPopClipsError && (
                <div className="flex h-[45vh] items-center justify-center rounded-2xl border border-[color:rgba(244,63,94,0.3)] bg-[color:rgba(244,63,94,0.08)] px-4 text-center">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-[color:var(--text)]">{popClipsError}</p>
                    <button
                      type="button"
                      onClick={handlePopClipsRetry}
                      className="rounded-full border border-[color:rgba(244,63,94,0.7)] bg-[color:rgba(244,63,94,0.08)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.16)]"
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
                      className="h-[75vh] md:h-[70vh] rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] animate-pulse"
                    />
                  ))}
                </div>
              )}
              {!isPopClipsLoading && !showPopClipsError && !hasPopClips && (
                <div className="flex h-[45vh] items-center justify-center rounded-2xl border border-dashed border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
                  <p className="text-sm text-[color:var(--muted)]">Este creador aún no tiene PopClips.</p>
                </div>
              )}
              {!showPopClipsError && hasPopClips && (
                <div className="h-[80vh] md:h-[72vh] overflow-y-auto snap-y snap-mandatory space-y-6 pr-2">
                  {sortedPopClips.map((clip) => {
                    const clipTitle = clip.title?.trim() || clip.pack.title;
                    const priceLabel = formatPriceCents(clip.pack.priceCents, clip.pack.currency);
                    const startAtSec = Math.max(0, Number(clip.startAtSec ?? 0));
                    const durationSec = clip.durationSec ?? null;
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
                        className="relative h-[75vh] md:h-[70vh] snap-start overflow-hidden rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-0)]"
                      >
                        <video
                          ref={(node) => {
                            videoRefs.current[clip.id] = node;
                          }}
                          data-src={clip.videoUrl}
                          poster={clip.posterUrl?.trim() ? clip.posterUrl : undefined}
                          muted
                          loop={!durationSec}
                          playsInline
                          preload="none"
                          onLoadStart={() => updateClipStatus(clip.id, "loading")}
                          onLoadedMetadata={() => {
                            updateClipStatus(clip.id, "ready");
                            seekToStart(clip.id, startAtSec);
                          }}
                          onPlay={() => updateClipStatus(clip.id, "playing")}
                          onPause={() => updateClipStatus(clip.id, "paused")}
                          onError={() => handleClipError(clip.id, clip.videoUrl)}
                          onTimeUpdate={() => handleTimeUpdate(clip.id, startAtSec, durationSec)}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-[color:var(--surface-overlay)]" />
                        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-wide text-[color:var(--brand)]">PopClip</p>
                            <h3 className="text-lg font-semibold text-[color:var(--text)]">{clipTitle}</h3>
                            <p className="text-xs text-[color:var(--muted)]">Disponible en: {clip.pack.title}</p>
                            <p className="text-sm text-[color:var(--warning)]">{priceLabel}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActivePack(clip)}
                            className="rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
                          >
                            Ver pack
                          </button>
                        </div>
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--surface-overlay)] text-xs font-semibold text-[color:var(--text)]">
                            Cargando...
                          </div>
                        )}
                        {isError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[color:var(--surface-overlay)] text-center">
                            <p className="text-sm font-semibold text-[color:var(--text)]">
                              No se pudo cargar el clip. Revisa la URL o el archivo local.
                            </p>
                            {isDev && clipErrorDetails[clip.id] && (
                              <p className="text-[11px] text-[color:var(--muted)]">
                                URL: {clipErrorDetails[clip.id].url} (
                                {clipErrorDetails[clip.id].status ?? "error"})
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => retryClip(clip.id)}
                              className="rounded-full border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                            >
                              Reintentar
                            </button>
                          </div>
                        )}
                        {!isError && isBlocked && (
                          <button
                            type="button"
                            onClick={() => handleManualPlay(clip.id)}
                            className="absolute inset-0 flex items-center justify-center bg-[color:var(--surface-overlay-soft)] text-sm font-semibold text-[color:var(--text)]"
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
              <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-6 text-[color:var(--muted)]">
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
            <h2 className="text-2xl font-semibold">Para los que aún estáis curioseando</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleFreebies.map((resource) => (
                <div
                  key={resource.id}
                  className="rounded-2xl bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] p-4 flex flex-col gap-3 shadow-lg shadow-black/10"
                >
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-[color:var(--text)]">{resource.title}</p>
                    <p className="text-[color:var(--muted)] text-sm leading-relaxed">{resource.description}</p>
                  </div>
                  <button className="inline-flex w-full items-center justify-center rounded-lg border border-[color:var(--warning)] text-[color:var(--warning)] bg-transparent hover:bg-[color:rgba(245,158,11,0.08)] px-3 py-2 text-sm font-semibold transition-colors">
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
                  <div key={item.id} className="rounded-2xl bg-[color:var(--surface-1)] border border-[color:var(--surface-border)]">
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between text-left"
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                    >
                      <span className="font-semibold text-[color:var(--text)]">{item.question}</span>
                      <span className="text-[color:var(--muted)]">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-sm text-[color:var(--muted)] leading-relaxed">{item.answer}</div>
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
      <h3 className="text-lg font-semibold text-[color:var(--text)]">{title}</h3>
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
              className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 flex flex-col gap-3 shadow-lg shadow-black/20"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-[color:var(--text)]">{item.title}</h4>
                  <span className="text-lg font-semibold text-[color:var(--warning)]">
                    {formatPriceCents(item.priceCents, item.currency)}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm text-[color:var(--muted)] leading-relaxed">{item.description}</p>
                )}
                {includesLine && <p className="text-xs text-[color:var(--muted)]">{includesLine}</p>}
              </div>
              <Link
                href={href}
                className="inline-flex w-full items-center justify-center rounded-lg border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)] transition"
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
