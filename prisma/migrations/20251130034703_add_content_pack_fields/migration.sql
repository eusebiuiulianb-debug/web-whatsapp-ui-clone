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
    "externalUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ContentItem" ("createdAt", "creatorId", "externalUrl", "id", "title", "type", "updatedAt", "visibility") SELECT "createdAt", "creatorId", "externalUrl", "id", "title", "type", "updatedAt", "visibility" FROM "ContentItem";
DROP TABLE "ContentItem";
ALTER TABLE "new_ContentItem" RENAME TO "ContentItem";
CREATE INDEX "ContentItem_pack_order_idx" ON "ContentItem"("pack", "order");
CREATE UNIQUE INDEX "ContentItem_creatorId_slug_key" ON "ContentItem"("creatorId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
