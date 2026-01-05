-- AlterTable
ALTER TABLE "Fan" ADD COLUMN "lastCortexOutreachAt" DATETIME;
ALTER TABLE "Fan" ADD COLUMN "lastCortexOutreachKey" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExtraPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXTRA',
    "productId" TEXT,
    "productType" TEXT,
    "sessionTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ExtraPurchase_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExtraPurchase_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExtraPurchase" ("amount", "contentItemId", "createdAt", "fanId", "id", "kind", "productId", "productType", "sessionTag", "tier") SELECT "amount", "contentItemId", "createdAt", "fanId", "id", "kind", "productId", "productType", "sessionTag", "tier" FROM "ExtraPurchase";
DROP TABLE "ExtraPurchase";
ALTER TABLE "new_ExtraPurchase" RENAME TO "ExtraPurchase";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
