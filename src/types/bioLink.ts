import type { CreatorLocation } from "./creatorLocation";

export type BioLinkSecondaryLink = {
  label: string;
  url: string;
  iconKey?: "tiktok" | "instagram" | "twitter" | "custom";
};

export type BioLinkConfig = {
  enabled: boolean;
  title: string;
  tagline: string;
  description?: string;
  avatarUrl?: string | null;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryLinks: BioLinkSecondaryLink[];
  handle: string;
  chips?: string[];
  faq?: string[];
  creatorId?: string;
  location?: CreatorLocation | null;
};
