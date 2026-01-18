-- CreateTable
CREATE TABLE "UTMLink" (
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
    CONSTRAINT "UTMLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UTMLink_creatorId_createdAt_idx" ON "UTMLink"("creatorId", "createdAt");
