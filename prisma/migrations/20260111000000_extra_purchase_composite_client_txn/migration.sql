-- DropIndex
DROP INDEX "ExtraPurchase_clientTxnId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ExtraPurchase_fanId_kind_clientTxnId_key" ON "ExtraPurchase"("fanId", "kind", "clientTxnId");
