export type CatalogItemType = "EXTRA" | "BUNDLE" | "PACK";

export type CatalogItem = {
  id: string;
  creatorId: string;
  type: CatalogItemType;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  includes: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogItemInput = {
  creatorId: string;
  type: CatalogItemType;
  title: string;
  description?: string | null;
  priceCents: number;
  currency?: string;
  includes?: string[] | null;
  isPublic?: boolean;
};

export type CatalogItemDb = {
  id: string;
  creatorId: string;
  type: CatalogItemType;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
  isPublic?: boolean;
  sortOrder: number;
  includes?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export const CATALOG_ITEM_TYPES: CatalogItemType[] = ["EXTRA", "BUNDLE", "PACK"];

export const CATALOG_ITEM_TYPE_LABELS: Record<CatalogItemType, string> = {
  EXTRA: "Extra",
  BUNDLE: "Bundle",
  PACK: "Pack",
};

export function isCatalogItemType(value: unknown): value is CatalogItemType {
  return typeof value === "string" && CATALOG_ITEM_TYPES.includes(value as CatalogItemType);
}

export function formatCatalogPriceCents(cents: number, currency = "EUR") {
  const amount = cents / 100;
  const hasDecimals = cents % 100 !== 0;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    const fixed = hasDecimals ? amount.toFixed(2) : Math.round(amount).toString();
    return `${fixed} ${currency}`;
  }
}

export function formatCatalogIncludesSummary(includes?: string[] | null) {
  const list = (includes ?? []).map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) return "";
  const preview = list.slice(0, 2).join(", ");
  const remaining = Math.max(0, list.length - 2);
  return remaining > 0 ? `${preview} y ${remaining} mas` : preview;
}

export function buildCatalogPitch({
  fanName,
  item,
  includesSummary,
}: {
  fanName: string;
  item: Pick<CatalogItem, "type" | "title" | "priceCents" | "currency" | "includes">;
  includesSummary?: string;
}) {
  const safeName = fanName.trim() || "alli";
  const priceLabel = formatCatalogPriceCents(item.priceCents, item.currency || "EUR");
  if (item.type === "EXTRA") {
    return `Hola ${safeName}, hoy tengo un extra: ${item.title} (${priceLabel}). Te lo dejo listo?`;
  }
  if (item.type === "PACK") {
    return `Hola ${safeName}, si quieres subimos a ${item.title} (${priceLabel}) y lo tienes activo desde hoy. Te lo dejo listo?`;
  }
  const summary = includesSummary ?? formatCatalogIncludesSummary(item.includes);
  const includesLine = summary ? ` Incluye: ${summary}.` : "";
  return `Hola ${safeName}, te preparo el bundle ${item.title} (${priceLabel}).${includesLine} Te lo dejo listo?`;
}

export function serializeCatalogItem(item: CatalogItemDb): CatalogItem {
  const includes = Array.isArray(item.includes)
    ? item.includes.filter((entry): entry is string => typeof entry === "string")
    : null;
  return {
    id: item.id,
    creatorId: item.creatorId,
    type: item.type,
    title: item.title,
    description: item.description,
    priceCents: item.priceCents,
    currency: item.currency,
    isActive: item.isActive,
    isPublic: typeof item.isPublic === "boolean" ? item.isPublic : true,
    sortOrder: item.sortOrder,
    includes: includes && includes.length ? includes : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
