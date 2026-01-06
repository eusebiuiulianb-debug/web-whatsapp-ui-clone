export type VoiceNoteNoticePayload = {
  fanId: string;
  fanName?: string;
  durationMs?: number;
  from?: "fan" | "creator";
  eventId?: string;
  createdAt?: string;
};

export type VoiceNoteNotice = {
  count: number;
  voiceIds: string[];
  last: {
    durationMs: number;
    from?: "fan" | "creator";
    createdAt?: string;
    fanName?: string;
  };
};

const STORAGE_KEY = "novsy:unseenVoiceNotes";

function readStore(): Record<string, VoiceNoteNotice> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed as Record<string, VoiceNoteNotice>);
    const normalized: Record<string, VoiceNoteNotice> = {};
    for (let i = 0; i < entries.length; i += 1) {
      const [fanId, notice] = entries[i];
      if (!notice) continue;
      const count = typeof notice.count === "number" ? notice.count : 0;
      const voiceIds = Array.isArray(notice.voiceIds) ? notice.voiceIds : [];
      const durationMs = typeof notice.last?.durationMs === "number" ? notice.last.durationMs : 0;
      normalized[fanId] = {
        ...notice,
        count,
        voiceIds,
        last: {
          durationMs,
          from: notice.last?.from,
          createdAt: notice.last?.createdAt,
          fanName: notice.last?.fanName,
        },
      };
    }
    return normalized;
  } catch (_err) {
    return {};
  }
}

function writeStore(map: Record<string, VoiceNoteNotice>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (_err) {
    // ignore storage errors
  }
}

export function getUnseenVoiceNotes(): Record<string, VoiceNoteNotice> {
  return readStore();
}

export function recordUnseenVoiceNote(payload: VoiceNoteNoticePayload): VoiceNoteNotice | null {
  if (!payload?.fanId) return null;
  const voiceId = (() => {
    if (typeof payload.eventId === "string" && payload.eventId.trim()) {
      return payload.eventId.trim();
    }
    if (typeof payload.createdAt === "string" && payload.createdAt.trim()) {
      return `voice-${payload.fanId}-${payload.createdAt.trim()}`;
    }
    return `voice-${payload.fanId}-${Date.now()}`;
  })();
  const map = readStore();
  const existing = map[payload.fanId];
  const previousIds = Array.isArray(existing?.voiceIds) ? existing!.voiceIds : [];
  if (voiceId && previousIds.includes(voiceId)) {
    return existing ?? null;
  }
  const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : 0;
  const count = (existing?.count ?? 0) + 1;
  const voiceIds = voiceId ? [...previousIds, voiceId] : [...previousIds];
  const last = {
    durationMs,
    from: payload.from ?? existing?.last?.from,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : existing?.last?.createdAt,
    fanName: typeof payload.fanName === "string" ? payload.fanName : existing?.last?.fanName,
  };
  const next: VoiceNoteNotice = {
    count,
    voiceIds,
    last,
  };
  map[payload.fanId] = next;
  writeStore(map);
  return next;
}

export function consumeUnseenVoiceNote(fanId: string): VoiceNoteNotice | null {
  if (!fanId) return null;
  const map = readStore();
  const existing = map[fanId];
  if (!existing) return null;
  delete map[fanId];
  writeStore(map);
  return existing;
}

export function clearUnseenVoiceNote(fanId: string) {
  if (!fanId) return;
  const map = readStore();
  if (!map[fanId]) return;
  delete map[fanId];
  writeStore(map);
}
