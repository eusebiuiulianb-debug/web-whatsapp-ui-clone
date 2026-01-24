import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { randomUUID } from "crypto";
import { ThumbsUp } from "lucide-react";
import { Skeleton } from "../../../components/ui/Skeleton";
import type { PublicCommentReply, PublicCreatorComment } from "../../../types/publicProfile";
import { ensureAnalyticsCookie } from "../../../lib/analyticsCookie";

type Props = {
  notFound?: boolean;
  showPreviewBanner?: boolean;
  creatorName?: string;
  creatorHandle?: string;
  isCreatorViewer?: boolean;
  locale?: "es" | "en";
};

const COMMENTS_PAGE_SIZE = 10;
const CREATOR_COMMENT_MAX_LENGTH = 600;
const REPLY_PREVIEW_LIMIT = 1;
const MAX_REPLY_PARTICIPANTS = 10;
const IS_DEV = process.env.NODE_ENV === "development";

type Locale = "es" | "en";

const COPY: Record<
  Locale,
  {
    reply: string;
    viewReplies: (count: number) => string;
    threadFull: (count: number) => string;
    threadFullBadge: string;
    threadLocked: string;
    threadLockedBadge: string;
    loginToReply: string;
    verifiedOnly: string;
  }
> = {
  es: {
    reply: "Responder",
    viewReplies: (count) => `Ver ${count} respuestas`,
    threadFull: (count) => `Hilo completo (máx. ${count} participantes).`,
    threadFullBadge: "Hilo completo",
    threadLocked: "Hilo cerrado por el creador.",
    threadLockedBadge: "Hilo cerrado",
    loginToReply: "Inicia sesión para responder.",
    verifiedOnly: "Solo compradores verificados pueden responder.",
  },
  en: {
    reply: "Reply",
    viewReplies: (count) => `View ${count} replies`,
    threadFull: (count) => `Thread full (max ${count} participants).`,
    threadFullBadge: "Thread full",
    threadLocked: "Thread closed by the creator.",
    threadLockedBadge: "Thread closed",
    loginToReply: "Sign in to reply.",
    verifiedOnly: "Verified buyers only.",
  },
};

export default function PublicCreatorComments({
  notFound,
  showPreviewBanner,
  creatorName,
  creatorHandle,
  isCreatorViewer,
  locale: localeProp,
}: Props) {
  const router = useRouter();
  const locale: Locale = localeProp === "en" ? "en" : "es";
  const t = (
    key:
      | "reply"
      | "viewReplies"
      | "threadFull"
      | "threadFullBadge"
      | "threadLocked"
      | "threadLockedBadge"
      | "loginToReply"
      | "verifiedOnly",
    count?: number
  ) => {
    const entry = COPY[locale][key];
    return typeof entry === "function" ? entry(count ?? 0) : entry;
  };
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
  const [replyExpanded, setReplyExpanded] = useState<Record<string, boolean>>({});
  const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});
  const [replyItemsById, setReplyItemsById] = useState<Record<string, PublicCommentReply[]>>({});
  const [lockPending, setLockPending] = useState<Record<string, boolean>>({});
  const [helpfulPending, setHelpfulPending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    params.set("handle", creatorHandle);
    const endpoint = `/api/public/comments?${params.toString()}`;
    let responseStatus: number | null = null;
    setCommentsLoading(true);
    setCommentsError("");
    setNextCursor(null);
    setRatingDistribution(null);
    setComments([]);
    setReplyTargetId(null);
    setReplyDraft("");
    setReplyExpanded({});
    setReplyLoading({});
    setReplyItemsById({});
    setHelpfulPending({});
    setCanComment(false);
    setViewerIsLoggedIn(false);
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
    params.set("handle", creatorHandle);
    const endpoint = `/api/public/comments?${params.toString()}`;
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
    const endpoint = `/api/public/comments?handle=${encodeURIComponent(creatorHandle)}`;
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
          showToast("Solo compradores verificados pueden comentar.");
          return;
        }
        throw new Error("request failed");
      }
      if (data.ok === false) {
        if (data.error === "NOT_ELIGIBLE" || data.error === "NOT_VERIFIED" || data.error === "AUTH_REQUIRED") {
          showToast("Solo compradores verificados pueden comentar.");
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

  const loadReplies = async (commentId: string) => {
    if (replyLoading[commentId]) return;
    setReplyLoading((prev) => ({ ...prev, [commentId]: true }));
    const endpoint = `/api/public/comments/${encodeURIComponent(commentId)}/replies`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint);
      responseStatus = res.status;
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            replies?: PublicCommentReply[];
            repliesCount?: number;
            participantsCount?: number;
            repliesLocked?: boolean;
          }
        | null;
      if (!data || data.ok === false) throw new Error("request failed");
      const list = Array.isArray(data.replies) ? data.replies : [];
      setReplyItemsById((prev) => ({ ...prev, [commentId]: list }));
      setComments((prev) =>
        prev.map((comment) => {
          if (comment.id !== commentId) return comment;
          const next = { ...comment };
          if (typeof data.repliesCount === "number") {
            next.repliesCount = data.repliesCount;
          }
          if (typeof data.participantsCount === "number") {
            next.replyParticipantsCount = data.participantsCount;
          }
          if (typeof data.repliesLocked === "boolean") {
            next.repliesLocked = data.repliesLocked;
          }
          return next;
        })
      );
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      showToast("No se pudieron cargar las respuestas.");
    } finally {
      setReplyLoading((prev) => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
    }
  };

  const handleExpandReplies = (commentId: string) => {
    if (replyExpanded[commentId]) return;
    setReplyExpanded((prev) => ({ ...prev, [commentId]: true }));
    if (!replyItemsById[commentId]) {
      void loadReplies(commentId);
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
    const endpoint = `/api/public/comments/${encodeURIComponent(commentId)}/replies`;
    let responseStatus: number | null = null;
    const hasFullReplies = Boolean(replyItemsById[commentId]);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      responseStatus = res.status;
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string | { code?: string; message?: string };
            message?: string;
            reply?: PublicCommentReply;
            updated?: boolean;
            participantsCount?: number;
          }
        | null;
      if (!res.ok || !data || data.ok === false || !data.reply) {
        const errorCode =
          typeof data?.error === "string" ? data.error : typeof (data as any)?.error?.code === "string"
          ? (data as any).error.code
          : "";
        const errorMessage =
          typeof data?.message === "string" && data.message.trim()
            ? data.message
            : typeof (data as any)?.error?.message === "string"
            ? (data as any).error.message
            : "";
        if (res.status === 401 || errorCode === "AUTH_REQUIRED") {
          showToast(t("loginToReply"));
          return;
        }
        if (res.status === 403) {
          if (errorCode === "THREAD_LOCKED") {
            showToast(errorMessage || t("threadLocked"));
            return;
          }
          if (errorCode === "THREAD_FULL") {
            showToast(errorMessage || t("threadFull", MAX_REPLY_PARTICIPANTS));
            return;
          }
          if (errorCode === "NOT_ELIGIBLE" || errorCode === "NOT_VERIFIED") {
            showToast(t("verifiedOnly"));
            return;
          }
        }
        if (res.status === 409) {
          showToast(errorMessage || t("threadFull", MAX_REPLY_PARTICIPANTS));
          return;
        }
        if (errorMessage) {
          showToast(errorMessage);
          return;
        }
        throw new Error("request failed");
      }
      const newReply = data.reply;
      const wasUpdated = data.updated === true;
      const participantsCountFromResponse =
        typeof data.participantsCount === "number" ? data.participantsCount : null;
      setReplyTargetId(null);
      setReplyDraft("");
      setReplyExpanded((prev) => ({ ...prev, [commentId]: true }));
      setComments((prev) =>
        prev.map((comment) => {
          if (comment.id !== commentId) return comment;
          const previewReplies = resolvePreviewReplies(comment, creatorName);
          const prevCount =
            typeof comment.repliesCount === "number" ? comment.repliesCount : previewReplies.length;
          const prevParticipants =
            typeof comment.replyParticipantsCount === "number" ? comment.replyParticipantsCount : 0;
          const viewerAlreadyReplied = Boolean(comment.viewerHasReplied);
          const nextPreview = wasUpdated
            ? previewReplies.map((reply) => (reply.id === newReply.id ? newReply : reply))
            : previewReplies.length >= REPLY_PREVIEW_LIMIT
            ? previewReplies
            : [...previewReplies, newReply];
          const nextCount = wasUpdated ? prevCount : prevCount + 1;
          const nextParticipants = participantsCountFromResponse ?? (() => {
            if (wasUpdated || viewerAlreadyReplied || isCreatorViewer) return prevParticipants;
            return prevParticipants + 1;
          })();
          const nextViewerHasReplied = viewerAlreadyReplied || (!wasUpdated && !isCreatorViewer);
          return {
            ...comment,
            repliesCount: nextCount,
            replies: nextPreview,
            replyParticipantsCount: nextParticipants,
            viewerHasReplied: nextViewerHasReplied,
          };
        })
      );
      setReplyItemsById((prev) => {
        const existing = prev[commentId];
        if (!existing) return prev;
        const merged = wasUpdated
          ? existing.map((reply) => (reply.id === newReply.id ? newReply : reply))
          : [...existing, newReply].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
        return { ...prev, [commentId]: merged };
      });
      if (!hasFullReplies && !wasUpdated) {
        void loadReplies(commentId);
      }
      showToast(wasUpdated ? "Respuesta actualizada." : "Respuesta publicada.");
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      showToast("No se pudo guardar la respuesta.");
    } finally {
      setReplySending(false);
    }
  };

  const handleToggleThreadLock = async (commentId: string, nextLocked: boolean) => {
    if (!creatorHandle || !isCreatorViewer || lockPending[commentId]) return;
    setLockPending((prev) => ({ ...prev, [commentId]: true }));
    const endpoint = `/api/creator/comments/${encodeURIComponent(commentId)}/replies-lock`;
    let responseStatus: number | null = null;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: nextLocked }),
      });
      responseStatus = res.status;
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; repliesLocked?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) throw new Error("request failed");
      const resolvedLocked = typeof data.repliesLocked === "boolean" ? data.repliesLocked : nextLocked;
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId ? { ...comment, repliesLocked: resolvedLocked } : comment
        )
      );
      showToast(resolvedLocked ? "Hilo cerrado." : "Hilo reabierto.");
    } catch (err) {
      logPublicFetchFailure(endpoint, responseStatus, err);
      showToast("No se pudo actualizar el hilo.");
    } finally {
      setLockPending((prev) => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
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
          <div className="flex justify-center pt-2">
            <a
              href="/explore"
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              Volver a explorar
            </a>
          </div>
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
                      ? "Compra un pack para poder comentar."
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
                      {creatorHasCatalogItems ? (
                        <a
                          href={creatorHandle ? `/c/${creatorHandle}#catalog` : "/c/creator#catalog"}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] px-4 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                        >
                          Ver packs
                        </a>
                      ) : (
                        <a
                          href={creatorHandle ? `/go/${creatorHandle}` : "/go/creator"}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] px-4 text-[11px] font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                        >
                          Entrar al chat privado
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
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
                const helpfulDisabledClass = helpfulDisabled
                  ? isCreatorViewer
                    ? "opacity-50 cursor-not-allowed"
                    : "opacity-60 cursor-not-allowed"
                  : "hover:bg-[color:var(--surface-2)]";
                const previewReplies = resolvePreviewReplies(comment, creatorName);
                const totalReplies =
                  typeof comment.repliesCount === "number" ? comment.repliesCount : previewReplies.length;
                const repliesLocked = Boolean(comment.repliesLocked);
                const participantsCount =
                  typeof comment.replyParticipantsCount === "number" ? comment.replyParticipantsCount : 0;
                const threadFull = participantsCount >= MAX_REPLY_PARTICIPANTS;
                const viewerHasReplied = Boolean(comment.viewerHasReplied);
                const threadFullForViewer = threadFull && !viewerHasReplied && !isCreatorViewer;
                const replyBlocked = repliesLocked;
                const expanded = Boolean(replyExpanded[comment.id]);
                const displayReplies = expanded
                  ? replyItemsById[comment.id] ?? previewReplies
                  : previewReplies;
                const showViewReplies = !expanded && totalReplies > previewReplies.length;
                const repliesLoading = Boolean(replyLoading[comment.id]);
                const viewerCanReply = Boolean(isCreatorViewer || (viewerIsLoggedIn && viewerHasPurchased));
                const canReplyAction = viewerCanReply && !threadFullForViewer && !replyBlocked;
                const replyHint = !viewerCanReply
                  ? viewerIsLoggedIn
                    ? t("verifiedOnly")
                    : t("loginToReply")
                  : replyBlocked
                  ? t("threadLocked")
                  : threadFullForViewer
                  ? t("threadFull", MAX_REPLY_PARTICIPANTS)
                  : "";
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
                        } ${helpfulDisabledClass}`}
                        aria-label={helpfulTitle}
                      >
                        <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                        <span>Útil</span>
                        <span className="tabular-nums">
                          {typeof comment.helpfulCount === "number" ? comment.helpfulCount : 0}
                        </span>
                      </button>
                    </div>
                    {displayReplies.length > 0 && (
                      <div className="space-y-2">
                        {displayReplies.map((reply) => (
                          <div
                            key={reply.id}
                            className="ml-8 rounded-xl border border-[color:var(--surface-border)] border-l-2 border-l-[color:rgba(var(--brand-rgb),0.35)] bg-[color:var(--surface-2)] px-3 py-2 text-[13px] text-[color:var(--text)] space-y-2"
                          >
                            <div className="flex flex-col gap-1 text-[10px] text-[color:var(--muted)] sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[11px] font-semibold text-[color:var(--text)]">
                                  {getInitial(reply.authorDisplayName)}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] font-semibold text-[color:var(--text)]">
                                    {reply.authorDisplayName}
                                  </span>
                                  <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                                    {reply.authorRole === "CREATOR" ? "Creador" : "Comprador verificado"}
                                  </span>
                                </div>
                              </div>
                              <span className="text-[10px] text-[color:var(--muted)]">
                                {formatCreatorCommentDate(reply.createdAt)}
                              </span>
                            </div>
                            <p className="whitespace-pre-line">{reply.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {(repliesLocked || threadFull || isCreatorViewer) && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                        {repliesLocked && (
                          <span className="rounded-full border border-[color:rgba(244,63,94,0.4)] bg-[color:rgba(244,63,94,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                            {t("threadLockedBadge")}
                          </span>
                        )}
                        {threadFull && (
                          <span className="rounded-full border border-[color:rgba(245,158,11,0.5)] bg-[color:rgba(245,158,11,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)]">
                            {t("threadFullBadge")}
                          </span>
                        )}
                        {isCreatorViewer && (
                          <button
                            type="button"
                            onClick={() => handleToggleThreadLock(comment.id, !repliesLocked)}
                            disabled={lockPending[comment.id]}
                            className="rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                          >
                            {lockPending[comment.id]
                              ? "Guardando..."
                              : repliesLocked
                              ? "Abrir hilo"
                              : "Cerrar hilo"}
                          </button>
                        )}
                      </div>
                    )}
                    {showViewReplies && (
                      <button
                        type="button"
                        onClick={() => handleExpandReplies(comment.id)}
                        className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
                      >
                        {t("viewReplies", totalReplies)}
                      </button>
                    )}
                    {expanded && repliesLoading && (
                      <div className="text-[11px] text-[color:var(--muted)]">Cargando respuestas...</div>
                    )}
                    {replyHint && (
                      <div className="text-[11px] text-[color:var(--muted)]">{replyHint}</div>
                    )}
                    {canReplyAction && replyTargetId !== comment.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTargetId(comment.id);
                          setReplyDraft("");
                        }}
                        className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
                      >
                        {t("reply")}
                      </button>
                    )}
                    {canReplyAction && replyTargetId === comment.id && (
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
  const locale = resolveLocale(ctx.req?.headers["accept-language"]);
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
      locale,
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

function getInitial(name?: string | null) {
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

function resolvePreviewReplies(
  comment: PublicCreatorComment,
  creatorName?: string | null
): PublicCommentReply[] {
  if (Array.isArray(comment.replies) && comment.replies.length > 0) {
    return comment.replies;
  }
  const legacyBody = comment.replyText?.trim();
  if (!legacyBody) return [];
  return [
    {
      id: `legacy-${comment.id}`,
      body: legacyBody,
      createdAt: comment.repliedAt || comment.createdAt,
      authorRole: "CREATOR",
      authorDisplayName: creatorName || "Creador",
    },
  ];
}

function resolveLocale(headerValue: string | string[] | undefined): Locale {
  const raw = Array.isArray(headerValue) ? headerValue.join(",") : headerValue || "";
  return raw.toLowerCase().includes("en") ? "en" : "es";
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
