-- AlterTable
ALTER TABLE "CreatorAiSettings" ADD COLUMN "voiceTranscriptionDailyBudgetUsd" REAL NOT NULL DEFAULT 0.5;
ALTER TABLE "CreatorAiSettings" ADD COLUMN "voiceTranscriptionExtractIntentTags" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreatorAiSettings" ADD COLUMN "voiceTranscriptionSuggestReply" BOOLEAN NOT NULL DEFAULT false;

UPDATE "CreatorAiSettings"
SET "voiceTranscriptionExtractIntentTags" = "voiceIntentTagsEnabled"
WHERE "voiceIntentTagsEnabled" IS NOT NULL;

UPDATE "CreatorAiSettings"
SET "voiceTranscriptionMinSeconds" = 8
WHERE "voiceTranscriptionMinSeconds" IS NULL OR "voiceTranscriptionMinSeconds" < 1;

UPDATE "CreatorAiSettings"
SET "voiceTranscriptionMode" = 'MANUAL'
WHERE "voiceTranscriptionMode" IS NULL OR "voiceTranscriptionMode" = '' OR "voiceTranscriptionMode" = 'OFF';
