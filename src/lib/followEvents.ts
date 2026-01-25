export const FOLLOW_UPDATED_EVENT = "ip:follow-updated";
export const FOLLOW_UPDATED_KEY = "intimipop-follow-event-v1";
const FOLLOW_BROADCAST_CHANNEL = "intimipop-follow-v1";
const TAB_ID = typeof window === "undefined" ? "server" : resolveTabId();
let broadcastChannel: BroadcastChannel | null = null;

export type FollowUpdateDetail = {
  creatorId?: string;
  isFollowing?: boolean;
  following?: boolean;
  followersCount?: number;
  updatedAt?: number;
  at?: number;
  sourceId?: string;
};

type FollowBroadcastPayload = FollowUpdateDetail & { sourceId: string };

export type FollowSnapshot = {
  creatorId: string;
  isFollowing: boolean;
  followersCount?: number;
  updatedAt: number;
};

type FollowSnapshotInput = {
  isFollowing: boolean;
  followersCount?: number;
  updatedAt?: number;
};

type FollowSubscriber = (snapshot: FollowSnapshot) => void;

const followSnapshots = new Map<string, FollowSnapshot>();
const followSubscribers = new Map<string, Set<FollowSubscriber>>();
const globalSubscribers = new Set<(detail?: FollowUpdateDetail) => void>();
let listenersAttached = false;

export function setFollowSnapshot(creatorId: string, state: FollowSnapshotInput): FollowSnapshot | null {
  return updateSnapshot(creatorId, state).snapshot;
}

export function getFollowSnapshot(creatorId: string): FollowSnapshot | null {
  const normalized = normalizeCreatorId(creatorId);
  if (!normalized) return null;
  return followSnapshots.get(normalized) ?? null;
}

export function emitFollowChange(creatorId: string, state: FollowSnapshotInput) {
  const { snapshot, updated } = updateSnapshot(creatorId, state);
  if (!snapshot || !updated) return;
  notifySubscribers(snapshot);
  notifyFollowUpdated({
    creatorId: snapshot.creatorId,
    isFollowing: snapshot.isFollowing,
    followersCount: snapshot.followersCount,
    updatedAt: snapshot.updatedAt,
  });
}

export function subscribeFollow(creatorId: string, onUpdate: FollowSubscriber) {
  const normalized = normalizeCreatorId(creatorId);
  if (!normalized) return () => {};
  ensureListeners();
  const existing = followSubscribers.get(normalized);
  if (existing) {
    existing.add(onUpdate);
  } else {
    followSubscribers.set(normalized, new Set([onUpdate]));
  }
  return () => {
    const current = followSubscribers.get(normalized);
    if (!current) return;
    current.delete(onUpdate);
    if (current.size === 0) {
      followSubscribers.delete(normalized);
    }
  };
}

export function notifyFollowUpdated(detail?: FollowUpdateDetail) {
  if (typeof window === "undefined") return;
  const updatedAt = resolveUpdatedAtFromDetail(detail);
  const resolvedFollowing =
    typeof detail?.isFollowing === "boolean"
      ? detail.isFollowing
      : typeof detail?.following === "boolean"
      ? detail.following
      : undefined;
  const payload: FollowBroadcastPayload = {
    ...detail,
    isFollowing: resolvedFollowing,
    updatedAt,
    sourceId: TAB_ID,
  };
  try {
    window.dispatchEvent(new CustomEvent(FOLLOW_UPDATED_EVENT, { detail: payload }));
  } catch (_err) {
  }
  broadcastFollowUpdate(payload);
}

export function subscribeFollowUpdates(onUpdate: (detail?: FollowUpdateDetail) => void) {
  if (typeof window === "undefined") return () => {};
  ensureListeners();
  globalSubscribers.add(onUpdate);
  return () => {
    globalSubscribers.delete(onUpdate);
  };
}

function ensureListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  window.addEventListener(FOLLOW_UPDATED_EVENT, handleEvent as EventListener);
  window.addEventListener("storage", handleStorage);
  const channel = getBroadcastChannel();
  if (channel) {
    channel.addEventListener("message", handleBroadcastMessage);
  }
}

function handleEvent(event: Event) {
  if (event instanceof CustomEvent) {
    handleIncomingUpdate(event.detail as FollowUpdateDetail);
    return;
  }
  handleIncomingUpdate();
}

function handleStorage(event: StorageEvent) {
  if (event.key !== FOLLOW_UPDATED_KEY) return;
  if (!event.newValue) {
    handleIncomingUpdate();
    return;
  }
  try {
    const parsed = JSON.parse(event.newValue) as FollowBroadcastPayload;
    if (parsed?.sourceId === TAB_ID) return;
    handleIncomingUpdate(parsed);
  } catch (_err) {
    handleIncomingUpdate();
  }
}

function handleBroadcastMessage(event: MessageEvent) {
  const payload = parseBroadcastPayload(event.data);
  if (!payload || payload.sourceId === TAB_ID) return;
  handleIncomingUpdate(payload);
}

function handleIncomingUpdate(detail?: FollowUpdateDetail) {
  applySnapshotFromDetail(detail);
  globalSubscribers.forEach((callback) => callback(detail));
}

function applySnapshotFromDetail(detail?: FollowUpdateDetail) {
  const normalized = normalizeCreatorId(detail?.creatorId);
  const resolvedFollowing =
    typeof detail?.isFollowing === "boolean"
      ? detail.isFollowing
      : typeof detail?.following === "boolean"
      ? detail.following
      : null;
  if (!normalized || resolvedFollowing === null) return;
  const { snapshot, updated } = updateSnapshot(normalized, {
    isFollowing: resolvedFollowing,
    followersCount: detail?.followersCount,
    updatedAt: resolveUpdatedAtFromDetail(detail),
  });
  if (updated && snapshot) {
    notifySubscribers(snapshot);
  }
}

function updateSnapshot(
  creatorId: string,
  state: FollowSnapshotInput
): { snapshot: FollowSnapshot | null; updated: boolean } {
  const normalized = normalizeCreatorId(creatorId);
  if (!normalized) return { snapshot: null, updated: false };
  const prev = followSnapshots.get(normalized);
  const updatedAt = resolveUpdatedAt(state.updatedAt);
  if (prev && prev.updatedAt >= updatedAt) {
    return { snapshot: prev, updated: false };
  }
  const followersCount = resolveFollowersCount(state.followersCount, prev);
  const next: FollowSnapshot = {
    creatorId: normalized,
    isFollowing: state.isFollowing,
    followersCount,
    updatedAt,
  };
  followSnapshots.set(normalized, next);
  return { snapshot: next, updated: true };
}

function notifySubscribers(snapshot: FollowSnapshot) {
  const subscribers = followSubscribers.get(snapshot.creatorId);
  if (!subscribers) return;
  subscribers.forEach((callback) => callback(snapshot));
}

function normalizeCreatorId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function resolveUpdatedAt(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}

function resolveUpdatedAtFromDetail(detail?: FollowUpdateDetail) {
  const candidate =
    typeof detail?.updatedAt === "number"
      ? detail.updatedAt
      : typeof detail?.at === "number"
      ? detail.at
      : undefined;
  return resolveUpdatedAt(candidate);
}

function resolveFollowersCount(value: unknown, prev?: FollowSnapshot) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return prev?.followersCount;
}

function broadcastFollowUpdate(payload: FollowBroadcastPayload) {
  if (typeof window === "undefined") return;
  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(payload);
      return;
    } catch (_err) {
    }
  }
  try {
    window.localStorage.setItem(FOLLOW_UPDATED_KEY, JSON.stringify(payload));
  } catch (_err) {
  }
}

function getBroadcastChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(FOLLOW_BROADCAST_CHANNEL);
  }
  return broadcastChannel;
}

function parseBroadcastPayload(value: unknown): FollowBroadcastPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as FollowBroadcastPayload;
  if (typeof payload.sourceId !== "string") return null;
  return payload;
}

function resolveTabId() {
  if (typeof window === "undefined") return "server";
  try {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch (_err) {
  }
  return `tab-${Math.random().toString(36).slice(2)}`;
}
