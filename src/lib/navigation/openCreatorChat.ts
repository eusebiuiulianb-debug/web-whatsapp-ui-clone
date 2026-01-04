import type { NextRouter } from "next/router";
import type { ParsedUrlQuery } from "querystring";

type OpenFanChatOptions = {
  draft?: string;
  segmentNote?: string;
  panel?: string;
  source?: string;
  shallow?: boolean;
  scroll?: boolean;
  pathname?: string;
};

const DEFAULT_CHAT_PATH = "/creator";

export function buildFanChatHref(fanId: string, options: Omit<OpenFanChatOptions, "pathname"> = {}) {
  if (!fanId) return DEFAULT_CHAT_PATH;
  const params = new URLSearchParams({ fan: fanId });
  if (options.draft) params.set("draft", options.draft);
  if (options.segmentNote) params.set("segmentNote", options.segmentNote);
  if (options.panel) params.set("panel", options.panel);
  if (options.source) params.set("source", options.source);
  return `${DEFAULT_CHAT_PATH}?${params.toString()}`;
}

export function getFanIdFromQuery(query: ParsedUrlQuery): string | null {
  const raw = query.fan ?? query.fanId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function openFanChat(router: NextRouter, fanId: string, options: OpenFanChatOptions = {}) {
  if (!fanId) return;
  const query: Record<string, string> = { fan: fanId };
  if (options.draft) query.draft = options.draft;
  if (options.segmentNote) query.segmentNote = options.segmentNote;
  if (options.panel) query.panel = options.panel;
  if (options.source) query.source = options.source;
  void router.push(
    {
      pathname: options.pathname ?? DEFAULT_CHAT_PATH,
      query,
    },
    undefined,
    { shallow: options.shallow, scroll: options.scroll }
  );
}

export function openCreatorChat(router: NextRouter, fanId: string) {
  openFanChat(router, fanId);
}
