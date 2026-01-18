/*
  Warnings:

  - A unique constraint covering the columns `[ppvMessageId]` on the table `PpvPurchase` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PpvPurchase_ppvMessageId_fanId_key";

-- CreateIndex
CREATE UNIQUE INDEX "PpvPurchase_ppvMessageId_key" ON "PpvPurchase"("ppvMessageId");
