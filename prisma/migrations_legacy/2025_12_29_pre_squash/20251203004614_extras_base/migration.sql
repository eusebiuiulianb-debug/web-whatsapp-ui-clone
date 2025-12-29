-- CreateTable
CREATE TABLE "ExtraPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sessionTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtraPurchase_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExtraPurchase_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "pack" TEXT NOT NULL DEFAULT 'WELCOME',
    "slug" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "mediaPath" TEXT,
    "durationSec" INTEGER,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'INCLUDED_MONTHLY',
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "extraTier" TEXT,
    "timeOfDay" TEXT NOT NULL DEFAULT 'ANY',
    "externalUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ContentItem" ("createdAt", "creatorId", "description", "durationSec", "externalUrl", "id", "isPreview", "mediaPath", "order", "pack", "slug", "title", "type", "updatedAt", "visibility") SELECT "createdAt", "creatorId", "description", "durationSec", "externalUrl", "id", "isPreview", "mediaPath", "order", "pack", "slug", "title", "type", "updatedAt", "visibility" FROM "ContentItem";
DROP TABLE "ContentItem";
ALTER TABLE "new_ContentItem" RENAME TO "ContentItem";
CREATE INDEX "ContentItem_pack_order_idx" ON "ContentItem"("pack", "order");
CREATE UNIQUE INDEX "ContentItem_creatorId_slug_key" ON "ContentItem"("creatorId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
