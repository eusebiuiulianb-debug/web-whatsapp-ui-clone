-- AlterTable
ALTER TABLE "PpvMessage" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "PpvMessage" ADD COLUMN "soldAt" DATETIME;
ALTER TABLE "PpvMessage" ADD COLUMN "purchaseId" TEXT;

-- Backfill existing purchases
UPDATE "PpvMessage"
SET "status" = 'SOLD',
    "soldAt" = (
        SELECT "createdAt"
        FROM "PpvPurchase"
        WHERE "PpvPurchase"."ppvMessageId" = "PpvMessage"."id"
    ),
    "purchaseId" = (
        SELECT "id"
        FROM "PpvPurchase"
        WHERE "PpvPurchase"."ppvMessageId" = "PpvMessage"."id"
    )
WHERE EXISTS (
    SELECT 1
    FROM "PpvPurchase"
    WHERE "PpvPurchase"."ppvMessageId" = "PpvMessage"."id"
);
