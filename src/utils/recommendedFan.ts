import { ConversationListData } from "../types/Conversation";
import { getFollowUpTag, needsFollowUpToday } from "./followUp";

export function getRecommendedFan(list: ConversationListData[]): ConversationListData | undefined {
  const candidates = list.filter((fan) =>
    needsFollowUpToday(fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft), fan.lastCreatorMessageAt)
  );

  const orderTier = { priority: 0, regular: 1, new: 2 } as const;
  const orderTag = { trial_soon: 0, monthly_soon: 1 } as const;

  return candidates.sort((a, b) => {
    const ta = orderTier[a.customerTier ?? "new"] ?? 2;
    const tb = orderTier[b.customerTier ?? "new"] ?? 2;
    if (ta !== tb) return ta - tb;

    const ua = orderTag[a.followUpTag as keyof typeof orderTag] ?? 2;
    const ub = orderTag[b.followUpTag as keyof typeof orderTag] ?? 2;
    if (ua !== ub) return ua - ub;

    const na = a.nextAction ? 0 : 1;
    const nb = b.nextAction ? 0 : 1;
    if (na !== nb) return na - nb;

    const da = typeof a.daysLeft === "number" ? a.daysLeft : Number.POSITIVE_INFINITY;
    const db = typeof b.daysLeft === "number" ? b.daysLeft : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;

    const lva = typeof a.lifetimeValue === "number" ? a.lifetimeValue : 0;
    const lvb = typeof b.lifetimeValue === "number" ? b.lifetimeValue : 0;
    return lvb - lva;
  })[0];
}
