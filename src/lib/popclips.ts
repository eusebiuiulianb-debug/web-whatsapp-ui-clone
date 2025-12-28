import type { CatalogItemType } from "./catalog";

export type PopClipCatalogItem = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  type: CatalogItemType;
  isPublic?: boolean;
  isActive?: boolean;
};

export type PopClip = {
  id: string;
  creatorId: string;
  catalogItemId: string;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  durationSec: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  catalogItem?: PopClipCatalogItem;
};

export type PopClipInput = {
  creatorId: string;
  catalogItemId: string;
  title?: string | null;
  videoUrl: string;
  posterUrl?: string | null;
  durationSec?: number | null;
  isActive?: boolean;
  sortOrder?: number;
};

export type PopClipDb = {
  id: string;
  creatorId: string;
  catalogItemId: string;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  durationSec: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  catalogItem?: {
    id: string;
    title: string;
    description: string | null;
    priceCents: number;
    currency: string;
    type: CatalogItemType;
    isPublic?: boolean | null;
    isActive?: boolean | null;
  } | null;
};

export function serializePopClip(item: PopClipDb): PopClip {
  return {
    id: item.id,
    creatorId: item.creatorId,
    catalogItemId: item.catalogItemId,
    title: item.title ?? null,
    videoUrl: item.videoUrl,
    posterUrl: item.posterUrl ?? null,
    durationSec: item.durationSec ?? null,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    catalogItem: item.catalogItem
      ? {
          id: item.catalogItem.id,
          title: item.catalogItem.title,
          description: item.catalogItem.description ?? null,
          priceCents: item.catalogItem.priceCents,
          currency: item.catalogItem.currency,
          type: item.catalogItem.type,
          isPublic: typeof item.catalogItem.isPublic === "boolean" ? item.catalogItem.isPublic : undefined,
          isActive: typeof item.catalogItem.isActive === "boolean" ? item.catalogItem.isActive : undefined,
        }
      : undefined,
  };
}
