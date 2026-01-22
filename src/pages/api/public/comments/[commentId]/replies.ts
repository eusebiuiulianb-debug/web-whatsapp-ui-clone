import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { sendBadRequest, sendServerError } from "@/lib/apiError";
import { parseCookieHeader, readFanId, slugifyHandle } from "@/lib/fan/session";
import type { PublicCommentReply } from "@/types/publicProfile";

type RepliesResponse =
  | {
      ok: true;
      replies: PublicCommentReply[];
      repliesCount: number;
      participantsCount: number;
      repliesLocked: boolean;
      nextCursor?: string | null;
    }
  | { ok: false; error: string };

type ReplyCreateResponse =
  | { ok: true; reply: PublicCommentReply; updated?: boolean; participantsCount?: number; repliesCount?: number }
  | { ok: false; error: string; message?: string };

const MAX_REPLY_LENGTH = 600;
const MAX_REPLY_PARTICIPANTS = 10;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RepliesResponse | ReplyCreateResponse>
) {
  res.setHeader("Cache-Control", "no-store");
  const raw = req.query.commentId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
  const commentId = id.trim();
  if (!commentId) return res.status(400).json({ ok: false, error: "Missing id" });

  if (req.method === "GET") {
    try {
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
        : null;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
      const comment = await prisma.creatorComment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          createdAt: true,
          replyText: true,
          repliedAt: true,
          isPublic: true,
          status: true,
          repliesLocked: true,
          creator: { select: { id: true, name: true } },
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" as const },
            select: {
              id: true,
              body: true,
              createdAt: true,
              authorRole: true,
              authorFan: { select: { displayName: true, name: true } },
              authorCreator: { select: { name: true } },
            },
          },
        },
      });

      if (!comment || !comment.isPublic || comment.status !== "APPROVED") {
        return res.status(404).json({ ok: false, error: "comment_not_found" });
      }

      const hasLegacyReply = Boolean(comment.replyText?.trim());
      const replies = formatCommentReplies({
        commentId,
        creatorName: comment.creator?.name || "Creador",
        replies: comment.replies ?? [],
        legacyReplyText: hasLegacyReply ? comment.replyText : null,
        legacyReplyDate: comment.repliedAt ?? comment.createdAt,
      });
      const repliesCount = replies.length;
      const participantRows = await prisma.commentReply.groupBy({
        by: ["authorFanId"],
        where: { commentId, deletedAt: null, authorFanId: { not: null } },
      });
      const participantsCount = participantRows.length;
      const startIndex = cursor ? replies.findIndex((item) => item.id === cursor) + 1 : 0;
      const resolvedStart = startIndex > 0 ? startIndex : 0;
      const pagedReplies = limit ? replies.slice(resolvedStart, resolvedStart + limit) : replies.slice(resolvedStart);
      const nextCursor =
        limit && resolvedStart + limit < replies.length
          ? pagedReplies[pagedReplies.length - 1]?.id ?? null
          : null;

      return res.status(200).json({
        ok: true,
        replies: pagedReplies,
        repliesCount,
        participantsCount,
        repliesLocked: comment.repliesLocked ?? false,
        nextCursor,
      });
    } catch (err) {
      console.error("Error loading comment replies", err);
      return sendServerError(res);
    }
  }

  if (req.method === "POST") {
    const bodyRaw = typeof (req.body as any)?.body === "string" ? (req.body as any).body.trim() : "";
    const textRaw =
      bodyRaw || (typeof (req.body as any)?.text === "string" ? (req.body as any).text.trim() : "");
    if (!textRaw || textRaw.length > MAX_REPLY_LENGTH) {
      return sendBadRequest(res, "reply text invalid");
    }

    try {
      const comment = await prisma.creatorComment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          creatorId: true,
          isPublic: true,
          status: true,
          replyText: true,
          repliedAt: true,
          repliesLocked: true,
          creator: { select: { name: true } },
        },
      });
      if (!comment || !comment.isPublic || comment.status !== "APPROVED") {
        return res.status(404).json({ ok: false, error: "comment_not_found" });
      }

      const creatorHandle = slugifyHandle(comment.creator?.name || "");
      const previewHandle = readPreviewHandle(req.headers.cookie);
      const isOwner = previewHandle && previewHandle === creatorHandle;
      const creatorName = comment.creator?.name || "Creador";
      const hasLegacyReply = Boolean(comment.replyText?.trim());
      const repliesLocked = comment.repliesLocked ?? false;

      if (repliesLocked) {
        return res.status(403).json({
          ok: false,
          error: "THREAD_LOCKED",
          message: "Hilo cerrado por el creador.",
        });
      }

      if (isOwner) {
        const existingCreatorReply = await prisma.commentReply.findFirst({
          where: { commentId, authorCreatorId: comment.creatorId, deletedAt: null },
          select: { id: true },
        });
        if (existingCreatorReply?.id) {
          const updatedReply = await prisma.commentReply.update({
            where: { id: existingCreatorReply.id },
            data: { body: textRaw },
            select: { id: true, body: true, createdAt: true },
          });
          return res.status(200).json({
            ok: true,
            updated: true,
            reply: {
              id: updatedReply.id,
              body: updatedReply.body,
              createdAt: updatedReply.createdAt.toISOString(),
              authorRole: "CREATOR",
              authorDisplayName: creatorName,
            },
          });
        }
        if (hasLegacyReply) {
          const updatedComment = await prisma.creatorComment.update({
            where: { id: commentId },
            data: { replyText: textRaw, repliedAt: new Date(), repliedByCreatorId: comment.creatorId },
            select: { replyText: true, repliedAt: true },
          });
          return res.status(200).json({
            ok: true,
            updated: true,
            reply: {
              id: `legacy-${commentId}`,
              body: updatedComment.replyText || textRaw,
              createdAt: (updatedComment.repliedAt || new Date()).toISOString(),
              authorRole: "CREATOR",
              authorDisplayName: creatorName,
            },
          });
        }
        const reply = await prisma.commentReply.create({
          data: {
            commentId,
            authorRole: "CREATOR",
            authorCreatorId: comment.creatorId,
            body: textRaw,
          },
          select: { id: true, body: true, createdAt: true },
        });
        return res.status(200).json({
          ok: true,
          reply: {
            id: reply.id,
            body: reply.body,
            createdAt: reply.createdAt.toISOString(),
            authorRole: "CREATOR",
            authorDisplayName: creatorName,
          },
        });
      }

      const fanId = readFanId(req, creatorHandle);
      if (!fanId) {
        return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
      }

      const [fan, block] = await Promise.all([
        prisma.fan.findFirst({
          where: { id: fanId, creatorId: comment.creatorId },
          select: { id: true, displayName: true, name: true, isBlocked: true },
        }),
        prisma.creatorFanBlock.findUnique({
          where: { creatorId_fanId: { creatorId: comment.creatorId, fanId } },
          select: { id: true },
        }),
      ]);
      if (!fan?.id) {
        return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
      }
      if (fan.isBlocked || block?.id) {
        return res.status(403).json({
          ok: false,
          error: "BLOCKED",
          message: "No puedes responder a este creador.",
        });
      }

      const verified = await resolveVerifiedBuyer(fanId, comment.creatorId);
      if (!verified) {
        return res.status(403).json({
          ok: false,
          error: "NOT_VERIFIED",
          message: "Solo compradores verificados pueden responder.",
        });
      }

      const existingFanReply = await prisma.commentReply.findFirst({
        where: { commentId, authorFanId: fanId, deletedAt: null },
        select: { id: true },
      });
      const participantRows = await prisma.commentReply.groupBy({
        by: ["authorFanId"],
        where: { commentId, deletedAt: null, authorFanId: { not: null } },
      });
      const participantsCount = participantRows.length;
      if (!existingFanReply?.id && participantsCount >= MAX_REPLY_PARTICIPANTS) {
        return res.status(403).json({
          ok: false,
          error: "THREAD_FULL",
          message: `Hilo completo (máx. ${MAX_REPLY_PARTICIPANTS} participantes).`,
        });
      }

      const reply = await prisma.commentReply.create({
        data: {
          commentId,
          authorRole: "FAN",
          authorFanId: fanId,
          body: textRaw,
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorRole: true,
          authorFan: { select: { displayName: true, name: true } },
        },
      });

      return res.status(200).json({
        ok: true,
        participantsCount: existingFanReply?.id ? participantsCount : participantsCount + 1,
        reply: {
          id: reply.id,
          body: reply.body,
          createdAt: reply.createdAt.toISOString(),
          authorRole: reply.authorRole,
          authorDisplayName: maskFanName(reply.authorFan?.displayName || reply.authorFan?.name),
        },
      });
    } catch (err) {
      console.error("Error creating comment reply", err);
      return sendServerError(res);
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ ok: false, error: "Method not allowed" });
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

async function resolveVerifiedBuyer(fanId: string, creatorId: string) {
  const now = new Date();
  const [accessGrant, ppvPurchase, extraPurchase] = await Promise.all([
    prisma.accessGrant.findFirst({
      where: { fanId, expiresAt: { gt: now } },
      select: { id: true },
    }),
    prisma.ppvPurchase.findFirst({
      where: { fanId, creatorId, status: "PAID" },
      select: { id: true },
    }),
    prisma.extraPurchase.findFirst({
      where: { fanId, isArchived: false, contentItem: { creatorId } },
      select: { id: true },
    }),
  ]);
  return Boolean(accessGrant || ppvPurchase || extraPurchase);
}

function maskFanName(raw?: string | null) {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "invitado") return "Anónimo";
  const letters = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  const token = (letters || trimmed).slice(0, 3).toUpperCase();
  return `Fan ${token}`;
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const cookies = parseCookieHeader(cookieHeader);
  const value = cookies["novsy_creator_preview"] || "";
  return value ? slugifyHandle(value) : "";
}
