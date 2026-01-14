-- CreateTable
CREATE TABLE "ChatAgencyMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "objective" TEXT NOT NULL DEFAULT 'CONNECT',
    "intensity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "nextAction" TEXT,
    "lastTouchAt" DATETIME,
    "notes" TEXT,
    "recommendedOfferId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatAgencyMeta_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatAgencyMeta_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgencyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "intensity" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "blocksJson" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgencyTemplate_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "oneLiner" TEXT NOT NULL,
    "hooksJson" JSONB NOT NULL,
    "ctasJson" JSONB NOT NULL,
    "intensityMin" TEXT NOT NULL DEFAULT 'SOFT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offer_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChatAgencyMeta_creatorId_fanId_idx" ON "ChatAgencyMeta"("creatorId", "fanId");

-- CreateIndex
CREATE INDEX "ChatAgencyMeta_creatorId_stage_idx" ON "ChatAgencyMeta"("creatorId", "stage");

-- CreateIndex
CREATE INDEX "ChatAgencyMeta_creatorId_objective_idx" ON "ChatAgencyMeta"("creatorId", "objective");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAgencyMeta_creatorId_fanId_key" ON "ChatAgencyMeta"("creatorId", "fanId");

-- CreateIndex
CREATE INDEX "AgencyTemplate_creatorId_stage_objective_intensity_idx" ON "AgencyTemplate"("creatorId", "stage", "objective", "intensity");

-- CreateIndex
CREATE INDEX "AgencyTemplate_creatorId_language_active_idx" ON "AgencyTemplate"("creatorId", "language", "active");

-- CreateIndex
CREATE INDEX "Offer_creatorId_active_idx" ON "Offer"("creatorId", "active");

-- CreateIndex
CREATE INDEX "Offer_creatorId_tier_idx" ON "Offer"("creatorId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_creatorId_code_key" ON "Offer"("creatorId", "code");
