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
CREATE UNIQUE INDEX "CreatorDiscoveryProfile_creatorId_key" ON "CreatorDiscoveryProfile"("creatorId");

-- CreateIndex
CREATE INDEX "DiscoveryFeedback_creatorId_idx" ON "DiscoveryFeedback"("creatorId");

-- CreateIndex
CREATE INDEX "DiscoveryFeedback_sessionId_idx" ON "DiscoveryFeedback"("sessionId");
