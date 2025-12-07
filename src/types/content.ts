export type ContentType = "IMAGE" | "VIDEO" | "AUDIO" | "TEXT";
export type ContentVisibility = "INCLUDED_MONTHLY" | "VIP" | "EXTRA";

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  visibility: ContentVisibility;
  externalUrl: string;
  createdAt: string;
}

export function getContentTypeLabel(type: ContentType): string {
  if (type === "IMAGE") return "Foto";
  if (type === "VIDEO") return "Vídeo";
  if (type === "TEXT") return "Texto";
  return "Audio";
}

export function getContentVisibilityLabel(visibility: ContentVisibility): string {
  if (visibility === "INCLUDED_MONTHLY") return "Incluido en tu suscripción";
  if (visibility === "VIP") return "VIP";
  return "Extra";
}
