/*
  Warnings:

  - You are about to alter the column `intentJson` on the `Message` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.

*/
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
    "allowAutoLowPriority" BOOLEAN NOT NULL DEFAULT false,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorAiSettings_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreatorAiSettings" ("allowAutoLowPriority", "allowSuggestExtras", "allowSuggestRenewals", "allowSuggestReplies", "createdAt", "creatorId", "creditsAvailable", "emojiUsage", "forbiddenPromises", "forbiddenTopics", "formalityLevel", "hardLimitPerDay", "id", "platforms", "priorityOrderJson", "rulesManifest", "spicinessLevel", "tone", "turnMode", "updatedAt", "voiceIntentTagsEnabled", "voiceTranscriptionDailyBudgetMinutes", "voiceTranscriptionDailyBudgetUsd", "voiceTranscriptionExtractIntentTags", "voiceTranscriptionMinSeconds", "voiceTranscriptionMode", "voiceTranscriptionSuggestReply") SELECT "allowAutoLowPriority", "allowSuggestExtras", "allowSuggestRenewals", "allowSuggestReplies", "createdAt", "creatorId", "creditsAvailable", "emojiUsage", "forbiddenPromises", "forbiddenTopics", "formalityLevel", "hardLimitPerDay", "id", "platforms", "priorityOrderJson", "rulesManifest", "spicinessLevel", "tone", "turnMode", "updatedAt", "voiceIntentTagsEnabled", "voiceTranscriptionDailyBudgetMinutes", "voiceTranscriptionDailyBudgetUsd", "voiceTranscriptionExtractIntentTags", "voiceTranscriptionMinSeconds", "voiceTranscriptionMode", "voiceTranscriptionSuggestReply" FROM "CreatorAiSettings";
DROP TABLE "CreatorAiSettings";
ALTER TABLE "new_CreatorAiSettings" RENAME TO "CreatorAiSettings";
CREATE UNIQUE INDEX "CreatorAiSettings_creatorId_key" ON "CreatorAiSettings"("creatorId");
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'FAN',
    "text" TEXT NOT NULL,
    "deliveredText" TEXT,
    "creatorTranslatedText" TEXT,
    "time" TEXT,
    "isLastFromCreator" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "contentItemId" TEXT,
    "stickerId" TEXT,
    "audioUrl" TEXT,
    "audioDurationMs" INTEGER,
    "audioMime" TEXT,
    "audioSizeBytes" INTEGER,
    "transcriptText" TEXT,
    "transcriptStatus" TEXT NOT NULL DEFAULT 'OFF',
    "transcriptError" TEXT,
    "transcribedAt" DATETIME,
    "transcriptLang" TEXT,
    "intentJson" JSONB,
    CONSTRAINT "Message_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("audience", "audioDurationMs", "audioMime", "audioSizeBytes", "audioUrl", "contentItemId", "creatorTranslatedText", "deliveredText", "fanId", "from", "id", "intentJson", "isLastFromCreator", "stickerId", "text", "time", "transcribedAt", "transcriptError", "transcriptLang", "transcriptStatus", "transcriptText", "type") SELECT "audience", "audioDurationMs", "audioMime", "audioSizeBytes", "audioUrl", "contentItemId", "creatorTranslatedText", "deliveredText", "fanId", "from", "id", "intentJson", "isLastFromCreator", "stickerId", "text", "time", "transcribedAt", "transcriptError", "transcriptLang", "transcriptStatus", "transcriptText", "type" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
