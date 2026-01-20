/*
  Warnings:

  - A unique constraint covering the columns `[ppvMessageId,fanId]` on the table `PpvPurchase` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "PpvPurchase_ppvMessageId_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PpvPurchase_ppvMessageId_fanId_key" ON "PpvPurchase"("ppvMessageId", "fanId");
