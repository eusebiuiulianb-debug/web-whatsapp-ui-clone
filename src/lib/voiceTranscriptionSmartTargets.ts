export type SmartTranscriptionStore = {
  updatedAt: string;
  fanIds: string[];
};

const STORAGE_KEY = "novsy:voiceTranscriptionSmartTargets";

function readStore(): SmartTranscriptionStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SmartTranscriptionStore | null;
    if (!parsed || !Array.isArray(parsed.fanIds)) return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

function writeStore(store: SmartTranscriptionStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_err) {
    // ignore storage errors
  }
}

export function setSmartTranscriptionTargets(fanIds: string[]) {
  if (typeof window === "undefined") return;
  const normalized = Array.isArray(fanIds)
    ? fanIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0)
    : [];
  const unique: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const id = normalized[i];
    if (seen[id]) continue;
    seen[id] = true;
    unique.push(id);
  }
  writeStore({ updatedAt: new Date().toISOString(), fanIds: unique });
}

export function isSmartTranscriptionTarget(fanId: string | null | undefined): boolean {
  if (!fanId) return false;
  const store = readStore();
  if (!store) return false;
  return store.fanIds.includes(fanId);
}

export function getSmartTranscriptionTargets(): string[] {
  const store = readStore();
  if (!store) return [];
  return store.fanIds;
}
