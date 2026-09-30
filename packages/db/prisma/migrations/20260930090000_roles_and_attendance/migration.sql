-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "TenantInvite" ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "dataScope" TEXT NOT NULL DEFAULT 'all',
    "webAccess" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOutAt" TIMESTAMP(3),
    "clockInLat" DOUBLE PRECISION,
    "clockInLng" DOUBLE PRECISION,
    "clockOutLat" DOUBLE PRECISION,
    "clockOutLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_userId_clockInAt_idx" ON "Attendance"("tenantId", "userId", "clockInAt");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_clockInAt_idx" ON "Attendance"("tenantId", "clockInAt");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvite" ADD CONSTRAINT "TenantInvite_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Give every existing workspace the default roles, and move current members
-- and pending invites onto the role matching their old Admin/Agent/Viewer level.
INSERT INTO "Role" ("id", "tenantId", "name", "description", "permissions", "dataScope", "webAccess", "updatedAt")
SELECT 'role_' || md5("id" || 'Admin'), "id", 'Admin', 'Everything except billing checkout — manages the team and settings.', '{"inbox":"edit","broadcasts":"edit","audience":"edit","templates":"edit","flows":"edit","catalogue":"edit","connections":"edit","contact_fields":"edit","leads":"edit","follow_ups":"edit","visits":"edit","quotations":"edit","payments":"edit","targets":"edit","lead_fields":"edit","analytics":"edit","team":"edit","integrations":"edit","billing":"edit","developers":"edit"}'::jsonb, 'all', true, CURRENT_TIMESTAMP
FROM "Tenant";

INSERT INTO "Role" ("id", "tenantId", "name", "description", "permissions", "dataScope", "webAccess", "updatedAt")
SELECT 'role_' || md5("id" || 'Sales agent'), "id", 'Sales agent', 'Works their own leads in the field from the mobile app.', '{"inbox":"edit","broadcasts":"none","audience":"view","templates":"view","flows":"none","catalogue":"view","connections":"none","contact_fields":"none","leads":"edit","follow_ups":"edit","visits":"edit","quotations":"edit","payments":"edit","targets":"view","lead_fields":"none","analytics":"none","team":"none","integrations":"none","billing":"none","developers":"none"}'::jsonb, 'own', false, CURRENT_TIMESTAMP
FROM "Tenant";

INSERT INTO "Role" ("id", "tenantId", "name", "description", "permissions", "dataScope", "webAccess", "updatedAt")
SELECT 'role_' || md5("id" || 'Viewer'), "id", 'Viewer', 'Read-only view of sales and messaging — changes nothing.', '{"inbox":"view","broadcasts":"view","audience":"view","templates":"view","flows":"view","catalogue":"view","connections":"none","contact_fields":"view","leads":"view","follow_ups":"view","visits":"view","quotations":"view","payments":"view","targets":"view","lead_fields":"view","analytics":"view","team":"none","integrations":"none","billing":"none","developers":"none"}'::jsonb, 'all', true, CURRENT_TIMESTAMP
FROM "Tenant";

UPDATE "TenantMembership" SET "roleId" = 'role_' || md5("tenantId" || 'Admin'), "role" = 'admin' WHERE "role" = 'admin' AND "roleId" IS NULL;
UPDATE "TenantInvite" SET "roleId" = 'role_' || md5("tenantId" || 'Admin'), "role" = 'admin' WHERE "role" = 'admin' AND "roleId" IS NULL;
UPDATE "TenantMembership" SET "roleId" = 'role_' || md5("tenantId" || 'Sales agent'), "role" = 'agent' WHERE "role" = 'agent' AND "roleId" IS NULL;
UPDATE "TenantInvite" SET "roleId" = 'role_' || md5("tenantId" || 'Sales agent'), "role" = 'agent' WHERE "role" = 'agent' AND "roleId" IS NULL;
UPDATE "TenantMembership" SET "roleId" = 'role_' || md5("tenantId" || 'Viewer'), "role" = 'admin' WHERE "role" = 'viewer' AND "roleId" IS NULL;
UPDATE "TenantInvite" SET "roleId" = 'role_' || md5("tenantId" || 'Viewer'), "role" = 'admin' WHERE "role" = 'viewer' AND "roleId" IS NULL;
