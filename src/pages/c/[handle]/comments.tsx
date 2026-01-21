import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { randomUUID } from "crypto";
import { ThumbsUp } from "lucide-react";
import { Skeleton } from "../../../components/ui/Skeleton";
import type { PublicCreatorComment } from "../../../types/publicProfile";
import { ensureAnalyticsCookie } from "../../../lib/analyticsCookie";

type Props = {
  notFound?: boolean;
  showPreviewBanner?: boolean;
  creatorName?: string;
  creatorHandle?: string;
  isCreatorViewer?: boolean;
};

const COMMENTS_PAGE_SIZE = 10;
const CREATOR_COMMENT_MAX_LENGTH = 600;
const IS_DEV = process.env.NODE_ENV === "development";

export default function PublicCreatorComments({
  notFound,
  showPreviewBanner,
  creatorName,
  creatorHandle,
  isCreatorViewer,
}: Props) {
  const router = useRouter();
  const [comments, setComments] = useState<PublicCreatorComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [ratingDistribution, setRatingDistribution] = useState<Record<number, number> | null>(null);
  const [sortMode, setSortMode] = useState<"recent" | "highest" | "lowest" | "helpful">("recent");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [canComment, setCanComment] = useState(false);
  const [viewerIsLoggedIn, setViewerIsLoggedIn] = useState(false);
  const [viewerIsFollowing, setViewerIsFollowing] = useState(false);
  const [viewerHasPurchased, setViewerHasPurchased] = useState(false);
  const [creatorHasCatalogItems, setCreatorHasCatalogItems] = useState(false);
  const [viewerComment, setViewerComment] = useState<{ rating: number; text: string } | null>(null);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentRating, setCommentRating] = useState(5);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [helpfulPending, setHelpfulPending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [followPending, setFollowPending] = useState(false);
  const [authHref, setAuthHref] = useState("");

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!creatorHandle || typeof window === "undefined") return;
    setAuthHref(buildAuthHref(creatorHandle, window.location));
  }, [creatorHandle]);

  useEffect(() => {
    if (!creatorHandle) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("limit", String(COMMENTS_PAGE_SIZE));
    params.set("sort", sortMode);
    if (verifiedOnly) params.set("verifiedOnly", "1");
    const endpoint = `/api/public/creator/${encodeURIComponent(creatorHandle)}/comments?${params.toString()}`;
    let responseStatus: number | null = null;
    setCommentsLoading(true);
    setCommentsError("");
    setNextCursor(null);
    setRatingDistribution(null);
    setComments([]);
    setReplyTargetId(null);
    setReplyDraft("");
    setHelpfulPending({});
    setCanComment(false);
    setViewerIsLoggedIn(false);
    setViewerIsFollowing(false);
    setViewerHasPurchased(false);
    setCreatorHasCatalogItems(false);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        responseStatus = res.status;
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json()) as {
          comments?: PublicCreatorComment[];
          nextCursor?: string | null;
          totalCount?: number;
          avgRating?: number | null;
          stats?: { count?: number; avgRating?: number; distribution?: Record<number, number> };
          canComment?: boolean;
          viewerCanComment?: boolean;
          viewerIsLoggedIn?: boolean;
          viewerIsFollowing?: boolean;
          viewerHasPurchased?: boolean;
          creatorHasPacksOrCatalogItems?: boolean;
          viewerComment?: { rating: number; text: string } | null;
        };
        const list = Array.isArray(payload?.comments) ? payload.comments : [];
        setComments(list);
        setNextCursor(typeof payload?.nextCursor === "string" ? payload.nextCursor : null);
        if (typeof payload?.stats?.count === "number") {
          setTotalCount(payload.stats.count);
        } else {
          setTotalCount(typeof payload?.totalCount === "number" ? payload.totalCount : list.length);
        }
        if (typeof payload?.stats?.avgRating === "number") {
          setAvgRating(payload.stats.avgRating);
        } else {
          setAvgRating(typeof payload?.avgRating === "number" ? payload.avgRating : null);
        }
        if (payload?.stats?.distribution) {
          setRatingDistribution(payload.stats.distribution);
        }
        const resolvedCanComment =
          typeof payload?.viewerCanComment === "boolean" ? payload.viewerCanComment : Boolean(payload?.canComment);
        setCanComment(resolvedCanComment);
        setViewerIsLoggedIn(Boolean(payload?.viewerIsLoggedIn));
        setViewerIsFollowing(Boolean(payload?.viewerIsFollowing));
        setViewerHasPurchased(Boolean(payload?.viewerHasPurchased));
        setCreatorHasCatalogItems(Boolean(payload?.creatorHasPacksOrCatalogItems));
        setViewerComment(payload?.viewerComment ?? null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logPublicFetchFailure(endpoint, responseStatus, err);
        setCommentsError("No se pudieron cargar los comentarios.");
        setComments([]);
        setNextCursor(null);
        setAvgRating(null);
      })
      .finally(() => setCommentsLoading(false));
    return () => controller.abort();
  }, [creatorHandle, sortMode, verifiedOnly]);

  useEffect(() => {
    if (!commentSheetOpen) return;
    if (viewerComment) {
      setCommentRating(viewerComment.rating);
      setCommentText(viewerComment.text);
      return;
    }
    setCommentRating(5);
    setCommentText("");
  }, [commentSheetOpen, viewerComment]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2200);
  };

  const handleLoadMore = async () => {
    if (!creatorHandle || !nextCursor || commentsLoadingMore) return;
    setCommentsLoadingMore(true);
    const params = new URLSearchParams();
    params.set("limit", String(COMMENTS_PAGE_SIZE));
    params.set("cursor", nextCursor);
    params.set("sort", sortMode);
    if (verifiedOnly) params.set("verifiedOnly", "1");
    const endpoint = `/api/public/creator/${encodeURIComponent(creatorHandle)}/comments?${params.toString()}`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint);
      responseStatus = res.status;
      if (!res.ok) throw new Error("request failed");
      const payload = (await res.json()) as {
        comments?: PublicCreatorComment[];
        nextCursor?: string | null;
        totalCount?: number;
        avgRating?: number | null;
        stats?: { count?: number; avgRating?: number; distribution?: Record<number, number> };
      };
      const list = Array.isArray(payload?.comments) ? payload.comments : [];
      setComments((prev) => {
        if (!list.length) return prev;
        const existing = new Set(prev.map((item) => item.id));
        return [...prev, ...list.filter((item) => !existing.has(item.id))];
      });
      setNextCursor(typeof payload?.nextCursor === "string" ? payload.nextCursor : null);
      if (typeof payload?.totalCount === "number") {
        setTotalCount(payload.totalCount);
      }
      if (typeof payload?.avgRating === "number") {
        setAvgRating(payload.avgRating);
      }
      if (typeof payload?.stats?.count === "number") {
        setTotalCount(payload.stats.count);
      }
      if (typeof payload?.stats?.avgRating === "number") {
        setAvgRating(payload.stats.avgRating);
      }
      if (payload?.stats?.distribution) {
        setRatingDistribution(payload.stats.distribution);
      }
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      showToast("No se pudieron cargar más comentarios.");
    } finally {
      setCommentsLoadingMore(false);
    }
  };

  const handleSubmitCreatorComment = async () => {
    if (!creatorHandle || commentSending) return;
    const trimmed = commentText.trim();
    if (!trimmed || trimmed.length > CREATOR_COMMENT_MAX_LENGTH) {
      showToast("Revisa el texto del comentario.");
      return;
    }
    setCommentSending(true);
    const endpoint = `/api/public/creator/${encodeURIComponent(creatorHandle)}/comments`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: commentRating, text: trimmed }),
      });
      responseStatus = res.status;
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; created?: boolean; comment?: PublicCreatorComment }
        | null;
      if (!res.ok || !data) {
        if (res.status === 401 || res.status === 403) {
          showToast("Solo seguidores o clientes pueden comentar.");
          return;
        }
        throw new Error("request failed");
      }
      if (data.ok === false) {
        if (data.error === "NOT_ELIGIBLE" || data.error === "AUTH_REQUIRED") {
          showToast("Solo seguidores o clientes pueden comentar.");
          return;
        }
        throw new Error("request failed");
      }
      if (!data.comment) throw new Error("missing comment");
      const nextComment = data.comment;
      setViewerComment({ rating: nextComment.rating, text: nextComment.text });
      setComments((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === nextComment.id);
        const next =
          existingIndex >= 0
            ? [nextComment, ...prev.filter((item) => item.id !== nextComment.id)]
            : [nextComment, ...prev];
        return next;
      });
      if (data.created) {
        setTotalCount((prev) => (typeof prev === "number" ? prev + 1 : 1));
      }
      setCommentSheetOpen(false);
      showToast("Comentario enviado.");
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      showToast("No se pudo enviar el comentario.");
    } finally {
      setCommentSending(false);
    }
  };

  const handleEnableAlerts = async () => {
    if (!creatorHandle || followPending) return;
    if (viewerIsFollowing) {
      showToast("Avisos ya activados.");
      return;
    }
    const endpoint = `/api/public/creator/${encodeURIComponent(creatorHandle)}/follow`;
    let responseStatus: number | null = null;
    const prev = {
      viewerIsFollowing,
      viewerIsLoggedIn,
      canComment,
    };
    setViewerIsFollowing(true);
    setViewerIsLoggedIn(true);
    setCanComment(true);
    setFollowPending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      responseStatus = res.status;
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json().catch(() => null)) as { following?: boolean } | null;
      if (typeof data?.following === "boolean") {
        setViewerIsFollowing(data.following);
        setCanComment(data.following || viewerHasPurchased);
      }
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      setViewerIsFollowing(prev.viewerIsFollowing);
      setViewerIsLoggedIn(prev.viewerIsLoggedIn);
      setCanComment(prev.canComment);
      showToast("No se pudieron activar los avisos.");
    } finally {
      setFollowPending(false);
    }
  };

  const handleSaveReply = async (commentId: string) => {
    if (replySending) return;
    const trimmed = replyDraft.trim();
    if (!trimmed || trimmed.length > CREATOR_COMMENT_MAX_LENGTH) {
      showToast("Revisa el texto de la respuesta.");
      return;
    }
    setReplySending(true);
    const endpoint = `/api/creator/comments/${encodeURIComponent(commentId)}/reply`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      responseStatus = res.status;
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; comment?: { id: string; replyText?: string | null; repliedAt?: string | null; repliedByCreatorId?: string | null } }
        | null;
      if (!res.ok || !data || data.ok === false || !data.comment) {
        if (res.status === 401 || res.status === 403) {
          showToast("No tienes permisos para responder.");
          return;
        }
        throw new Error("request failed");
      }
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                replyText: data.comment?.replyText ?? trimmed,
                repliedAt: data.comment?.repliedAt ?? new Date().toISOString(),
                repliedByCreatorId: data.comment?.repliedByCreatorId ?? comment.repliedByCreatorId,
              }
            : comment
        )
      );
      setReplyTargetId(null);
      setReplyDraft("");
      showToast("Respuesta publicada.");
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      showToast("No se pudo guardar la respuesta.");
    } finally {
      setReplySending(false);
    }
  };

  const handleToggleHelpful = async (commentId: string) => {
    if (!creatorHandle || helpfulPending[commentId] || !viewerIsLoggedIn || isCreatorViewer) return;
    const target = comments.find((comment) => comment.id === commentId);
    if (!target) return;
    const prevHasVoted = Boolean(target.viewerHasVoted);
    const prevCount = typeof target.helpfulCount === "number" ? target.helpfulCount : 0;
    const nextHasVoted = !prevHasVoted;
    const nextCount = Math.max(0, prevCount + (nextHasVoted ? 1 : -1));

    setHelpfulPending((prev) => ({ ...prev, [commentId]: true }));
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, viewerHasVoted: nextHasVoted, helpfulCount: nextCount }
          : comment
      )
    );

    const endpoint = `/api/creator/comments/${encodeURIComponent(commentId)}/helpful`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint, { method: "POST" });
      responseStatus = res.status;
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; voted?: boolean; helpfulCount?: number; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        if (res.status === 401) {
          setComments((prev) =>
            prev.map((comment) =>
              comment.id === commentId
                ? { ...comment, viewerHasVoted: prevHasVoted, helpfulCount: prevCount }
                : comment
            )
          );
          showToast("Inicia sesión para votar.");
          return;
        }
        if (res.status === 403) {
          setComments((prev) =>
            prev.map((comment) =>
              comment.id === commentId
                ? { ...comment, viewerHasVoted: prevHasVoted, helpfulCount: prevCount }
                : comment
            )
          );
          showToast("No puedes votar en tu propio perfil.");
          return;
        }
        throw new Error("request failed");
      }
      const updatedCount =
        typeof data.helpfulCount === "number" ? data.helpfulCount : nextCount;
      const voted = typeof data.voted === "boolean" ? data.voted : nextHasVoted;
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, viewerHasVoted: voted, helpfulCount: updatedCount }
            : comment
        )
      );
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, viewerHasVoted: prevHasVoted, helpfulCount: prevCount }
            : comment
        )
      );
      showToast("No se pudo actualizar el voto.");
    } finally {
      setHelpfulPending((prev) => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
    }
  };

  if (notFound || !creatorHandle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-0)] text-[color:var(--muted)] px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Perfil no disponible</h1>
          <p className="text-sm text-[color:var(--muted)]">El creador aún no ha activado su perfil público.</p>
        </div>
      </div>
    );
  }

  const countLabel = typeof totalCount === "number" ? totalCount : comments.length;
  const avgValue = typeof avgRating === "number" && Number.isFinite(avgRating) && countLabel > 0 ? avgRating : null;
  const distributionRows = ratingDistribution && countLabel > 0
    ? [5, 4, 3, 2, 1].map((rating) => {
        const count = ratingDistribution[rating] ?? 0;
        const percent = countLabel > 0 ? Math.round((count / countLabel) * 100) : 0;
        return { rating, count, percent };
      })
    : [];

  return (
    <>
      <Head>
        <title>Comentarios · {creatorName || "Perfil público"}</title>
      </Head>
      <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
        <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 space-y-6">
          <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
            <a
              href={`/c/${creatorHandle}`}
              className="inline-flex items-center gap-2 font-semibold text-[color:var(--brand)] hover:underline"
            >
              Volver al perfil
            </a>
            {creatorName && <span className="truncate">{creatorName}</span>}
          </div>

          {showPreviewBanner && (
            <div className="rounded-xl border border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:var(--surface-1)] px-4 py-2 text-xs text-[color:var(--muted)]">
              Vista previa: tu perfil aún no está público.
            </div>
          )}

          {toast && <div className="text-xs text-[color:var(--brand)]">{toast}</div>}

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[color:var(--text)]">Comentarios</h1>
              {avgValue !== null && (
                <span className="text-sm font-semibold text-[color:var(--muted)]" title="Valoración media">
                  {avgValue.toFixed(1)} ★
                </span>
              )}
            </div>
            <p className="text-xs text-[color:var(--muted)]">Basado en {countLabel} reseñas</p>
            {distributionRows.length > 0 && (
              <div className="space-y-2">
                {distributionRows.map((row) => (
                  <div key={`dist-${row.rating}`} className="flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
                    <span className="w-10 text-right">{row.rating}★</span>
                    <div className="flex-1 h-2 rounded-full bg-[color:var(--surface-2)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[color:var(--brand)]"
                        style={{ width: `${row.percent}%` }}
                        aria-label={`${row.count} reseñas de ${row.rating} estrellas`}
                      />
                    </div>
                    <span className="w-10 text-right">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </header>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
            <label className="flex items-center gap-2">
              <span>Ordenar por</span>
              <select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as "recent" | "highest" | "lowest" | "helpful")
                }
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs text-[color:var(--text)]"
                aria-label="Ordenar comentarios"
              >
                <option value="recent">Más recientes</option>
                <option value="helpful">Más útiles</option>
                <option value="highest">Mejor puntuación</option>
                <option value="lowest">Peor puntuación</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[color:var(--surface-border)] text-[color:var(--brand)]"
                checked={verifiedOnly}
                onChange={(event) => setVerifiedOnly(event.target.checked)}
                aria-label="Solo comentarios verificados"
              />
              <span>Solo verificados</span>
            </label>
          </div>

          <div className="space-y-3">
            {canComment && (
              <button
                type="button"
                onClick={() => setCommentSheetOpen(true)}
                className="inline-flex items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
              >
                Escribir comentario
              </button>
            )}
            {!canComment && !isCreatorViewer && (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-xs text-[color:var(--text)] space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[color:var(--text)]">Para poder comentar</p>
                  <p className="text-[11px] text-[color:var(--muted)]">
                    {viewerIsLoggedIn
                      ? "Activa avisos o compra un pack para poder comentar."
                      : "Inicia sesión para comentar."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!viewerIsLoggedIn ? (
                    <a
                      href={authHref || (creatorHandle ? `/go/${creatorHandle}` : "/go/creator")}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 text-[11px] font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)]"
                    >
                      Iniciar sesión
                    </a>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleEnableAlerts()}
                        disabled={followPending}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] px-4 text-[11px] font-semibold text-[color:var(--text)] transition hover:bg-[color:rgba(var(--brand-rgb),0.16)] disabled:opacity-60"
                      >
                        Activar avisos
                      </button>
                      {creatorHasCatalogItems ? (
                        <a
                          href={creatorHandle ? `/c/${creatorHandle}#catalog` : "/c/creator#catalog"}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] px-4 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                        >
                          Ver packs
                        </a>
                      ) : (
                        <a
                          href={creatorHandle ? `/go/${creatorHandle}` : "/go/creator"}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] px-4 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                        >
                          Entrar al chat privado
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            {!canComment && isCreatorViewer && (
              <p className="text-xs text-[color:var(--muted)]">Solo seguidores o clientes pueden comentar.</p>
            )}
          </div>

          {commentsError ? (
            <div className="rounded-xl border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.08)] px-4 py-3 text-xs text-[color:var(--text)] flex items-center justify-between gap-3">
              <span>{commentsError}</span>
              <button
                type="button"
                onClick={() => router.replace(router.asPath)}
                className="rounded-full border border-[color:rgba(244,63,94,0.6)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.16)]"
              >
                Reintentar
              </button>
            </div>
          ) : commentsLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={`comment-skeleton-${idx}`} className="h-24 w-full" />
              ))}
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-[color:var(--muted)]">Aún no hay comentarios.</p>
          ) : (
            <div className="grid gap-3">
              {comments.map((comment) => {
                const helpfulDisabled = helpfulPending[comment.id] || !viewerIsLoggedIn || Boolean(isCreatorViewer);
                const helpfulTitle = helpfulPending[comment.id]
                  ? "Actualizando voto..."
                  : isCreatorViewer
                  ? "No puedes votar en tu propio perfil"
                  : viewerIsLoggedIn
                  ? "Marcar comentario como útil"
                  : "Inicia sesión para votar";
                return (
                  <div
                    key={comment.id}
                    className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                      <span className="text-[color:var(--warning)]">{renderStars(comment.rating)}</span>
                      <span>{formatCreatorCommentDate(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[color:var(--text)] whitespace-pre-line">{comment.text}</p>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[color:var(--muted)]">
                        <span>{comment.fanDisplayNameMasked}</span>
                        {comment.verified && (
                          <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                            Comprador verificado
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleHelpful(comment.id)}
                        disabled={helpfulDisabled}
                        title={helpfulTitle}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                          comment.viewerHasVoted
                            ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                            : "border-[color:var(--surface-border)] text-[color:var(--muted)]"
                        } ${helpfulDisabled ? "opacity-60 cursor-not-allowed" : "hover:bg-[color:var(--surface-2)]"}`}
                        aria-label={helpfulTitle}
                      >
                        <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                        <span>Útil</span>
                        <span className="tabular-nums">
                          {typeof comment.helpfulCount === "number" ? comment.helpfulCount : 0}
                        </span>
                      </button>
                    </div>
                    {comment.replyText && (
                      <div className="ml-8 rounded-xl border border-[color:var(--surface-border)] border-l-2 border-l-[color:rgba(var(--brand-rgb),0.35)] bg-[color:var(--surface-2)] px-3 py-2 text-[13px] text-[color:var(--text)] space-y-2">
                        <div className="flex flex-col gap-1 text-[10px] text-[color:var(--muted)] sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[11px] font-semibold text-[color:var(--text)]">
                              {getCreatorInitial(creatorName)}
                            </span>
                            <span className="text-[11px] font-semibold text-[color:var(--text)]">Respuesta</span>
                          </div>
                          {comment.repliedAt && (
                            <span className="text-[10px] text-[color:var(--muted)]">
                              {formatCreatorCommentDate(comment.repliedAt)}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-line">{comment.replyText}</p>
                      </div>
                    )}
                    {isCreatorViewer && !comment.replyText && replyTargetId !== comment.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTargetId(comment.id);
                          setReplyDraft("");
                        }}
                        className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
                      >
                        Responder
                      </button>
                    )}
                    {isCreatorViewer && replyTargetId === comment.id && (
                      <div className="space-y-2">
                        <textarea
                          className="min-h-[88px] w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                          placeholder="Escribe una respuesta..."
                          value={replyDraft}
                          onChange={(event) => setReplyDraft(event.target.value)}
                          maxLength={CREATOR_COMMENT_MAX_LENGTH}
                        />
                        <div className="flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                          <span>Máx. {CREATOR_COMMENT_MAX_LENGTH} caracteres</span>
                          <span>{replyDraft.length}/{CREATOR_COMMENT_MAX_LENGTH}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveReply(comment.id)}
                            disabled={replySending || !replyDraft.trim()}
                            className="h-9 rounded-full bg-[color:var(--brand-strong)] px-4 text-xs font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)] disabled:opacity-60"
                          >
                            {replySending ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTargetId(null);
                              setReplyDraft("");
                            }}
                            className="h-9 rounded-full border border-[color:var(--surface-border)] px-4 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {nextCursor && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={commentsLoadingMore}
              className="w-full rounded-full border border-[color:var(--surface-border)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)] disabled:opacity-60"
            >
              {commentsLoadingMore ? "Cargando..." : "Cargar más"}
            </button>
          )}
        </main>

        {commentSheetOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setCommentSheetOpen(false)}>
            <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-6">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Escribir comentario"
                onClick={(event) => event.stopPropagation()}
                className="w-full sm:w-[520px] max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
              >
                <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-5 sm:pb-5 space-y-4">
                  <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[color:var(--text)]">Escribir comentario</p>
                      <p className="text-xs text-[color:var(--muted)]">Tu opinión se mostrará en el perfil.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCommentSheetOpen(false)}
                      aria-label="Cerrar"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
                    >
                      X
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {Array.from({ length: 5 }).map((_, idx) => {
                      const value = idx + 1;
                      const active = value <= commentRating;
                      return (
                        <button
                          key={`rating-${value}`}
                          type="button"
                          onClick={() => setCommentRating(value)}
                          aria-label={`Puntuación ${value}`}
                          aria-pressed={active}
                          className={`text-lg ${active ? "text-[color:var(--warning)]" : "text-[color:var(--muted)]"} hover:text-[color:var(--warning)]`}
                        >
                          ★
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    <textarea
                      className="min-h-[120px] w-full rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                      placeholder="Escribe tu comentario..."
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      maxLength={CREATOR_COMMENT_MAX_LENGTH}
                    />
                    <div className="flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                      <span>Máx. {CREATOR_COMMENT_MAX_LENGTH} caracteres</span>
                      <span>{commentText.length}/{CREATOR_COMMENT_MAX_LENGTH}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmitCreatorComment}
                    disabled={commentSending || !commentText.trim()}
                    className="h-11 w-full rounded-xl bg-[color:var(--brand-strong)] px-4 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)] disabled:opacity-60"
                  >
                    {commentSending ? "Enviando..." : "Enviar comentario"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const prisma = (await import("../../../lib/prisma.server")).default;
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const creators = await prisma.creator.findMany();
  const match = creators.find((creator) => slugify(creator.name) === handleParam) || creators[0];

  const previewHandle = readPreviewHandle(ctx.req?.headers?.cookie);
  const previewAllowed = Boolean(match && previewHandle && slugify(match.name) === previewHandle);
  const profile = match ? await prisma.creatorProfile.findUnique({ where: { creatorId: match.id } }) : null;
  const visibilityMode = resolveVisibilityMode(profile?.visibilityMode);
  const showPreviewBanner = Boolean(match && previewAllowed && visibilityMode === "INVISIBLE");

  if (!match) {
    return { props: { notFound: true } };
  }

  if (!previewAllowed && visibilityMode === "INVISIBLE") {
    console.info("Public profile hidden", { handle: handleParam, mode: visibilityMode });
    return { props: { notFound: true } };
  }

  const utmSource = typeof ctx.query.utm_source === "string" ? ctx.query.utm_source : undefined;
  const utmMedium = typeof ctx.query.utm_medium === "string" ? ctx.query.utm_medium : undefined;
  const utmCampaign = typeof ctx.query.utm_campaign === "string" ? ctx.query.utm_campaign : undefined;
  const utmContent = typeof ctx.query.utm_content === "string" ? ctx.query.utm_content : undefined;
  const utmTerm = typeof ctx.query.utm_term === "string" ? ctx.query.utm_term : undefined;
  const referrer = (ctx.req?.headers?.referer as string | undefined) || (ctx.req?.headers?.referrer as string | undefined);

  try {
    ensureAnalyticsCookie(
      ctx.req as any,
      ctx.res as any,
      {
        sessionId: randomUUID(),
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        referrer,
      }
    );
  } catch (_err) {
    // ignore cookie errors
  }

  const creatorHandle = slugify(match.name);
  return {
    props: {
      creatorName: match.name || "Creador",
      creatorHandle,
      showPreviewBanner,
      isCreatorViewer: previewAllowed,
    },
  };
};

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function resolveVisibilityMode(value: unknown): "INVISIBLE" | "SOLO_LINK" | "DISCOVERABLE" | "PUBLIC" {
  if (value === "INVISIBLE") return "INVISIBLE";
  if (value === "DISCOVERABLE") return "DISCOVERABLE";
  if (value === "PUBLIC") return "PUBLIC";
  return "SOLO_LINK";
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const entries = cookieHeader.split(";").map((part) => part.trim().split("="));
  for (const [rawKey, ...rest] of entries) {
    if (!rawKey) continue;
    const key = decodeURIComponent(rawKey);
    if (key !== "novsy_creator_preview") continue;
    return slugify(decodeURIComponent(rest.join("=")));
  }
  return "";
}

function renderStars(rating: number) {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  return "★★★★★".slice(0, safe) + "☆☆☆☆☆".slice(0, 5 - safe);
}

function getCreatorInitial(name?: string | null) {
  const trimmed = (name || "").trim();
  return (trimmed[0] || "C").toUpperCase();
}

function formatCreatorCommentDate(value: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function logPublicFetchFailure(endpoint: string, status?: number | null, error?: unknown) {
  if (!IS_DEV) return;
  const message = error instanceof Error ? error.message : error ? String(error) : "";
  console.warn("[public] fetch failed", {
    endpoint,
    status: status ?? null,
    error: message || undefined,
  });
}

function buildAuthHref(handle: string, location: Location) {
  const safeHandle = handle || "creator";
  const baseHref = `/go/${safeHandle}`;
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  return `${baseHref}?returnTo=${returnTo}`;
}
