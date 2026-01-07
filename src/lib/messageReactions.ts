export type ReactionSummaryEntry = {
  emoji: string;
  count: number;
  mine?: boolean;
};

export type ReactionActor = {
  actorType: "FAN" | "CREATOR";
  actorId: string;
};

export function buildReactionSummary(
  reactions: Array<{ emoji: string; actorType: ReactionActor["actorType"]; actorId: string }>,
  viewer?: ReactionActor | null
): ReactionSummaryEntry[] {
  const map = new Map<string, ReactionSummaryEntry>();

  for (const reaction of reactions) {
    const emoji = (reaction.emoji || "").trim();
    if (!emoji) continue;
    const entry = map.get(emoji) ?? { emoji, count: 0 };
    entry.count += 1;
    if (viewer && reaction.actorType === viewer.actorType && reaction.actorId === viewer.actorId) {
      entry.mine = true;
    }
    map.set(emoji, entry);
  }

  return Array.from(map.values());
}

export function getMineEmoji(summary?: ReactionSummaryEntry[] | null): string | null {
  if (!Array.isArray(summary)) return null;
  return summary.find((entry) => entry.mine)?.emoji ?? null;
}

export function applyOptimisticReaction(
  summary: ReactionSummaryEntry[] | null | undefined,
  emoji: string
): ReactionSummaryEntry[] {
  const normalizedEmoji = (emoji || "").trim();
  if (!normalizedEmoji) return Array.isArray(summary) ? summary : [];
  const next = Array.isArray(summary) ? summary.map((entry) => ({ ...entry })) : [];
  const currentMine = next.find((entry) => entry.mine)?.emoji ?? null;

  next.forEach((entry) => {
    if (entry.mine) delete entry.mine;
  });

  const updateCount = (target: string, delta: number) => {
    const idx = next.findIndex((entry) => entry.emoji === target);
    if (idx === -1) {
      if (delta <= 0) return;
      next.push({ emoji: target, count: delta });
      return;
    }
    const updated = next[idx];
    updated.count += delta;
    if (updated.count <= 0) {
      next.splice(idx, 1);
    }
  };

  if (currentMine && currentMine === normalizedEmoji) {
    updateCount(normalizedEmoji, -1);
    return next;
  }

  if (currentMine) {
    updateCount(currentMine, -1);
  }
  updateCount(normalizedEmoji, 1);
  const mineEntry = next.find((entry) => entry.emoji === normalizedEmoji);
  if (mineEntry) {
    mineEntry.mine = true;
  }
  return next;
}
