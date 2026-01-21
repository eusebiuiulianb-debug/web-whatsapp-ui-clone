const ADULT_CONFIRM_STORAGE_KEY = "novsy_adult_confirmed_at";
const ADULT_CONFIRM_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function readAdultConfirmedAtFromStorage(now = Date.now()): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADULT_CONFIRM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
      return null;
    }
    if (now - parsed > ADULT_CONFIRM_TTL_MS) {
      window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

export function writeAdultConfirmedAtToStorage(timestamp = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADULT_CONFIRM_STORAGE_KEY, String(timestamp));
  } catch (_err) {
    // ignore storage failures
  }
}

export function clearAdultConfirmedAtStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
  } catch (_err) {
    // ignore storage failures
  }
}
