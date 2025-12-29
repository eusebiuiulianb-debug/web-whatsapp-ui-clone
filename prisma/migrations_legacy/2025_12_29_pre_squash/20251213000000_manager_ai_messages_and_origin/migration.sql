-- CreateTable
CREATE TABLE "ManagerAiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagerAiMessage_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'FAN_ASSISTANT',
    "origin" TEXT NOT NULL DEFAULT 'FAN_ASSISTANT',
    "creditsUsed" INTEGER NOT NULL DEFAULT 1,
    "context" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnMode" TEXT NOT NULL DEFAULT 'HEATUP',
    "actionType" TEXT,
    "contextSummary" TEXT,
    "suggestedText" TEXT,
    "outcome" TEXT,
    "finalText" TEXT,
    CONSTRAINT "AiUsageLog_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiUsageLog_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AiUsageLog" ("actionType", "contextSummary", "createdAt", "creatorId", "creditsUsed", "fanId", "finalText", "id", "outcome", "suggestedText", "turnMode") SELECT "actionType", "contextSummary", "createdAt", "creatorId", "creditsUsed", "fanId", "finalText", "id", "outcome", "suggestedText", "turnMode" FROM "AiUsageLog";
DROP TABLE "AiUsageLog";
ALTER TABLE "new_AiUsageLog" RENAME TO "AiUsageLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ManagerAiMessage_creatorId_tab_createdAt_idx" ON "ManagerAiMessage"("creatorId", "tab", "createdAt");

