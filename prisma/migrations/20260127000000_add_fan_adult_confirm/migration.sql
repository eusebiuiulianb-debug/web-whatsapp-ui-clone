-- Add fan adult confirmation fields
ALTER TABLE "Fan" ADD COLUMN "adultConfirmedAt" DATETIME;
ALTER TABLE "Fan" ADD COLUMN "adultConfirmVersion" TEXT;
