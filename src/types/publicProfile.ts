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
};
