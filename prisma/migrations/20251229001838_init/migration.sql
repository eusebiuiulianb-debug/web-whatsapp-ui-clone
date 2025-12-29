-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'creator-1',
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bioLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bioLinkTitle" TEXT,
    "bioLinkTagline" TEXT,
    "bioLinkAvatarUrl" TEXT,
    "bioLinkPrimaryCtaLabel" TEXT,
    "bioLinkPrimaryCtaUrl" TEXT,
    "bioLinkSecondaryLinks" JSONB,
    "bioLinkDescription" TEXT,
    "bioLinkFaq" JSONB
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "coverUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    CONSTRAINT "Pack_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "creatorLabel" TEXT,
    "avatar" TEXT,
    "preview" TEXT,
    "time" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "membershipStatus" TEXT,
    "daysLeft" INTEGER,
    "lastSeen" TEXT,
    "nextAction" TEXT,
    "profileText" TEXT,
    "quickNote" TEXT,
    "attendedAt" DATETIME,
    "creatorId" TEXT NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'NUEVO',
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" DATETIME,
    "lastCreatorMessageAt" DATETIME,
    "lastPurchaseAt" DATETIME,
    "lifetimeValue" REAL NOT NULL DEFAULT 0,
    "recent30dSpend" REAL NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isHighPriority" BOOLEAN NOT NULL DEFAULT false,
    "highPriorityAt" DATETIME,
    "inviteToken" TEXT,
    "inviteCreatedAt" DATETIME,
    "inviteUsedAt" DATETIME,
    "source" TEXT,
    "handle" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "firstUtmSource" TEXT,
    "firstUtmMedium" TEXT,
    "firstUtmCampaign" TEXT,
    "firstUtmContent" TEXT,
    "firstUtmTerm" TEXT,
    CONSTRAINT "Fan_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FanFollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "doneAt" DATETIME,
    CONSTRAINT "FanFollowUp_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FanFollowUp_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'FAN',
    "text" TEXT NOT NULL,
    "deliveredText" TEXT,
    "creatorTranslatedText" TEXT,
    "time" TEXT,
    "isLastFromCreator" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "contentItemId" TEXT,
    "stickerId" TEXT,
    CONSTRAINT "Message_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "pack" TEXT NOT NULL DEFAULT 'WELCOME',
    "slug" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "mediaPath" TEXT,
    "durationSec" INTEGER,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'INCLUDED_MONTHLY',
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "extraTier" TEXT,
    "timeOfDay" TEXT NOT NULL DEFAULT 'ANY',
    "externalUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "includes" JSONB,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PopClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "contentItemId" TEXT,
    "title" TEXT,
    "videoUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "startAtSec" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PopClip_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PopClip_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PopClip_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AccessGrant_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FanNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FanNote_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FanNote_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtraPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sessionTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtraPurchase_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExtraPurchase_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedAsset_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreatorAiSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "creatorId" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'cercano',
    "spicinessLevel" INTEGER NOT NULL DEFAULT 1,
    "formalityLevel" INTEGER NOT NULL DEFAULT 1,
    "emojiUsage" INTEGER NOT NULL DEFAULT 1,
    "priorityOrderJson" JSONB,
    "forbiddenTopics" TEXT,
    "forbiddenPromises" TEXT,
    "rulesManifest" TEXT,
    "allowSuggestReplies" BOOLEAN NOT NULL DEFAULT true,
    "allowSuggestExtras" BOOLEAN NOT NULL DEFAULT true,
    "allowSuggestRenewals" BOOLEAN NOT NULL DEFAULT true,
    "allowAutoLowPriority" BOOLEAN NOT NULL DEFAULT false,
    "creditsAvailable" INTEGER NOT NULL DEFAULT 0,
    "hardLimitPerDay" INTEGER,
    "turnMode" TEXT NOT NULL DEFAULT 'HEATUP',
    "platforms" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorAiSettings_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'FAN_ASSISTANT',
    "origin" TEXT NOT NULL DEFAULT 'FAN_ASSISTANT',
    "creditsUsed" INTEGER NOT NULL DEFAULT 1,
    "context" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnMode" TEXT NOT NULL DEFAULT 'HEATUP',
    "actionType" TEXT,
    "contextSummary" TEXT,
    "suggestedText" TEXT,
    "outcome" TEXT,
    "finalText" TEXT,
    CONSTRAINT "AiUsageLog_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiUsageLog_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreatorAiTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tone" TEXT,
    "content" TEXT NOT NULL,
    "tier" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorAiTemplate_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagerConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManagerConversation_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagerMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagerMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ManagerConversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentManagerConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentManagerConversation_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentManagerMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentManagerMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ContentManagerConversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagerAiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagerAiMessage_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT,
    "sessionId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CampaignLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "handle" TEXT,
    "platform" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "utmContent" TEXT NOT NULL,
    "utmTerm" TEXT,
    "slug" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

-- CreateTable
CREATE TABLE "CreatorDiscoveryProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "isDiscoverable" BOOLEAN NOT NULL DEFAULT false,
    "niches" TEXT NOT NULL DEFAULT '',
    "communicationStyle" TEXT NOT NULL,
    "limits" TEXT,
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "responseHours" INTEGER,
    "allowLocationMatching" BOOLEAN NOT NULL DEFAULT false,
    "showCountry" BOOLEAN NOT NULL DEFAULT false,
    "showCityApprox" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "cityApprox" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorDiscoveryProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveryFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscoveryFeedback_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_creatorId_key" ON "CreatorProfile"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Fan_inviteToken_key" ON "Fan"("inviteToken");

-- CreateIndex
CREATE INDEX "FanFollowUp_fanId_creatorId_status_idx" ON "FanFollowUp"("fanId", "creatorId", "status");

-- CreateIndex
CREATE INDEX "FanFollowUp_creatorId_status_dueAt_idx" ON "FanFollowUp"("creatorId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ContentItem_pack_order_idx" ON "ContentItem"("pack", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_creatorId_slug_key" ON "ContentItem"("creatorId", "slug");

-- CreateIndex
CREATE INDEX "CatalogItem_creatorId_isActive_sortOrder_createdAt_idx" ON "CatalogItem"("creatorId", "isActive", "sortOrder", "createdAt");

-- CreateIndex
CREATE INDEX "PopClip_creatorId_isActive_sortOrder_idx" ON "PopClip"("creatorId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PopClip_creatorId_catalogItemId_key" ON "PopClip"("creatorId", "catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PopClip_creatorId_contentItemId_key" ON "PopClip"("creatorId", "contentItemId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_creatorId_createdAt_idx" ON "GeneratedAsset"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorAiSettings_creatorId_key" ON "CreatorAiSettings"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerConversation_creatorId_key" ON "ManagerConversation"("creatorId");

-- CreateIndex
CREATE INDEX "ManagerMessage_conversationId_createdAt_idx" ON "ManagerMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentManagerConversation_creatorId_key" ON "ContentManagerConversation"("creatorId");

-- CreateIndex
CREATE INDEX "ContentManagerMessage_conversationId_createdAt_idx" ON "ContentManagerMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ManagerAiMessage_creatorId_tab_createdAt_idx" ON "ManagerAiMessage"("creatorId", "tab", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_creatorId_createdAt_idx" ON "AnalyticsEvent"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventName_createdAt_idx" ON "AnalyticsEvent"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_utmCampaign_utmContent_idx" ON "AnalyticsEvent"("utmCampaign", "utmContent");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignLink_slug_key" ON "CampaignLink"("slug");

-- CreateIndex
CREATE INDEX "CampaignLink_creatorId_createdAt_idx" ON "CampaignLink"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignMeta_creatorId_createdAt_idx" ON "CampaignMeta"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMeta_creatorId_utmCampaign_key" ON "CampaignMeta"("creatorId", "utmCampaign");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorDiscoveryProfile_creatorId_key" ON "CreatorDiscoveryProfile"("creatorId");

-- CreateIndex
CREATE INDEX "DiscoveryFeedback_creatorId_idx" ON "DiscoveryFeedback"("creatorId");

-- CreateIndex
CREATE INDEX "DiscoveryFeedback_sessionId_idx" ON "DiscoveryFeedback"("sessionId");
