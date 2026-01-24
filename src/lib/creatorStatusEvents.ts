export const CREATOR_STATUS_UPDATED_EVENT = "ip:creator-status-updated";
export const CREATOR_STATUS_UPDATED_KEY = "ip_creator_status_updated_at";

export function notifyCreatorStatusUpdated() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(CREATOR_STATUS_UPDATED_EVENT));
  } catch (_err) {
  }
  try {
    window.localStorage.setItem(CREATOR_STATUS_UPDATED_KEY, String(Date.now()));
  } catch (_err) {
  }
}

export function subscribeCreatorStatusUpdates(onUpdate: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleEvent = () => onUpdate();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CREATOR_STATUS_UPDATED_KEY) onUpdate();
  };
  window.addEventListener(CREATOR_STATUS_UPDATED_EVENT, handleEvent);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CREATOR_STATUS_UPDATED_EVENT, handleEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
