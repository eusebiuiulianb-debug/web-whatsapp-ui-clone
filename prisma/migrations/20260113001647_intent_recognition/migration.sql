/*
  Warnings:

  - You are about to alter the column `intentMeta` on the `Message` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "intentKey" TEXT,
    "intentConfidence" REAL,
    "intentMeta" JSONB,
    "intentUpdatedAt" DATETIME,
    "intentJson" JSONB,
    "voiceAnalysisJson" TEXT,
    "voiceAnalysisUpdatedAt" DATETIME,
    CONSTRAINT "Message_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("audience", "audioDurationMs", "audioMime", "audioSizeBytes", "audioUrl", "contentItemId", "creatorTranslatedText", "deliveredText", "fanId", "from", "id", "intentConfidence", "intentJson", "intentKey", "intentMeta", "intentUpdatedAt", "isLastFromCreator", "stickerId", "text", "time", "transcribedAt", "transcriptError", "transcriptLang", "transcriptStatus", "transcriptText", "type", "voiceAnalysisJson", "voiceAnalysisUpdatedAt") SELECT "audience", "audioDurationMs", "audioMime", "audioSizeBytes", "audioUrl", "contentItemId", "creatorTranslatedText", "deliveredText", "fanId", "from", "id", "intentConfidence", "intentJson", "intentKey", "intentMeta", "intentUpdatedAt", "isLastFromCreator", "stickerId", "text", "time", "transcribedAt", "transcriptError", "transcriptLang", "transcriptStatus", "transcriptText", "type", "voiceAnalysisJson", "voiceAnalysisUpdatedAt" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
