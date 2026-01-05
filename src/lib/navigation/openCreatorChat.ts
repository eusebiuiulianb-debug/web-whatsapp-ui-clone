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

export type ComposerDraftTarget = "fan" | "cortex";
export type ComposerDraftMode = "fan" | "internal" | "manager";
export type ComposerDraftInsertMode = "replace" | "append";

export type ComposerDraftPayload = {
  target: ComposerDraftTarget;
  fanId?: string;
  mode?: ComposerDraftMode;
  text: string;
  source?: string;
  insertMode?: ComposerDraftInsertMode;
  actionKey?: string;
};

const DEFAULT_CHAT_PATH = "/creator";
const DEFAULT_CORTEX_PATH = "/creator/manager";
const PENDING_COMPOSER_DRAFT_KEY = "novsy:pendingComposerDraft";
const PENDING_CORTEX_DRAFT_KEY = "novsy:pendingComposerDraft:cortex";
export const COMPOSER_DRAFT_EVENT = "novsy:composerDraft";

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

const getDraftStorageKey = (target: ComposerDraftTarget) =>
  target === "cortex" ? PENDING_CORTEX_DRAFT_KEY : PENDING_COMPOSER_DRAFT_KEY;

const normalizeDraftTarget = (target?: string): ComposerDraftTarget => (target === "cortex" ? "cortex" : "fan");
const normalizeInsertMode = (mode?: string): ComposerDraftInsertMode => (mode === "append" ? "append" : "replace");
const normalizeActionKey = (key?: string) => {
  if (typeof key !== "string") return undefined;
  const trimmed = key.trim();
  return trimmed ? trimmed : undefined;
};

export function appendDraftText(existing: string, incoming: string) {
  const trimmedExisting = existing.trim();
  const trimmedIncoming = incoming.trim();
  if (!trimmedExisting) return trimmedIncoming;
  if (!trimmedIncoming) return trimmedExisting;
  return `${trimmedExisting}\n\n${trimmedIncoming}`;
}

export function queueDraft(payload: ComposerDraftPayload) {
  if (typeof window === "undefined") return;
  const target = normalizeDraftTarget(payload?.target);
  const text = typeof payload?.text === "string" ? payload.text : "";
  const fanId = typeof payload?.fanId === "string" ? payload.fanId.trim() : "";
  const insertMode = normalizeInsertMode(payload?.insertMode);
  const actionKey = normalizeActionKey(payload?.actionKey);
  if (!text.trim()) return;
  if (target === "fan" && !fanId) return;
  const normalizedPayload: ComposerDraftPayload = {
    target,
    fanId: fanId || undefined,
    mode: payload.mode,
    text: payload.text,
    source: payload.source,
    insertMode,
    actionKey,
  };
  try {
    sessionStorage.setItem(getDraftStorageKey(target), JSON.stringify(normalizedPayload));
  } catch (_err) {
    // ignore storage errors
  }
  try {
    window.dispatchEvent(new CustomEvent(COMPOSER_DRAFT_EVENT, { detail: normalizedPayload }));
  } catch (_err) {
    // ignore event errors
  }
}

export function insertIntoCurrentComposer(payload: ComposerDraftPayload) {
  if (typeof window === "undefined") return false;
  const target = normalizeDraftTarget(payload?.target);
  const text = typeof payload?.text === "string" ? payload.text : "";
  const fanId = typeof payload?.fanId === "string" ? payload.fanId.trim() : "";
  const insertMode = normalizeInsertMode(payload?.insertMode);
  const actionKey = normalizeActionKey(payload?.actionKey);
  if (!text.trim()) return false;
  if (target === "fan" && !fanId) return false;
  queueDraft({
    target,
    fanId: fanId || undefined,
    mode: payload.mode,
    text: payload.text,
    source: payload.source,
    insertMode,
    actionKey,
  });
  return true;
}

export function consumeDraft(options: { target: ComposerDraftTarget; fanId?: string }): ComposerDraftPayload | null {
  if (typeof window === "undefined") return null;
  const target = normalizeDraftTarget(options?.target);
  const targetFanId = typeof options?.fanId === "string" ? options.fanId.trim() : "";
  if (target === "fan" && !targetFanId) return null;
  const storageKey = getDraftStorageKey(target);
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ComposerDraftPayload> | null;
    if (!parsed || typeof parsed !== "object") {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    const parsedTarget = normalizeDraftTarget(parsed.target);
    if (parsedTarget !== target) return null;
    const parsedFanId = typeof parsed.fanId === "string" ? parsed.fanId.trim() : "";
    const insertMode = normalizeInsertMode(parsed.insertMode);
    const actionKey = normalizeActionKey(parsed.actionKey);
    if (target === "fan") {
      if (!parsedFanId || parsedFanId !== targetFanId) return null;
    } else if (targetFanId) {
      if (!parsedFanId || parsedFanId !== targetFanId) return null;
    } else if (parsedFanId) {
      return null;
    }
    const text = typeof parsed.text === "string" ? parsed.text : "";
    if (!text.trim()) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    sessionStorage.removeItem(storageKey);
    return {
      target,
      fanId: parsedFanId || (target === "fan" ? targetFanId : undefined),
      mode: parsed.mode,
      text,
      source: parsed.source,
      insertMode,
      actionKey,
    };
  } catch (_err) {
    sessionStorage.removeItem(storageKey);
    return null;
  }
}

export function openFanChatAndPrefill(
  router: NextRouter,
  options: {
    fanId: string;
    text: string;
    mode?: ComposerDraftMode;
    source?: string;
    actionKey?: string;
    pathname?: string;
    shallow?: boolean;
    scroll?: boolean;
  }
) {
  const fanId = options.fanId?.trim();
  const text = typeof options.text === "string" ? options.text : "";
  if (!fanId || !text.trim()) return;
  queueDraft({
    target: "fan",
    fanId,
    mode: options.mode ?? "fan",
    text: options.text,
    source: options.source,
    actionKey: options.actionKey,
  });
  const activeFanId = getFanIdFromQuery(router.query);
  const isChatRoute = router.pathname === "/" || router.pathname === DEFAULT_CHAT_PATH;
  if (isChatRoute && activeFanId === fanId) return;
  openFanChat(router, fanId, {
    pathname: options.pathname,
    shallow: options.shallow,
    scroll: options.scroll,
  });
}

export function openCortexAndPrefill(
  router: NextRouter,
  options: { text: string; fanId?: string; mode?: ComposerDraftMode; source?: string; pathname?: string; shallow?: boolean; scroll?: boolean }
) {
  const text = typeof options.text === "string" ? options.text : "";
  const fanId = typeof options.fanId === "string" ? options.fanId.trim() : "";
  if (!text.trim()) return;
  queueDraft({
    target: "cortex",
    fanId: fanId || undefined,
    text: options.text,
    mode: options.mode,
    source: options.source,
  });
  const targetPath = options.pathname ?? DEFAULT_CORTEX_PATH;
  if (router.pathname === targetPath) return;
  void router.push(
    {
      pathname: targetPath,
    },
    undefined,
    { shallow: options.shallow, scroll: options.scroll }
  );
}

type LegacyComposerDraftPayload = Omit<ComposerDraftPayload, "target"> & { target?: ComposerDraftTarget };

export function queueComposerDraft(payload: LegacyComposerDraftPayload) {
  queueDraft({ ...payload, target: normalizeDraftTarget(payload?.target) });
}

export function consumeComposerDraft(fanId: string): ComposerDraftPayload | null {
  return consumeDraft({ target: "fan", fanId });
}
