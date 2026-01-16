import { useSyncExternalStore } from "react";
import {
  getTypingIndicator,
  subscribeTypingIndicators,
  type TypingIndicatorState,
} from "../lib/typingIndicatorStore";

export function useTypingIndicator(conversationId?: string | null): TypingIndicatorState | null {
  const resolvedId = typeof conversationId === "string" ? conversationId : "";
  return useSyncExternalStore(
    subscribeTypingIndicators,
    () => getTypingIndicator(resolvedId),
    () => null
  );
}
