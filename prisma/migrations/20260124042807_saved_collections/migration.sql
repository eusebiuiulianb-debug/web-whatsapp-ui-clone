-- CreateTable
CREATE TABLE "SavedCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SavedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "collectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "SavedCollection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavedCollection_userId_sortOrder_idx" ON "SavedCollection"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCollection_userId_name_key" ON "SavedCollection"("userId", "name");

-- CreateIndex
CREATE INDEX "SavedItem_userId_createdAt_idx" ON "SavedItem"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedItem_userId_collectionId_idx" ON "SavedItem"("userId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_userId_type_entityId_key" ON "SavedItem"("userId", "type", "entityId");
