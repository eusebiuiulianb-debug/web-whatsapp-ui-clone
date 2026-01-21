-- CreateTable
CREATE TABLE "CreatorComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorComment_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreatorComment_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CreatorComment_creatorId_createdAt_idx" ON "CreatorComment"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "CreatorComment_fanId_idx" ON "CreatorComment"("fanId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorComment_creatorId_fanId_key" ON "CreatorComment"("creatorId", "fanId");
