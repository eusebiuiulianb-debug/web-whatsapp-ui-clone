import { getAccessSummary, type AccessSummary } from "./access";
import { buildAccessStateFromGrants } from "./accessState";
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
      const accessState = buildAccessStateFromGrants({
        accessGrants: fan.accessGrants,
        isNew: fan.isNew ?? false,
        now,
      });
      membershipStatus = accessState.membershipStatus;
      daysLeft = accessState.daysLeft;
      hasAccessHistory = accessState.hasAccessHistory;
      activeGrantTypes = accessState.activeGrantTypes;
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
