-- CreateTable
CREATE TABLE "CampaignMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignMeta_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CampaignMeta_creatorId_createdAt_idx" ON "CampaignMeta"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMeta_creatorId_utmCampaign_key" ON "CampaignMeta"("creatorId", "utmCampaign");
