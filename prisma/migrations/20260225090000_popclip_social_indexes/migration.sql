-- Rename PopClipComment.body to text
ALTER TABLE "PopClipComment" RENAME COLUMN "body" TO "text";

-- Add missing indexes for PopClip reactions/comments
CREATE INDEX "PopClipReaction_popClipId_idx" ON "PopClipReaction"("popClipId");
CREATE INDEX "PopClipComment_popClipId_idx" ON "PopClipComment"("popClipId");
CREATE INDEX "PopClipComment_fanId_idx" ON "PopClipComment"("fanId");
