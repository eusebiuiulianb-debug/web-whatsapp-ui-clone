import { ConversationListData } from "../types/Conversation";
import { getFollowUpTag, shouldFollowUpToday } from "./followUp";

export function getRecommendedFan(list: ConversationListData[]): ConversationListData | undefined {
  const candidates = list.filter((fan) =>
    shouldFollowUpToday({
      membershipStatus: fan.membershipStatus,
      daysLeft: fan.daysLeft,
      followUpTag: fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes),
    })
  );

  const normalizeTier = (tier?: string | null) => {
    const lower = (tier || "").toLowerCase();
    if (lower === "vip" || lower === "priority") return "vip";
    if (lower === "regular") return "regular";
    return "new";
  };

  const computePriorityScore = (fan: ConversationListData): number => {
    const tag = fan.followUpTag ?? getFollowUpTag(fan.membershipStatus, fan.daysLeft, fan.activeGrantTypes);
    const isExpiredToday = tag === "expired" && (fan.daysLeft ?? 0) === 0;
    let urgencyScore = 0;
    switch (isExpiredToday ? "expired_today" : tag) {
      case "trial_soon":
      case "monthly_soon":
        urgencyScore = 3;
        break;
      case "expired_today":
        urgencyScore = 2;
        break;
      default:
        urgencyScore = 0;
    }
    const tier = normalizeTier(fan.customerTier);
    const tierScore = tier === "vip" ? 2 : tier === "regular" ? 1 : 0;
    return urgencyScore * 10 + tierScore;
  };

  return candidates.sort((a, b) => {
    const pa = typeof a.priorityScore === "number" ? a.priorityScore : computePriorityScore(a);
    const pb = typeof b.priorityScore === "number" ? b.priorityScore : computePriorityScore(b);
    if (pa !== pb) return pb - pa;

    const da = typeof a.daysLeft === "number" ? a.daysLeft : Number.POSITIVE_INFINITY;
    const db = typeof b.daysLeft === "number" ? b.daysLeft : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;

    const la = a.lastCreatorMessageAt ? new Date(a.lastCreatorMessageAt).getTime() : 0;
    const lb = b.lastCreatorMessageAt ? new Date(b.lastCreatorMessageAt).getTime() : 0;
    return lb - la;
  })[0];
}
