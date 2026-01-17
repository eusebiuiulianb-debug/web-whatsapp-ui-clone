-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "allowExplicitAdultContent" BOOLEAN NOT NULL DEFAULT false,
    "allowAutoLowPriority" BOOLEAN NOT NULL DEFAULT false,
    "enableFanDraftPreview" BOOLEAN NOT NULL DEFAULT false,
    "voiceTranscriptionMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "voiceTranscriptionMinSeconds" INTEGER NOT NULL DEFAULT 8,
    "voiceTranscriptionDailyBudgetMinutes" INTEGER NOT NULL DEFAULT 15,
    "voiceTranscriptionDailyBudgetUsd" REAL NOT NULL DEFAULT 0.5,
    "voiceIntentTagsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "voiceTranscriptionExtractIntentTags" BOOLEAN NOT NULL DEFAULT false,
    "voiceTranscriptionSuggestReply" BOOLEAN NOT NULL DEFAULT false,
    "creditsAvailable" INTEGER NOT NULL DEFAULT 0,
    "hardLimitPerDay" INTEGER,
    "turnMode" TEXT NOT NULL DEFAULT 'HEATUP',
    "platforms" JSONB,
    "translateProvider" TEXT,
    "libretranslateUrl" TEXT,
    "libretranslateApiKeyEnc" TEXT,
    "deeplApiUrl" TEXT,
    "deeplApiKeyEnc" TEXT,
    "cortexProvider" TEXT,
    "cortexBaseUrl" TEXT,
    "cortexModel" TEXT,
    "cortexApiKeyEnc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorAiSettings_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreatorAiSettings" ("allowAutoLowPriority", "allowExplicitAdultContent", "allowSuggestExtras", "allowSuggestRenewals", "allowSuggestReplies", "cortexApiKeyEnc", "cortexBaseUrl", "cortexModel", "cortexProvider", "createdAt", "creatorId", "creditsAvailable", "deeplApiKeyEnc", "deeplApiUrl", "emojiUsage", "forbiddenPromises", "forbiddenTopics", "formalityLevel", "hardLimitPerDay", "id", "libretranslateApiKeyEnc", "libretranslateUrl", "platforms", "priorityOrderJson", "rulesManifest", "spicinessLevel", "tone", "translateProvider", "turnMode", "updatedAt", "voiceIntentTagsEnabled", "voiceTranscriptionDailyBudgetMinutes", "voiceTranscriptionDailyBudgetUsd", "voiceTranscriptionExtractIntentTags", "voiceTranscriptionMinSeconds", "voiceTranscriptionMode", "voiceTranscriptionSuggestReply") SELECT "allowAutoLowPriority", "allowExplicitAdultContent", "allowSuggestExtras", "allowSuggestRenewals", "allowSuggestReplies", "cortexApiKeyEnc", "cortexBaseUrl", "cortexModel", "cortexProvider", "createdAt", "creatorId", "creditsAvailable", "deeplApiKeyEnc", "deeplApiUrl", "emojiUsage", "forbiddenPromises", "forbiddenTopics", "formalityLevel", "hardLimitPerDay", "id", "libretranslateApiKeyEnc", "libretranslateUrl", "platforms", "priorityOrderJson", "rulesManifest", "spicinessLevel", "tone", "translateProvider", "turnMode", "updatedAt", "voiceIntentTagsEnabled", "voiceTranscriptionDailyBudgetMinutes", "voiceTranscriptionDailyBudgetUsd", "voiceTranscriptionExtractIntentTags", "voiceTranscriptionMinSeconds", "voiceTranscriptionMode", "voiceTranscriptionSuggestReply" FROM "CreatorAiSettings";
DROP TABLE "CreatorAiSettings";
ALTER TABLE "new_CreatorAiSettings" RENAME TO "CreatorAiSettings";
CREATE UNIQUE INDEX "CreatorAiSettings_creatorId_key" ON "CreatorAiSettings"("creatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
