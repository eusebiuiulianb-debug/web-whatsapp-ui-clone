-- CreateTable
CREATE TABLE "CreatorAiSettings" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorAiSettings_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
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
    CONSTRAINT "AiUsageLog_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiUsageLog_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorAiSettings_creatorId_key" ON "CreatorAiSettings"("creatorId");
