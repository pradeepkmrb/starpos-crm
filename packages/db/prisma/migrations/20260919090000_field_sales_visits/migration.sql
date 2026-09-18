-- AlterEnum
ALTER TYPE "ActivityStatus" ADD VALUE 'in_progress';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "accuracyMeters" INTEGER,
ADD COLUMN     "endLatitude" DOUBLE PRECISION,
ADD COLUMN     "endLongitude" DOUBLE PRECISION,
ADD COLUMN     "startedAt" TIMESTAMP(3);

