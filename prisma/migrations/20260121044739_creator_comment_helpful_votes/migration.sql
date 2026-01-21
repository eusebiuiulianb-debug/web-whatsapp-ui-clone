-- CreateTable
CREATE TABLE "CreatorCommentHelpfulVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorCommentHelpfulVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CreatorComment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatorCommentHelpfulVote_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CreatorCommentHelpfulVote_commentId_idx" ON "CreatorCommentHelpfulVote"("commentId");

-- CreateIndex
CREATE INDEX "CreatorCommentHelpfulVote_fanId_idx" ON "CreatorCommentHelpfulVote"("fanId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorCommentHelpfulVote_commentId_fanId_key" ON "CreatorCommentHelpfulVote"("commentId", "fanId");
