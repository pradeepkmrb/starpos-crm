-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "metaLeadAdsConfigId" TEXT;

-- AlterTable
ALTER TABLE "MetaLeadForm" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "questionsJson" JSONB;

-- CreateTable
CREATE TABLE "MetaLeadConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fbUserId" TEXT NOT NULL,
    "fbUserName" TEXT,
    "userTokenEncrypted" TEXT NOT NULL,
    "connectedByUserId" TEXT,
    "defaultFieldMappingJson" JSONB,
    "defaultStatus" "LeadStatus" NOT NULL DEFAULT 'new',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaLeadConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaLeadPage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "pageAccessTokenEncrypted" TEXT NOT NULL,
    "subscribed" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaLeadPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaLeadConnection_tenantId_key" ON "MetaLeadConnection"("tenantId");

-- CreateIndex
CREATE INDEX "MetaLeadPage_pageId_idx" ON "MetaLeadPage"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaLeadPage_tenantId_pageId_key" ON "MetaLeadPage"("tenantId", "pageId");

-- AddForeignKey
ALTER TABLE "MetaLeadForm" ADD CONSTRAINT "MetaLeadForm_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaLeadConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLeadConnection" ADD CONSTRAINT "MetaLeadConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLeadPage" ADD CONSTRAINT "MetaLeadPage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLeadPage" ADD CONSTRAINT "MetaLeadPage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaLeadConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

