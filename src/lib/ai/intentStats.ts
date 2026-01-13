import prisma from "../prisma.server";
import type { IntentKey } from "./intents";

type IntentCount = Record<IntentKey, number>;

function parseTimestampFromId(id: string): number | null {
  const lastDash = id.lastIndexOf("-");
  if (lastDash < 0 || lastDash === id.length - 1) return null;
  const parsed = Number(id.slice(lastDash + 1));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function countIntentsForFan(fanId: string, days = 7): Promise<IntentCount> {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = (await prisma.message.findMany({
    where: { fanId, intentKey: { not: null } } as any,
    orderBy: { id: "desc" },
    take: 200,
    select: { id: true, intentKey: true } as any,
  })) as unknown as Array<{ id: string; intentKey: string | null }>;

  const counts = {} as IntentCount;
  rows.forEach((row) => {
    const ts = parseTimestampFromId(row.id);
    if (ts && ts < cutoffMs) return;
    const key = (row.intentKey as IntentKey | null) ?? "OTHER";
    counts[key] = (counts[key] ?? 0) + 1;
  });

  return counts;
}
