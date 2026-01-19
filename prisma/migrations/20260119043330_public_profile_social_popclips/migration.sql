/*
  Warnings:

  - You are about to drop the column `allowDiscoveryUseLocation` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `locationGeohash` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `locationLabel` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `locationRadiusKm` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `locationVisibility` on the `CreatorProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[ppvMessageId]` on the table `PpvPurchase` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PpvPurchase_ppvMessageId_fanId_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreatorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "coverUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreatorProfile" ("coverUrl", "createdAt", "creatorId", "id", "updatedAt") SELECT "coverUrl", "createdAt", "creatorId", "id", "updatedAt" FROM "CreatorProfile";
DROP TABLE "CreatorProfile";
ALTER TABLE "new_CreatorProfile" RENAME TO "CreatorProfile";
CREATE UNIQUE INDEX "CreatorProfile_creatorId_key" ON "CreatorProfile"("creatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PpvPurchase_ppvMessageId_key" ON "PpvPurchase"("ppvMessageId");
