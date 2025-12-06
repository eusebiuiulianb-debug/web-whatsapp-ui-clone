-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "preview" TEXT,
    "time" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "membershipStatus" TEXT,
    "daysLeft" INTEGER,
    "lastSeen" TEXT,
    "nextAction" TEXT,
    "creatorId" TEXT NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'NUEVO',
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" DATETIME,
    "lastCreatorMessageAt" DATETIME,
    "lastPurchaseAt" DATETIME,
    "lifetimeValue" REAL NOT NULL DEFAULT 0,
    "recent30dSpend" REAL NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    CONSTRAINT "Fan_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Fan" ("avatar", "creatorId", "daysLeft", "id", "isNew", "lastSeen", "membershipStatus", "name", "nextAction", "preview", "time", "unreadCount") SELECT "avatar", "creatorId", "daysLeft", "id", "isNew", "lastSeen", "membershipStatus", "name", "nextAction", "preview", "time", "unreadCount" FROM "Fan";
DROP TABLE "Fan";
ALTER TABLE "new_Fan" RENAME TO "Fan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
