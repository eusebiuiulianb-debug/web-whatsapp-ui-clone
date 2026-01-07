export type ChatEvent =
  | {
      type: "message_created";
      threadId: string;
      createdAt: string;
      preview: string;
      isIncoming: boolean;
    }
  | {
      type: "thread_read";
      threadId: string;
    };

const CHANNEL_NAME = "novsy";
const LOCAL_EVENT = "novsy:chat-event";

let initialized = false;
let channel: BroadcastChannel | null = null;

function dispatchLocal(event: ChatEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: event }));
}

function handleIncoming(raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const event = raw as ChatEvent;
  if (!event.type || !event.threadId) return;
  dispatchLocal(event);
}

export function initChatEventBus() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => handleIncoming(event.data));
  }
}

export function publishChatEvent(event: ChatEvent) {
  if (typeof window === "undefined") return;
  initChatEventBus();
  dispatchLocal(event);
  if (channel) {
    try {
      channel.postMessage(event);
    } catch (_err) {
      // ignore channel failures
    }
  }
}

export function subscribeChatEvents(handler: (event: ChatEvent) => void) {
  if (typeof window === "undefined") return () => {};
  initChatEventBus();
  const handleLocal = (event: Event) => {
    const detail = (event as CustomEvent).detail as ChatEvent | undefined;
    if (!detail) return;
    handler(detail);
  };
  window.addEventListener(LOCAL_EVENT, handleLocal as EventListener);
  return () => {
    window.removeEventListener(LOCAL_EVENT, handleLocal as EventListener);
  };
}
