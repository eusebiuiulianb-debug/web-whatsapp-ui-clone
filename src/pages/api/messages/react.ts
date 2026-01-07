import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../lib/dbSchemaGuard";
import { buildReactionSummary, type ReactionActor } from "../../../lib/messageReactions";

type ReactResponse =
  | { ok: true; reactionsSummary: ReturnType<typeof buildReactionSummary> }
  | { ok: false; error: string; errorCode?: string; message?: string; fix?: string[] };

const FAN_COOKIE_PREFIX = "novsy_fan_";

export default async function handler(req: NextApiRequest, res: NextApiResponse<ReactResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  const messageId = typeof req.body?.messageId === "string" ? req.body.messageId.trim() : "";
  const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim() : "";
  if (!messageId) {
    return res.status(400).json({ ok: false, error: "messageId is required" });
  }
  if (!emoji) {
    return res.status(400).json({ ok: false, error: "emoji is required" });
  }
  if (emoji.length > 16) {
    return res.status(400).json({ ok: false, error: "emoji too long" });
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, fanId: true, fan: { select: { creatorId: true } } },
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: "Message not found" });
    }

    const viewerRole = resolveViewerRole(req);
    let viewerActor: ReactionActor | null = null;

    if (viewerRole === "creator") {
      const creatorId = await resolveCreatorId();
      if (message.fan.creatorId !== creatorId) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
      viewerActor = { actorType: "CREATOR", actorId: creatorId };
    } else {
      if (hasFanCookieMismatch(req, message.fanId)) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
      viewerActor = { actorType: "FAN", actorId: message.fanId };
    }

    if (!viewerActor) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const existing = await prisma.messageReaction.findUnique({
      where: {
        messageId_actorType_actorId: {
          messageId: message.id,
          actorType: viewerActor.actorType,
          actorId: viewerActor.actorId,
        },
      },
      select: { id: true, emoji: true },
    });

    if (existing && existing.emoji === emoji) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await prisma.messageReaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
    } else {
      await prisma.messageReaction.create({
        data: {
          messageId: message.id,
          actorType: viewerActor.actorType,
          actorId: viewerActor.actorId,
          emoji,
        },
      });
    }

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId: message.id },
      select: { emoji: true, actorType: true, actorId: true },
      orderBy: { createdAt: "asc" },
    });

    const reactionsSummary = buildReactionSummary(reactions, viewerActor);
    return res.status(200).json({ ok: true, reactionsSummary });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/messages/react error", err);
    return res.status(500).json({ ok: false, error: "reaction_failed" });
  }
}

function resolveViewerRole(req: NextApiRequest) {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";

  return "fan";
}

function hasFanCookieMismatch(req: NextApiRequest, fanId: string) {
  const cookies = parseCookieHeader(req.headers?.cookie);
  const fanCookieValues = Object.entries(cookies)
    .filter(([key]) => key.startsWith(FAN_COOKIE_PREFIX))
    .map(([, value]) => value);
  if (fanCookieValues.length === 0) return false;
  return !fanCookieValues.includes(fanId);
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    const key = decodeURIComponent(rawKey);
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;
  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("No creator found");
  }
  return creator.id;
}
