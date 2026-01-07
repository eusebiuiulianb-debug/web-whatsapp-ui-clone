type DedupeEntry<T> = {
  ts: number;
  promise: Promise<T>;
};

const inflight = new Map<string, DedupeEntry<unknown>>();

export async function fetchJsonDedupe<T>(
  key: string,
  fetcher: () => Promise<Response>,
  opts?: { ttlMs?: number; keepOnError?: boolean }
): Promise<T> {
  const ttlMs = opts?.ttlMs ?? 1200;
  const now = Date.now();
  const existing = inflight.get(key) as DedupeEntry<T> | undefined;
  if (existing && now - existing.ts < ttlMs) {
    return existing.promise;
  }

  const promise = (async () => {
    const res = await fetcher();
    if (!res.ok) {
      const error = new Error(`request_failed_${res.status}`);
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }
    return (await res.json()) as T;
  })();

  inflight.set(key, { ts: now, promise });

  const scheduleCleanup = () => {
    const current = inflight.get(key) as DedupeEntry<T> | undefined;
    if (!current || current.promise !== promise) return;
    const elapsed = Date.now() - now;
    if (elapsed >= ttlMs) {
      inflight.delete(key);
      return;
    }
    setTimeout(() => {
      const latest = inflight.get(key) as DedupeEntry<T> | undefined;
      if (latest && latest.promise === promise) {
        inflight.delete(key);
      }
    }, ttlMs - elapsed);
  };

  promise.then(scheduleCleanup).catch(() => {
    if (opts?.keepOnError) {
      scheduleCleanup();
      return;
    }
    const current = inflight.get(key) as DedupeEntry<T> | undefined;
    if (current && current.promise === promise) {
      inflight.delete(key);
    }
  });

  return promise;
}
