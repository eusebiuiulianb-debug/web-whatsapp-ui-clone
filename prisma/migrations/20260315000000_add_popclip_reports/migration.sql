-- CreateTable
CREATE TABLE "PopClipReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "popClipId" TEXT NOT NULL,
    "fanId" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PopClipReport_popClipId_fkey" FOREIGN KEY ("popClipId") REFERENCES "PopClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PopClipReport_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PopClipReport_popClipId_fanId_key" ON "PopClipReport"("popClipId", "fanId");

-- CreateIndex
CREATE INDEX "PopClipReport_popClipId_idx" ON "PopClipReport"("popClipId");

-- CreateIndex
CREATE INDEX "PopClipReport_fanId_idx" ON "PopClipReport"("fanId");

-- CreateIndex
CREATE INDEX "PopClipReport_popClipId_createdAt_idx" ON "PopClipReport"("popClipId", "createdAt");
