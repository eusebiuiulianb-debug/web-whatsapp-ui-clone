-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "productId" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "AccessRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessRequest_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreatorComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "creatorReplyText" TEXT,
    "creatorReplyAt" DATETIME,
    "repliedByCreatorId" TEXT,
    "repliesLocked" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorComment_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreatorComment_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreatorComment" ("createdAt", "creatorId", "creatorReplyAt", "creatorReplyText", "fanId", "id", "isPublic", "rating", "repliedByCreatorId", "status", "text", "updatedAt") SELECT "createdAt", "creatorId", "creatorReplyAt", "creatorReplyText", "fanId", "id", "isPublic", "rating", "repliedByCreatorId", "status", "text", "updatedAt" FROM "CreatorComment";
DROP TABLE "CreatorComment";
ALTER TABLE "new_CreatorComment" RENAME TO "CreatorComment";
CREATE INDEX "CreatorComment_creatorId_createdAt_idx" ON "CreatorComment"("creatorId", "createdAt");
CREATE INDEX "CreatorComment_fanId_idx" ON "CreatorComment"("fanId");
CREATE UNIQUE INDEX "CreatorComment_creatorId_fanId_key" ON "CreatorComment"("creatorId", "fanId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AccessRequest_creatorId_status_createdAt_idx" ON "AccessRequest"("creatorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AccessRequest_fanId_status_createdAt_idx" ON "AccessRequest"("fanId", "status", "createdAt");
