type CreatorRealtimePayload = {
  id: string;
  originId: string;
  ts: number;
  eventName: string;
  detail: any;
};

const CHANNEL_NAME = "novsy_creator";
const STORAGE_PREFIX = "novsy:creator:event:";
const MAX_PROCESSED = 200;
const PROCESS_TTL_MS = 10 * 60 * 1000;

let initialized = false;
let channel: BroadcastChannel | null = null;
const processedIds = new Map<string, number>();
const processedQueue: string[] = [];

const originId = (() => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
})();

function pruneProcessed(now: number) {
  while (processedQueue.length > MAX_PROCESSED) {
    const old = processedQueue.shift();
    if (old) processedIds.delete(old);
  }
  const expired: string[] = [];
  processedIds.forEach((ts, id) => {
    if (now - ts > PROCESS_TTL_MS) {
      expired.push(id);
    }
  });
  expired.forEach((id) => processedIds.delete(id));
}

function markProcessed(id: string) {
  const now = Date.now();
  processedIds.set(id, now);
  processedQueue.push(id);
  pruneProcessed(now);
}

function shouldProcess(payload: CreatorRealtimePayload): boolean {
  if (!payload?.id || !payload?.eventName) return false;
  if (payload.originId === originId) return false;
  if (processedIds.has(payload.id)) return false;
  return true;
}

function dispatchLocal(eventName: string, detail: any) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function handleIncoming(raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const payload = raw as CreatorRealtimePayload;
  if (!shouldProcess(payload)) return;
  markProcessed(payload.id);
  dispatchLocal(payload.eventName, payload.detail);
}

export function initCreatorRealtimeBus() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => handleIncoming(event.data));
  }

  window.addEventListener("storage", (event) => {
    if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return;
    if (!event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue);
      handleIncoming(payload);
    } catch (_err) {
      // ignore parse errors
    }
  });
}

export function emitCreatorEvent(eventName: string, detail: any) {
  if (typeof window === "undefined") return;
  initCreatorRealtimeBus();
  const payload: CreatorRealtimePayload = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    originId,
    ts: Date.now(),
    eventName,
    detail,
  };
  markProcessed(payload.id);
  dispatchLocal(eventName, detail);

  if (channel) {
    try {
      channel.postMessage(payload);
      return;
    } catch (_err) {
      // fallback below
    }
  }

  try {
    const key = `${STORAGE_PREFIX}${payload.id}`;
    localStorage.setItem(key, JSON.stringify(payload));
    localStorage.removeItem(key);
  } catch (_err) {
    // ignore storage failures
  }
}
