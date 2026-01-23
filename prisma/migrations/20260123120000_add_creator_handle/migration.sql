-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "handle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Creator_handle_key" ON "Creator"("handle");
