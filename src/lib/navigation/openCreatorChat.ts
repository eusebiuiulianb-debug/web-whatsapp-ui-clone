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

type ComposerDraftMode = "fan";

type ComposerDraftPayload = {
  fanId: string;
  mode: ComposerDraftMode;
  text: string;
};

const DEFAULT_CHAT_PATH = "/creator";
const PENDING_COMPOSER_DRAFT_KEY = "novsy:pendingComposerDraft";
const COMPOSER_DRAFT_EVENT = "novsy:composerDraft";

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

export function queueComposerDraft(payload: ComposerDraftPayload) {
  if (typeof window === "undefined") return;
  const fanId = payload?.fanId?.trim();
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!fanId || !text) return;
  try {
    sessionStorage.setItem(
      PENDING_COMPOSER_DRAFT_KEY,
      JSON.stringify({ fanId, mode: payload.mode, text: payload.text })
    );
  } catch (_err) {
    // ignore storage errors
  }
  try {
    window.dispatchEvent(new CustomEvent(COMPOSER_DRAFT_EVENT, { detail: { fanId, mode: payload.mode, text: payload.text } }));
  } catch (_err) {
    // ignore event errors
  }
}

export function consumeComposerDraft(fanId: string): ComposerDraftPayload | null {
  if (typeof window === "undefined") return null;
  const targetFanId = fanId?.trim();
  if (!targetFanId) return null;
  try {
    const raw = sessionStorage.getItem(PENDING_COMPOSER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ComposerDraftPayload> | null;
    if (!parsed || typeof parsed !== "object") {
      sessionStorage.removeItem(PENDING_COMPOSER_DRAFT_KEY);
      return null;
    }
    if (parsed.fanId !== targetFanId) return null;
    const text = typeof parsed.text === "string" ? parsed.text : "";
    if (!text.trim()) {
      sessionStorage.removeItem(PENDING_COMPOSER_DRAFT_KEY);
      return null;
    }
    sessionStorage.removeItem(PENDING_COMPOSER_DRAFT_KEY);
    return { fanId: targetFanId, mode: parsed.mode === "fan" ? "fan" : "fan", text };
  } catch (_err) {
    sessionStorage.removeItem(PENDING_COMPOSER_DRAFT_KEY);
    return null;
  }
}
