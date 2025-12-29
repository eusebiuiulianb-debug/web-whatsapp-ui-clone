-- CreateTable
CREATE TABLE "PopClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "title" TEXT,
    "videoUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "durationSec" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PopClip_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PopClip_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PopClip_creatorId_isActive_sortOrder_idx" ON "PopClip"("creatorId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PopClip_creatorId_catalogItemId_key" ON "PopClip"("creatorId", "catalogItemId");
