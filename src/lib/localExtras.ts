import { useSyncExternalStore } from "react";

const EXTRAS_STORAGE_PREFIX = "novsy:extras:";
const EXTRAS_SYSTEM_STORAGE_PREFIX = "novsy:extras-system:";
const EXTRAS_EVENT = "novsy:extras";
const EXTRAS_CHANNEL = "novsy";
const EXTRAS_CLIENT_ID_KEY = "novsy:extras-client-id";
const EXTRAS_UNREAD_KEY = "novsy:extras-unread";
const EXTRAS_UNREAD_EVENT = "novsy:extras-unread";
export const EXTRAS_SYSTEM_EVENT = "novsy:extras-system";
const EMPTY_ALL_RAW = "";
const EMPTY_UNREAD_RAW = "{}";

export type ExtraEvent = {
  id: string;
  kind: "TIP" | "GIFT" | "EXTRA";
  amount: number;
  packRef?: string;
  packName?: string;
  createdAt: string;
};

export type ExtraEventWithMeta = ExtraEvent & {
  fanId: string;
  ts: number;
};

export type ExtraSupportMessage = {
  id: string;
  fanId: string;
  kind: "system";
  subtype: "extra_support";
  amount: number;
  currency: string;
  fanName?: string;
  ts: number;
  createdAt: string;
  meta: {
    eventId: string;
    originClientId?: string;
  };
};

export type ExtraSupportMessageInput = {
  fanId: string;
  amount: number;
  currency?: string;
  fanName?: string | null;
  createdAt?: string;
  ts?: number;
  id?: string;
  eventId?: string;
  sourceEventId?: string;
  originClientId?: string;
};

export type ExtrasSummaryBucket = { count: number; amount: number };
export type ExtrasSummaryBuckets = {
  today: ExtrasSummaryBucket;
  last7Days: ExtrasSummaryBucket;
  total: ExtrasSummaryBucket;
};

export const EMPTY_EXTRAS_RAW = "[]";
const EMPTY_EXTRAS: ExtraEvent[] = Object.freeze([]);
const EMPTY_SYSTEM_RAW = "[]";

const extrasCacheRaw = new Map<string, string>();
const extrasCacheParsed = new Map<string, ExtraEvent[]>();
const extrasSystemCacheRaw = new Map<string, string>();
const extrasSystemCacheParsed = new Map<string, ExtraSupportMessage[]>();
let extrasChannel: BroadcastChannel | null = null;
let extrasClientId: string | null = null;
const EMPTY_ALL_EVENTS: ExtraEventWithMeta[] = Object.freeze([]);
const EMPTY_SYSTEM_MESSAGES: ExtraSupportMessage[] = Object.freeze([]);
let cachedAllRaw: string = EMPTY_ALL_RAW;
let cachedAllEvents: ExtraEventWithMeta[] = EMPTY_ALL_EVENTS;
const EMPTY_UNREAD_MAP: Record<string, number> = Object.freeze({});
let unreadCacheRaw: string = EMPTY_UNREAD_RAW;
let unreadCacheParsed: Record<string, number> = EMPTY_UNREAD_MAP;

export function buildExtrasStorageKey(fanId: string): string {
  return `${EXTRAS_STORAGE_PREFIX}${fanId}`;
}

export function buildExtrasSystemStorageKey(fanId: string): string {
  return `${EXTRAS_SYSTEM_STORAGE_PREFIX}${fanId}`;
}

export function buildExtraSupportMessageId(fanId: string, eventId: string | null | undefined, ts: number): string {
  const cleanFanId = (fanId || "").toString().trim().replace(/[^a-zA-Z0-9_-]+/g, "");
  const cleanEventId = (eventId || "").toString().trim().replace(/[^a-zA-Z0-9_-]+/g, "");
  const safeTs = Number.isFinite(ts) ? Math.floor(ts) : Date.now();
  const base = `extra-support-${cleanFanId || "fan"}${cleanEventId ? `-${cleanEventId}` : ""}`;
  return `${base}-${safeTs}`;
}

export function createExtraEventId(): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getExtrasClientId(): string {
  if (typeof window === "undefined") return "server";
  if (extrasClientId) return extrasClientId;
  try {
    const stored = window.sessionStorage.getItem(EXTRAS_CLIENT_ID_KEY);
    if (stored) {
      extrasClientId = stored;
      return stored;
    }
    const created = createExtraEventId();
    window.sessionStorage.setItem(EXTRAS_CLIENT_ID_KEY, created);
    extrasClientId = created;
    return created;
  } catch (_err) {
    const fallback = createExtraEventId();
    extrasClientId = fallback;
    return fallback;
  }
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
  const kind = data.kind === "TIP" || data.kind === "GIFT" || data.kind === "EXTRA" ? data.kind : null;
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

function normalizeExtraEventForWrite(event: ExtraEvent): ExtraEvent {
  const nextId = typeof event.id === "string" && event.id.trim().length > 0 ? event.id : createExtraEventId();
  const nextCreatedAt =
    typeof event.createdAt === "string" && event.createdAt.trim().length > 0
      ? event.createdAt
      : new Date().toISOString();
  return {
    ...event,
    id: nextId,
    createdAt: nextCreatedAt,
  };
}

function normalizeExtraSupportMessage(entry: unknown, fallbackFanId?: string): ExtraSupportMessage | null {
  if (!entry || typeof entry !== "object") return null;
  const data = entry as {
    id?: unknown;
    fanId?: unknown;
    kind?: unknown;
    subtype?: unknown;
    amount?: unknown;
    currency?: unknown;
    fanName?: unknown;
    ts?: unknown;
    createdAt?: unknown;
    eventId?: unknown;
    originClientId?: unknown;
    meta?: { eventId?: unknown; originClientId?: unknown } | null;
  };
  const id = typeof data.id === "string" ? data.id.trim() : "";
  const fanId =
    typeof data.fanId === "string" && data.fanId.trim().length > 0
      ? data.fanId.trim()
      : typeof fallbackFanId === "string"
      ? fallbackFanId.trim()
      : "";
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  if (!id || !fanId || !Number.isFinite(amount)) return null;
  const currencyRaw = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : "EUR";
  const fanName = typeof data.fanName === "string" ? data.fanName.trim() : "";
  const createdAt = typeof data.createdAt === "string" ? data.createdAt : "";
  const parsedCreatedAt = createdAt ? toExtrasTimestamp(createdAt) : 0;
  const tsRaw = typeof data.ts === "number" ? data.ts : Number(data.ts);
  const ts = Number.isFinite(tsRaw) && tsRaw > 0 ? Math.floor(tsRaw) : parsedCreatedAt;
  const resolvedCreatedAt = createdAt && parsedCreatedAt > 0 ? createdAt : ts > 0 ? new Date(ts).toISOString() : "";
  const metaEventId =
    typeof data.meta?.eventId === "string"
      ? data.meta.eventId.trim()
      : typeof data.eventId === "string"
      ? data.eventId.trim()
      : id;
  const originClientId =
    typeof data.meta?.originClientId === "string"
      ? data.meta.originClientId.trim()
      : typeof data.originClientId === "string"
      ? data.originClientId.trim()
      : undefined;
  return {
    id,
    fanId,
    kind: "system",
    subtype: "extra_support",
    amount,
    currency: currencyRaw || "EUR",
    fanName: fanName || undefined,
    ts,
    createdAt: resolvedCreatedAt,
    meta: {
      eventId: metaEventId || id,
      originClientId: originClientId || undefined,
    },
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

function parseExtraSupportRaw(raw: string, fanId: string): ExtraSupportMessage[] {
  if (!raw || raw === EMPTY_SYSTEM_RAW) return EMPTY_SYSTEM_MESSAGES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_SYSTEM_MESSAGES;
    const normalized = parsed
      .map((entry) => normalizeExtraSupportMessage(entry, fanId))
      .filter(Boolean) as ExtraSupportMessage[];
    if (normalized.length === 0) return EMPTY_SYSTEM_MESSAGES;
    normalized.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
    return normalized;
  } catch (_err) {
    return EMPTY_SYSTEM_MESSAGES;
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

function readExtraSupportRawByKey(storageKey: string): string {
  if (typeof window === "undefined") return EMPTY_SYSTEM_RAW;
  let raw = EMPTY_SYSTEM_RAW;
  try {
    raw = window.localStorage.getItem(storageKey) ?? EMPTY_SYSTEM_RAW;
  } catch (_err) {
    raw = EMPTY_SYSTEM_RAW;
  }
  const cachedRaw = extrasSystemCacheRaw.get(storageKey);
  if (cachedRaw === raw) return cachedRaw;
  extrasSystemCacheRaw.set(storageKey, raw);
  const fanId = storageKey.startsWith(EXTRAS_SYSTEM_STORAGE_PREFIX)
    ? storageKey.slice(EXTRAS_SYSTEM_STORAGE_PREFIX.length)
    : "";
  extrasSystemCacheParsed.set(storageKey, parseExtraSupportRaw(raw, fanId));
  return raw;
}

function readExtraSupportMessagesByKey(storageKey: string): ExtraSupportMessage[] {
  readExtraSupportRawByKey(storageKey);
  return extrasSystemCacheParsed.get(storageKey) ?? EMPTY_SYSTEM_MESSAGES;
}

function listExtrasStorageKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(EXTRAS_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  } catch (_err) {
    return [];
  }
}

function toExtrasTimestamp(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function buildExtraEventKey(event: ExtraEventWithMeta): string {
  const ts = Number.isFinite(event.ts) ? event.ts : toExtrasTimestamp(event.createdAt);
  return `${event.fanId}:${event.id}:${ts}`;
}

function buildAllExtrasRaw(): string {
  if (typeof window === "undefined") return EMPTY_ALL_RAW;
  const keys = listExtrasStorageKeys();
  if (keys.length === 0) return EMPTY_ALL_RAW;
  const parts = keys.map((key) => {
    let raw = "";
    try {
      raw = window.localStorage.getItem(key) ?? "";
    } catch (_err) {
      raw = "";
    }
    return `${key}=${raw}`;
  });
  parts.sort();
  return parts.join("\n");
}

function parseUnreadExtrasRaw(raw: string): Record<string, number> {
  if (!raw || raw === EMPTY_UNREAD_RAW) return EMPTY_UNREAD_MAP;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_UNREAD_MAP;
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) return EMPTY_UNREAD_MAP;
    const next: Record<string, number> = {};
    entries.forEach(([fanId, value]) => {
      const count = typeof value === "number" ? value : Number(value);
      if (!fanId || !Number.isFinite(count) || count <= 0) return;
      next[fanId] = Math.floor(count);
    });
    return Object.keys(next).length > 0 ? next : EMPTY_UNREAD_MAP;
  } catch (_err) {
    return EMPTY_UNREAD_MAP;
  }
}

function readUnreadExtrasRaw(): string {
  if (typeof window === "undefined") return EMPTY_UNREAD_RAW;
  let raw = EMPTY_UNREAD_RAW;
  try {
    raw = window.localStorage.getItem(EXTRAS_UNREAD_KEY) ?? EMPTY_UNREAD_RAW;
  } catch (_err) {
    raw = EMPTY_UNREAD_RAW;
  }
  if (raw === unreadCacheRaw) return unreadCacheRaw;
  unreadCacheRaw = raw;
  unreadCacheParsed = parseUnreadExtrasRaw(raw);
  return unreadCacheRaw;
}

function readUnreadExtrasMap(): Record<string, number> {
  readUnreadExtrasRaw();
  return unreadCacheParsed;
}

function stringifyUnreadExtrasMap(map: Record<string, number>): string {
  const keys = Object.keys(map).filter((key) => map[key] > 0).sort();
  if (keys.length === 0) return EMPTY_UNREAD_RAW;
  const ordered: Record<string, number> = {};
  keys.forEach((key) => {
    ordered[key] = map[key];
  });
  return JSON.stringify(ordered);
}

function writeUnreadExtrasMap(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  const raw = stringifyUnreadExtrasMap(map);
  if (raw === unreadCacheRaw) return;
  try {
    window.localStorage.setItem(EXTRAS_UNREAD_KEY, raw);
  } catch (_err) {
    return;
  }
  unreadCacheRaw = raw;
  unreadCacheParsed = parseUnreadExtrasRaw(raw);
  window.dispatchEvent(new CustomEvent(EXTRAS_UNREAD_EVENT));
}

export function readExtraSupportMessages(fanId: string): ExtraSupportMessage[] {
  if (!fanId) return EMPTY_SYSTEM_MESSAGES;
  return readExtraSupportMessagesByKey(buildExtrasSystemStorageKey(fanId));
}

export function writeExtraSupportMessages(fanId: string, messages: ExtraSupportMessage[], originClientId?: string) {
  if (!fanId || typeof window === "undefined") return;
  const storageKey = buildExtrasSystemStorageKey(fanId);
  const normalized = (messages || [])
    .map((msg) => normalizeExtraSupportMessage(msg, fanId))
    .filter(Boolean) as ExtraSupportMessage[];
  if (normalized.length > 1) {
    const byEventId = new Map<string, ExtraSupportMessage>();
    normalized.forEach((msg) => {
      byEventId.set(msg.meta?.eventId ?? msg.id, msg);
    });
    const merged = Array.from(byEventId.values());
    normalized.splice(0, normalized.length, ...merged);
  }
  normalized.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  const raw = normalized.length > 0 ? JSON.stringify(normalized) : EMPTY_SYSTEM_RAW;
  try {
    window.localStorage.setItem(storageKey, raw);
  } catch (_err) {
    return;
  }
  extrasSystemCacheRaw.set(storageKey, raw);
  extrasSystemCacheParsed.set(storageKey, normalized.length > 0 ? normalized : EMPTY_SYSTEM_MESSAGES);
  window.dispatchEvent(
    new CustomEvent(EXTRAS_SYSTEM_EVENT, {
      detail: { fanId, storageKey, originClientId: originClientId || undefined },
    })
  );
  getExtrasChannel()?.postMessage({ type: "extras-system", fanId, storageKey, originClientId: originClientId || undefined });
}

export function appendExtraSupportMessage(input: ExtraSupportMessageInput): ExtraSupportMessage | null {
  const fanId = typeof input?.fanId === "string" ? input.fanId.trim() : "";
  if (!fanId) return null;
  const amount = typeof input.amount === "number" ? input.amount : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const ts =
    typeof input.ts === "number" && Number.isFinite(input.ts) ? Math.floor(input.ts) : toExtrasTimestamp(input.createdAt ?? "");
  const resolvedTs = ts > 0 ? ts : Date.now();
  const createdAt =
    typeof input.createdAt === "string" && toExtrasTimestamp(input.createdAt) > 0
      ? input.createdAt
      : new Date(resolvedTs).toISOString();
  const eventIdRaw =
    typeof input.eventId === "string" && input.eventId.trim().length > 0
      ? input.eventId.trim()
      : typeof input.sourceEventId === "string" && input.sourceEventId.trim().length > 0
      ? input.sourceEventId.trim()
      : createExtraEventId();
  const id =
    typeof input.id === "string" && input.id.trim().length > 0
      ? input.id.trim()
      : buildExtraSupportMessageId(fanId, eventIdRaw, resolvedTs);
  const currency =
    typeof input.currency === "string" && input.currency.trim().length > 0
      ? input.currency.trim().toUpperCase()
      : "EUR";
  const fanName = typeof input.fanName === "string" ? input.fanName.trim() : "";
  const originClientId =
    typeof input.originClientId === "string" && input.originClientId.trim().length > 0
      ? input.originClientId.trim()
      : getExtrasClientId();
  const message: ExtraSupportMessage = {
    id,
    fanId,
    kind: "system",
    subtype: "extra_support",
    amount,
    currency,
    fanName: fanName || undefined,
    ts: resolvedTs,
    createdAt,
    meta: {
      eventId: eventIdRaw,
      originClientId: originClientId || undefined,
    },
  };
  const current = readExtraSupportMessages(fanId);
  if (current.some((item) => item.id === id || item.meta?.eventId === eventIdRaw)) return null;
  writeExtraSupportMessages(fanId, [...current, message], originClientId);
  return message;
}

function subscribeToExtraSupportMessages(storageKey: string, fanId: string, callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const clientId = getExtrasClientId();
  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent)?.detail as
      | { fanId?: string; storageKey?: string; originClientId?: string }
      | undefined;
    if (detail?.storageKey && detail.storageKey !== storageKey) return;
    if (detail?.fanId && fanId && detail.fanId !== fanId) return;
    callback();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== storageKey) return;
    if (event.newValue) {
      const parsed = parseExtraSupportRaw(event.newValue, fanId);
      const last = parsed[parsed.length - 1];
      if (last?.meta?.originClientId && last.meta.originClientId === clientId) return;
    }
    callback();
  };
  const handleBroadcast = (event: MessageEvent) => {
    const data = event.data as { type?: string; fanId?: string; storageKey?: string; originClientId?: string } | null;
    if (!data || data.type !== "extras-system") return;
    if (data.originClientId && data.originClientId === clientId) return;
    if (data.storageKey && data.storageKey !== storageKey) return;
    if (data.fanId && fanId && data.fanId !== fanId) return;
    callback();
  };

  window.addEventListener(EXTRAS_SYSTEM_EVENT, handleCustom as EventListener);
  window.addEventListener("storage", handleStorage);
  const channel = getExtrasChannel();
  channel?.addEventListener("message", handleBroadcast as EventListener);

  return () => {
    window.removeEventListener(EXTRAS_SYSTEM_EVENT, handleCustom as EventListener);
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleBroadcast as EventListener);
  };
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
  const originClientId = getExtrasClientId();
  window.dispatchEvent(new CustomEvent(EXTRAS_EVENT, { detail: { fanId, storageKey, originClientId } }));
  getExtrasChannel()?.postMessage({ type: "extras", fanId, storageKey, originClientId });
}

export function appendExtraEvent(fanId: string, event: ExtraEvent): ExtraEvent[] {
  if (!fanId) return [];
  const current = readExtraEvents(fanId);
  const normalized = normalizeExtraEventForWrite(event);
  const next = [...current, normalized];
  writeExtraEvents(fanId, next);
  return next;
}

function subscribeToExtras(storageKey: string, fanId: string, callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const clientId = getExtrasClientId();
  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent)?.detail as
      | { fanId?: string; storageKey?: string; originClientId?: string }
      | undefined;
    if (detail?.storageKey && detail.storageKey !== storageKey) return;
    if (detail?.fanId && fanId && detail.fanId !== fanId) return;
    callback();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== storageKey) return;
    callback();
  };
  const handleBroadcast = (event: MessageEvent) => {
    const data = event.data as { type?: string; fanId?: string; storageKey?: string; originClientId?: string } | null;
    if (!data || data.type !== "extras") return;
    if (data.originClientId && data.originClientId === clientId) return;
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

export function getAllExtrasEvents(): ExtraEventWithMeta[] {
  if (typeof window === "undefined") return EMPTY_ALL_EVENTS;
  const keys = listExtrasStorageKeys();
  if (keys.length === 0) {
    cachedAllRaw = EMPTY_ALL_RAW;
    cachedAllEvents = EMPTY_ALL_EVENTS;
    return cachedAllEvents;
  }
  const entries = keys.map((storageKey) => {
    let raw = "";
    try {
      raw = window.localStorage.getItem(storageKey) ?? "";
    } catch (_err) {
      raw = "";
    }
    return { storageKey, raw };
  });
  const rawTokens = entries.map(({ storageKey, raw }) => `${storageKey}=${raw}`).sort();
  const nextRaw = rawTokens.join("\n");
  if (nextRaw === cachedAllRaw) {
    return cachedAllEvents;
  }
  const all: ExtraEventWithMeta[] = [];
  entries.forEach(({ storageKey, raw }) => {
    const fanId = storageKey.slice(EXTRAS_STORAGE_PREFIX.length);
    if (!fanId) return;
    const events = parseExtrasRaw(raw);
    events.forEach((event) => {
      all.push({ ...event, fanId, ts: toExtrasTimestamp(event.createdAt) });
    });
  });
  all.sort((a, b) => b.ts - a.ts);
  cachedAllRaw = nextRaw;
  cachedAllEvents = all.length > 0 ? all : EMPTY_ALL_EVENTS;
  return cachedAllEvents;
}

export function subscribeAllExtras(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  let lastRaw = buildAllExtrasRaw();
  const clientId = getExtrasClientId();
  const notifyIfChanged = () => {
    const nextRaw = buildAllExtrasRaw();
    if (nextRaw === lastRaw) return;
    lastRaw = nextRaw;
    callback();
  };
  const handleCustom = () => {
    notifyIfChanged();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && !event.key.startsWith(EXTRAS_STORAGE_PREFIX)) return;
    notifyIfChanged();
  };
  const handleBroadcast = (event: MessageEvent) => {
    const data = event.data as { type?: string; originClientId?: string } | null;
    if (!data || data.type !== "extras") return;
    if (data.originClientId && data.originClientId === clientId) return;
    notifyIfChanged();
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

export function subscribeAllExtrasEvents(callback: (event: ExtraEventWithMeta) => void) {
  if (typeof window === "undefined") return () => {};
  const seen = new Set<string>();
  getAllExtrasEvents().forEach((event) => {
    seen.add(buildExtraEventKey(event));
  });
  return subscribeAllExtras(() => {
    const events = getAllExtrasEvents();
    events.forEach((event) => {
      const key = buildExtraEventKey(event);
      if (seen.has(key)) return;
      seen.add(key);
      callback(event);
    });
  });
}

export function markUnreadExtra(fanId: string) {
  if (!fanId) return;
  const current = readUnreadExtrasMap();
  const next: Record<string, number> = { ...current };
  next[fanId] = (current[fanId] ?? 0) + 1;
  writeUnreadExtrasMap(next);
}

export function clearUnreadExtra(fanId: string) {
  if (!fanId) return;
  const current = readUnreadExtrasMap();
  if (!current[fanId]) return;
  const next: Record<string, number> = { ...current };
  delete next[fanId];
  writeUnreadExtrasMap(next);
}

export function useUnreadExtrasMap(): Record<string, number> {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const handleCustom = () => callback();
      const handleStorage = (event: StorageEvent) => {
        if (event.key && event.key !== EXTRAS_UNREAD_KEY) return;
        callback();
      };
      window.addEventListener(EXTRAS_UNREAD_EVENT, handleCustom as EventListener);
      window.addEventListener("storage", handleStorage);
      return () => {
        window.removeEventListener(EXTRAS_UNREAD_EVENT, handleCustom as EventListener);
        window.removeEventListener("storage", handleStorage);
      };
    },
    () => readUnreadExtrasMap(),
    () => EMPTY_UNREAD_MAP
  );
}

export function summarizeExtras(events: ExtraEventWithMeta[], now: Date | number = new Date()): ExtrasSummaryBuckets {
  const base: ExtrasSummaryBuckets = {
    today: { count: 0, amount: 0 },
    last7Days: { count: 0, amount: 0 },
    total: { count: 0, amount: 0 },
  };
  if (!events || events.length === 0) return base;
  const resolvedNow = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(resolvedNow.getTime())) return base;
  const startOfToday = new Date(resolvedNow);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayTs = startOfToday.getTime();
  const start7Days = new Date(startOfToday);
  start7Days.setDate(start7Days.getDate() - 6);
  const start7DaysTs = start7Days.getTime();

  events.forEach((event) => {
    const amount = Number.isFinite(event.amount) ? event.amount : 0;
    base.total.count += 1;
    base.total.amount += amount;
    if (event.ts >= start7DaysTs) {
      base.last7Days.count += 1;
      base.last7Days.amount += amount;
    }
    if (event.ts >= startOfTodayTs) {
      base.today.count += 1;
      base.today.amount += amount;
    }
  });

  return base;
}

export function useLocalExtras(fanId: string): string {
  const storageKey = buildExtrasStorageKey(fanId || "");
  return useSyncExternalStore(
    (callback) => (fanId ? subscribeToExtras(storageKey, fanId, callback) : () => {}),
    () => (fanId ? readExtrasRawByKey(storageKey) : EMPTY_EXTRAS_RAW),
    () => EMPTY_EXTRAS_RAW
  );
}

export function useExtraSupportMessages(fanId: string): ExtraSupportMessage[] {
  const storageKey = buildExtrasSystemStorageKey(fanId || "");
  return useSyncExternalStore(
    (callback) => (fanId ? subscribeToExtraSupportMessages(storageKey, fanId, callback) : () => {}),
    () => (fanId ? readExtraSupportMessagesByKey(storageKey) : EMPTY_SYSTEM_MESSAGES),
    () => EMPTY_SYSTEM_MESSAGES
  );
}

export function useAllExtrasEvents(): ExtraEventWithMeta[] {
  return useSyncExternalStore(
    subscribeAllExtras,
    () => getAllExtrasEvents(),
    () => EMPTY_ALL_EVENTS
  );
}
