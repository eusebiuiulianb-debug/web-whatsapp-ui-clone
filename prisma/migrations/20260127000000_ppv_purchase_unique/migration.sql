-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PpvPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ppvMessageId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PpvPurchase_ppvMessageId_fkey" FOREIGN KEY ("ppvMessageId") REFERENCES "PpvMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PpvPurchase_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PpvPurchase_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PpvPurchase" ("amountCents", "createdAt", "creatorId", "currency", "fanId", "id", "ppvMessageId", "status")
SELECT "amountCents", "createdAt", "creatorId", "currency", "fanId", "id", "ppvMessageId", "status" FROM "PpvPurchase";
DROP TABLE "PpvPurchase";
ALTER TABLE "new_PpvPurchase" RENAME TO "PpvPurchase";
CREATE UNIQUE INDEX "PpvPurchase_ppvMessageId_fanId_key" ON "PpvPurchase"("ppvMessageId", "fanId");
CREATE INDEX "PpvPurchase_fanId_createdAt_idx" ON "PpvPurchase"("fanId", "createdAt");
CREATE INDEX "PpvPurchase_creatorId_createdAt_idx" ON "PpvPurchase"("creatorId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
