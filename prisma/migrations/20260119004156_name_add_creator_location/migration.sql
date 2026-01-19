/*
  Warnings:

  - A unique constraint covering the columns `[ppvMessageId]` on the table `PpvPurchase` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "PpvPurchase_ppvMessageId_fanId_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE IF NOT EXISTS "UTMLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "content" TEXT,
    "term" TEXT,
    "source" TEXT,
    "medium" TEXT NOT NULL DEFAULT 'social',
    "fullUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "new_UTMLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "content" TEXT,
    "term" TEXT,
    "source" TEXT,
    "medium" TEXT NOT NULL DEFAULT 'social',
    "fullUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UTMLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UTMLink" ("campaign", "content", "createdAt", "creatorId", "fullUrl", "id", "medium", "platform", "source", "term") SELECT "campaign", "content", "createdAt", "creatorId", "fullUrl", "id", "medium", "platform", "source", "term" FROM "UTMLink";
DROP TABLE "UTMLink";
ALTER TABLE "new_UTMLink" RENAME TO "UTMLink";
CREATE INDEX "UTMLink_creatorId_createdAt_idx" ON "UTMLink"("creatorId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PpvPurchase_ppvMessageId_key" ON "PpvPurchase"("ppvMessageId");
