-- AlterTable
ALTER TABLE "ExtraPurchase" ADD COLUMN "clientTxnId" TEXT;

-- AlterTable
ALTER TABLE "Fan" ADD COLUMN "lastActivityAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "ExtraPurchase_clientTxnId_key" ON "ExtraPurchase"("clientTxnId");
