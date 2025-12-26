-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FanFollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "doneAt" DATETIME,
    CONSTRAINT "FanFollowUp_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FanFollowUp_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FanFollowUp" ("createdAt", "creatorId", "doneAt", "dueAt", "fanId", "id", "note", "status", "title", "updatedAt") SELECT "createdAt", "creatorId", "doneAt", "dueAt", "fanId", "id", "note", "status", "title", "updatedAt" FROM "FanFollowUp";
DROP TABLE "FanFollowUp";
ALTER TABLE "new_FanFollowUp" RENAME TO "FanFollowUp";
CREATE INDEX "FanFollowUp_fanId_creatorId_status_idx" ON "FanFollowUp"("fanId", "creatorId", "status");
CREATE INDEX "FanFollowUp_creatorId_status_dueAt_idx" ON "FanFollowUp"("creatorId", "status", "dueAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
