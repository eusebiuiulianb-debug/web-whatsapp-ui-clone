-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreatorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "coverUrl" TEXT,
    "visibilityMode" TEXT NOT NULL DEFAULT 'SOLO_LINK',
    "locationVisibility" TEXT NOT NULL DEFAULT 'OFF',
    "locationLabel" TEXT,
    "locationGeohash" TEXT,
    "locationRadiusKm" INTEGER,
    "allowDiscoveryUseLocation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreatorProfile" ("allowDiscoveryUseLocation", "coverUrl", "createdAt", "creatorId", "id", "locationGeohash", "locationLabel", "locationRadiusKm", "locationVisibility", "updatedAt") SELECT "allowDiscoveryUseLocation", "coverUrl", "createdAt", "creatorId", "id", "locationGeohash", "locationLabel", "locationRadiusKm", "locationVisibility", "updatedAt" FROM "CreatorProfile";
DROP TABLE "CreatorProfile";
ALTER TABLE "new_CreatorProfile" RENAME TO "CreatorProfile";
CREATE UNIQUE INDEX "CreatorProfile_creatorId_key" ON "CreatorProfile"("creatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
