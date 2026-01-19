-- DropIndex
DROP INDEX IF EXISTS "ExtraPurchase_clientTxnId_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExtraPurchase_fanId_kind_clientTxnId_key" ON "ExtraPurchase"("fanId", "kind", "clientTxnId");
