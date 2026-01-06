export type PendingManagerTranscript = {
  fanId: string;
  transcript: string;
  createdAt?: string;
  messageId?: string;
};

function storageKey(fanId: string) {
  return `novsy:pendingManagerTranscript:${fanId}`;
}

export function setPendingManagerTranscript(payload: PendingManagerTranscript) {
  if (typeof window === "undefined" || !payload?.fanId || !payload.transcript) return;
  try {
    const key = storageKey(payload.fanId);
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch (_err) {
    // ignore storage errors
  }
}

export function consumePendingManagerTranscript(fanId: string): PendingManagerTranscript | null {
  if (typeof window === "undefined" || !fanId) return null;
  try {
    const key = storageKey(fanId);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as PendingManagerTranscript | null;
    if (!parsed || typeof parsed.transcript !== "string") return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}
