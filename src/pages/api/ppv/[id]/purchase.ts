import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { buildWalletPayload, getOrCreateWallet } from "../../../../lib/wallet";
import { emitCreatorEvent as emitRealtimeEvent } from "../../../../server/realtimeHub";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";

type PpvPurchaseResponse =
  | {
      ok: true;
      purchaseId: string;
      reused?: boolean;
      message: any;
      wallet?: { enabled?: boolean; currency?: string; balanceCents?: number };
    }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      requiredCents?: number;
      wallet?: { enabled?: boolean; currency?: string; balanceCents?: number };
      message?: string;
      fix?: string[];
    };

const OFFER_MARKER = "\n\n__NOVSY_OFFER__:";
const PPV_OFFER_FALLBACK_TITLE = "Extra";
const PPV_LOCKED_PLACEHOLDER = "Texto bloqueado hasta compra.";

function attachOfferMarker(text: string, marker: string): string {
  if (!marker) return text;
  return `${text}${OFFER_MARKER}${marker}`;
}

function formatPriceFromCents(value: number, currency?: string | null) {
  const amount = value / 100;
  const rounded = Math.round(amount * 100) / 100;
  const label = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
  const code = (currency || "EUR").toUpperCase();
  return code === "EUR" ? `${label} €` : `${label} ${code}`;
}

function buildPpvOfferMeta(ppv: {
  id: string;
  messageId?: string | null;
  title?: string | null;
  priceCents: number;
  amountCents?: number;
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
    ...(typeof ppv.amountCents === "number" ? { amountCents: ppv.amountCents } : {}),
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

function buildPpvMessagePayload(
  message: Record<string, unknown>,
  ppvMeta: {
    id: string;
    messageId?: string | null;
    title?: string | null;
    priceCents: number;
    currency?: string | null;
    status?: "locked" | "unlocked";
    purchasedAt?: string | null;
    isUnlockedForViewer?: boolean;
    canViewContent?: boolean;
    canPurchase?: boolean;
  }
) {
  const baseText = PPV_LOCKED_PLACEHOLDER;
  const offerMeta = buildPpvOfferMeta({
    ...ppvMeta,
    amountCents: ppvMeta.priceCents,
    status: ppvMeta.status,
    purchasedByFan: ppvMeta.status === "unlocked",
    purchaseCount: ppvMeta.status === "unlocked" ? 1 : 0,
  });
  const textWithOffer = attachOfferMarker(baseText, JSON.stringify(offerMeta));
  return {
    ...message,
    text: textWithOffer,
    deliveredText: null,
    creatorTranslatedText: null,
    messageTranslations: undefined,
    ppvMessage: undefined,
    offerMeta,
    ppvMessageId: ppvMeta.id,
  };
}

function buildPpvPurchasePreview(title: string, priceCents: number, currency?: string | null) {
  const label = formatPriceFromCents(priceCents, currency ?? "EUR");
  return `🔓 ${title}${label ? ` · ${label}` : ""}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<PpvPurchaseResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ppvId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!ppvId) {
    return res.status(400).json({ ok: false, error: "Missing ppv id" });
  }

  let fanIdForWallet: string | null = null;

  try {
    const ppvMessage = await prisma.ppvMessage.findUnique({
      where: { id: ppvId },
      select: {
        id: true,
        messageId: true,
        fanId: true,
        creatorId: true,
        title: true,
        priceCents: true,
        currency: true,
        message: {
          select: {
            id: true,
            fanId: true,
            from: true,
            audience: true,
            text: true,
            deliveredText: true,
            creatorTranslatedText: true,
            time: true,
            type: true,
            stickerId: true,
            audioUrl: true,
            audioDurationMs: true,
            audioMime: true,
            audioSizeBytes: true,
            isLastFromCreator: true,
            contentItem: true,
          },
        },
      },
    });
    if (!ppvMessage?.id || !ppvMessage.messageId || !ppvMessage.message) {
      return res.status(404).json({ ok: false, error: "PPV_NOT_FOUND" });
    }

    const fan = await prisma.fan.findUnique({
      where: { id: ppvMessage.fanId },
      select: { id: true, creatorId: true, adultConfirmedAt: true, displayName: true, name: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }
    if (!fan.adultConfirmedAt) {
      return res.status(403).json({ ok: false, error: "ADULT_NOT_CONFIRMED" });
    }
    fanIdForWallet = fan.id;

    const existingPurchase = await prisma.ppvPurchase.findUnique({
      where: {
        PpvPurchase_ppvMessageId_fanId_key: {
          ppvMessageId: ppvMessage.id,
          fanId: fan.id,
        },
      },
      select: { id: true, createdAt: true },
    });

    const wallet = await getOrCreateWallet(prisma, fan.id);
    const walletEnabled = Boolean(wallet);
    if (existingPurchase) {
      await prisma.ppvMessage.update({
        where: { id: ppvMessage.id },
        data: {
          status: "SOLD",
          soldAt: existingPurchase.createdAt,
          purchaseId: existingPurchase.id,
        },
      });
      const messagePayload = buildPpvMessagePayload(ppvMessage.message, {
        id: ppvMessage.id,
        messageId: ppvMessage.messageId,
        title: ppvMessage.title ?? null,
        priceCents: ppvMessage.priceCents,
        currency: ppvMessage.currency ?? "EUR",
        status: "unlocked",
        purchasedAt: existingPurchase.createdAt.toISOString(),
        isUnlockedForViewer: true,
        canViewContent: true,
        canPurchase: false,
      });
      return res.status(200).json({
        ok: true,
        purchaseId: existingPurchase.id,
        reused: true,
        message: messagePayload,
        ...buildWalletPayload(wallet),
      });
    }

    if (walletEnabled && (wallet?.balanceCents ?? 0) < ppvMessage.priceCents) {
      return res.status(400).json({
        ok: false,
        error: "INSUFFICIENT_BALANCE",
        requiredCents: ppvMessage.priceCents,
        ...buildWalletPayload(wallet),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const txWallet = walletEnabled ? await getOrCreateWallet(tx, fan.id) : null;
      if (walletEnabled && ppvMessage.priceCents > 0) {
        if (!txWallet || txWallet.balanceCents < ppvMessage.priceCents) {
          const err = new Error("INSUFFICIENT_BALANCE");
          (err as any).code = "INSUFFICIENT_BALANCE";
          throw err;
        }
      }
      let nextWallet = txWallet;
      if (walletEnabled && ppvMessage.priceCents > 0 && txWallet) {
        const nextBalance = txWallet.balanceCents - ppvMessage.priceCents;
        await (tx as any).walletTransaction.create({
          data: {
            walletId: txWallet.id,
            kind: "PPV_PURCHASE",
            amountCents: -ppvMessage.priceCents,
            balanceAfterCents: nextBalance,
            meta: { ppvId: ppvMessage.id, messageId: ppvMessage.messageId },
          },
        });
        const updatedWallet = await (tx as any).wallet.update({
          where: { id: txWallet.id },
          data: { balanceCents: nextBalance },
        });
        nextWallet = {
          id: updatedWallet.id,
          fanId: updatedWallet.fanId,
          currency: updatedWallet.currency || "EUR",
          balanceCents: updatedWallet.balanceCents ?? nextBalance,
        };
      }
      const purchase = await tx.ppvPurchase.create({
        data: {
          ppvMessageId: ppvMessage.id,
          fanId: fan.id,
          creatorId: ppvMessage.creatorId,
          amountCents: ppvMessage.priceCents,
          currency: ppvMessage.currency ?? "EUR",
          status: "PAID",
        },
      });
      await tx.ppvMessage.update({
        where: { id: ppvMessage.id },
        data: {
          status: "SOLD",
          soldAt: purchase.createdAt,
          purchaseId: purchase.id,
        },
      });
      return { purchase, wallet: nextWallet };
    });

    const now = new Date();
    const previewTitle = (ppvMessage.title || "").trim() || PPV_OFFER_FALLBACK_TITLE;
    const preview = buildPpvPurchasePreview(previewTitle, ppvMessage.priceCents, ppvMessage.currency ?? "EUR");
    const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
    try {
      await prisma.fan.update({
        where: { id: fan.id },
        data: {
          lastPurchaseAt: now,
          lastActivityAt: now,
          preview,
          time,
        },
      });
    } catch (updateErr) {
      console.error("api/ppv purchase fan-update error", { fanId: fan.id, error: (updateErr as Error)?.message });
    }

    const messagePayload = buildPpvMessagePayload(ppvMessage.message, {
      id: ppvMessage.id,
      messageId: ppvMessage.messageId,
      title: ppvMessage.title ?? null,
      priceCents: ppvMessage.priceCents,
      currency: ppvMessage.currency ?? "EUR",
      status: "unlocked",
      purchasedAt: result.purchase.createdAt.toISOString(),
      isUnlockedForViewer: true,
      canViewContent: true,
      canPurchase: false,
    });

    emitRealtimeEvent({
      eventId: result.purchase.id,
      type: "PURCHASE_CREATED",
      creatorId: ppvMessage.creatorId,
      fanId: fan.id,
      createdAt: result.purchase.createdAt.toISOString(),
      payload: {
        purchaseId: result.purchase.id,
        kind: "PPV",
        amountCents: ppvMessage.priceCents,
        title: previewTitle,
        createdAt: result.purchase.createdAt.toISOString(),
        fanName: fan.displayName ?? fan.name ?? null,
        clientTxnId: `ppv:${ppvMessage.id}`,
      },
    });

    emitRealtimeEvent({
      eventId: result.purchase.id,
      type: "PPV_UNLOCKED",
      creatorId: ppvMessage.creatorId,
      fanId: fan.id,
      createdAt: result.purchase.createdAt.toISOString(),
      payload: { message: messagePayload },
    });

    return res.status(200).json({
      ok: true,
      purchaseId: result.purchase.id,
      message: messagePayload,
      ...buildWalletPayload(result.wallet),
    });
  } catch (err) {
    if ((err as { code?: string }).code === "INSUFFICIENT_BALANCE") {
      const wallet = fanIdForWallet ? await getOrCreateWallet(prisma, fanIdForWallet).catch(() => null) : null;
      return res.status(400).json({
        ok: false,
        error: "INSUFFICIENT_BALANCE",
        requiredCents: undefined,
        ...buildWalletPayload(wallet),
      });
    }
    if (isDbSchemaOutOfSyncError(err)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("api/ppv purchase error", { ppvId, error: (err as Error)?.message });
    return res.status(500).json({ ok: false, error: "Error purchasing ppv" });
  }
}
