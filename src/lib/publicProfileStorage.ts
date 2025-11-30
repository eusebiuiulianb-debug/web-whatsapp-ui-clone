import type { PublicProfileCopy } from "../types/publicProfile";

const STORAGE_PREFIX = "novsy.publicProfile";

function getStorageKey(creatorId: string) {
  const id = creatorId || "default";
  return `${STORAGE_PREFIX}.${id}`;
}

export function getPublicProfileOverrides(creatorId: string): PublicProfileCopy | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(creatorId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed as PublicProfileCopy;
  } catch (_err) {
    return null;
  }
}

export function savePublicProfileOverrides(creatorId: string, data: PublicProfileCopy) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(creatorId), JSON.stringify(data));
  } catch (_err) {
    // ignore
  }
}

export function clearPublicProfileOverrides(creatorId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getStorageKey(creatorId));
  } catch (_err) {
    // ignore
  }
}
