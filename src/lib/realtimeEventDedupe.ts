type EventDedupeOptions = {
  ttlMs?: number;
  maxEntries?: number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createEventIdDedupe(options?: EventDedupeOptions) {
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

  const shouldProcess = (idValue?: string | null) => {
    const id = normalizeId(idValue);
    if (!id) return true;
    prune();
    if (seen.has(id)) return false;
    mark(id);
    return true;
  };

  return { shouldProcess, mark };
}
