export type PendingAction = {
  type: "SAVE_POPCLIP";
  popclipId: string;
};

const STORAGE_KEY = "novsy:pendingAction";

export function setPendingAction(action: PendingAction) {
  if (typeof window === "undefined") return;
  if (!action || action.type !== "SAVE_POPCLIP" || !action.popclipId) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
  } catch (_err) {
    // ignore storage errors
  }
}

export function readPendingAction(): PendingAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAction | null;
    if (!parsed || parsed.type !== "SAVE_POPCLIP" || typeof parsed.popclipId !== "string") {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

export function clearPendingAction() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (_err) {
    // ignore storage errors
  }
}

export function consumePendingAction(): PendingAction | null {
  const pending = readPendingAction();
  if (pending) {
    clearPendingAction();
  }
  return pending;
}
