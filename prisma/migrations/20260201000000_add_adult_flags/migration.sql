-- Add adult flags to creator profiles and popclips
ALTER TABLE "CreatorProfile" ADD COLUMN "isAdult" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "PopClip" ADD COLUMN "isSensitive" BOOLEAN NOT NULL DEFAULT 0;
