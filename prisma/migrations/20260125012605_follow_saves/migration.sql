-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Follow_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Follow_fanId_createdAt_idx" ON "Follow"("fanId", "createdAt");

-- CreateIndex
CREATE INDEX "Follow_creatorId_createdAt_idx" ON "Follow"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_fanId_creatorId_key" ON "Follow"("fanId", "creatorId");
