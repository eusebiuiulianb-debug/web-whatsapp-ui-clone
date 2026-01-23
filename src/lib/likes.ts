const LIKED_CLIPS_KEY = "ip_liked_clips_v1";
const LEGACY_FAVORITES_KEY = "ip_favorite_clips_v1";

export function getLikedClips(): string[] {
  return Array.from(readLikedClips());
}

export function isLiked(clipId: string): boolean {
  const key = normalizeClipId(clipId);
  if (!key) return false;
  return readLikedClips().has(key);
}

export function toggleLikedClip(clipId: string): boolean {
  if (typeof window === "undefined") return false;
  const key = normalizeClipId(clipId);
  if (!key) return false;
  const clips = readLikedClips();
  const isNowLiked = !clips.has(key);
  if (isNowLiked) {
    clips.add(key);
  } else {
    clips.delete(key);
  }
  saveLikedClips(clips);
  return isNowLiked;
}

function readLikedClips(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const existing = readKey(LIKED_CLIPS_KEY);
  if (existing) return existing;
  const legacy = readKey(LEGACY_FAVORITES_KEY);
  if (legacy) {
    saveLikedClips(legacy);
    try {
      window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
    } catch {
      // Ignore storage errors
    }
    return legacy;
  }
  return new Set();
}

function readKey(key: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed
      .filter((item) => typeof item === "string")
      .map((item) => normalizeClipId(item))
      .filter(Boolean);
    return new Set(normalized);
  } catch {
    return null;
  }
}

function saveLikedClips(clips: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIKED_CLIPS_KEY, JSON.stringify(Array.from(clips)));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

function normalizeClipId(id: string): string {
  return id.trim();
}
