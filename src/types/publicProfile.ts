export type PublicProfileMode = "coach" | "fanclub";

export type PublicProfileCopy = {
  mode: PublicProfileMode;
  hero: {
    tagline: string;
    description: string;
    chips: string[];
  };
  recommendedPackId: "welcome" | "monthly" | "special";
  packs: Array<{
    id: "welcome" | "monthly" | "special";
    title: string;
    badge: string;
    price: string;
    bullets: string[];
    ctaLabel: string;
  }>;
  freebies: Array<{ id: string; title: string; description: string; ctaLabel: string }>;
  faq: Array<{ id: string; question: string; answer: string }>;
};
