import type { NextApiRequest, NextApiResponse } from "next";
import type { SavedItemType } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { readFanId, slugifyHandle } from "../../../lib/fan/session";

type SavedPreviewItem = {
  id: string;
  type: SavedItemType;
  entityId: string;
  collectionId: string | null;
  createdAt: string;
  title: string;
  subtitle: string | null;
  thumbUrl: string | null;
  href: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(200).json({ items: [] as SavedPreviewItem[], unauth: true });
  }

  const collectionId = pickQueryString(req.query.collectionId);
  const typeParam = pickQueryString(req.query.type);
  const type = normalizeSavedType(typeParam);

  try {
    const items = await prisma.savedItem.findMany({
      where: {
        userId: fanId,
        ...(collectionId ? { collectionId } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        entityId: true,
        collectionId: true,
        createdAt: true,
      },
    });

    if (items.length === 0) {
      return res.status(200).json({ items: [] as SavedPreviewItem[] });
    }

    const popclipIds = items.filter((item) => item.type === "POPCLIP").map((item) => item.entityId);
    const packIds = items.filter((item) => item.type === "PACK").map((item) => item.entityId);
    const creatorIds = items.filter((item) => item.type === "CREATOR").map((item) => item.entityId);

    const [popclips, packs, creators] = await Promise.all([
      popclipIds.length
        ? prisma.popClip.findMany({
            where: {
              id: { in: popclipIds },
              isActive: true,
              isArchived: false,
            },
            select: {
              id: true,
              title: true,
              caption: true,
              posterUrl: true,
              creator: {
                select: {
                  name: true,
                  handle: true,
                  bioLinkAvatarUrl: true,
                },
              },
            },
          })
        : [],
      packIds.length
        ? prisma.catalogItem.findMany({
            where: {
              id: { in: packIds },
              isActive: true,
              isPublic: true,
            },
            select: {
              id: true,
              title: true,
              priceCents: true,
              currency: true,
              creator: {
                select: {
                  name: true,
                  handle: true,
                },
              },
            },
          })
        : [],
      creatorIds.length
        ? prisma.creator.findMany({
            where: { id: { in: creatorIds } },
            select: {
              id: true,
              name: true,
              handle: true,
              subtitle: true,
              bioLinkAvatarUrl: true,
              profile: { select: { responseSla: true, availability: true } },
            },
          })
        : [],
    ]);

    const popclipMap = new Map(
      popclips.map((clip) => {
        const creatorName = clip.creator?.name || "Creador";
        const creatorHandle = clip.creator?.handle || slugifyHandle(creatorName || "creator");
        const title = (clip.title || clip.caption || "PopClip").trim() || "PopClip";
        const subtitle = `@${creatorHandle}`;
        const href = `/c/${encodeURIComponent(creatorHandle)}?popclip=${encodeURIComponent(clip.id)}`;
        const thumbUrl = clip.posterUrl ?? clip.creator?.bioLinkAvatarUrl ?? null;
        return [
          clip.id,
          {
            title,
            subtitle,
            thumbUrl,
            href,
          },
        ];
      })
    );

    const packMap = new Map(
      packs.map((pack) => {
        const creatorHandle = pack.creator?.handle || slugifyHandle(pack.creator?.name || "creator");
        const title = pack.title?.trim() || "Pack";
        const subtitle = formatPrice(pack.priceCents, pack.currency);
        const href = creatorHandle ? `/p/${encodeURIComponent(creatorHandle)}/${encodeURIComponent(pack.id)}` : null;
        return [
          pack.id,
          {
            title,
            subtitle,
            thumbUrl: null,
            href,
          },
        ];
      })
    );

    const creatorMap = new Map(
      creators.map((creator) => {
        const handle = creator.handle || slugifyHandle(creator.name || "creator");
        const title = creator.name?.trim() || "Creador";
        const subtitle = creator.subtitle?.trim() || formatResponseTimeLabel(creator.profile?.responseSla);
        const href = `/c/${encodeURIComponent(handle)}`;
        return [
          creator.id,
          {
            title,
            subtitle,
            thumbUrl: creator.bioLinkAvatarUrl ?? null,
            href,
          },
        ];
      })
    );

    const resolved: SavedPreviewItem[] = [];
    for (const item of items) {
      if (item.type === "POPCLIP") {
        const preview = popclipMap.get(item.entityId);
        if (!preview) continue;
        resolved.push({
          id: item.id,
          type: item.type,
          entityId: item.entityId,
          collectionId: item.collectionId ?? null,
          createdAt: item.createdAt.toISOString(),
          title: preview.title,
          subtitle: preview.subtitle,
          thumbUrl: preview.thumbUrl,
          href: preview.href,
        });
        continue;
      }
      if (item.type === "PACK") {
        const preview = packMap.get(item.entityId);
        if (!preview) continue;
        resolved.push({
          id: item.id,
          type: item.type,
          entityId: item.entityId,
          collectionId: item.collectionId ?? null,
          createdAt: item.createdAt.toISOString(),
          title: preview.title,
          subtitle: preview.subtitle,
          thumbUrl: preview.thumbUrl,
          href: preview.href,
        });
        continue;
      }
      if (item.type === "CREATOR") {
        const preview = creatorMap.get(item.entityId);
        if (!preview) continue;
        resolved.push({
          id: item.id,
          type: item.type,
          entityId: item.entityId,
          collectionId: item.collectionId ?? null,
          createdAt: item.createdAt.toISOString(),
          title: preview.title,
          subtitle: preview.subtitle,
          thumbUrl: preview.thumbUrl,
          href: preview.href,
        });
      }
    }

    return res.status(200).json({ items: resolved });
  } catch (err) {
    console.error("Error loading saved items", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function pickQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim?.() ?? "";
  return "";
}

function normalizeSavedType(value?: string): SavedItemType | null {
  const raw = (value || "").toUpperCase();
  if (raw === "POPCLIP" || raw === "PACK" || raw === "CREATOR") {
    return raw as SavedItemType;
  }
  return null;
}

function formatPrice(cents?: number | null, currency?: string | null): string | null {
  if (!Number.isFinite(cents ?? NaN)) return null;
  const amount = (cents as number) / 100;
  const resolvedCurrency = currency || "EUR";
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: resolvedCurrency }).format(amount);
  } catch (_err) {
    return `${amount.toFixed(2)} ${resolvedCurrency}`;
  }
}

function formatResponseTimeLabel(value?: string | null): string | null {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "Responde al momento";
  if (normalized === "LT_72H" || normalized === "LT_48H") return "Responde <72h";
  if (normalized === "LT_24H") return "Responde <24h";
  return null;
}
