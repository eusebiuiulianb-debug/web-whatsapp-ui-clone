import type { AgencyIntensity } from "../lib/agency/types";

export type OfferTier = "MICRO" | "STANDARD" | "PREMIUM" | "MONTHLY";

export type Offer = {
  id: string;
  code: string;
  title: string;
  tier: OfferTier;
  priceCents: number;
  currency: string;
  oneLiner: string;
  hooks: string[];
  ctas: string[];
  intensityMin: AgencyIntensity;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
