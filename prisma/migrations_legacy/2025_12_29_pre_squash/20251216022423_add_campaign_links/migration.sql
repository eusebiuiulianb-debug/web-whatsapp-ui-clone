-- DropIndex
DROP INDEX "CampaignLink_creatorId_createdAt_idx";

-- CreateIndex
CREATE INDEX "CampaignLink_creatorId_createdAt_idx" ON "CampaignLink"("creatorId", "createdAt");
