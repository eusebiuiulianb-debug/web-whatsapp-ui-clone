export const PUBLIC_CREATOR_PROFILE_SELECT = {
  availability: true,
  responseSla: true,
  allowDiscoveryUseLocation: true,
  locationVisibility: true,
  locationLabel: true,
  locationGeohash: true,
  locationRadiusKm: true,
  isVerified: true,
  plan: true,
} as const;

export const PUBLIC_CREATOR_SELECT = {
  id: true,
  name: true,
  bioLinkAvatarUrl: true,
  isVerified: true,
  profile: {
    select: PUBLIC_CREATOR_PROFILE_SELECT,
  },
} as const;
