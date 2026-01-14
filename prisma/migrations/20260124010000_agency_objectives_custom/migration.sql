-- CreateTable
CREATE TABLE "AgencyObjective" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labels" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgencyObjective_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyObjective_creatorId_code_key" ON "AgencyObjective"("creatorId", "code");

-- CreateIndex
CREATE INDEX "AgencyObjective_creatorId_active_idx" ON "AgencyObjective"("creatorId", "active");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatAgencyMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "objectiveCode" TEXT NOT NULL DEFAULT 'CONNECT',
    "intensity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "playbook" TEXT NOT NULL DEFAULT 'GIRLFRIEND',
    "nextAction" TEXT,
    "lastTouchAt" DATETIME,
    "notes" TEXT,
    "recommendedOfferId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatAgencyMeta_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatAgencyMeta_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ChatAgencyMeta" ("createdAt", "creatorId", "fanId", "id", "intensity", "lastTouchAt", "nextAction", "notes", "objectiveCode", "playbook", "recommendedOfferId", "stage", "updatedAt") SELECT "createdAt", "creatorId", "fanId", "id", "intensity", "lastTouchAt", "nextAction", "notes", "objective", "playbook", "recommendedOfferId", "stage", "updatedAt" FROM "ChatAgencyMeta";
DROP TABLE "ChatAgencyMeta";
ALTER TABLE "new_ChatAgencyMeta" RENAME TO "ChatAgencyMeta";
CREATE INDEX "ChatAgencyMeta_creatorId_fanId_idx" ON "ChatAgencyMeta"("creatorId", "fanId");
CREATE INDEX "ChatAgencyMeta_creatorId_stage_idx" ON "ChatAgencyMeta"("creatorId", "stage");
CREATE INDEX "ChatAgencyMeta_creatorId_objectiveCode_idx" ON "ChatAgencyMeta"("creatorId", "objectiveCode");
CREATE UNIQUE INDEX "ChatAgencyMeta_creatorId_fanId_key" ON "ChatAgencyMeta"("creatorId", "fanId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
