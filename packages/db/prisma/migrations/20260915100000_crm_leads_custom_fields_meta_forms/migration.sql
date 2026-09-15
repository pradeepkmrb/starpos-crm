-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'won', 'lost');

-- CreateEnum
CREATE TYPE "LeadFieldType" AS ENUM ('text', 'textarea', 'number', 'date', 'dropdown', 'radio', 'checkbox');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "valuePaise" INTEGER,
    "notes" TEXT,
    "ownerUserId" TEXT,
    "customFieldsJson" JSONB,
    "metaLeadId" TEXT,
    "metaFormLinkId" TEXT,
    "metaAdId" TEXT,
    "sourcePayloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCustomField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "LeadFieldType" NOT NULL DEFAULT 'text',
    "optionsJson" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "placeholder" TEXT,
    "helpText" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaLeadForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "formId" TEXT NOT NULL,
    "formName" TEXT,
    "pageAccessTokenEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fieldMappingJson" JSONB,
    "defaultStatus" "LeadStatus" NOT NULL DEFAULT 'new',
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "lastLeadAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaLeadForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_metaLeadId_key" ON "Lead"("metaLeadId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Lead_ownerUserId_idx" ON "Lead"("ownerUserId");

-- CreateIndex
CREATE INDEX "LeadCustomField_tenantId_idx" ON "LeadCustomField"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCustomField_tenantId_key_key" ON "LeadCustomField"("tenantId", "key");

-- CreateIndex
CREATE INDEX "MetaLeadForm_tenantId_idx" ON "MetaLeadForm"("tenantId");

-- CreateIndex
CREATE INDEX "MetaLeadForm_formId_idx" ON "MetaLeadForm"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaLeadForm_tenantId_formId_key" ON "MetaLeadForm"("tenantId", "formId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_metaFormLinkId_fkey" FOREIGN KEY ("metaFormLinkId") REFERENCES "MetaLeadForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCustomField" ADD CONSTRAINT "LeadCustomField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLeadForm" ADD CONSTRAINT "MetaLeadForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

