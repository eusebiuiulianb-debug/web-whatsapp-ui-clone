-- CreateTable
CREATE TABLE "PopClipReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "popClipId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PopClipReaction_popClipId_fkey" FOREIGN KEY ("popClipId") REFERENCES "PopClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PopClipReaction_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PopClipComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "popClipId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PopClipComment_popClipId_fkey" FOREIGN KEY ("popClipId") REFERENCES "PopClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PopClipComment_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PopClipReaction_popClipId_fanId_key" ON "PopClipReaction"("popClipId", "fanId");

-- CreateIndex
CREATE INDEX "PopClipReaction_fanId_idx" ON "PopClipReaction"("fanId");

-- CreateIndex
CREATE INDEX "PopClipComment_popClipId_createdAt_idx" ON "PopClipComment"("popClipId", "createdAt");
