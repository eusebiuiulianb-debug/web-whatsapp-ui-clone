-- CreateTable
CREATE TABLE "PpvMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PpvMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PpvMessage_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PpvMessage_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PpvPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ppvMessageId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PpvPurchase_ppvMessageId_fkey" FOREIGN KEY ("ppvMessageId") REFERENCES "PpvMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PpvPurchase_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PpvPurchase_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PpvMessage_messageId_key" ON "PpvMessage"("messageId");

-- CreateIndex
CREATE INDEX "PpvMessage_fanId_createdAt_idx" ON "PpvMessage"("fanId", "createdAt");

-- CreateIndex
CREATE INDEX "PpvMessage_creatorId_createdAt_idx" ON "PpvMessage"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PpvPurchase_ppvMessageId_key" ON "PpvPurchase"("ppvMessageId");

-- CreateIndex
CREATE INDEX "PpvPurchase_fanId_createdAt_idx" ON "PpvPurchase"("fanId", "createdAt");

-- CreateIndex
CREATE INDEX "PpvPurchase_creatorId_createdAt_idx" ON "PpvPurchase"("creatorId", "createdAt");
