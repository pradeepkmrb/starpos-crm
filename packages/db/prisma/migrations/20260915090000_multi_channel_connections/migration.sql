-- Multi-channel: WhatsappChannel becomes the generic Channel, and Contact
-- learns which channel its person reached us on.

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('whatsapp', 'facebook', 'instagram', 'email');

-- RenameTable (indexes and constraints follow, so rename them to match)
ALTER TABLE "WhatsappChannel" RENAME TO "Channel";
ALTER TABLE "Channel" RENAME CONSTRAINT "WhatsappChannel_pkey" TO "Channel_pkey";
ALTER TABLE "Channel" RENAME CONSTRAINT "WhatsappChannel_tenantId_fkey" TO "Channel_tenantId_fkey";
ALTER INDEX "WhatsappChannel_phoneNumberId_key" RENAME TO "Channel_phoneNumberId_key";
ALTER INDEX "WhatsappChannel_tenantId_idx" RENAME TO "Channel_tenantId_idx";

-- AlterTable: the WhatsApp-only columns become optional, and the generic ones arrive.
ALTER TABLE "Channel"
  ADD COLUMN "type" "ChannelType" NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "configJson" JSONB,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "syncCursor" TEXT,
  ADD COLUMN "lastError" TEXT,
  ALTER COLUMN "wabaId" DROP NOT NULL,
  ALTER COLUMN "phoneNumberId" DROP NOT NULL,
  ALTER COLUMN "displayPhoneNumber" DROP NOT NULL;

-- Backfill: every existing row is a WhatsApp channel, and its phone number id is
-- its native account id, so inbound routing can resolve any channel the same way.
UPDATE "Channel" SET "externalId" = "phoneNumberId" WHERE "externalId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Channel_tenantId_type_externalId_key" ON "Channel"("tenantId", "type", "externalId");

-- AlterTable
ALTER TABLE "Contact"
  ADD COLUMN "channelType" "ChannelType" NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN "externalId" TEXT,
  ALTER COLUMN "whatsappNumber" DROP NOT NULL;

-- Backfill
UPDATE "Contact" SET "externalId" = "whatsappNumber" WHERE "externalId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_channelType_externalId_key" ON "Contact"("tenantId", "channelType", "externalId");
