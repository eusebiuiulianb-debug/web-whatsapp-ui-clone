import prisma from "./prisma.server";

export async function getPublicProfileStats(creatorId: string) {
  const now = new Date();

  const [grants, salesCount, ratingsCount] = await Promise.all([
    prisma.accessGrant.findMany({
      where: {
        fan: { creatorId },
        expiresAt: { gt: now },
      },
      select: { fanId: true },
    }),
    prisma.walletTransaction.count({
      where: {
        kind: { in: ["PACK_PURCHASE", "EXTRA_PURCHASE", "PPV_PURCHASE"] },
        wallet: { fan: { creatorId } },
      },
    }),
    prisma.discoveryFeedback.count({ where: { creatorId } }),
  ]);

  const activeMembers = new Set(grants.map((g) => g.fanId)).size;

  const contentItems = await prisma.contentItem.findMany({
    where: { creatorId },
    select: { type: true },
  });

  const stats = contentItems.reduce<{ images: number; videos: number; audios: number }>((acc, item) => {
    if (item.type === "IMAGE") acc.images += 1;
    if (item.type === "VIDEO") acc.videos += 1;
    if (item.type === "AUDIO") acc.audios += 1;
    return acc;
  }, { images: 0, videos: 0, audios: 0 });

  return { activeMembers, ...stats, salesCount, ratingsCount };
}
