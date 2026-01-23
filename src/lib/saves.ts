const SAVED_CLIPS_KEY = "ip_saved_clips_v1";
const LEGACY_LIKED_KEY = "ip_liked_clips_v1";
const LEGACY_FAVORITES_KEY = "ip_favorite_clips_v1";
const MIGRATION_FLAG_KEY = "ip_saved_clips_migrated_v1";

export function getSavedClips(): string[] {
  return Array.from(readSavedClips());
}

export function isSaved(clipId: string): boolean {
  const key = normalizeClipId(clipId);
  if (!key) return false;
  return readSavedClips().has(key);
}

export function toggleSavedClip(clipId: string): boolean {
  if (typeof window === "undefined") return false;
  const key = normalizeClipId(clipId);
  if (!key) return false;
  const clips = readSavedClips();
  const isNowSaved = !clips.has(key);
  if (isNowSaved) {
    clips.add(key);
  } else {
    clips.delete(key);
  }
  saveSavedClips(clips);
  return isNowSaved;
}

function readSavedClips(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const existing = readKey(SAVED_CLIPS_KEY);
  if (existing.found) {
    if (existing.corrupted) {
      saveSavedClips(existing.clips);
    }
    return existing.clips;
  }
  if (hasMigrationFlag()) return new Set();
  const legacyLiked = readKey(LEGACY_LIKED_KEY);
  const legacyFavorites = readKey(LEGACY_FAVORITES_KEY);
  if (legacyLiked.found || legacyFavorites.found) {
    const merged = new Set<string>();
    legacyLiked.clips.forEach((clip) => merged.add(clip));
    legacyFavorites.clips.forEach((clip) => merged.add(clip));
    saveSavedClips(merged);
    markMigrationFlag();
    removeLegacyKey(LEGACY_LIKED_KEY);
    removeLegacyKey(LEGACY_FAVORITES_KEY);
    return merged;
  }
  markMigrationFlag();
  return new Set();
}

type ReadKeyResult = {
  clips: Set<string>;
  found: boolean;
  corrupted: boolean;
};

function readKey(key: string): ReadKeyResult {
  if (typeof window === "undefined") {
    return { clips: new Set(), found: false, corrupted: false };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { clips: new Set(), found: false, corrupted: false };
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return { clips: new Set(), found: true, corrupted: true };
      }
      const normalized = parsed
        .filter((item) => typeof item === "string")
        .map((item) => normalizeClipId(item))
        .filter(Boolean);
      return { clips: new Set(normalized), found: true, corrupted: false };
    } catch {
      return { clips: new Set(), found: true, corrupted: true };
    }
  } catch {
    return { clips: new Set(), found: false, corrupted: false };
  }
}

function saveSavedClips(clips: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_CLIPS_KEY, JSON.stringify(Array.from(clips)));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

function hasMigrationFlag(): boolean {
  try {
    return window.localStorage.getItem(MIGRATION_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function markMigrationFlag() {
  try {
    window.localStorage.setItem(MIGRATION_FLAG_KEY, "1");
  } catch {
    // Ignore storage errors
  }
}

function removeLegacyKey(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

function normalizeClipId(id: string): string {
  return id.trim();
}
