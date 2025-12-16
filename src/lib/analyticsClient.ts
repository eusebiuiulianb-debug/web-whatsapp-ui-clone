import type { AnalyticsEventMeta, AnalyticsEventName } from "./analyticsEvents";

type TrackParams = {
  creatorId?: string;
  fanId?: string | null;
  meta?: AnalyticsEventMeta;
};

const DEFAULT_CREATOR_ID = process.env.NEXT_PUBLIC_CREATOR_ID || "creator-1";

export async function track(eventName: AnalyticsEventName, params: TrackParams = {}) {
  try {
    if (!eventName) return;
    const body = {
      eventName,
      creatorId: params.creatorId || DEFAULT_CREATOR_ID,
      fanId: params.fanId ?? undefined,
      meta: params.meta,
    };
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (_err) {
    // swallow errors to avoid breaking UX
  }
}
