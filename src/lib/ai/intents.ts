export type IntentKey =
  | "GREETING"
  | "FLIRT"
  | "CONTENT_REQUEST"
  | "CUSTOM_REQUEST"
  | "PRICE_ASK"
  | "BUY_NOW"
  | "SUBSCRIBE"
  | "CANCEL"
  | "OFF_PLATFORM"
  | "SUPPORT"
  | "OBJECTION"
  | "RUDE_OR_HARASS"
  | "UNSAFE_MINOR"
  | "OTHER";

export type IntentResult = {
  intent: IntentKey;
  confidence: number;
  signals?: Record<string, unknown>;
};
