export type PublicProfileMode = "coach" | "fanclub";

export type PublicProfileCopy = {
  mode: PublicProfileMode;
  hero: {
    tagline: string;
    description: string;
    chips: { label: string; visible: boolean }[];
    coverImageUrl?: string | null;
    showWhatInside: boolean;
    whatInsideTitle: string;
    whatInsideBullets: string[];
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
    showStats: boolean;
  };
  recommendedPackId: "welcome" | "monthly" | "special";
  packs: Array<{
    id: "welcome" | "monthly" | "special";
    title: string;
    badge: string;
    price: string;
    bullets: string[];
    ctaLabel: string;
    visible: boolean;
  }>;
  freebiesSectionVisible: boolean;
  freebies: Array<{ id: string; title: string; description: string; ctaLabel: string; visible: boolean; link?: string | null }>;
  faqSectionVisible: boolean;
  faq: Array<{ id: string; question: string; answer: string }>;
};

export type PublicProfileStats = {
  activeMembers: number;
  images: number;
  videos: number;
  audios: number;
  salesCount?: number;
  ratingsCount?: number;
};

export type PublicCatalogItemType = "EXTRA" | "BUNDLE" | "PACK";

export type PublicCatalogItem = {
  id: string;
  type: PublicCatalogItemType;
  title: string;
  description?: string | null;
  priceCents: number;
  currency: string;
  includes: string[];
  isActive: boolean;
};

export type PublicPopClip = {
  id: string;
  title?: string | null;
  videoUrl: string;
  posterUrl?: string | null;
  startAtSec?: number | null;
  durationSec?: number | null;
  sortOrder?: number;
  createdAt?: string;
  likeCount?: number;
  commentCount?: number;
  liked?: boolean;
  canInteract?: boolean;
  isStory?: boolean;
  pack: {
    id: string;
    title: string;
    description?: string | null;
    priceCents: number;
    currency: string;
    type: PublicCatalogItemType;
    slug?: string;
    route?: string;
    coverUrl?: string | null;
  };
};
