type PurchaseEventPayload = {
  eventId?: string;
  purchaseId?: string;
  fanId?: string;
  createdAt?: string;
  amountCents?: number;
  kind?: string;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolvePurchaseEventId(payload: PurchaseEventPayload | null | undefined): string | null {
  if (!payload) return null;
  const explicit = normalizeId(payload.eventId);
  if (explicit) return explicit;
  const purchaseId = normalizeId(payload.purchaseId);
  if (purchaseId) return purchaseId;
  const fanId = normalizeId(payload.fanId);
  const createdAt = normalizeId(payload.createdAt);
  if (fanId && createdAt) return `purchase-${fanId}-${createdAt}`;
  const kind = normalizeId(payload.kind)?.toUpperCase();
  if (fanId && kind && typeof payload.amountCents === "number") {
    return `purchase-${fanId}-${kind}-${payload.amountCents}`;
  }
  return null;
}

export function createPurchaseEventDedupe(options?: { ttlMs?: number; maxEntries?: number }) {
  const ttlMs = typeof options?.ttlMs === "number" ? options.ttlMs : DEFAULT_TTL_MS;
  const maxEntries = typeof options?.maxEntries === "number" ? options.maxEntries : DEFAULT_MAX_ENTRIES;
  const seen = new Map<string, number>();
  const queue: string[] = [];

  const prune = () => {
    const now = Date.now();
    while (queue.length > maxEntries) {
      const old = queue.shift();
      if (old) seen.delete(old);
    }
    const toDelete: string[] = [];
    seen.forEach((ts, key) => {
      if (now - ts > ttlMs) {
        toDelete.push(key);
      }
    });
    for (let i = 0; i < toDelete.length; i += 1) {
      seen.delete(toDelete[i]);
    }
  };

  const mark = (id: string) => {
    const now = Date.now();
    seen.set(id, now);
    queue.push(id);
    prune();
  };

  const shouldProcess = (payload: PurchaseEventPayload | null | undefined) => {
    const id = resolvePurchaseEventId(payload);
    if (!id) return true;
    prune();
    if (seen.has(id)) return false;
    mark(id);
    return true;
  };

  return { shouldProcess, mark };
}
