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
  catalogItemId: string | null;
  contentItemId?: string | null;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  startAtSec?: number | null;
  durationSec: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoSizeBytes?: number | null;
  isActive: boolean;
  isArchived: boolean;
  isStory: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  catalogItem?: PopClipCatalogItem;
};

export type PopClipInput = {
  creatorId: string;
  catalogItemId?: string | null;
  contentItemId?: string | null;
  title?: string | null;
  videoUrl: string;
  posterUrl?: string | null;
  startAtSec?: number | null;
  durationSec?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoSizeBytes?: number | null;
  isActive?: boolean;
  isStory?: boolean;
  isArchived?: boolean;
  sortOrder?: number;
};

export type PopClipDb = {
  id: string;
  creatorId: string;
  catalogItemId: string | null;
  contentItemId?: string | null;
  title: string | null;
  videoUrl: string;
  posterUrl: string | null;
  startAtSec?: number | null;
  durationSec: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoSizeBytes?: number | null;
  isActive: boolean;
  isArchived: boolean;
  isStory: boolean;
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
    catalogItemId: item.catalogItemId ?? null,
    contentItemId: item.contentItemId ?? null,
    title: item.title ?? null,
    videoUrl: item.videoUrl,
    posterUrl: item.posterUrl ?? null,
    startAtSec: typeof item.startAtSec === "number" ? item.startAtSec : 0,
    durationSec: item.durationSec ?? null,
    videoWidth: typeof item.videoWidth === "number" ? item.videoWidth : null,
    videoHeight: typeof item.videoHeight === "number" ? item.videoHeight : null,
    videoSizeBytes: typeof item.videoSizeBytes === "number" ? item.videoSizeBytes : null,
    isActive: item.isActive,
    isArchived: item.isArchived,
    isStory: item.isStory,
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
