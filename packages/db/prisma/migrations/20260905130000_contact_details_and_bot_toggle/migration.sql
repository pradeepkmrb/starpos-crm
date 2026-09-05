-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "botEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "languageCode" TEXT;

