export const ANALYTICS_EVENTS = {
  BIO_LINK_VIEW: "bio_link_view",
  CTA_CLICK_ENTER_CHAT: "cta_click_enter_chat",
  OPEN_CHAT: "open_chat",
  NEW_FAN: "new_fan",
  SEND_MESSAGE: "send_message",
  PURCHASE_START: "purchase_start",
  PURCHASE_SUCCESS: "purchase_success",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type AnalyticsEventMeta = {
  platform?: string;
  creativeId?: string;
  placement?: string;
  amountCents?: number;
  currency?: string;
  productId?: string;
  handle?: string;
  ctaUrl?: string;
  contentId?: string;
  title?: string;
  [key: string]: any;
};
