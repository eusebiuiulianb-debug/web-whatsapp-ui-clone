import prisma from "./prisma";

export async function getPublicProfileStats(creatorId: string) {
  const now = new Date();

  const grants = await prisma.accessGrant.findMany({
    where: {
      fan: { creatorId },
      expiresAt: { gt: now },
    },
    select: { fanId: true },
  });

  const activeMembers = new Set(grants.map((g) => g.fanId)).size;

  const contentItems = await prisma.contentItem.findMany({
    where: { creatorId },
    select: { type: true },
  });

  const stats = contentItems.reduce(
    (acc, item) => {
      if (item.type === "IMAGE") acc.images += 1;
      if (item.type === "VIDEO") acc.videos += 1;
      if (item.type === "AUDIO") acc.audios += 1;
      return acc;
    },
    { images: 0, videos: 0, audios: 0 }
  );

  return { activeMembers, ...stats };
}
