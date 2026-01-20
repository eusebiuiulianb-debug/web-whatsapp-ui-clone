-- CreateTable
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "fanId" TEXT,
    "ip" TEXT,
    "endpoint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RateLimitEvent_key_createdAt_idx" ON "RateLimitEvent"("key", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitEvent_fanId_createdAt_idx" ON "RateLimitEvent"("fanId", "createdAt");
