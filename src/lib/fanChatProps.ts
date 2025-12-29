import { getAccessSummary, type AccessSummary } from "./access";
import type { IncludedContent } from "./fanContent";

export type FanChatSSRProps = {
  includedContent: IncludedContent[];
  initialAccessSummary: AccessSummary;
};

export async function buildFanChatProps(fanId: string): Promise<FanChatSSRProps> {
  const prisma = (await import("./prisma.server")).default;
  const { getFanContents } = await import("./fanContent");
  const creatorId = "creator-1";
  const now = new Date();

  let membershipStatus: string | null = null;
  let daysLeft: number | null = null;
  let hasAccessHistory = false;
  let activeGrantTypes: string[] = [];

  if (fanId) {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      include: { accessGrants: true },
    });

    if (fan) {
      hasAccessHistory = fan.accessGrants.length > 0;

      const activeGrants = fan.accessGrants.filter((grant) => grant.expiresAt > now);
      activeGrantTypes = activeGrants.map((grant) => grant.type);

      const latestExpiry = activeGrants.reduce<Date | null>((acc, grant) => {
        if (!acc) return grant.expiresAt;
        return grant.expiresAt > acc ? grant.expiresAt : acc;
      }, null);

      daysLeft = latestExpiry
        ? Math.max(0, Math.ceil((latestExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : hasAccessHistory
        ? 0
        : null;

      if (activeGrants.length > 0) {
        membershipStatus = "active";
      } else if (hasAccessHistory) {
        membershipStatus = "expired";
      } else {
        membershipStatus = "none";
      }
    }
  }

  const accessSummary = getAccessSummary({
    membershipStatus,
    daysLeft,
    hasAccessHistory,
    activeGrantTypes,
  });

  const includedContent = await getFanContents(creatorId, accessSummary, activeGrantTypes);

  return {
    includedContent,
    initialAccessSummary: accessSummary,
  };
}
