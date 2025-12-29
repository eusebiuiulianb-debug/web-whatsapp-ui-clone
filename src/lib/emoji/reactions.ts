import { useSyncExternalStore } from "react";

const REACTIONS_STORAGE_PREFIX = "novsy:reactions:";
const REACTIONS_EVENT = "novsy:reactions";
const REACTIONS_CHANNEL = "novsy";
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

export type ReactionStore = Record<string, MessageReaction[]>;

export const EMPTY_REACTIONS_RAW = "{}";
const EMPTY_REACTIONS: ReactionStore = Object.freeze({});

const reactionsCacheRaw = new Map<string, string>();
const reactionsCacheParsed = new Map<string, ReactionStore>();
let reactionsChannel: BroadcastChannel | null = null;

export function buildReactionsStorageKey(fanId: string): string {
  return `${REACTIONS_STORAGE_PREFIX}${fanId}`;
}

function getReactionsChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (reactionsChannel) return reactionsChannel;
  try {
    reactionsChannel = new BroadcastChannel(REACTIONS_CHANNEL);
  } catch (_err) {
    reactionsChannel = null;
  }
  return reactionsChannel;
}

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

export function parseReactionsRaw(raw: string): ReactionStore {
  if (!raw || raw === EMPTY_REACTIONS_RAW) return EMPTY_REACTIONS;
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeStore(parsed);
    return Object.keys(normalized).length > 0 ? normalized : EMPTY_REACTIONS;
  } catch (_err) {
    return EMPTY_REACTIONS;
  }
}

function readReactionsRawByKey(storageKey: string): string {
  if (typeof window === "undefined") return EMPTY_REACTIONS_RAW;
  let raw = EMPTY_REACTIONS_RAW;
  try {
    raw = window.localStorage.getItem(storageKey) ?? EMPTY_REACTIONS_RAW;
  } catch (_err) {
    raw = EMPTY_REACTIONS_RAW;
  }
  const cachedRaw = reactionsCacheRaw.get(storageKey);
  if (cachedRaw === raw) return cachedRaw;
  reactionsCacheRaw.set(storageKey, raw);
  reactionsCacheParsed.set(storageKey, parseReactionsRaw(raw));
  return raw;
}

function readReactionStoreByKey(storageKey: string): ReactionStore {
  readReactionsRawByKey(storageKey);
  return reactionsCacheParsed.get(storageKey) ?? EMPTY_REACTIONS;
}

export function readReactionsRaw(fanId: string): string {
  if (!fanId) return EMPTY_REACTIONS_RAW;
  return readReactionsRawByKey(buildReactionsStorageKey(fanId));
}

export function readReactions(fanId: string): ReactionStore {
  if (!fanId) return EMPTY_REACTIONS;
  return readReactionStoreByKey(buildReactionsStorageKey(fanId));
}

export function writeReactions(fanId: string, next: ReactionStore) {
  if (!fanId || typeof window === "undefined") return;
  const storageKey = buildReactionsStorageKey(fanId);
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(storageKey, raw);
  } catch (_err) {
    return;
  }
  reactionsCacheRaw.set(storageKey, raw);
  reactionsCacheParsed.set(storageKey, next);
  window.dispatchEvent(new CustomEvent(REACTIONS_EVENT, { detail: { fanId, storageKey } }));
  getReactionsChannel()?.postMessage({ type: "reactions", fanId, storageKey });
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

export function toggleMessageReaction(
  fanId: string,
  messageId: string,
  emoji: string,
  actor: string
): MessageReaction[] {
  if (!fanId || !messageId) return [];
  const normalizedEmoji = (emoji || "").trim();
  const normalizedActor = (actor || DEFAULT_ACTOR).trim() || DEFAULT_ACTOR;
  if (!normalizedEmoji) return [];

  const store = readReactions(fanId);
  const current = store[messageId] ?? [];
  const existingForActor = current.find((reaction) => reaction.actor === normalizedActor);
  let next: MessageReaction[];

  if (existingForActor && existingForActor.emoji === normalizedEmoji) {
    next = current.filter((reaction) => reaction.actor !== normalizedActor);
  } else {
    next = current.filter((reaction) => reaction.actor !== normalizedActor);
    next = [...next, { emoji: normalizedEmoji, actor: normalizedActor }];
  }

  const nextStore: ReactionStore = { ...store };
  if (next.length > 0) {
    nextStore[messageId] = next;
  } else {
    delete nextStore[messageId];
  }

  writeReactions(fanId, nextStore);
  return next;
}

function subscribeToReactions(storageKey: string, fanId: string, callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent)?.detail as { fanId?: string; storageKey?: string } | undefined;
    if (detail?.storageKey && detail.storageKey !== storageKey) return;
    if (detail?.fanId && fanId && detail.fanId !== fanId) return;
    callback();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== storageKey) return;
    callback();
  };
  const handleBroadcast = (event: MessageEvent) => {
    const data = event.data as { type?: string; fanId?: string; storageKey?: string } | null;
    if (!data || data.type !== "reactions") return;
    if (data.storageKey && data.storageKey !== storageKey) return;
    if (data.fanId && fanId && data.fanId !== fanId) return;
    callback();
  };

  window.addEventListener(REACTIONS_EVENT, handleCustom as EventListener);
  window.addEventListener("storage", handleStorage);
  const channel = getReactionsChannel();
  channel?.addEventListener("message", handleBroadcast as EventListener);

  return () => {
    window.removeEventListener(REACTIONS_EVENT, handleCustom as EventListener);
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleBroadcast as EventListener);
  };
}

export function useReactions(fanId: string): string {
  const storageKey = buildReactionsStorageKey(fanId || "");
  return useSyncExternalStore(
    (callback) => (fanId ? subscribeToReactions(storageKey, fanId, callback) : () => {}),
    () => (fanId ? readReactionsRawByKey(storageKey) : EMPTY_REACTIONS_RAW),
    () => EMPTY_REACTIONS_RAW
  );
}
