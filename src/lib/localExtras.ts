import { useSyncExternalStore } from "react";

const EXTRAS_STORAGE_PREFIX = "novsy:extras:";
const EXTRAS_EVENT = "novsy:extras";
const EXTRAS_CHANNEL = "novsy";

export type ExtraEvent = {
  id: string;
  kind: "TIP" | "GIFT";
  amount: number;
  packRef?: string;
  packName?: string;
  createdAt: string;
};

export type ExtrasWindowSummary = {
  count: number;
  amount: number;
};

export type LocalExtrasSummary = {
  tips: {
    today: ExtrasWindowSummary;
    last7Days: ExtrasWindowSummary;
    last30Days: ExtrasWindowSummary;
  };
  gifts: {
    today: ExtrasWindowSummary;
    last7Days: ExtrasWindowSummary;
    last30Days: ExtrasWindowSummary;
  };
};

export const EMPTY_EXTRAS_RAW = "[]";
const EMPTY_EXTRAS: ExtraEvent[] = Object.freeze([]);
const EMPTY_WINDOW: ExtrasWindowSummary = Object.freeze({ count: 0, amount: 0 });
const EMPTY_LOCAL_SUMMARY: LocalExtrasSummary = Object.freeze({
  tips: { today: EMPTY_WINDOW, last7Days: EMPTY_WINDOW, last30Days: EMPTY_WINDOW },
  gifts: { today: EMPTY_WINDOW, last7Days: EMPTY_WINDOW, last30Days: EMPTY_WINDOW },
});

const extrasCacheRaw = new Map<string, string>();
const extrasCacheParsed = new Map<string, ExtraEvent[]>();
let extrasChannel: BroadcastChannel | null = null;
let extrasSummaryVersion = 0;
let extrasSummaryCache: { version: number; summary: LocalExtrasSummary } | null = null;

export function buildExtrasStorageKey(fanId: string): string {
  return `${EXTRAS_STORAGE_PREFIX}${fanId}`;
}

function getExtrasChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (extrasChannel) return extrasChannel;
  try {
    extrasChannel = new BroadcastChannel(EXTRAS_CHANNEL);
  } catch (_err) {
    extrasChannel = null;
  }
  return extrasChannel;
}

function buildWindowSummary(): ExtrasWindowSummary {
  return { count: 0, amount: 0 };
}

function buildLocalExtrasSummary(): LocalExtrasSummary {
  return {
    tips: {
      today: buildWindowSummary(),
      last7Days: buildWindowSummary(),
      last30Days: buildWindowSummary(),
    },
    gifts: {
      today: buildWindowSummary(),
      last7Days: buildWindowSummary(),
      last30Days: buildWindowSummary(),
    },
  };
}

function normalizeExtraEvent(entry: unknown): ExtraEvent | null {
  if (!entry || typeof entry !== "object") return null;
  const data = entry as {
    id?: unknown;
    kind?: unknown;
    amount?: unknown;
    packRef?: unknown;
    packName?: unknown;
    createdAt?: unknown;
  };
  const id = typeof data.id === "string" ? data.id.trim() : "";
  const kind = data.kind === "TIP" || data.kind === "GIFT" ? data.kind : null;
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const createdAt = typeof data.createdAt === "string" ? data.createdAt : "";
  if (!id || !kind || !Number.isFinite(amount) || !createdAt) return null;
  const packRef = typeof data.packRef === "string" ? data.packRef.trim() : undefined;
  const packName = typeof data.packName === "string" ? data.packName.trim() : undefined;
  return {
    id,
    kind,
    amount,
    packRef: packRef || undefined,
    packName: packName || undefined,
    createdAt,
  };
}

export function parseExtrasRaw(raw: string): ExtraEvent[] {
  if (!raw || raw === EMPTY_EXTRAS_RAW) return EMPTY_EXTRAS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_EXTRAS;
    const normalized = parsed.map(normalizeExtraEvent).filter(Boolean) as ExtraEvent[];
    return normalized.length > 0 ? normalized : EMPTY_EXTRAS;
  } catch (_err) {
    return EMPTY_EXTRAS;
  }
}

function readExtrasRawByKey(storageKey: string): string {
  if (typeof window === "undefined") return EMPTY_EXTRAS_RAW;
  let raw = EMPTY_EXTRAS_RAW;
  try {
    raw = window.localStorage.getItem(storageKey) ?? EMPTY_EXTRAS_RAW;
  } catch (_err) {
    raw = EMPTY_EXTRAS_RAW;
  }
  const cachedRaw = extrasCacheRaw.get(storageKey);
  if (cachedRaw === raw) return cachedRaw;
  extrasCacheRaw.set(storageKey, raw);
  extrasCacheParsed.set(storageKey, parseExtrasRaw(raw));
  return raw;
}

function readExtraEventsByKey(storageKey: string): ExtraEvent[] {
  readExtrasRawByKey(storageKey);
  return extrasCacheParsed.get(storageKey) ?? EMPTY_EXTRAS;
}

export function readExtrasRaw(fanId: string): string {
  if (!fanId) return EMPTY_EXTRAS_RAW;
  return readExtrasRawByKey(buildExtrasStorageKey(fanId));
}

export function readExtraEvents(fanId: string): ExtraEvent[] {
  if (!fanId) return EMPTY_EXTRAS;
  return readExtraEventsByKey(buildExtrasStorageKey(fanId));
}

export function writeExtraEvents(fanId: string, next: ExtraEvent[]) {
  if (!fanId || typeof window === "undefined") return;
  const storageKey = buildExtrasStorageKey(fanId);
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(storageKey, raw);
  } catch (_err) {
    return;
  }
  extrasCacheRaw.set(storageKey, raw);
  extrasCacheParsed.set(storageKey, next);
  window.dispatchEvent(new CustomEvent(EXTRAS_EVENT, { detail: { fanId, storageKey } }));
  getExtrasChannel()?.postMessage({ type: "extras", fanId, storageKey });
}

export function appendExtraEvent(fanId: string, event: ExtraEvent): ExtraEvent[] {
  if (!fanId) return [];
  const current = readExtraEvents(fanId);
  const next = [...current, event];
  writeExtraEvents(fanId, next);
  return next;
}

function subscribeToExtras(storageKey: string, fanId: string, callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent)?.detail as { fanId?: string; storageKey?: string } | undefined;
    if (detail?.storageKey && detail.storageKey !== storageKey) return;
    if (detail?.fanId && fanId && detail.fanId !== fanId) return;
    callback();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== storageKey) return;
    callback();
  };
  const handleBroadcast = (event: MessageEvent) => {
    const data = event.data as { type?: string; fanId?: string; storageKey?: string } | null;
    if (!data || data.type !== "extras") return;
    if (data.storageKey && data.storageKey !== storageKey) return;
    if (data.fanId && fanId && data.fanId !== fanId) return;
    callback();
  };

  window.addEventListener(EXTRAS_EVENT, handleCustom as EventListener);
  window.addEventListener("storage", handleStorage);
  const channel = getExtrasChannel();
  channel?.addEventListener("message", handleBroadcast as EventListener);

  return () => {
    window.removeEventListener(EXTRAS_EVENT, handleCustom as EventListener);
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleBroadcast as EventListener);
  };
}

export function useLocalExtras(fanId: string): string {
  const storageKey = buildExtrasStorageKey(fanId || "");
  return useSyncExternalStore(
    (callback) => (fanId ? subscribeToExtras(storageKey, fanId, callback) : () => {}),
    () => (fanId ? readExtrasRawByKey(storageKey) : EMPTY_EXTRAS_RAW),
    () => EMPTY_EXTRAS_RAW
  );
}

function subscribeToAllExtras(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const notify = () => {
    extrasSummaryVersion += 1;
    callback();
  };
  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent)?.detail as { storageKey?: string } | undefined;
    if (detail?.storageKey && !detail.storageKey.startsWith(EXTRAS_STORAGE_PREFIX)) return;
    notify();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && !event.key.startsWith(EXTRAS_STORAGE_PREFIX)) return;
    notify();
  };
  const handleBroadcast = (event: MessageEvent) => {
    const data = event.data as { type?: string } | null;
    if (!data || data.type !== "extras") return;
    notify();
  };

  window.addEventListener(EXTRAS_EVENT, handleCustom as EventListener);
  window.addEventListener("storage", handleStorage);
  const channel = getExtrasChannel();
  channel?.addEventListener("message", handleBroadcast as EventListener);

  return () => {
    window.removeEventListener(EXTRAS_EVENT, handleCustom as EventListener);
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleBroadcast as EventListener);
  };
}

export function summarizeLocalExtras(now = new Date()): LocalExtrasSummary {
  if (typeof window === "undefined") return EMPTY_LOCAL_SUMMARY;
  const summary = buildLocalExtrasSummary();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const start7 = new Date(startOfToday);
  start7.setDate(start7.getDate() - 7);
  const start30 = new Date(startOfToday);
  start30.setDate(start30.getDate() - 30);

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(EXTRAS_STORAGE_PREFIX)) continue;
      const raw = window.localStorage.getItem(key) ?? EMPTY_EXTRAS_RAW;
      const events = parseExtrasRaw(raw);
      for (const event of events) {
        if (!Number.isFinite(event.amount) || event.amount < 0) continue;
        const createdAt = new Date(event.createdAt);
        if (Number.isNaN(createdAt.getTime())) continue;
        const bucket = event.kind === "TIP" ? summary.tips : summary.gifts;
        if (createdAt >= startOfToday) {
          bucket.today.count += 1;
          bucket.today.amount += event.amount;
        }
        if (createdAt >= start7) {
          bucket.last7Days.count += 1;
          bucket.last7Days.amount += event.amount;
        }
        if (createdAt >= start30) {
          bucket.last30Days.count += 1;
          bucket.last30Days.amount += event.amount;
        }
      }
    }
  } catch (_err) {
    return summary;
  }

  return summary;
}

export function useLocalExtrasSummary(): LocalExtrasSummary {
  return useSyncExternalStore(
    subscribeToAllExtras,
    () => {
      if (extrasSummaryCache && extrasSummaryCache.version === extrasSummaryVersion) {
        return extrasSummaryCache.summary;
      }
      const summary = summarizeLocalExtras();
      extrasSummaryCache = { version: extrasSummaryVersion, summary };
      return summary;
    },
    () => EMPTY_LOCAL_SUMMARY
  );
}
