-- AlterTable
ALTER TABLE "CreatorProfile" ADD COLUMN "locationVisibility" TEXT NOT NULL DEFAULT 'OFF';
ALTER TABLE "CreatorProfile" ADD COLUMN "locationLabel" TEXT;
ALTER TABLE "CreatorProfile" ADD COLUMN "locationGeohash" TEXT;
ALTER TABLE "CreatorProfile" ADD COLUMN "locationRadiusKm" INTEGER;
ALTER TABLE "CreatorProfile" ADD COLUMN "allowDiscoveryUseLocation" BOOLEAN NOT NULL DEFAULT false;
