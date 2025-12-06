-- AlterTable
ALTER TABLE "CreatorAiTemplate" ADD COLUMN "mode" TEXT;
ALTER TABLE "CreatorAiTemplate" ADD COLUMN "tier" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiUsageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT,
    "actionType" TEXT NOT NULL,
    "contextSummary" TEXT,
    "suggestedText" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "finalText" TEXT,
    "creditsUsed" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnMode" TEXT NOT NULL DEFAULT 'HEATUP',
    CONSTRAINT "AiUsageLog_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiUsageLog_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AiUsageLog" ("actionType", "contextSummary", "createdAt", "creatorId", "creditsUsed", "fanId", "finalText", "id", "outcome", "suggestedText") SELECT "actionType", "contextSummary", "createdAt", "creatorId", "creditsUsed", "fanId", "finalText", "id", "outcome", "suggestedText" FROM "AiUsageLog";
DROP TABLE "AiUsageLog";
ALTER TABLE "new_AiUsageLog" RENAME TO "AiUsageLog";
CREATE TABLE "new_CreatorAiSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "creatorId" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'cercano',
    "spicinessLevel" INTEGER NOT NULL DEFAULT 1,
    "formalityLevel" INTEGER NOT NULL DEFAULT 1,
    "emojiUsage" INTEGER NOT NULL DEFAULT 1,
    "priorityOrderJson" JSONB,
    "forbiddenTopics" TEXT,
    "forbiddenPromises" TEXT,
    "rulesManifest" TEXT,
    "allowSuggestReplies" BOOLEAN NOT NULL DEFAULT true,
    "allowSuggestExtras" BOOLEAN NOT NULL DEFAULT true,
    "allowSuggestRenewals" BOOLEAN NOT NULL DEFAULT true,
    "allowAutoLowPriority" BOOLEAN NOT NULL DEFAULT false,
    "creditsAvailable" INTEGER NOT NULL DEFAULT 0,
    "hardLimitPerDay" INTEGER,
    "turnMode" TEXT NOT NULL DEFAULT 'HEATUP',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorAiSettings_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreatorAiSettings" ("allowAutoLowPriority", "allowSuggestExtras", "allowSuggestRenewals", "allowSuggestReplies", "createdAt", "creatorId", "creditsAvailable", "emojiUsage", "forbiddenPromises", "forbiddenTopics", "formalityLevel", "hardLimitPerDay", "id", "priorityOrderJson", "rulesManifest", "spicinessLevel", "tone", "updatedAt") SELECT "allowAutoLowPriority", "allowSuggestExtras", "allowSuggestRenewals", "allowSuggestReplies", "createdAt", "creatorId", "creditsAvailable", "emojiUsage", "forbiddenPromises", "forbiddenTopics", "formalityLevel", "hardLimitPerDay", "id", "priorityOrderJson", "rulesManifest", "spicinessLevel", "tone", "updatedAt" FROM "CreatorAiSettings";
DROP TABLE "CreatorAiSettings";
ALTER TABLE "new_CreatorAiSettings" RENAME TO "CreatorAiSettings";
CREATE UNIQUE INDEX "CreatorAiSettings_creatorId_key" ON "CreatorAiSettings"("creatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
