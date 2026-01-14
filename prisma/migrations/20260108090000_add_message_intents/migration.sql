-- Add intent fields to Message
ALTER TABLE "Message" ADD COLUMN "intentKey" TEXT;
ALTER TABLE "Message" ADD COLUMN "intentConfidence" REAL;
ALTER TABLE "Message" ADD COLUMN "intentMeta" JSON;
ALTER TABLE "Message" ADD COLUMN "intentUpdatedAt" DATETIME;
