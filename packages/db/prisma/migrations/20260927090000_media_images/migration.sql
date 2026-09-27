-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "StoredImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoredImage_tenantId_idx" ON "StoredImage"("tenantId");

-- AddForeignKey
ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
