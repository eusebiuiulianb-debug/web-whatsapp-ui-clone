-- Add profile text to fan
ALTER TABLE "Fan" ADD COLUMN "profileText" TEXT;

-- Create follow-up table
CREATE TABLE "FanFollowUp" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fanId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "dueAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "doneAt" DATETIME,
  CONSTRAINT "FanFollowUp_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FanFollowUp_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FanFollowUp_fanId_creatorId_status_idx" ON "FanFollowUp"("fanId", "creatorId", "status");
CREATE INDEX "FanFollowUp_creatorId_status_dueAt_idx" ON "FanFollowUp"("creatorId", "status", "dueAt");
