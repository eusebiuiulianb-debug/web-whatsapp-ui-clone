export type DiscoveryRecommendation = {
  creatorId: string;
  displayName: string;
  avatarUrl?: string | null;
  priceRange?: string;
  responseHours?: number | null;
  reasons: string[];
  handle: string;
  country?: string | null;
  cityApprox?: string | null;
};
