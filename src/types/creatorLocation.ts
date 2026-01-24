export type LocationVisibility = "OFF" | "COUNTRY" | "CITY" | "AREA";

export type CreatorLocation = {
  visibility: LocationVisibility;
  label: string | null;
  geohash: string | null;
  radiusKm: number | null;
  allowDiscoveryUseLocation: boolean;
  enabled?: boolean;
  lat?: number | null;
  lng?: number | null;
  precisionKm?: number | null;
  placeId?: string | null;
};
