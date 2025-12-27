export const STICKER_TOKEN_PREFIX = "::sticker::";

export const STICKER_COLLECTIONS = [
  { id: "suave", label: "Suave" },
  { id: "atrevido", label: "Atrevido" },
] as const;

export type StickerCollectionId = (typeof STICKER_COLLECTIONS)[number]["id"];

export const STICKER_PACKS = [
  { id: "mirada", label: "Mirada" },
  { id: "cita", label: "Cita" },
  { id: "cierre", label: "Cierre" },
] as const;

export type StickerPackId = (typeof STICKER_PACKS)[number]["id"];

export type StickerItem = {
  id: string;
  label: string;
  collectionId: StickerCollectionId;
  packId: StickerPackId;
  src: string;
};

const STICKER_COUNTS: Record<StickerPackId, number> = {
  mirada: 8,
  cita: 8,
  cierre: 8,
};

const COLLECTION_ACCENTS: Record<StickerCollectionId, { border: string; text: string }> = {
  suave: { border: "#22c55e", text: "#dcfce7" },
  atrevido: { border: "#f59e0b", text: "#fef3c7" },
};

const STICKER_COLLECTION_IDS = STICKER_COLLECTIONS.map((collection) => collection.id);
const STICKER_PACK_IDS = STICKER_PACKS.map((pack) => pack.id);

const isStickerCollectionId = (value: string): value is StickerCollectionId =>
  STICKER_COLLECTION_IDS.includes(value as StickerCollectionId);
const isStickerPackId = (value: string): value is StickerPackId =>
  STICKER_PACK_IDS.includes(value as StickerPackId);

const makeStickerKey = (collectionId: StickerCollectionId, packId: StickerPackId, id: string) =>
  `${collectionId}/${packId}/${id}`;

const createStickerSvg = (label: string, accent: { border: string; text: string }) => {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">`,
    `<rect width="360" height="360" rx="72" fill="#0b1220" fill-opacity="0.92" />`,
    `<rect x="14" y="14" width="332" height="332" rx="58" fill="none" stroke="${accent.border}" stroke-width="6" />`,
    `<text x="50%" y="50%" fill="${accent.text}" font-size="28" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial" font-weight="600" text-anchor="middle" dominant-baseline="middle">${label}</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const buildStickerItems = (): StickerItem[] => {
  const items: StickerItem[] = [];
  for (const collection of STICKER_COLLECTIONS) {
    const accent = COLLECTION_ACCENTS[collection.id];
    for (const pack of STICKER_PACKS) {
      const count = STICKER_COUNTS[pack.id] ?? 8;
      for (let index = 1; index <= count; index += 1) {
        const id = String(index).padStart(2, "0");
        const label = `${pack.label} ${id}`;
        items.push({
          id,
          label,
          collectionId: collection.id,
          packId: pack.id,
          src: createStickerSvg(label, accent),
        });
      }
    }
  }
  return items;
};

export const STICKERS: StickerItem[] = buildStickerItems();

const STICKER_LOOKUP = new Map(
  STICKERS.map((item) => [makeStickerKey(item.collectionId, item.packId, item.id), item])
);

export const buildStickerToken = (collectionId: StickerCollectionId, packId: StickerPackId, id: string) =>
  `${STICKER_TOKEN_PREFIX}${collectionId}/${packId}/${id}`;

export const buildStickerTokenFromItem = (item: StickerItem) =>
  buildStickerToken(item.collectionId, item.packId, item.id);

export const parseStickerToken = (input?: string | null) => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith(STICKER_TOKEN_PREFIX)) return null;
  const withoutPrefix = trimmed.slice(STICKER_TOKEN_PREFIX.length);
  const tokenPart = withoutPrefix.split(/\s/)[0] ?? "";
  const [collectionId, packId, id] = tokenPart.split("/");
  if (!collectionId || !packId || !id) return null;
  if (!isStickerCollectionId(collectionId) || !isStickerPackId(packId)) return null;
  return {
    collectionId,
    packId,
    id,
    key: makeStickerKey(collectionId, packId, id),
  };
};

export const isStickerToken = (input?: string | null) => Boolean(parseStickerToken(input));

export const getStickerByToken = (input?: string | null) => {
  const parsed = parseStickerToken(input);
  if (!parsed) return null;
  return STICKER_LOOKUP.get(parsed.key) ?? null;
};
