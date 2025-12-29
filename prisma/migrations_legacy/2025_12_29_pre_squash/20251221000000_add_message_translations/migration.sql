-- AlterTable
ALTER TABLE "Fan" ADD COLUMN "preferredLanguage" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "deliveredText" TEXT;
ALTER TABLE "Message" ADD COLUMN "creatorTranslatedText" TEXT;
