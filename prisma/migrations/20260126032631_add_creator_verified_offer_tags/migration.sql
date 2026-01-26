-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Creator" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'creator-1',
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "offerTags" JSONB,
    "subtitle" TEXT NOT NULL,
    "uiLocale" TEXT NOT NULL DEFAULT 'es',
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
INSERT INTO "new_Creator" ("bioLinkAvatarUrl", "bioLinkDescription", "bioLinkEnabled", "bioLinkFaq", "bioLinkPrimaryCtaLabel", "bioLinkPrimaryCtaUrl", "bioLinkSecondaryLinks", "bioLinkTagline", "bioLinkTitle", "description", "handle", "id", "name", "subtitle", "uiLocale") SELECT "bioLinkAvatarUrl", "bioLinkDescription", "bioLinkEnabled", "bioLinkFaq", "bioLinkPrimaryCtaLabel", "bioLinkPrimaryCtaUrl", "bioLinkSecondaryLinks", "bioLinkTagline", "bioLinkTitle", "description", "handle", "id", "name", "subtitle", "uiLocale" FROM "Creator";
DROP TABLE "Creator";
ALTER TABLE "new_Creator" RENAME TO "Creator";
CREATE UNIQUE INDEX "Creator_handle_key" ON "Creator"("handle");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
