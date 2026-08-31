-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TUTOR');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('GUIDE', 'NOTES', 'EXAM', 'LINKS', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PDF', 'DOC', 'IMAGE', 'ARCHIVE', 'LINK', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'TUTOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Direction" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Direction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "type" "MaterialType" NOT NULL DEFAULT 'GUIDE',
    "status" "MaterialStatus" NOT NULL DEFAULT 'DRAFT',
    "directionId" TEXT NOT NULL,
    "semesterId" TEXT,
    "authorId" TEXT,
    "coverImageUrl" TEXT,
    "externalUrl" TEXT,
    "fileUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialAttachment" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'LINK',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Direction_slug_key" ON "Direction"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_number_key" ON "Semester"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Material_slug_key" ON "Material"("slug");

-- CreateIndex
CREATE INDEX "Material_directionId_status_isPinned_sortOrder_idx" ON "Material"("directionId", "status", "isPinned", "sortOrder");

-- CreateIndex
CREATE INDEX "Material_semesterId_idx" ON "Material"("semesterId");

-- CreateIndex
CREATE INDEX "Material_type_idx" ON "Material"("type");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "Direction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialAttachment" ADD CONSTRAINT "MaterialAttachment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

