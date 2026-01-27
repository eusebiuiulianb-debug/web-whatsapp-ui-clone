-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreatorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "offerTags" JSONB,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "coverUrl" TEXT,
    "websiteUrl" TEXT,
    "visibilityMode" TEXT NOT NULL DEFAULT 'SOLO_LINK',
    "locationVisibility" TEXT NOT NULL DEFAULT 'OFF',
    "locationLabel" TEXT,
    "locationPlaceId" TEXT,
    "locationGeohash" TEXT,
    "locationRadiusKm" INTEGER,
    "locationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "locationLat" REAL,
    "locationLng" REAL,
    "locationPrecisionKm" INTEGER NOT NULL DEFAULT 3,
    "allowDiscoveryUseLocation" BOOLEAN NOT NULL DEFAULT false,
    "responseSla" TEXT NOT NULL DEFAULT 'LT_24H',
    "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "vipOnly" BOOLEAN NOT NULL DEFAULT false,
    "popclipPreviewLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreatorProfile" ("allowDiscoveryUseLocation", "availability", "coverUrl", "createdAt", "creatorId", "id", "isVerified", "locationEnabled", "locationGeohash", "locationLabel", "locationLat", "locationLng", "locationPlaceId", "locationPrecisionKm", "locationRadiusKm", "locationVisibility", "offerTags", "plan", "responseSla", "updatedAt", "vipOnly", "visibilityMode", "websiteUrl") SELECT "allowDiscoveryUseLocation", "availability", "coverUrl", "createdAt", "creatorId", "id", "isVerified", "locationEnabled", "locationGeohash", "locationLabel", "locationLat", "locationLng", "locationPlaceId", "locationPrecisionKm", "locationRadiusKm", "locationVisibility", "offerTags", "plan", "responseSla", "updatedAt", "vipOnly", "visibilityMode", "websiteUrl" FROM "CreatorProfile";
DROP TABLE "CreatorProfile";
ALTER TABLE "new_CreatorProfile" RENAME TO "CreatorProfile";
CREATE UNIQUE INDEX "CreatorProfile_creatorId_key" ON "CreatorProfile"("creatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
