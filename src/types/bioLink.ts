export type BioLinkSecondaryLink = {
  label: string;
  url: string;
  iconKey?: "tiktok" | "instagram" | "twitter" | "custom";
};

export type BioLinkConfig = {
  enabled: boolean;
  title: string;
  tagline: string;
  avatarUrl?: string | null;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryLinks: BioLinkSecondaryLink[];
  handle: string;
  chips?: string[];
  creatorId?: string;
};
