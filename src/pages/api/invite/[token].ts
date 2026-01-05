import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { deriveAudience, type MessageAudience } from "../../../lib/messageAudience";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    return res.status(400).json({ ok: false, error: "token is required" });
  }

  try {
    const fan = await prisma.fan.findFirst({
      where: { inviteToken: token },
      select: {
        id: true,
        handle: true,
        inviteUsedAt: true,
        creator: { select: { name: true } },
      },
    });

    if (!fan) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[invite] token not found", token);
      }
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    if (!fan.inviteUsedAt) {
      await prisma.fan.updateMany({
        where: { id: fan.id, inviteUsedAt: null },
        data: { inviteUsedAt: new Date() },
      });
    }

    const creatorHandle = fan.handle && fan.handle.trim().length > 0 ? fan.handle : slugify(fan.creator?.name || "");
    let messages: unknown[] = [];

    try {
      messages = await fetchInviteMessages(fan.id);
    } catch (messageError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[invite] message fetch failed", messageError);
      }
    }

    return res.status(200).json({ ok: true, fanId: fan.id, creatorHandle, messages, items: messages });
  } catch (error) {
    console.error("Error resolving invite token", error);
    return res.status(500).json({ ok: false, error: "Error resolving invite token" });
  }
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function fetchInviteMessages(fanId: string) {
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { fanId },
        { id: { startsWith: `${fanId}-` } },
      ],
    },
    orderBy: { id: "asc" },
    include: { contentItem: true },
  });

  return messages
    .map((message) => {
      const audience = deriveAudience(message);
      if (!isInviteAudienceVisible(audience)) return null;
      return {
        id: message.id,
        fanId,
        from: message.from,
        sender: message.from,
        audience,
        text: message.text ?? null,
        deliveredText: message.deliveredText ?? null,
        creatorTranslatedText: message.creatorTranslatedText ?? null,
        time: message.time ?? null,
        isLastFromCreator: message.isLastFromCreator ?? null,
        type: message.type ?? "TEXT",
        stickerId: message.stickerId ?? null,
        audioUrl: message.audioUrl ?? null,
        audioDurationMs: message.audioDurationMs ?? null,
        audioMime: message.audioMime ?? null,
        audioSizeBytes: message.audioSizeBytes ?? null,
        contentItem: message.contentItem ?? null,
        createdAt: resolveCreatedAt(message),
      };
    })
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
}

function isInviteAudienceVisible(audience: MessageAudience) {
  return audience === "FAN" || audience === "CREATOR";
}

function resolveCreatedAt(message: { id?: string | null; createdAt?: Date | string | null }) {
  const createdAt = message.createdAt;
  if (createdAt instanceof Date) return createdAt.toISOString();
  if (typeof createdAt === "string") return createdAt;
  const fallbackMs = extractMessageIdTimestamp(message.id);
  return fallbackMs ? new Date(fallbackMs).toISOString() : null;
}

function extractMessageIdTimestamp(messageId?: string | null): number | null {
  if (!messageId) return null;
  const lastDash = messageId.lastIndexOf("-");
  if (lastDash < 0 || lastDash === messageId.length - 1) return null;
  const raw = messageId.slice(lastDash + 1);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
