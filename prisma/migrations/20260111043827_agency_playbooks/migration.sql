-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgencyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "intensity" TEXT NOT NULL,
    "playbook" TEXT NOT NULL DEFAULT 'GIRLFRIEND',
    "language" TEXT NOT NULL DEFAULT 'es',
    "blocksJson" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgencyTemplate_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgencyTemplate" ("active", "blocksJson", "createdAt", "creatorId", "id", "intensity", "language", "objective", "stage", "updatedAt") SELECT "active", "blocksJson", "createdAt", "creatorId", "id", "intensity", "language", "objective", "stage", "updatedAt" FROM "AgencyTemplate";
DROP TABLE "AgencyTemplate";
ALTER TABLE "new_AgencyTemplate" RENAME TO "AgencyTemplate";
CREATE INDEX "AgencyTemplate_creatorId_playbook_stage_objective_intensity_idx" ON "AgencyTemplate"("creatorId", "playbook", "stage", "objective", "intensity");
CREATE INDEX "AgencyTemplate_creatorId_language_active_idx" ON "AgencyTemplate"("creatorId", "language", "active");
CREATE TABLE "new_ChatAgencyMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "objective" TEXT NOT NULL DEFAULT 'CONNECT',
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
INSERT INTO "new_ChatAgencyMeta" ("createdAt", "creatorId", "fanId", "id", "intensity", "lastTouchAt", "nextAction", "notes", "objective", "recommendedOfferId", "stage", "updatedAt") SELECT "createdAt", "creatorId", "fanId", "id", "intensity", "lastTouchAt", "nextAction", "notes", "objective", "recommendedOfferId", "stage", "updatedAt" FROM "ChatAgencyMeta";
DROP TABLE "ChatAgencyMeta";
ALTER TABLE "new_ChatAgencyMeta" RENAME TO "ChatAgencyMeta";
CREATE INDEX "ChatAgencyMeta_creatorId_fanId_idx" ON "ChatAgencyMeta"("creatorId", "fanId");
CREATE INDEX "ChatAgencyMeta_creatorId_stage_idx" ON "ChatAgencyMeta"("creatorId", "stage");
CREATE INDEX "ChatAgencyMeta_creatorId_objective_idx" ON "ChatAgencyMeta"("creatorId", "objective");
CREATE UNIQUE INDEX "ChatAgencyMeta_creatorId_fanId_key" ON "ChatAgencyMeta"("creatorId", "fanId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
