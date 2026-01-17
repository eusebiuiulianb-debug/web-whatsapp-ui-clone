import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { emitCreatorEvent as emitRealtimeEvent } from "../../../../server/realtimeHub";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";

type PpvResponse =
  | { ok: true; message: any; messages?: any[] }
  | { ok: false; error: string; errorCode?: string; message?: string; fix?: string[] };

const MAX_TITLE_LEN = 120;
const MAX_TEXT_LEN = 4000;
const MAX_PRICE_CENTS = 50000;
const OFFER_MARKER = "\n\n__NOVSY_OFFER__:";
const PPV_OFFER_FALLBACK_TITLE = "Extra";

function formatPriceFromCents(value: number, currency?: string | null) {
  const amount = value / 100;
  const rounded = Math.round(amount * 100) / 100;
  const label = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
  const code = (currency || "EUR").toUpperCase();
  return code === "EUR" ? `${label} €` : `${label} ${code}`;
}

function attachOfferMarker(text: string, marker: string): string {
  if (!marker) return text;
  return `${text}${OFFER_MARKER}${marker}`;
}

function buildPpvOfferMeta(ppv: {
  id: string;
  messageId?: string | null;
  title?: string | null;
  priceCents: number;
  currency?: string | null;
  status?: "locked" | "unlocked";
  purchaseCount?: number;
  purchasedByFan?: boolean;
  purchasedAt?: string | null;
  isUnlockedForViewer?: boolean;
  canViewContent?: boolean;
  canPurchase?: boolean;
}) {
  return {
    id: ppv.id,
    ppvMessageId: ppv.id,
    ...(ppv.messageId ? { messageId: ppv.messageId } : {}),
    title: (ppv.title || "").trim() || PPV_OFFER_FALLBACK_TITLE,
    price: formatPriceFromCents(ppv.priceCents, ppv.currency ?? "EUR"),
    priceCents: ppv.priceCents,
    currency: (ppv.currency ?? "EUR").toUpperCase(),
    kind: "ppv",
    ...(ppv.status ? { status: ppv.status } : {}),
    ...(typeof ppv.purchaseCount === "number" ? { purchaseCount: ppv.purchaseCount } : {}),
    ...(typeof ppv.purchasedByFan === "boolean" ? { purchasedByFan: ppv.purchasedByFan } : {}),
    ...(ppv.purchasedAt ? { purchasedAt: ppv.purchasedAt } : {}),
    ...(typeof ppv.isUnlockedForViewer === "boolean" ? { isUnlockedForViewer: ppv.isUnlockedForViewer } : {}),
    ...(typeof ppv.canViewContent === "boolean" ? { canViewContent: ppv.canViewContent } : {}),
    ...(typeof ppv.canPurchase === "boolean" ? { canPurchase: ppv.canPurchase } : {}),
  };
}

function isSafeChatId(chatId: string) {
  return !chatId.includes("/") && !chatId.includes("\\") && chatId.trim().length > 0;
}

function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TITLE_LEN);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT_LEN);
}

function normalizePriceCents(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number.parseInt(value, 10)
      : NaN;
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0 || parsed > MAX_PRICE_CENTS) return null;
  return Math.round(parsed);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<PpvResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const chatId = typeof req.query.chatId === "string" ? req.query.chatId.trim() : "";
  if (!chatId || !isSafeChatId(chatId)) {
    return res.status(400).json({ ok: false, error: "chatId is required" });
  }

  const text = normalizeText(req.body?.text ?? req.body?.content);
  if (!text) {
    return res.status(400).json({ ok: false, error: "content is required" });
  }
  const priceCents = normalizePriceCents(req.body?.priceCents);
  if (!priceCents) {
    return res.status(400).json({ ok: false, error: "priceCents is required" });
  }
  const title = normalizeTitle(req.body?.title);

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: chatId },
      select: { id: true, creatorId: true, isBlocked: true, inviteToken: true, inviteUsedAt: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }
    if (fan.isBlocked) {
      return res.status(403).json({ ok: false, error: "CHAT_BLOCKED" });
    }

    const now = new Date();
    const time = now.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const created = await prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { fanId: chatId },
        data: { isLastFromCreator: false },
      });
      const message = await tx.message.create({
        data: {
          id: `${chatId}-${Date.now()}`,
          fanId: chatId,
          from: "creator",
          audience: "CREATOR",
          text,
          time,
          isLastFromCreator: true,
          type: "TEXT",
        },
      });
      const ppv = await tx.ppvMessage.create({
        data: {
          messageId: message.id,
          fanId: chatId,
          creatorId: fan.creatorId,
          title,
          priceCents,
          currency: "EUR",
        },
      });
      return { message, ppv };
    });

    const preview = text.trim().slice(0, 120);
    const fanUpdate: Record<string, unknown> = {
      preview,
      time,
      lastMessageAt: now,
      lastActivityAt: now,
      lastCreatorMessageAt: now,
    };
    if (fan.inviteToken && !fan.inviteUsedAt) {
      fanUpdate.inviteUsedAt = now;
    }
    try {
      await prisma.fan.update({ where: { id: chatId }, data: fanUpdate });
    } catch (updateErr) {
      console.error("api/chats/ppv fan-update error", { fanId: chatId, error: (updateErr as Error)?.message });
    }

    const offerMeta = buildPpvOfferMeta({
      id: created.ppv.id,
      messageId: created.message.id,
      title,
      priceCents,
      currency: "EUR",
      status: "locked",
      purchaseCount: 0,
      purchasedByFan: false,
      isUnlockedForViewer: false,
      canViewContent: false,
      canPurchase: true,
    });
    const messageText = attachOfferMarker(created.message.text || "", JSON.stringify(offerMeta));
    const responseMessage = { ...created.message, text: messageText, reactionsSummary: [] };
    emitRealtimeEvent({
      eventId: created.message.id,
      type: "MESSAGE_CREATED",
      creatorId: fan.creatorId,
      fanId: chatId,
      createdAt: now.toISOString(),
      payload: { message: responseMessage },
    });

    return res.status(200).json({ ok: true, message: responseMessage, messages: [responseMessage] });
  } catch (err) {
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/chats/ppv error", { chatId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error creating ppv message" });
  }
}
