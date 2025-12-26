export type StickerCategory = "amor" | "fuego" | "magia" | "picante" | "fruta" | "divertido";

export type StickerItem = {
  id: string;
  label: string;
  src: string;
  tags: string[];
  category: StickerCategory;
};

export const STICKER_CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: "amor", label: "Amor" },
  { id: "fuego", label: "Fuego" },
  { id: "magia", label: "Magia" },
  { id: "picante", label: "Picante" },
  { id: "fruta", label: "Fruta" },
  { id: "divertido", label: "Divertido" },
];

export const STICKER_ITEMS: StickerItem[] = [
  { id: "sticker-01", label: "Corazonazo", src: "/stickers/sticker-01.svg", tags: ["amor", "corazón"], category: "amor" },
  { id: "sticker-02", label: "Besito", src: "/stickers/sticker-02.svg", tags: ["amor", "beso"], category: "amor" },
  { id: "sticker-03", label: "Chispa", src: "/stickers/sticker-03.svg", tags: ["fuego", "energía"], category: "fuego" },
  { id: "sticker-04", label: "Fuego suave", src: "/stickers/sticker-04.svg", tags: ["fuego", "calor"], category: "fuego" },
  { id: "sticker-05", label: "Magia", src: "/stickers/sticker-05.svg", tags: ["magia", "brillo"], category: "magia" },
  { id: "sticker-06", label: "Unicornio", src: "/stickers/sticker-06.svg", tags: ["magia", "unicornio"], category: "magia" },
  { id: "sticker-07", label: "Picante", src: "/stickers/sticker-07.svg", tags: ["picante", "atrevido"], category: "picante" },
  { id: "sticker-08", label: "Diablito", src: "/stickers/sticker-08.svg", tags: ["picante", "travieso"], category: "picante" },
  { id: "sticker-09", label: "Piña", src: "/stickers/sticker-09.svg", tags: ["fruta", "piña"], category: "fruta" },
  { id: "sticker-10", label: "Piña invertida", src: "/stickers/sticker-10.svg", tags: ["fruta", "piña", "señal"], category: "fruta" },
  { id: "sticker-11", label: "Guiño", src: "/stickers/sticker-11.svg", tags: ["divertido", "guiño"], category: "divertido" },
  { id: "sticker-12", label: "Risa", src: "/stickers/sticker-12.svg", tags: ["divertido", "risa"], category: "divertido" },
];

const STICKER_LOOKUP = new Map(STICKER_ITEMS.map((item) => [item.id, item]));

export function getStickerById(id?: string | null): StickerItem | null {
  if (!id) return null;
  return STICKER_LOOKUP.get(id) ?? null;
}
