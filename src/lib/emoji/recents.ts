export const FAVORITE_EMOJIS = ["❤️", "😘", "😉", "🔥", "😈", "🦄", "🍍🙃", "😇"];
const EMOJI_RECENTS_KEY = "novsy_emoji_recents";
const EMOJI_FAVORITES_KEY = "novsy_emoji_favorites";
const EMOJI_FAVORITES_EVENT = "novsy:emoji-favorites";
const MAX_RECENTS = 24;
export const MAX_FAVORITES = 12;

export function readEmojiFavorites(): string[] {
  if (typeof window === "undefined") return FAVORITE_EMOJIS;
  try {
    const stored = window.localStorage.getItem(EMOJI_FAVORITES_KEY);
    if (!stored) return FAVORITE_EMOJIS;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return FAVORITE_EMOJIS;
    const sanitized = parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
    return sanitized.slice(0, MAX_FAVORITES);
  } catch (error) {
    return FAVORITE_EMOJIS;
  }
}

export function writeEmojiFavorites(next: string[]): string[] {
  const unique = Array.from(new Set(next.map((item) => item.trim()).filter(Boolean))).slice(0, MAX_FAVORITES);
  if (typeof window === "undefined") return unique;
  try {
    window.localStorage.setItem(EMOJI_FAVORITES_KEY, JSON.stringify(unique));
    window.dispatchEvent(new Event(EMOJI_FAVORITES_EVENT));
  } catch (error) {
    // Ignore storage errors (private mode or quota).
  }
  return unique;
}

export function addEmojiFavorite(emoji: string, current?: string[]): string[] {
  const nextEmoji = (emoji || "").trim();
  if (!nextEmoji) return Array.isArray(current) ? current : readEmojiFavorites();
  const base = Array.isArray(current) ? current : readEmojiFavorites();
  return writeEmojiFavorites([nextEmoji, ...base.filter((item) => item !== nextEmoji)]);
}

export function removeEmojiFavorite(emoji: string, current?: string[]): string[] {
  const target = (emoji || "").trim();
  const base = Array.isArray(current) ? current : readEmojiFavorites();
  const next = base.filter((item) => item !== target);
  return writeEmojiFavorites(next);
}

export function subscribeEmojiFavorites(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(EMOJI_FAVORITES_EVENT, handler);
  return () => {
    window.removeEventListener(EMOJI_FAVORITES_EVENT, handler);
  };
}

export function readEmojiRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(EMOJI_RECENTS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
  } catch (error) {
    return [];
  }
}

export function recordEmojiRecent(emoji: string, current?: string[]): string[] {
  if (typeof window === "undefined") return current ?? [];
  const nextEmoji = (emoji || "").trim();
  const base = Array.isArray(current) ? current : readEmojiRecents();
  if (!nextEmoji) return base;
  const next = [nextEmoji, ...base.filter((item) => item !== nextEmoji)].slice(0, MAX_RECENTS);
  try {
    window.localStorage.setItem(EMOJI_RECENTS_KEY, JSON.stringify(next));
  } catch (error) {
    // Ignore storage errors (private mode or quota).
  }
  return next;
}
