import type { IntentKey } from "./intents";

type HeatInput = {
  recentMessages: Array<{
    id?: string | null;
    from: string | null;
    intentKey?: IntentKey | string | null;
    intentConfidence?: number | null;
    createdAt?: Date | null;
  }>;
  recentPurchases?: Array<{ createdAt: Date; amount?: number | null }>;
  subscriptionStatus?: string | null;
  lastSeenAt?: Date | null;
};

type HeatResult = { score: number; label: "COLD" | "WARM" | "HOT"; reasons: string[] };

const INTENT_BOOSTS: Record<IntentKey, number> = {
  GREETING: 2,
  FLIRT: 6,
  CONTENT_REQUEST: 10,
  CUSTOM_REQUEST: 12,
  PRICE_ASK: 14,
  BUY_NOW: 20,
  SUBSCRIBE: 12,
  CANCEL: -12,
  OFF_PLATFORM: -10,
  SUPPORT: -8,
  OBJECTION: -8,
  RUDE_OR_HARASS: -30,
  UNSAFE_MINOR: -50,
  OTHER: 0,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function parseMessageTimestamp(message: { id?: string | null; createdAt?: Date | null }): Date | null {
  if (message.createdAt instanceof Date && !Number.isNaN(message.createdAt.getTime())) return message.createdAt;
  const id = message.id ?? "";
  const lastDash = id.lastIndexOf("-");
  if (lastDash < 0 || lastDash === id.length - 1) return null;
  const ts = Number(id.slice(lastDash + 1));
  if (!Number.isFinite(ts) || String(ts).length < 10) return null;
  return new Date(ts);
}

export function computeHeatFromSignals(input: HeatInput): HeatResult {
  let score = 10;
  const reasons: string[] = [];
  const now = Date.now();
  const messages = Array.isArray(input.recentMessages) ? input.recentMessages : [];
  const fanMessages = messages.filter((msg) => (msg.from || "").toLowerCase() === "fan");

  const latestFanTs = fanMessages
    .map((msg) => parseMessageTimestamp(msg))
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (latestFanTs) {
    const diffMs = now - latestFanTs.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    if (hours <= 24) {
      score += 18;
      reasons.push("Msg <24h +18");
    } else if (hours <= 72) {
      score += 10;
      reasons.push("Msg <72h +10");
    } else if (hours <= 168) {
      score += 4;
      reasons.push("Msg <7d +4");
    } else {
      score -= 8;
      reasons.push("Inactivo >7d -8");
    }
  }

  const fanMessages7d = fanMessages.filter((msg) => {
    const ts = parseMessageTimestamp(msg);
    return ts ? now - ts.getTime() <= 7 * 24 * 60 * 60 * 1000 : false;
  });
  if (fanMessages7d.length > 0) {
    const freqPoints = Math.min(fanMessages7d.length * 3, 18);
    score += freqPoints;
    reasons.push(`Frecuencia 7d +${freqPoints}`);
  }

  const purchases = Array.isArray(input.recentPurchases) ? input.recentPurchases : [];
  const latestPurchase = purchases
    .map((p) => p.createdAt)
    .filter((d) => d instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (latestPurchase) {
    const diffMs = now - latestPurchase.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    if (hours <= 24) {
      score += 20;
      reasons.push("Compra <24h +20");
    } else if (hours <= 7 * 24) {
      score += 12;
      reasons.push("Compra <7d +12");
    } else if (hours <= 30 * 24) {
      score += 6;
      reasons.push("Compra <30d +6");
    }
  }

  const purchases30d = purchases.filter((p) => now - p.createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000);
  if (purchases30d.length > 0) {
    const total30d = purchases30d.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const valuePoints = Math.min(Math.round(total30d / 5), 15);
    if (valuePoints > 0) {
      score += valuePoints;
      reasons.push(`Gasto 30d +${valuePoints}`);
    }
  }

  const subscription = (input.subscriptionStatus || "").toLowerCase();
  if (subscription.includes("active") || subscription.includes("mensual") || subscription.includes("sub")) {
    score += 8;
    reasons.push("Sub activa +8");
  }

  const lastIntent = fanMessages
    .map((msg) => {
      const ts = parseMessageTimestamp(msg);
      return { intent: ((msg.intentKey || "") as string).toUpperCase() as IntentKey, ts: ts?.getTime() ?? 0 };
    })
    .sort((a, b) => b.ts - a.ts)[0]?.intent;
  if (lastIntent) {
    const delta = INTENT_BOOSTS[lastIntent] ?? 0;
    if (delta !== 0) {
      score += delta;
      reasons.push(`Intent ${lastIntent} ${delta > 0 ? "+" : ""}${delta}`);
    }
  }

  if (typeof score !== "number" || Number.isNaN(score)) score = 0;
  const clamped = clamp(score);
  const label = clamped >= 70 ? "HOT" : clamped >= 35 ? "WARM" : "COLD";
  const trimmedReasons = reasons.slice(0, 3);

  return { score: Math.round(clamped), label, reasons: trimmedReasons };
}
