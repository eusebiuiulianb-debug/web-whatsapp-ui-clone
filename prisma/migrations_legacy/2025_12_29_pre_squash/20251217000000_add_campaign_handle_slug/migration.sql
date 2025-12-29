-- Add optional handle/slug for campaign links + unique slug
ALTER TABLE "CampaignLink" ADD COLUMN "handle" TEXT;
ALTER TABLE "CampaignLink" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "CampaignLink_slug_key" ON "CampaignLink"("slug");
