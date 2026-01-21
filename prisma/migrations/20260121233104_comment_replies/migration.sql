-- CreateTable
CREATE TABLE "CommentReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "authorCreatorId" TEXT,
    "authorFanId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "CommentReply_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CreatorComment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentReply_authorCreatorId_fkey" FOREIGN KEY ("authorCreatorId") REFERENCES "Creator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommentReply_authorFanId_fkey" FOREIGN KEY ("authorFanId") REFERENCES "Fan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommentReply_commentId_createdAt_idx" ON "CommentReply"("commentId", "createdAt");

-- CreateIndex
CREATE INDEX "CommentReply_authorCreatorId_idx" ON "CommentReply"("authorCreatorId");

-- CreateIndex
CREATE INDEX "CommentReply_authorFanId_idx" ON "CommentReply"("authorFanId");
