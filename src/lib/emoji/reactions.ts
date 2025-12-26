const EMOJI_REACTIONS_KEY = "novsy_message_reactions";
const EMOJI_REACTIONS_EVENT = "novsy:emoji-reactions";
const DEFAULT_ACTOR = "creator";

export type MessageReaction = {
  emoji: string;
  actor: string;
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  actors: string[];
};

type ReactionStore = Record<string, MessageReaction[]>;

function sanitizeReaction(entry: unknown): MessageReaction | null {
  if (!entry || typeof entry !== "object") return null;
  const data = entry as { emoji?: unknown; actor?: unknown };
  const emoji = typeof data.emoji === "string" ? data.emoji.trim() : "";
  const actor = typeof data.actor === "string" ? data.actor.trim() : "";
  if (!emoji) return null;
  return { emoji, actor: actor || DEFAULT_ACTOR };
}

function normalizeStore(raw: unknown): ReactionStore {
  if (!raw || typeof raw !== "object") return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const next: ReactionStore = {};
  for (const [messageId, value] of entries) {
    if (!messageId) continue;
    if (typeof value === "string") {
      const emoji = value.trim();
      if (!emoji) continue;
      next[messageId] = [{ emoji, actor: DEFAULT_ACTOR }];
      continue;
    }
    if (Array.isArray(value)) {
      const reactions = value.map(sanitizeReaction).filter(Boolean) as MessageReaction[];
      if (reactions.length > 0) {
        next[messageId] = reactions;
      }
    }
  }
  return next;
}

function readReactionStore(): ReactionStore {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(EMOJI_REACTIONS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return normalizeStore(parsed);
  } catch (error) {
    return {};
  }
}

function writeReactionStore(next: ReactionStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMOJI_REACTIONS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EMOJI_REACTIONS_EVENT));
  } catch (error) {
    // Ignore storage errors.
  }
}

export function readMessageReactions(messageId: string): MessageReaction[] {
  if (!messageId) return [];
  const store = readReactionStore();
  return store[messageId] ?? [];
}

export function getActorReaction(reactions: MessageReaction[], actor: string): string | null {
  if (!actor) return null;
  const match = reactions.find((reaction) => reaction.actor === actor);
  return match?.emoji ?? null;
}

export function getReactionSummary(reactions: MessageReaction[]): ReactionSummary[] {
  const map = new Map<string, Set<string>>();
  reactions.forEach((reaction) => {
    const emoji = reaction.emoji.trim();
    const actor = reaction.actor.trim() || DEFAULT_ACTOR;
    if (!emoji) return;
    const set = map.get(emoji) ?? new Set<string>();
    set.add(actor);
    map.set(emoji, set);
  });
  return Array.from(map.entries()).map(([emoji, actors]) => ({
    emoji,
    count: actors.size,
    actors: Array.from(actors),
  }));
}

export function toggleMessageReaction(messageId: string, emoji: string, actor: string): MessageReaction[] {
  if (!messageId) return [];
  const normalizedEmoji = (emoji || "").trim();
  const normalizedActor = (actor || DEFAULT_ACTOR).trim() || DEFAULT_ACTOR;
  if (!normalizedEmoji) return readMessageReactions(messageId);

  const store = readReactionStore();
  const current = store[messageId] ?? [];
  const existingForActor = current.find((reaction) => reaction.actor === normalizedActor);
  let next: MessageReaction[];

  if (existingForActor && existingForActor.emoji === normalizedEmoji) {
    next = current.filter((reaction) => reaction.actor !== normalizedActor);
  } else {
    next = current.filter((reaction) => reaction.actor !== normalizedActor);
    next.push({ emoji: normalizedEmoji, actor: normalizedActor });
  }

  if (next.length > 0) {
    store[messageId] = next;
  } else {
    delete store[messageId];
  }
  writeReactionStore(store);
  return next;
}

export function subscribeMessageReactions(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(EMOJI_REACTIONS_EVENT, handler);
  return () => {
    window.removeEventListener(EMOJI_REACTIONS_EVENT, handler);
  };
}
