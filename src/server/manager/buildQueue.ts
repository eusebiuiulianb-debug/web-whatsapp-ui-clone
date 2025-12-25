import type { PrismaClient } from "@prisma/client";
import { isNewWithinDays } from "../../lib/fanNewness";
import { buildManagerQueueForCreator, type FanManagerRow } from "./managerService";

export type ActiveManagerQueueItem = FanManagerRow & {
  flags: {
    isNew30d: boolean;
  };
};

export type ActiveManagerQueueResult = {
  activeQueue: ActiveManagerQueueItem[];
  archivedCount: number;
  blockedCount: number;
};

export async function buildActiveManagerQueue(
  creatorId: string,
  prisma: PrismaClient
): Promise<ActiveManagerQueueResult> {
  const queueRaw = await buildManagerQueueForCreator(creatorId, prisma);
  const uniqueQueue: FanManagerRow[] = [];
  const seen = new Set<string>();

  queueRaw.forEach((item) => {
    if (!item?.id) return;
    if (seen.has(item.id)) return;
    seen.add(item.id);
    uniqueQueue.push(item);
  });

  if (uniqueQueue.length === 0) {
    return { activeQueue: [], archivedCount: 0, blockedCount: 0 };
  }

  const statusRows = await prisma.fan.findMany({
    where: { id: { in: uniqueQueue.map((item) => item.id) } },
    select: { id: true, isArchived: true, isBlocked: true, inviteCreatedAt: true, inviteUsedAt: true },
  });
  const statusMap = new Map<
    string,
    { isArchived: boolean; isBlocked: boolean; inviteCreatedAt: Date | null; inviteUsedAt: Date | null }
  >();
  statusRows.forEach((row) => {
    statusMap.set(row.id, {
      isArchived: row.isArchived === true,
      isBlocked: row.isBlocked === true,
      inviteCreatedAt: row.inviteCreatedAt ?? null,
      inviteUsedAt: row.inviteUsedAt ?? null,
    });
  });

  const activeQueue: ActiveManagerQueueItem[] = [];
  let archivedCount = 0;
  let blockedCount = 0;
  const now = new Date();

  uniqueQueue.forEach((item) => {
    const status = statusMap.get(item.id);
    if (!status) return;
    if (status.isArchived) {
      archivedCount += 1;
      return;
    }
    if (status.isBlocked) {
      blockedCount += 1;
      return;
    }
    const isNew30d = isNewWithinDays(
      { id: item.id, inviteCreatedAt: status.inviteCreatedAt, inviteUsedAt: status.inviteUsedAt },
      30,
      now
    );
    activeQueue.push({ ...item, flags: { isNew30d } });
  });

  return { activeQueue, archivedCount, blockedCount };
}
