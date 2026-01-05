type PurchaseNoticePayload = {
  fanId: string;
  fanName?: string;
  amountCents?: number;
  kind?: string;
  title?: string;
  purchaseId?: string;
  createdAt?: string;
};

export type PurchaseNotice = {
  count: number;
  totalAmountCents: number;
  purchaseIds: string[];
  last: {
    amountCents: number;
    kind: string;
    title?: string;
    purchaseId?: string;
    createdAt?: string;
    fanName?: string;
  };
};

const STORAGE_KEY = "novsy:unseenPurchases";

function readStore(): Record<string, PurchaseNotice> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed as Record<string, PurchaseNotice>);
    const normalized: Record<string, PurchaseNotice> = {};
    for (const [fanId, notice] of entries) {
      if (!notice) continue;
      const count = typeof notice.count === "number" ? notice.count : 0;
      const lastAmount = typeof notice.last?.amountCents === "number" ? notice.last.amountCents : 0;
      const totalAmountCents =
        typeof notice.totalAmountCents === "number" ? notice.totalAmountCents : lastAmount * Math.max(1, count);
      const purchaseIds = Array.isArray(notice.purchaseIds) ? notice.purchaseIds : [];
      normalized[fanId] = {
        ...notice,
        count,
        totalAmountCents,
        purchaseIds,
      };
    }
    return normalized;
  } catch (_err) {
    return {};
  }
}

function writeStore(map: Record<string, PurchaseNotice>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (_err) {
    // ignore storage errors
  }
}

export function getUnseenPurchases(): Record<string, PurchaseNotice> {
  return readStore();
}

export function recordUnseenPurchase(payload: PurchaseNoticePayload): PurchaseNotice | null {
  if (!payload?.fanId) return null;
  const purchaseId = (() => {
    if (typeof payload.purchaseId === "string" && payload.purchaseId.trim()) {
      return payload.purchaseId.trim();
    }
    if (typeof payload.createdAt === "string" && payload.createdAt.trim()) {
      return `purchase-${payload.fanId}-${payload.createdAt.trim()}`;
    }
    return `purchase-${payload.fanId}-${Date.now()}`;
  })();
  const map = readStore();
  const existing = map[payload.fanId];
  const previousIds = Array.isArray(existing?.purchaseIds) ? existing!.purchaseIds : [];
  if (purchaseId && previousIds.includes(purchaseId)) {
    return existing ?? null;
  }
  const amountCents = typeof payload.amountCents === "number" ? payload.amountCents : 0;
  const count = (existing?.count ?? 0) + 1;
  const totalAmountCents = (existing?.totalAmountCents ?? 0) + amountCents;
  const purchaseIds = purchaseId ? [...previousIds, purchaseId] : [...previousIds];
  const last = {
    amountCents,
    kind: payload.kind?.toString().toUpperCase() ?? "EXTRA",
    title: typeof payload.title === "string" ? payload.title : existing?.last?.title,
    purchaseId: purchaseId ?? existing?.last?.purchaseId,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : existing?.last?.createdAt,
    fanName: typeof payload.fanName === "string" ? payload.fanName : existing?.last?.fanName,
  };
  const next: PurchaseNotice = {
    count,
    totalAmountCents,
    purchaseIds,
    last,
  };
  map[payload.fanId] = next;
  writeStore(map);
  return next;
}

export function consumeUnseenPurchase(fanId: string): PurchaseNotice | null {
  if (!fanId) return null;
  const map = readStore();
  const existing = map[fanId];
  if (!existing) return null;
  delete map[fanId];
  writeStore(map);
  return existing;
}

export function clearUnseenPurchase(fanId: string) {
  if (!fanId) return;
  const map = readStore();
  if (!map[fanId]) return;
  delete map[fanId];
  writeStore(map);
}
