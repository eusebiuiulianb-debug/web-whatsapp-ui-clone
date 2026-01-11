-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "uiLocale" TEXT NOT NULL DEFAULT 'es';

-- AlterTable
ALTER TABLE "Fan" ADD COLUMN "locale" TEXT;
