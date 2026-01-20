-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PopClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "contentItemId" TEXT,
    "title" TEXT,
    "videoUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "startAtSec" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,
    "videoWidth" INTEGER,
    "videoHeight" INTEGER,
    "videoSizeBytes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PopClip_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PopClip_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PopClip_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PopClip" ("catalogItemId", "contentItemId", "createdAt", "creatorId", "durationSec", "id", "isActive", "posterUrl", "sortOrder", "startAtSec", "title", "updatedAt", "videoUrl") SELECT "catalogItemId", "contentItemId", "createdAt", "creatorId", "durationSec", "id", "isActive", "posterUrl", "sortOrder", "startAtSec", "title", "updatedAt", "videoUrl" FROM "PopClip";
DROP TABLE "PopClip";
ALTER TABLE "new_PopClip" RENAME TO "PopClip";
CREATE INDEX "PopClip_creatorId_isActive_sortOrder_idx" ON "PopClip"("creatorId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "PopClip_creatorId_catalogItemId_key" ON "PopClip"("creatorId", "catalogItemId");
CREATE UNIQUE INDEX "PopClip_creatorId_contentItemId_key" ON "PopClip"("creatorId", "contentItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
