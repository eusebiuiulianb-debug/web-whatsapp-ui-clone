import { AccessSummary } from "./access";
import prisma from "./prisma";

export type IncludedContent = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  visibility: string;
  mediaPath: string | null;
  externalUrl: string | null;
  pack: ContentPack;
  order: number;
};

type ContentPack = "WELCOME" | "MONTHLY" | "SPECIAL";

function resolveAllowedPacks(summary: AccessSummary | null, activeGrantTypes: string[]): ContentPack[] {
  if (!summary || summary.state !== "ACTIVE") return [];
  const normalizedTypes = activeGrantTypes.map((type) => type.toLowerCase());

  const hasMonthly = summary.hasActiveMonthly || normalizedTypes.includes("monthly");
  const hasTrial = summary.hasActiveTrial || normalizedTypes.includes("trial");
  const hasSpecial =
    summary.hasActiveSpecial ||
    normalizedTypes.includes("special") ||
    normalizedTypes.includes("individual") ||
    normalizedTypes.includes("single");

  const packs: ContentPack[] = [];

  if (hasMonthly) {
    packs.push("WELCOME", "MONTHLY");
    if (hasSpecial) packs.push("SPECIAL");
  } else if (hasTrial) {
    packs.push("WELCOME");
  } else if (hasSpecial) {
    packs.push("SPECIAL");
  }

  return Array.from(new Set(packs));
}

export async function getFanContents(
  creatorId: string,
  accessSummary: AccessSummary | null,
  activeGrantTypes: string[] = []
): Promise<IncludedContent[]> {
  if (!creatorId) return [];

  const allowedPacks = resolveAllowedPacks(accessSummary, activeGrantTypes);
  if (allowedPacks.length === 0) return [];

  const items = await prisma.contentItem.findMany({
    where: {
      creatorId,
      isPreview: false,
      visibility: "INCLUDED_MONTHLY",
      pack: { in: allowedPacks },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    visibility: item.visibility,
    mediaPath: item.mediaPath,
    externalUrl: item.externalUrl ?? null,
    pack: item.pack as ContentPack,
    order: item.order ?? 0,
  }));
}
