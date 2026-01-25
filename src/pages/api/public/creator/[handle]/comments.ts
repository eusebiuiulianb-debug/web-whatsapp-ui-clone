import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";
import { readFanId, slugifyHandle } from "../../../../../lib/fan/session";

const MAX_COMMENT_LENGTH = 600;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const REPLY_PREVIEW_LIMIT = 1;

type PublicCreatorComment = {
  id: string;
  rating: number;
  text: string;
  createdAt: string;
  fanDisplayNameMasked: string;
  verified?: boolean;
  repliesCount?: number;
  replies?: PublicCommentReply[];
  repliesLocked?: boolean;
  replyParticipantsCount?: number;
  viewerHasReplied?: boolean;
  replyText?: string | null;
  repliedAt?: string | null;
  repliedByCreatorId?: string | null;
  helpfulCount?: number;
  viewerHasVoted?: boolean;
  fan?: { id: string; displayName: string };
};

type PublicCommentReply = {
  id: string;
  body: string;
  createdAt: string;
  authorRole: "CREATOR" | "FAN";
  authorDisplayName: string;
};

type CommentsStats = {
  count: number;
  avgRating: number;
  distribution: Record<number, number>;
};

type CommentsResponse = {
  comments: PublicCreatorComment[];
  nextCursor: string | null;
  totalCount: number;
  avgRating?: number | null;
  stats?: CommentsStats;
  canComment: boolean;
  viewerCanComment: boolean;
  viewerIsLoggedIn: boolean;
  viewerIsFollowing: boolean;
  viewerHasPurchased: boolean;
  creatorHasPacksOrCatalogItems: boolean;
  viewerComment?: { rating: number; text: string } | null;
};

type CommentPostResponse =
  | { ok: true; comment: PublicCreatorComment; created: boolean }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CommentsResponse | CommentPostResponse>
) {
  res.setHeader("Cache-Control", "no-store");
  const handle = typeof req.query.handle === "string" ? req.query.handle.trim() : "";
  if (!handle) {
    return sendBadRequest(res, "handle is required");
  }

  const creator = await resolveCreatorByHandle(handle);
  if (!creator) {
    return res.status(404).json({ ok: false, error: "creator_not_found" });
  }

  if (req.method === "GET") {
    try {
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
        : DEFAULT_LIMIT;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
      const sortParam = typeof req.query.sort === "string" ? req.query.sort.trim() : "";
      const normalizedSort = sortParam === "recent" ? "newest" : sortParam;
      const sort =
        normalizedSort === "highest" || normalizedSort === "lowest" || normalizedSort === "helpful"
          ? normalizedSort
          : "newest";
      const verifiedOnly = req.query.verifiedOnly === "1" || req.query.verifiedOnly === "true";
      const where: { creatorId: string; isPublic: boolean; status: "APPROVED"; fanId?: { in: string[] } } = {
        creatorId: creator.id,
        isPublic: true,
        status: "APPROVED" as const,
      };
      const orderBy =
        sort === "helpful"
          ? [
              { helpfulVotes: { _count: "desc" as const } },
              { createdAt: "desc" as const },
              { id: "desc" as const },
            ]
          : sort === "highest"
          ? [{ rating: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
          : sort === "lowest"
          ? [{ rating: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
          : [{ createdAt: "desc" as const }, { id: "desc" as const }];

      const eligibility = await resolveEligibility(req, creator.id, handle);
      const creatorHasPacksOrCatalogItems = await resolveCreatorHasCatalogItems(creator.id);
      let verifiedFilterIds: Set<string> | null = null;
      if (verifiedOnly) {
        verifiedFilterIds = await resolveVerifiedFanIdsForCreator(creator.id);
        if (!verifiedFilterIds.size) {
          return res.status(200).json({
            comments: [],
            nextCursor: null,
            totalCount: 0,
            avgRating: 0,
            stats: {
              count: 0,
              avgRating: 0,
              distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            },
            canComment: eligibility.canComment,
            viewerCanComment: eligibility.canComment,
            viewerIsLoggedIn: eligibility.viewerIsLoggedIn,
            viewerIsFollowing: eligibility.viewerIsFollowing,
            viewerHasPurchased: eligibility.viewerHasPurchased,
            creatorHasPacksOrCatalogItems,
            viewerComment: eligibility.viewerComment,
          });
        }
        where.fanId = { in: Array.from(verifiedFilterIds) };
      }

      const helpfulVoteSelect = eligibility.viewerFanId
        ? { helpfulVotes: { where: { fanId: eligibility.viewerFanId }, select: { id: true } } }
        : {};
      const [aggregate, ratingGroups, comments] = await Promise.all([
        prisma.creatorComment.aggregate({
          where,
          _count: { _all: true },
          _avg: { rating: true },
        }),
        prisma.creatorComment.groupBy({
          by: ["rating"],
          where,
          _count: { _all: true },
        }),
        prisma.creatorComment.findMany({
          where,
          orderBy,
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            fanId: true,
            rating: true,
            text: true,
            createdAt: true,
            replyText: true,
            repliedAt: true,
            repliedByCreatorId: true,
            repliesLocked: true,
            fan: { select: { displayName: true, name: true } },
            replies: {
              take: REPLY_PREVIEW_LIMIT,
              orderBy: { createdAt: "asc" as const },
              where: { deletedAt: null },
              select: {
                id: true,
                body: true,
                createdAt: true,
                authorRole: true,
                authorFan: { select: { displayName: true, name: true } },
                authorCreator: { select: { name: true } },
              },
            },
            _count: { select: { helpfulVotes: true } },
            ...helpfulVoteSelect,
          },
        }),
      ]);

      const nextCursor = comments.length > limit ? comments[limit - 1]?.id ?? null : null;
      const sliced = comments.slice(0, limit);
      const commentIds = sliced.map((comment) => comment.id);
      const [creatorReplies, replyCounts, participantRows, viewerReplies] = await Promise.all([
        commentIds.length
          ? prisma.commentReply.findMany({
              where: { commentId: { in: commentIds }, authorRole: "CREATOR", deletedAt: null },
              orderBy: { createdAt: "desc" as const },
              select: {
                id: true,
                commentId: true,
                body: true,
                createdAt: true,
                authorCreator: { select: { name: true } },
              },
            })
          : Promise.resolve([]),
        commentIds.length
          ? prisma.commentReply.groupBy({
              by: ["commentId"],
              where: { commentId: { in: commentIds }, deletedAt: null },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        commentIds.length
          ? prisma.commentReply.groupBy({
              by: ["commentId", "authorFanId"],
              where: {
                commentId: { in: commentIds },
                deletedAt: null,
                authorFanId: { not: null },
              },
            })
          : Promise.resolve([]),
        commentIds.length && eligibility.viewerFanId
          ? prisma.commentReply.findMany({
              where: {
                commentId: { in: commentIds },
                deletedAt: null,
                authorFanId: eligibility.viewerFanId,
              },
              select: { commentId: true },
            })
          : Promise.resolve([]),
      ]);
      const replyCountByCommentId = new Map<string, number>();
      replyCounts.forEach((row) => {
        replyCountByCommentId.set(row.commentId, row._count?._all ?? 0);
      });
      const participantCountByCommentId = new Map<string, number>();
      participantRows.forEach((row) => {
        if (!row.authorFanId) return;
        participantCountByCommentId.set(row.commentId, (participantCountByCommentId.get(row.commentId) ?? 0) + 1);
      });
      const viewerRepliedSet = new Set(viewerReplies.map((row) => row.commentId));
      const creatorReplyByCommentId = new Map<string, typeof creatorReplies[number]>();
      creatorReplies.forEach((reply) => {
        if (!creatorReplyByCommentId.has(reply.commentId)) {
          creatorReplyByCommentId.set(reply.commentId, reply);
        }
      });
      const distribution = buildDistribution(ratingGroups);
      const totalCount = aggregate._count._all ?? 0;
      const avgRaw = typeof aggregate._avg.rating === "number" ? aggregate._avg.rating : 0;
      const avgRating = totalCount > 0 ? Math.round(avgRaw * 10) / 10 : 0;
      const fanIds = Array.from(new Set(sliced.map((comment) => comment.fanId).filter(Boolean)));
      const verifiedFanIds = verifiedFilterIds ?? (await resolveVerifiedFanIds(fanIds, creator.id));
      const formatted = sliced.map((comment) => {
        const displayName = maskFanName(comment.fan?.displayName || comment.fan?.name);
        const helpfulCount = comment._count?.helpfulVotes ?? 0;
        const viewerHasVoted = eligibility.viewerFanId ? (comment.helpfulVotes?.length ?? 0) > 0 : false;
        const hasLegacyReply = Boolean(comment.replyText?.trim());
        const creatorReply = creatorReplyByCommentId.get(comment.id) ?? null;
        const legacyCount = hasLegacyReply && !creatorReply ? 1 : 0;
        const baseReplyCount = replyCountByCommentId.get(comment.id) ?? 0;
        const totalReplies = baseReplyCount + legacyCount;
        const repliesCount = totalReplies;
        const replyParticipantsCount = participantCountByCommentId.get(comment.id) ?? 0;
        const previewReplies = creatorReply
          ? [
              {
                id: creatorReply.id,
                body: creatorReply.body,
                createdAt: creatorReply.createdAt.toISOString(),
                authorRole: "CREATOR" as const,
                authorDisplayName:
                  creatorReply.authorCreator?.name || creator.name || "Creador",
              },
            ]
          : formatCommentReplies({
              commentId: comment.id,
              creatorName: creator.name || "Creador",
              replies: comment.replies ?? [],
              legacyReplyText: hasLegacyReply ? comment.replyText : null,
              legacyReplyDate: comment.repliedAt ?? comment.createdAt,
              limit: REPLY_PREVIEW_LIMIT,
              preferCreator: true,
            });
        return {
          id: comment.id,
          rating: comment.rating,
          text: comment.text,
          createdAt: comment.createdAt.toISOString(),
          fanDisplayNameMasked: displayName,
          verified: verifiedFanIds.has(comment.fanId),
          repliesCount,
          replies: previewReplies,
          repliesLocked: comment.repliesLocked ?? false,
          replyParticipantsCount,
          viewerHasReplied: viewerRepliedSet.has(comment.id),
          replyText: comment.replyText ?? null,
          repliedAt: comment.repliedAt ? comment.repliedAt.toISOString() : null,
          repliedByCreatorId: comment.repliedByCreatorId ?? null,
          helpfulCount,
          viewerHasVoted,
          fan: { id: comment.fanId, displayName },
        };
      });

      return res.status(200).json({
        comments: formatted,
        nextCursor,
        totalCount,
        avgRating,
        stats: {
          count: totalCount,
          avgRating,
          distribution,
        },
        canComment: eligibility.canComment,
        viewerCanComment: eligibility.canComment,
        viewerIsLoggedIn: eligibility.viewerIsLoggedIn,
        viewerIsFollowing: eligibility.viewerIsFollowing,
        viewerHasPurchased: eligibility.viewerHasPurchased,
        creatorHasPacksOrCatalogItems,
        viewerComment: eligibility.viewerComment,
      });
    } catch (err) {
      console.error("Error loading creator comments", err);
      return sendServerError(res);
    }
  }

  if (req.method === "POST") {
    try {
      const fanId = readFanId(req, handle);
      if (!fanId) {
        return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
      }

      const ratingRaw = Number((req.body as any)?.rating);
      const textRaw = typeof (req.body as any)?.text === "string" ? (req.body as any).text.trim() : "";
      if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
        return sendBadRequest(res, "rating must be 1-5");
      }
      if (!textRaw || textRaw.length > MAX_COMMENT_LENGTH) {
        return sendBadRequest(res, "text length invalid");
      }

      const eligibility = await resolveEligibility(req, creator.id, handle, fanId);
      if (eligibility.viewerIsBlocked) {
        return res.status(403).json({ ok: false, error: "BLOCKED" });
      }
      if (!eligibility.canComment) {
        return res.status(403).json({ ok: false, error: "NOT_VERIFIED" });
      }

      const existing = await prisma.creatorComment.findUnique({
        where: { creatorId_fanId: { creatorId: creator.id, fanId } },
        select: { id: true },
      });
      const created = !existing?.id;

      const comment = await prisma.creatorComment.upsert({
        where: { creatorId_fanId: { creatorId: creator.id, fanId } },
        update: {
          rating: ratingRaw,
          text: textRaw,
          status: "APPROVED",
          isPublic: true,
        },
        create: {
          creatorId: creator.id,
          fanId,
          rating: ratingRaw,
          text: textRaw,
          status: "APPROVED",
          isPublic: true,
        },
        select: {
          id: true,
          fanId: true,
          rating: true,
          text: true,
          createdAt: true,
          replyText: true,
          repliedAt: true,
          repliedByCreatorId: true,
          fan: { select: { displayName: true, name: true } },
        },
      });
      const verifiedFanIds = await resolveVerifiedFanIds([fanId], creator.id);
      const displayName = maskFanName(comment.fan?.displayName || comment.fan?.name);

      return res.status(200).json({
        ok: true,
        created,
        comment: {
          id: comment.id,
          rating: comment.rating,
          text: comment.text,
          createdAt: comment.createdAt.toISOString(),
          fanDisplayNameMasked: displayName,
          verified: verifiedFanIds.has(comment.fanId),
          repliesCount: 0,
          replies: [],
          repliesLocked: false,
          replyParticipantsCount: 0,
          viewerHasReplied: false,
          replyText: comment.replyText ?? null,
          repliedAt: comment.repliedAt ? comment.repliedAt.toISOString() : null,
          repliedByCreatorId: comment.repliedByCreatorId ?? null,
          helpfulCount: 0,
          viewerHasVoted: false,
          fan: { id: comment.fanId, displayName },
        },
      });
    } catch (err) {
      console.error("Error creating creator comment", err);
      return sendServerError(res);
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function resolveCreatorByHandle(handle: string) {
  const normalized = slugifyHandle(handle);
  const creators = await prisma.creator.findMany({ select: { id: true, name: true } });
  return creators.find((creator) => slugifyHandle(creator.name) === normalized) || null;
}

async function resolveEligibility(
  req: NextApiRequest,
  creatorId: string,
  handle: string,
  explicitFanId?: string | null
) {
  const fanId = explicitFanId || readFanId(req, handle);
  const followFanId = readFanId(req) || fanId;
  if (!fanId) {
    const follow = followFanId
      ? await prisma.follow.findUnique({
          where: { fanId_creatorId: { fanId: followFanId, creatorId } },
          select: { id: true },
        })
      : null;
    return {
      canComment: false,
      viewerComment: null,
      viewerIsLoggedIn: false,
      viewerIsFollowing: Boolean(follow?.id),
      viewerHasPurchased: false,
      viewerFanId: null,
      viewerIsBlocked: false,
    };
  }

  const [fan, block, follow] = await Promise.all([
    prisma.fan.findFirst({
      where: { id: fanId, creatorId },
      select: { id: true, isBlocked: true },
    }),
    prisma.creatorFanBlock.findUnique({
      where: { creatorId_fanId: { creatorId, fanId } },
      select: { id: true },
    }),
    followFanId
      ? prisma.follow.findUnique({
          where: { fanId_creatorId: { fanId: followFanId, creatorId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!fan?.id) {
    return {
      canComment: false,
      viewerComment: null,
      viewerIsLoggedIn: false,
      viewerIsFollowing: Boolean(follow?.id),
      viewerHasPurchased: false,
      viewerFanId: null,
      viewerIsBlocked: false,
    };
  }

  const viewerIsBlocked = Boolean(fan.isBlocked || block?.id);
  const followsCreator = Boolean(follow?.id);
  if (viewerIsBlocked) {
    return {
      canComment: false,
      viewerComment: null,
      viewerIsLoggedIn: true,
      viewerIsFollowing: followsCreator,
      viewerHasPurchased: false,
      viewerFanId: fanId,
      viewerIsBlocked: true,
    };
  }

  const now = new Date();
  const [accessGrant, ppvPurchase, extraPurchase, viewerComment] = await Promise.all([
    prisma.accessGrant.findFirst({
      where: { fanId, expiresAt: { gt: now } },
      select: { id: true },
    }),
    prisma.ppvPurchase.findFirst({
      where: { fanId, creatorId },
      select: { id: true },
    }),
    prisma.extraPurchase.findFirst({
      where: { fanId, isArchived: false, contentItem: { creatorId } },
      select: { id: true },
    }),
    prisma.creatorComment.findUnique({
      where: { creatorId_fanId: { creatorId, fanId } },
      select: { rating: true, text: true },
    }),
  ]);

  const hasAccess = Boolean(accessGrant || ppvPurchase || extraPurchase);
  const canComment = hasAccess;

  return {
    canComment,
    viewerComment: viewerComment ? { rating: viewerComment.rating, text: viewerComment.text } : null,
    viewerIsLoggedIn: true,
    viewerIsFollowing: followsCreator,
    viewerHasPurchased: hasAccess,
    viewerFanId: fanId,
    viewerIsBlocked,
  };
}

async function resolveCreatorHasCatalogItems(creatorId: string) {
  const catalogItem = await prisma.catalogItem.findFirst({
    where: { creatorId, isActive: true, isPublic: true },
    select: { id: true },
  });
  return Boolean(catalogItem?.id);
}

function maskFanName(raw?: string | null) {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "invitado") return "Anónimo";
  const letters = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  const token = (letters || trimmed).slice(0, 3).toUpperCase();
  return `Fan ${token}`;
}

function formatCommentReplies({
  commentId,
  creatorName,
  replies,
  legacyReplyText,
  legacyReplyDate,
  limit,
  preferCreator,
}: {
  commentId: string;
  creatorName: string;
  replies: Array<{
    id: string;
    body: string;
    createdAt: Date;
    authorRole: "CREATOR" | "FAN";
    authorFan?: { displayName?: string | null; name?: string | null } | null;
    authorCreator?: { name?: string | null } | null;
  }>;
  legacyReplyText?: string | null;
  legacyReplyDate?: Date | null;
  limit?: number;
  preferCreator?: boolean;
}): PublicCommentReply[] {
  const items = replies.map((reply) => ({
    id: reply.id,
    body: reply.body,
    createdAt: reply.createdAt.toISOString(),
    authorRole: reply.authorRole,
    authorDisplayName:
      reply.authorRole === "CREATOR"
        ? reply.authorCreator?.name || creatorName || "Creador"
        : maskFanName(reply.authorFan?.displayName || reply.authorFan?.name),
  }));

  const legacyBody = legacyReplyText?.trim() || "";
  if (legacyBody) {
    const createdAt = legacyReplyDate ? legacyReplyDate.toISOString() : new Date().toISOString();
    items.push({
      id: `legacy-${commentId}`,
      body: legacyBody,
      createdAt,
      authorRole: "CREATOR",
      authorDisplayName: creatorName || "Creador",
    });
  }

  items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (typeof limit === "number") {
    if (limit <= 0) return [];
    if (preferCreator) {
      const creatorReply = items.find((item) => item.authorRole === "CREATOR");
      if (creatorReply) return [creatorReply];
    }
    return items.slice(-limit);
  }
  return items;
}

function buildDistribution(
  groups: Array<{ rating: number; _count: { _all: number } }>
): Record<number, number> {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  groups.forEach((group) => {
    const rating = group.rating;
    if (rating >= 1 && rating <= 5) {
      distribution[rating] = group._count._all ?? 0;
    }
  });
  return distribution;
}

async function resolveVerifiedFanIds(fanIds: string[], creatorId: string) {
  if (!fanIds.length) return new Set<string>();
  const now = new Date();
  const [accessGrants, ppvPurchases, extraPurchases] = await Promise.all([
    prisma.accessGrant.findMany({
      where: { fanId: { in: fanIds }, expiresAt: { gt: now }, fan: { creatorId } },
      select: { fanId: true },
    }),
    prisma.ppvPurchase.findMany({
      where: { fanId: { in: fanIds }, creatorId, status: "PAID" },
      select: { fanId: true },
    }),
    prisma.extraPurchase.findMany({
      where: { fanId: { in: fanIds }, isArchived: false, contentItem: { creatorId } },
      select: { fanId: true },
    }),
  ]);
  return new Set([
    ...accessGrants.map((item) => item.fanId),
    ...ppvPurchases.map((item) => item.fanId),
    ...extraPurchases.map((item) => item.fanId),
  ]);
}

async function resolveVerifiedFanIdsForCreator(creatorId: string) {
  const now = new Date();
  const [accessGrants, ppvPurchases, extraPurchases] = await Promise.all([
    prisma.accessGrant.findMany({
      where: { expiresAt: { gt: now }, fan: { creatorId } },
      select: { fanId: true },
    }),
    prisma.ppvPurchase.findMany({
      where: { creatorId, status: "PAID" },
      select: { fanId: true },
    }),
    prisma.extraPurchase.findMany({
      where: { isArchived: false, contentItem: { creatorId } },
      select: { fanId: true },
    }),
  ]);
  return new Set([
    ...accessGrants.map((item) => item.fanId),
    ...ppvPurchases.map((item) => item.fanId),
    ...extraPurchases.map((item) => item.fanId),
  ]);
}
