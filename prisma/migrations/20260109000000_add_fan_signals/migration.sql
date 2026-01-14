-- Add fan signal fields
ALTER TABLE "Fan" ADD COLUMN "lastIntentKey" TEXT;
ALTER TABLE "Fan" ADD COLUMN "lastIntentAt" DATETIME;
ALTER TABLE "Fan" ADD COLUMN "lastInboundAt" DATETIME;
ALTER TABLE "Fan" ADD COLUMN "signalsUpdatedAt" DATETIME;
ALTER TABLE "Fan" ADD COLUMN "lastIntentConfidence" REAL;
ALTER TABLE "Fan" ADD COLUMN "temperatureScore" REAL;
ALTER TABLE "Fan" ADD COLUMN "temperatureBucket" TEXT;
