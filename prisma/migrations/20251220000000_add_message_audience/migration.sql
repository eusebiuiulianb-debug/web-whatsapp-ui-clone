-- AlterTable
ALTER TABLE "Message" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'FAN';

-- Backfill audience based on sender for existing rows.
UPDATE "Message"
SET "audience" = CASE
  WHEN lower("from") = 'fan' THEN 'FAN'
  WHEN lower("from") = 'creator' THEN 'CREATOR'
  ELSE 'INTERNAL'
END;
