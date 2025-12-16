import type { JsonValue } from "@prisma/client/runtime/library";

export const CREATOR_PLATFORM_KEYS = ["tiktok", "instagram", "youtube", "x"] as const;

export type CreatorPlatformKey = (typeof CREATOR_PLATFORM_KEYS)[number];

export type CreatorPlatformConfig = {
  enabled: boolean;
  handle: string;
};

export type CreatorPlatforms = Record<CreatorPlatformKey, CreatorPlatformConfig>;

const DEFAULT_PLATFORMS: CreatorPlatforms = {
  tiktok: { enabled: false, handle: "" },
  instagram: { enabled: false, handle: "" },
  youtube: { enabled: false, handle: "" },
  x: { enabled: false, handle: "" },
};

export function createDefaultCreatorPlatforms(): CreatorPlatforms {
  return {
    tiktok: { enabled: false, handle: "" },
    instagram: { enabled: false, handle: "" },
    youtube: { enabled: false, handle: "" },
    x: { enabled: false, handle: "" },
  };
}

export function normalizeCreatorPlatforms(raw: unknown): CreatorPlatforms {
  const base = createDefaultCreatorPlatforms();
  if (!raw || typeof raw !== "object") return base;

  const data = raw as Record<string, any>;
  CREATOR_PLATFORM_KEYS.forEach((key) => {
    const item = data[key];
    const enabled = typeof item?.enabled === "boolean" ? item.enabled : Boolean(item?.enabled);
    const handle = typeof item?.handle === "string" ? item.handle.trim() : "";
    base[key] = { enabled, handle };
  });
  return base;
}

export function creatorPlatformsToJsonValue(platforms: CreatorPlatforms | null | undefined): JsonValue {
  return (platforms ?? DEFAULT_PLATFORMS) as unknown as JsonValue;
}

export function getEnabledPlatforms(platforms: CreatorPlatforms | null | undefined): CreatorPlatformKey[] {
  if (!platforms) return [];
  return CREATOR_PLATFORM_KEYS.filter((key) => Boolean(platforms[key]?.enabled));
}

export function formatPlatformLabel(key: CreatorPlatformKey): string {
  if (key === "tiktok") return "TikTok";
  if (key === "instagram") return "Instagram";
  if (key === "youtube") return "YouTube";
  return "X";
}
