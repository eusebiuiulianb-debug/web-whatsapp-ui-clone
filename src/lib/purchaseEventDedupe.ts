type PurchaseEventIdentity = {
  eventId?: string | null;
  purchaseId?: string | null;
  fanId?: string | null;
  createdAt?: string | null;
  kind?: string | null;
  amountCents?: number | null;
};

const MAX_EVENT_IDS = 240;
const EVENT_TTL_MS = 10 * 60 * 1000;

export function resolvePurchaseEventId(detail?: PurchaseEventIdentity | null): string | null {
  if (!detail) return null;
  if (typeof detail.eventId === "string" && detail.eventId.trim()) {
    return detail.eventId.trim();
  }
  if (typeof detail.purchaseId === "string" && detail.purchaseId.trim()) {
    return `purchase:${detail.purchaseId.trim()}`;
  }
  const fanId = typeof detail.fanId === "string" ? detail.fanId.trim() : "";
  if (!fanId) return null;
  const createdAt = typeof detail.createdAt === "string" ? detail.createdAt.trim() : "";
  const kind = typeof detail.kind === "string" ? detail.kind.trim() : "";
  const amount = typeof detail.amountCents === "number" ? String(detail.amountCents) : "";
  if (!createdAt && !kind && !amount) return null;
  return `purchase:${fanId}:${createdAt || "na"}:${kind || "na"}:${amount || "na"}`;
}

export function createPurchaseEventDedupe(maxEntries = MAX_EVENT_IDS, ttlMs = EVENT_TTL_MS) {
  const processed = new Map<string, number>();
  const queue: string[] = [];

  const prune = (now: number) => {
    while (queue.length > maxEntries) {
      const oldest = queue.shift();
      if (oldest) processed.delete(oldest);
    }
    const expired: string[] = [];
    processed.forEach((ts, id) => {
      if (now - ts > ttlMs) {
        expired.push(id);
      }
    });
    expired.forEach((id) => processed.delete(id));
  };

  const shouldProcess = (eventId?: string | null) => {
    if (!eventId) return true;
    if (processed.has(eventId)) return false;
    const now = Date.now();
    processed.set(eventId, now);
    queue.push(eventId);
    prune(now);
    return true;
  };

  return { shouldProcess };
}
