-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Creator" (
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
    "bioLinkSecondaryLinks" JSONB
);
INSERT INTO "new_Creator" ("description", "id", "name", "subtitle") SELECT "description", "id", "name", "subtitle" FROM "Creator";
DROP TABLE "Creator";
ALTER TABLE "new_Creator" RENAME TO "Creator";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
