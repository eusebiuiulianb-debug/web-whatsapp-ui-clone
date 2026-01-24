ALTER TABLE "CreatorProfile" ADD COLUMN "locationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreatorProfile" ADD COLUMN "locationPlaceId" TEXT;
ALTER TABLE "CreatorProfile" ADD COLUMN "locationLat" REAL;
ALTER TABLE "CreatorProfile" ADD COLUMN "locationLng" REAL;
ALTER TABLE "CreatorProfile" ADD COLUMN "locationPrecisionKm" INTEGER NOT NULL DEFAULT 3;
