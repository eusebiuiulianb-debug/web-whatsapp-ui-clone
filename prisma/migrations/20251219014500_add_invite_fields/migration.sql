-- AlterTable
ALTER TABLE "Fan" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "Fan" ADD COLUMN "inviteCreatedAt" DATETIME;
ALTER TABLE "Fan" ADD COLUMN "inviteUsedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Fan_inviteToken_key" ON "Fan"("inviteToken");
