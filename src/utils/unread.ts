export type UnreadMap = Record<string, string>;

const STORAGE_KEY = "novsy.unread.v1";

export function loadUnreadMap(): UnreadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as UnreadMap) : {};
  } catch {
    return {};
  }
}

export function saveUnreadMap(map: UnreadMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function updateLastReadForFan(map: UnreadMap, fanId: string, date: Date): UnreadMap {
  return {
    ...map,
    [fanId]: date.toISOString(),
  };
}

export function getLastReadForFan(map: UnreadMap, fanId: string): Date | null {
  const iso = map[fanId];
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
