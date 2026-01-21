import prisma from "./prisma.server";

export async function getPublicProfileStats(creatorId: string) {
  const now = new Date();

  const [grants, commentsCount, popclipsCount, storiesCount, ratingsCount] = await Promise.all([
    prisma.accessGrant.findMany({
      where: {
        fan: { creatorId },
        expiresAt: { gt: now },
      },
      select: { fanId: true },
    }),
    prisma.popClipComment.count({
      where: {
        popClip: {
          creatorId,
          isActive: true,
          isArchived: false,
        },
      },
    }),
    prisma.popClip.count({
      where: {
        creatorId,
        isActive: true,
        isArchived: false,
        isStory: false,
      },
    }),
    prisma.popClip.count({
      where: {
        creatorId,
        isActive: true,
        isArchived: false,
        isStory: true,
      },
    }),
    prisma.discoveryFeedback.count({ where: { creatorId } }),
  ]);

  const activeMembers = new Set(grants.map((g) => g.fanId)).size;
  const contentCount = popclipsCount + storiesCount;

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

  return { activeMembers, ...stats, commentsCount, storiesCount, popclipsCount, contentCount, ratingsCount };
}
