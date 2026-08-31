-- AlterTable
ALTER TABLE "Material" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "archivedBy" TEXT;

-- CreateIndex
CREATE INDEX "Material_directionId_archivedAt_idx" ON "Material"("directionId", "archivedAt");
