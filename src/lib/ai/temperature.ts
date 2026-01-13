import type { IntentKey } from "./intents";

export type TemperatureBucket = "COLD" | "WARM" | "HOT";

export type TemperatureResult = {
  score: number;
  bucket: TemperatureBucket;
  reasons: string[];
};

type TemperatureInput = {
  previousScore?: number | null;
  lastInboundAt?: Date | string | null;
  intentKey?: IntentKey | string | null;
  lastPurchaseAt?: Date | string | null;
  now?: Date;
};

type NextActionInput = {
  intentKey?: IntentKey | string | null;
  temperatureBucket?: TemperatureBucket | string | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function parseDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function computeTemperatureFromMessage(input: TemperatureInput): TemperatureResult {
  const now = input.now ?? new Date();
  const previousScore = typeof input.previousScore === "number" ? input.previousScore : 0;
  const lastInboundAt = parseDate(input.lastInboundAt);
  const lastPurchaseAt = parseDate(input.lastPurchaseAt);
  const intentKey = ((input.intentKey || "") as string).toUpperCase() as IntentKey;

  const reasons: string[] = [];
  const daysSince = lastInboundAt
    ? Math.max(0, Math.floor((now.getTime() - lastInboundAt.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;
  let score = clamp(previousScore - daysSince * 5);
  if (daysSince > 0) {
    reasons.push(`Decaimiento -${daysSince * 5}`);
  }

  if (intentKey === "UNSAFE_MINOR") {
    return { score: 0, bucket: "COLD", reasons: ["Unsafe intent"] };
  }

  score += 8;
  reasons.push("Inbound +8");

  if (intentKey === "BUY_NOW") {
    score += 35;
    reasons.push("Intent BUY_NOW +35");
  } else if (intentKey === "PRICE_ASK") {
    score += 20;
    reasons.push("Intent PRICE_ASK +20");
  }

  if (lastPurchaseAt && now.getTime() - lastPurchaseAt.getTime() <= 7 * 24 * 60 * 60 * 1000) {
    score += 50;
    reasons.push("Compra reciente +50");
  }

  const clamped = clamp(score);
  const bucket = clamped >= 70 ? "HOT" : clamped >= 35 ? "WARM" : "COLD";
  return { score: Math.round(clamped), bucket, reasons: reasons.slice(0, 3) };
}

export function resolveNextAction(input: NextActionInput): string | null {
  const intentKey = ((input.intentKey || "") as string).toUpperCase();
  const bucket = ((input.temperatureBucket || "") as string).toUpperCase() as TemperatureBucket;
  if (intentKey === "UNSAFE_MINOR") return "SAFETY";
  if (intentKey === "SUPPORT") return "SUPPORT";
  if (intentKey === "BUY_NOW") return "SEND_PAYMENT_LINK";
  if (intentKey === "PRICE_ASK") return "OFFER_EXTRA";

  if (bucket === "HOT") return "PUSH_MONTHLY";
  if (bucket === "WARM") return "BUILD_RAPPORT";
  if (bucket === "COLD") return "BREAK_ICE";
  return "BUILD_RAPPORT";
}
