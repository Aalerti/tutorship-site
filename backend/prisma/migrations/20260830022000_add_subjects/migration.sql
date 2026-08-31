-- Add subject-level cataloging so materials can be grouped by course
-- and then split into notes, exam programs, guides, and links.
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortTitle" TEXT,
    "description" TEXT,
    "directionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subject_directionId_slug_key" ON "Subject"("directionId", "slug");
CREATE INDEX "Subject_directionId_sortOrder_idx" ON "Subject"("directionId", "sortOrder");

ALTER TABLE "Subject"
    ADD CONSTRAINT "Subject_directionId_fkey"
    FOREIGN KEY ("directionId") REFERENCES "Direction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Material" ADD COLUMN "subjectId" TEXT;
CREATE INDEX "Material_subjectId_idx" ON "Material"("subjectId");

ALTER TABLE "Material"
    ADD CONSTRAINT "Material_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
