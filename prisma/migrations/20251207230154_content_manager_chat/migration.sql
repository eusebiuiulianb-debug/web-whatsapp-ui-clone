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

-- CreateIndex
CREATE UNIQUE INDEX "ContentManagerConversation_creatorId_key" ON "ContentManagerConversation"("creatorId");

-- CreateIndex
CREATE INDEX "ContentManagerMessage_conversationId_createdAt_idx" ON "ContentManagerMessage"("conversationId", "createdAt");
