import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "../ui/Skeleton";
import { PublicCatalogCard, type PublicCatalogCardItem } from "./PublicCatalogCard";

type CatalogFilter = "all" | "pack" | "sub" | "extra" | "popclip";

type PopClipSocialState = {
  likeCount: number;
  commentCount: number;
  liked: boolean;
};

type PopClipComment = {
  id: string;
  text: string;
  createdAt: string;
  fanDisplayName: string;
};

type ToastState = {
  message: string;
  href?: string;
};

const DEFAULT_FILTERS: Array<{ id: CatalogFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "pack", label: "Packs" },
  { id: "sub", label: "Suscripciones" },
  { id: "extra", label: "Extras" },
];
const MAX_COMMENT_LENGTH = 300;
const IS_DEV = process.env.NODE_ENV === "development";

const logFetchFailure = (endpoint: string, status?: number | null, error?: unknown) => {
  if (!IS_DEV) return;
  const message = error instanceof Error ? error.message : error ? String(error) : "";
  console.warn("[public] fetch failed", {
    endpoint,
    status: status ?? null,
    error: message || undefined,
  });
};

type Props = {
  items: PublicCatalogCardItem[];
  popclipItems?: PublicCatalogCardItem[];
  chatHref: string;
  onOpenChat?: () => void | Promise<void>;
  filters?: Array<{ id: CatalogFilter; label: string }>;
  defaultFilter?: CatalogFilter;
  featuredIds?: string[];
  isLoading?: boolean;
  error?: string | null;
  popclipLoading?: boolean;
  popclipError?: string | null;
  onRetry?: () => void;
  hideFilters?: boolean;
  compactEmpty?: boolean;
  openPopclipId?: string | null;
  openPopclipItem?: PublicCatalogCardItem | null;
  onPopclipOpenHandled?: () => void;
  sectionId?: string;
};

export function PublicCatalogGrid({
  items,
  popclipItems,
  chatHref,
  onOpenChat,
  filters,
  defaultFilter,
  featuredIds,
  isLoading,
  error,
  popclipLoading,
  popclipError,
  onRetry,
  hideFilters,
  compactEmpty,
  openPopclipId,
  openPopclipItem,
  onPopclipOpenHandled,
  sectionId,
}: Props) {
  const resolvedFilters = filters ?? DEFAULT_FILTERS;
  const [activeFilter, setActiveFilter] = useState<CatalogFilter>(
    defaultFilter ?? resolvedFilters[0]?.id ?? "all"
  );
  const [popclipSocial, setPopclipSocial] = useState<Record<string, PopClipSocialState>>({});
  const [likePending, setLikePending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCommentClip, setActiveCommentClip] = useState<PublicCatalogCardItem | null>(null);
  const [commentItems, setCommentItems] = useState<PopClipComment[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [commentAccessBlocked, setCommentAccessBlocked] = useState(false);
  const [authHref, setAuthHref] = useState("");

  useEffect(() => {
    if (!resolvedFilters.some((filter) => filter.id === activeFilter)) {
      setActiveFilter(resolvedFilters[0]?.id ?? "all");
    }
  }, [activeFilter, resolvedFilters]);

  useEffect(() => {
    if (!defaultFilter) return;
    if (!resolvedFilters.some((filter) => filter.id === defaultFilter)) return;
    setActiveFilter(defaultFilter);
  }, [defaultFilter, resolvedFilters]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAuthHref(buildAuthHref(chatHref, window.location));
  }, [chatHref]);

  const featuredSet = useMemo(() => new Set(featuredIds ?? []), [featuredIds]);
  const normalizedPopclips = useMemo(() => popclipItems ?? [], [popclipItems]);
  const filteredCatalogItems = useMemo(() => {
    if (activeFilter === "all") return items;
    if (activeFilter === "popclip") return [];
    return items.filter((item) => item.kind === activeFilter);
  }, [activeFilter, items]);
  const orderedCatalogItems = useMemo(() => {
    if (featuredSet.size === 0) return filteredCatalogItems;
    const nonFeatured = filteredCatalogItems.filter((item) => !featuredSet.has(item.id));
    const featured = filteredCatalogItems.filter((item) => featuredSet.has(item.id));
    return [...nonFeatured, ...featured];
  }, [featuredSet, filteredCatalogItems]);
  const filteredPopclips = useMemo(() => {
    if (activeFilter === "popclip") return normalizedPopclips;
    if (activeFilter === "all") return normalizedPopclips;
    return [];
  }, [activeFilter, normalizedPopclips]);

  useEffect(() => {
    if (normalizedPopclips.length === 0) {
      setPopclipSocial({});
      return;
    }
    setPopclipSocial((prev) => {
      const next: Record<string, PopClipSocialState> = { ...prev };
      normalizedPopclips.forEach((clip) => {
        const existing = next[clip.id];
        next[clip.id] = {
          likeCount: clip.likeCount ?? existing?.likeCount ?? 0,
          commentCount: clip.commentCount ?? existing?.commentCount ?? 0,
          liked: clip.liked ?? existing?.liked ?? false,
        };
      });
      return next;
    });
  }, [normalizedPopclips]);

  const showToast = useCallback((message: string, href?: string) => {
    setToast({ message, href });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (!activeCommentClip) {
      setCommentItems([]);
      setCommentLoading(false);
      setCommentDraft("");
      setCommentSending(false);
      setCommentAccessBlocked(false);
      return;
    }
    const controller = new AbortController();
    const endpoint = `/api/public/popclips/${activeCommentClip.id}/comments`;
    let responseStatus: number | null = null;
    setCommentLoading(true);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; items?: PopClipComment[]; comments?: PopClipComment[]; count?: number }
          | null;
        if (!res.ok || !data) {
          logFetchFailure(endpoint, responseStatus);
          setCommentItems([]);
          showToast("No se pudieron cargar los comentarios.");
          return;
        }
        const items = Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.comments)
          ? data.comments
          : [];
        setCommentItems(items);
        if (typeof data.count === "number") {
          setPopclipSocial((prev) => {
            const current = prev[activeCommentClip.id];
            if (!current) return prev;
            return {
              ...prev,
              [activeCommentClip.id]: { ...current, commentCount: data.count as number },
            };
          });
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logFetchFailure(endpoint, responseStatus, err);
        setCommentItems([]);
        showToast("No se pudieron cargar los comentarios.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommentLoading(false);
      });
    return () => controller.abort();
  }, [activeCommentClip, showToast]);

  useEffect(() => {
    if (!activeCommentClip) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveCommentClip(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCommentClip]);

  useEffect(() => {
    if (!activeCommentClip) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeCommentClip]);

  const showLikeAuthToast = () => {
    const resolvedHref =
      authHref || (typeof window !== "undefined" ? buildAuthHref(chatHref, window.location) : chatHref);
    showToast("Entra al chat para dar like", resolvedHref);
  };

  const showCommentAuthToast = () => {
    const resolvedHref =
      authHref || (typeof window !== "undefined" ? buildAuthHref(chatHref, window.location) : chatHref);
    showToast("Para comentar, entra al chat privado.", resolvedHref);
  };

  const showCommentAccessToast = () => {
    const resolvedHref =
      authHref || (typeof window !== "undefined" ? buildAuthHref(chatHref, window.location) : chatHref);
    showToast("Necesitas acceso activo.", resolvedHref);
  };

  const handleOpenChat = async () => {
    try {
      if (onOpenChat) {
        await onOpenChat();
        return;
      }
      if (typeof window !== "undefined" && chatHref) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        const resolvedHref = appendReturnTo(chatHref, returnTo);
        window.location.href = resolvedHref;
      }
    } catch (_err) {
      showToast("No se pudo abrir el chat.");
    }
  };

  const handleOpenComments = useCallback((item: PublicCatalogCardItem) => {
    if (!item?.id) return;
    setCommentDraft("");
    setCommentItems([]);
    setCommentAccessBlocked(false);
    setActiveCommentClip(item);
  }, []);

  useEffect(() => {
    if (!openPopclipId) return;
    const fallbackItem =
      openPopclipItem && openPopclipItem.id === openPopclipId ? openPopclipItem : null;
    const target = normalizedPopclips.find((clip) => clip.id === openPopclipId) ?? fallbackItem;
    if (target) {
      handleOpenComments(target);
    }
    onPopclipOpenHandled?.();
  }, [handleOpenComments, normalizedPopclips, onPopclipOpenHandled, openPopclipId, openPopclipItem]);

  const handleCloseComments = () => {
    setActiveCommentClip(null);
  };

  const handleToggleLike = async (item: PublicCatalogCardItem) => {
    if (likePending[item.id]) return;
    if (item.canInteract === false) {
      showLikeAuthToast();
      return;
    }
    const endpoint = `/api/public/popclips/${item.id}/like`;
    let responseStatus: number | null = null;
    const current = popclipSocial[item.id] ?? {
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      liked: item.liked ?? false,
    };
    const next = {
      ...current,
      liked: !current.liked,
      likeCount: Math.max(0, current.likeCount + (current.liked ? -1 : 1)),
    };
    setPopclipSocial((prev) => ({ ...prev, [item.id]: next }));
    setLikePending((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch(endpoint, { method: "POST" });
      responseStatus = res.status;
      if (res.status === 401 || res.status === 403) {
        showLikeAuthToast();
        setPopclipSocial((prev) => ({ ...prev, [item.id]: current }));
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as { liked?: boolean; likeCount?: number; ok?: boolean; error?: string };
      if (data?.ok === false && data.error === "CHAT_REQUIRED") {
        showLikeAuthToast();
        setPopclipSocial((prev) => ({ ...prev, [item.id]: current }));
        return;
      }
      setPopclipSocial((prev) => ({
        ...prev,
        [item.id]: {
          ...current,
          liked: Boolean(data.liked),
          likeCount: typeof data.likeCount === "number" ? data.likeCount : current.likeCount,
        },
      }));
    } catch (_err) {
      logFetchFailure(endpoint, responseStatus, _err);
      setPopclipSocial((prev) => ({ ...prev, [item.id]: current }));
      showToast("No se pudo reaccionar");
    } finally {
      setLikePending((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const commentCanInteract = activeCommentClip?.canComment === true;
  const commentCanWrite = commentCanInteract && !commentAccessBlocked;

  const handleSendComment = async () => {
    if (!activeCommentClip || commentSending) return;
    if (!commentCanWrite) {
      if (commentAccessBlocked) {
        showCommentAccessToast();
      } else {
        showCommentAuthToast();
      }
      return;
    }
    const endpoint = `/api/public/popclips/${activeCommentClip.id}/comments`;
    let responseStatus: number | null = null;
    const text = commentDraft.trim();
    if (!text) return;
    if (text.length > MAX_COMMENT_LENGTH) {
      showToast(`Máximo ${MAX_COMMENT_LENGTH} caracteres`);
      return;
    }
    const clipId = activeCommentClip.id;
    const current = popclipSocial[clipId] ?? {
      likeCount: activeCommentClip.likeCount ?? 0,
      commentCount: activeCommentClip.commentCount ?? 0,
      liked: activeCommentClip.liked ?? false,
    };
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticItem: PopClipComment = {
      id: optimisticId,
      text,
      createdAt: new Date().toISOString(),
      fanDisplayName: "Tú",
    };
    setCommentItems((prev) => [optimisticItem, ...prev]);
    setCommentDraft("");
    setPopclipSocial((prev) => ({
      ...prev,
      [clipId]: { ...current, commentCount: current.commentCount + 1 },
    }));
    setCommentSending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      responseStatus = res.status;
      const data = (await res.json().catch(() => ({}))) as {
        item?: PopClipComment;
        count?: number;
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        if (data?.error === "ACCESS_REQUIRED") {
          setCommentAccessBlocked(true);
          showCommentAccessToast();
          throw new Error("auth_required");
        }
        if (data?.error === "AUTH_REQUIRED") {
          showCommentAuthToast();
          throw new Error("auth_required");
        }
        throw new Error("request failed");
      }
      if (
        data?.ok === false &&
        (data.error === "CHAT_REQUIRED" || data.error === "AUTH_REQUIRED" || data.error === "ACCESS_REQUIRED")
      ) {
        if (data.error === "ACCESS_REQUIRED") {
          setCommentAccessBlocked(true);
          showCommentAccessToast();
        } else {
          showCommentAuthToast();
        }
        throw new Error("auth_required");
      }
      const resolvedItem = data.item;
      if (!resolvedItem) {
        throw new Error("request failed");
      }
      setCommentItems((prev) => prev.map((item) => (item.id === optimisticId ? resolvedItem : item)));
      setPopclipSocial((prev) => {
        const nextCurrent = prev[clipId];
        if (!nextCurrent) return prev;
        return {
          ...prev,
          [clipId]: {
            ...nextCurrent,
            commentCount:
              typeof data.count === "number" ? data.count : nextCurrent.commentCount,
          },
        };
      });
    } catch (err) {
      setCommentItems((prev) => prev.filter((item) => item.id !== optimisticId));
      setPopclipSocial((prev) => ({
        ...prev,
        [clipId]: { ...current, commentCount: current.commentCount },
      }));
      setCommentDraft(text);
      const isAuthError = err instanceof Error && err.message === "auth_required";
      if (!isAuthError) {
        logFetchFailure(endpoint, responseStatus, err);
        showToast("No se pudo comentar");
      }
    } finally {
      setCommentSending(false);
    }
  };

  const emptyCopyByFilter: Record<CatalogFilter, string> = {
    all: "Aún no hay contenido publicado.",
    pack: "Aún no hay packs publicados.",
    sub: "Aún no hay suscripciones publicadas.",
    extra: "Aún no hay extras publicados.",
    popclip: "Aún no hay contenido publicado.",
  };
  const emptyCopy = emptyCopyByFilter[activeFilter] ?? "Aún no hay contenido publicado.";
  const hasPopclips = normalizedPopclips.length > 0;
  const showCatalogEmpty =
    !isLoading && !error && orderedCatalogItems.length === 0 && (activeFilter !== "all" || !hasPopclips);
  const shouldShowPopclips = resolvedFilters.some((filter) => filter.id === "popclip");

  const resolvePopclipSocial = (item: PublicCatalogCardItem): PopClipSocialState => {
    const state = popclipSocial[item.id];
    if (state) return state;
    return {
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      liked: item.liked ?? false,
    };
  };

  const renderPopclipActions = (item: PublicCatalogCardItem) => {
    const social = resolvePopclipSocial(item);
    const isPending = Boolean(likePending[item.id]);
    const canInteract = item.canInteract !== false;
    return (
      <div className="flex items-center gap-3 text-xs text-[color:var(--muted)]">
        <button
          type="button"
          onClick={() => (canInteract ? handleToggleLike(item) : showLikeAuthToast())}
          disabled={isPending}
          aria-pressed={social.liked}
          aria-disabled={!canInteract || isPending}
          className={clsx(
            "inline-flex items-center gap-1 rounded-full border px-2 py-1 transition",
            social.liked
              ? "border-[color:rgba(244,63,94,0.6)] bg-[color:rgba(244,63,94,0.12)] text-[color:rgba(244,63,94,0.95)]"
              : "border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)]",
            (isPending || !canInteract) && "opacity-60 cursor-not-allowed"
          )}
        >
          <span>❤</span>
          <span className="tabular-nums">{social.likeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => handleOpenComments(item)}
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-border)] px-2 py-1 text-[color:var(--muted)] hover:text-[color:var(--text)]"
        >
          <span>💬</span>
          <span className="tabular-nums">{social.commentCount}</span>
        </button>
      </div>
    );
  };

  const renderGrid = (gridItems: PublicCatalogCardItem[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {gridItems.map((item) => {
        const card = item.href ? (
          <a key={item.id} href={item.href} className="block min-w-0">
            <PublicCatalogCard item={item} />
          </a>
        ) : (
          <PublicCatalogCard key={item.id} item={item} />
        );

        if (item.kind !== "popclip") return card;

        return (
          <div key={item.id} id={`popclip-${item.id}`} className="space-y-2 scroll-mt-24">
            {card}
            {renderPopclipActions(item)}
          </div>
        );
      })}
    </div>
  );

  const renderSkeleton = (length: number) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length }).map((_, index) => (
        <div
          key={`catalog-skeleton-${index}`}
          className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-3"
        >
          <Skeleton className="h-24 w-full" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );

  return (
    <section id={sectionId ?? "catalog"} className="space-y-4 scroll-mt-24 min-w-0 w-full">
      {!hideFilters && (
        <div className="flex flex-wrap gap-2">
          {resolvedFilters.map((filter) => {
            const isActive = filter.id === activeFilter;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                  isActive
                    ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}
      {toast && (
        <div className="text-xs text-[color:var(--brand)]">
          {toast.href ? (
            <a href={toast.href} className="underline underline-offset-2">
              {toast.message}
            </a>
          ) : (
            toast.message
          )}
        </div>
      )}

      {activeFilter === "popclip" ? (
        <div className="space-y-2">
          {popclipError ? (
            <div className="text-xs text-[color:var(--danger)]">{popclipError}</div>
          ) : popclipLoading ? (
            renderSkeleton(6)
          ) : filteredPopclips.length === 0 ? (
            <div className="text-xs text-[color:var(--muted)]">Sin PopClips todavía.</div>
          ) : (
            renderGrid(filteredPopclips)
          )}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.08)] px-4 py-3 text-xs text-[color:var(--text)] flex items-center justify-between gap-3">
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-[color:rgba(244,63,94,0.6)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.16)]"
            >
              Reintentar
            </button>
          )}
        </div>
      ) : isLoading ? (
        renderSkeleton(8)
      ) : showCatalogEmpty ? (
        compactEmpty ? (
          <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-xs text-[color:var(--muted)]">
            {emptyCopy}
          </div>
        ) : (
          <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 sm:p-5 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-[color:var(--muted)]">{emptyCopy}</p>
            <a
              href={chatHref}
              onClick={(event) => {
                event.preventDefault();
                void handleOpenChat();
              }}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)] sm:w-auto"
            >
              Entrar al chat privado
            </a>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {orderedCatalogItems.length > 0 && renderGrid(orderedCatalogItems)}
          {activeFilter === "all" && shouldShowPopclips && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[color:var(--text)]">PopClips</div>
              {popclipError ? (
                <div className="text-xs text-[color:var(--danger)]">{popclipError}</div>
              ) : popclipLoading ? (
                renderSkeleton(4)
              ) : filteredPopclips.length === 0 ? (
                <div className="text-xs text-[color:var(--muted)]">Sin PopClips todavía.</div>
              ) : (
                renderGrid(filteredPopclips)
              )}
            </div>
          )}
        </div>
      )}

      {activeCommentClip && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={handleCloseComments}
        >
          <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Comentarios"
              onClick={(event) => event.stopPropagation()}
              className="w-full sm:w-[520px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
            >
              <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-5 sm:pb-5 space-y-3">
                <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[color:var(--text)]">Comentarios</p>
                    <p className="text-xs text-[color:var(--muted)]">{activeCommentClip.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseComments}
                    aria-label="Cerrar"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                  >
                    X
                  </button>
                </div>
                <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-1">
                  {commentLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                    </div>
                  ) : commentItems.length === 0 ? (
                    <p className="text-xs text-[color:var(--muted)]">Sé la primera persona en comentar.</p>
                  ) : (
                    commentItems.map((comment) => (
                      <div key={comment.id} className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-xs font-semibold text-[color:var(--text)] flex items-center justify-center">
                          {(comment.fanDisplayName || "F")[0]?.toUpperCase() || "F"}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
                            <span className="font-semibold text-[color:var(--text)]">{comment.fanDisplayName}</span>
                            <span>{formatCommentDate(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-[color:var(--text)]">{comment.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {!commentCanWrite ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted)]">
                    <span>Para comentar, entra al chat privado.</span>
                    <button
                      type="button"
                      onClick={handleOpenChat}
                      className="rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                    >
                      Entrar al chat
                    </button>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      className="min-h-[44px] flex-1 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                      placeholder="Añade un comentario..."
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      maxLength={MAX_COMMENT_LENGTH}
                      rows={2}
                      disabled={commentSending}
                    />
                    <button
                      type="button"
                      onClick={handleSendComment}
                      disabled={
                        commentSending || !commentDraft.trim() || commentDraft.trim().length > MAX_COMMENT_LENGTH
                      }
                      className="h-10 rounded-xl bg-[color:var(--brand-strong)] px-4 text-xs font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)] disabled:opacity-60"
                    >
                      Enviar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function formatCommentDate(value: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch (_err) {
    return "";
  }
}

function resolveGoHandle(href: string) {
  if (!href.startsWith("/go/")) return "";
  const path = href.split("?")[0];
  return path.replace("/go/", "").split("/")[0] || "";
}

function buildAuthHref(chatHref: string, location: Location) {
  const handle = resolveGoHandle(chatHref);
  const baseHref = handle ? `/go/${handle}` : "/go/creator";
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  return `${baseHref}?returnTo=${returnTo}`;
}

function appendReturnTo(url: string, returnTo: string) {
  if (!url) return url;
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return url;
  if (url.includes("returnTo=")) return url;
  const encoded = encodeURIComponent(returnTo);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}returnTo=${encoded}`;
}
