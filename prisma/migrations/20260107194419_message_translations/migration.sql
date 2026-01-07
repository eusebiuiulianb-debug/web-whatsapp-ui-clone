-- CreateTable
CREATE TABLE "MessageTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "provider" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByCreatorId" TEXT,
    CONSTRAINT "MessageTranslation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MessageTranslation_messageId_targetLang_idx" ON "MessageTranslation"("messageId", "targetLang");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTranslation_messageId_targetLang_sourceKind_sourceHash_key" ON "MessageTranslation"("messageId", "targetLang", "sourceKind", "sourceHash");
