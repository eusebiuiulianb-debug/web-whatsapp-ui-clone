/*
  Warnings:

  - Added the required column `updatedAt` to the `AccessRequest` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "CreatorFanBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorFanBlock_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreatorFanBlock_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccessRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "conversationId" TEXT,
    "productId" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "resolvedByCreatorId" TEXT,
    CONSTRAINT "AccessRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessRequest_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AccessRequest" ("createdAt", "creatorId", "fanId", "id", "message", "productId", "resolvedAt", "status") SELECT "createdAt", "creatorId", "fanId", "id", "message", "productId", "resolvedAt", "status" FROM "AccessRequest";
DROP TABLE "AccessRequest";
ALTER TABLE "new_AccessRequest" RENAME TO "AccessRequest";
CREATE INDEX "AccessRequest_creatorId_status_createdAt_idx" ON "AccessRequest"("creatorId", "status", "createdAt");
CREATE INDEX "AccessRequest_fanId_status_createdAt_idx" ON "AccessRequest"("fanId", "status", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CreatorFanBlock_creatorId_createdAt_idx" ON "CreatorFanBlock"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "CreatorFanBlock_fanId_createdAt_idx" ON "CreatorFanBlock"("fanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorFanBlock_creatorId_fanId_key" ON "CreatorFanBlock"("creatorId", "fanId");
