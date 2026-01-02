export type FanPurchaseLike = {
  kind?: string | null;
  amount?: number | null;
};

export type FanTotals = {
  extrasAmount: number;
  tipsAmount: number;
  giftsAmount: number;
  totalSpent: number;
};

function normalizeKind(kind: string | null | undefined): "EXTRA" | "TIP" | "GIFT" {
  if (!kind) return "EXTRA";
  const normalized = kind.toUpperCase();
  if (normalized === "TIP" || normalized === "GIFT") return normalized;
  return "EXTRA";
}

export function computeFanTotals(purchases: FanPurchaseLike[] = []): FanTotals {
  let extrasAmount = 0;
  let tipsAmount = 0;
  let giftsAmount = 0;

  for (const purchase of purchases) {
    const rawAmount = typeof purchase?.amount === "number" ? purchase.amount : Number(purchase?.amount);
    if (!Number.isFinite(rawAmount)) continue;
    const amount = rawAmount ?? 0;
    const kind = normalizeKind(purchase?.kind ?? null);
    if (kind === "TIP") {
      tipsAmount += amount;
    } else if (kind === "GIFT") {
      giftsAmount += amount;
    } else {
      extrasAmount += amount;
    }
  }

  return {
    extrasAmount,
    tipsAmount,
    giftsAmount,
    totalSpent: extrasAmount + tipsAmount + giftsAmount,
  };
}
