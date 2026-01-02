export type CreatorSalesPurchase = {
  amount?: number | null;
  kind?: string | null;
  productType?: "PACK" | "BUNDLE" | "EXTRA" | null;
  productId?: string | null;
};

export type CreatorSalesBreakdown = {
  subscriptionsAmount: number;
  giftsAmount: number;
  packsAmount: number;
  bundlesAmount: number;
  extrasAmount: number;
  tipsAmount: number;
};

type PurchaseKind = "EXTRA" | "TIP" | "GIFT";

function normalizePurchaseKind(kind: string | null | undefined): PurchaseKind {
  if (kind === "TIP") return "TIP";
  if (kind === "GIFT") return "GIFT";
  return "EXTRA";
}

function normalizeProductType(type: CreatorSalesPurchase["productType"]): "PACK" | "BUNDLE" | "EXTRA" | null {
  if (type === "PACK" || type === "BUNDLE" || type === "EXTRA") return type;
  return null;
}

export function getSalesProductKey(purchase: {
  productId?: string | null;
  kind?: string | null;
  contentItemId?: string | null;
}): string {
  const productId = typeof purchase.productId === "string" ? purchase.productId.trim() : "";
  if (productId) return productId;
  const contentId = typeof purchase.contentItemId === "string" ? purchase.contentItemId.trim() : "";
  if (contentId) return contentId;
  const kind = (purchase.kind || "").toUpperCase();
  return kind === "TIP" || kind === "GIFT" ? kind.toLowerCase() : "extra";
}

export function computeCreatorSalesBreakdown({
  purchases = [],
  subscriptionsAmount = 0,
}: {
  purchases?: CreatorSalesPurchase[];
  subscriptionsAmount?: number;
}): CreatorSalesBreakdown {
  let giftsAmount = 0;
  let packsAmount = 0;
  let bundlesAmount = 0;
  let extrasAmount = 0;
  let tipsAmount = 0;

  for (const purchase of purchases) {
    const rawAmount = typeof purchase.amount === "number" ? purchase.amount : Number(purchase.amount);
    if (!Number.isFinite(rawAmount)) continue;
    const amount = rawAmount ?? 0;
    const kind = normalizePurchaseKind(purchase.kind);
    if (kind === "TIP") {
      tipsAmount += amount;
      continue;
    }
    if (kind === "GIFT") {
      giftsAmount += amount;
      continue;
    }

    const productType = normalizeProductType(purchase.productType);
    if (productType === "PACK") {
      packsAmount += amount;
    } else if (productType === "BUNDLE") {
      bundlesAmount += amount;
    } else {
      extrasAmount += amount;
    }
  }

  return {
    subscriptionsAmount,
    giftsAmount,
    packsAmount,
    bundlesAmount,
    extrasAmount,
    tipsAmount,
  };
}
