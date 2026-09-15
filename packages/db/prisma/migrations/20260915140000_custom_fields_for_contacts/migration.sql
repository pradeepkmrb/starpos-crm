-- The field builder now serves contacts as well as leads, so the table and its
-- type enum shed their lead-specific names and gain an entity column. Renaming
-- rather than recreating keeps every field definition (and every answer already
-- stored against its key) intact.

-- AlterEnum
ALTER TYPE "LeadFieldType" RENAME TO "CustomFieldType";

-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('lead', 'contact');

-- RenameTable
ALTER TABLE "LeadCustomField" RENAME TO "CustomField";

-- RenameConstraint (Postgres keeps the old names through a table rename)
ALTER TABLE "CustomField" RENAME CONSTRAINT "LeadCustomField_pkey" TO "CustomField_pkey";
ALTER TABLE "CustomField" RENAME CONSTRAINT "LeadCustomField_tenantId_fkey" TO "CustomField_tenantId_fkey";

-- AlterTable: everything that exists today was built on the lead form, so the
-- default backfills it before being dropped.
ALTER TABLE "CustomField" ADD COLUMN "entity" "CustomFieldEntity" NOT NULL DEFAULT 'lead';
ALTER TABLE "CustomField" ALTER COLUMN "entity" DROP DEFAULT;

-- DropIndex
DROP INDEX "LeadCustomField_tenantId_idx";
DROP INDEX "LeadCustomField_tenantId_key_key";

-- CreateIndex: a key only has to be unique within one entity, so leads and
-- contacts can each have their own "city".
CREATE INDEX "CustomField_tenantId_entity_idx" ON "CustomField"("tenantId", "entity");
CREATE UNIQUE INDEX "CustomField_tenantId_entity_key_key" ON "CustomField"("tenantId", "entity", "key");
