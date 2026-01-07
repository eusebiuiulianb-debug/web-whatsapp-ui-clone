type DevRequestKind = "fans" | "messages";

type DevRequestRates = {
  fans: number;
  messages: number;
};

const WINDOW_MS = 60_000;
const requestTimestamps: Record<DevRequestKind, number[]> = {
  fans: [],
  messages: [],
};
const listeners = new Set<() => void>();

function prune(list: number[], now: number) {
  let idx = 0;
  while (idx < list.length && now - list[idx] > WINDOW_MS) {
    idx += 1;
  }
  if (idx > 0) {
    list.splice(0, idx);
  }
  return list.length;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function recordDevRequest(kind: DevRequestKind) {
  if (process.env.NODE_ENV === "production") return;
  const now = Date.now();
  const list = requestTimestamps[kind];
  list.push(now);
  prune(list, now);
  notify();
}

export function getDevRequestRates(): DevRequestRates {
  const now = Date.now();
  return {
    fans: prune(requestTimestamps.fans, now),
    messages: prune(requestTimestamps.messages, now),
  };
}

export function subscribeDevRequestRates(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
