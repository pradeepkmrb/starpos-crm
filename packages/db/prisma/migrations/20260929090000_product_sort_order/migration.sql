-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Keep today's order (newest first) as the starting position.
UPDATE "Product" p
SET "sortOrder" = ranked.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" DESC) - 1 AS position
  FROM "Product"
) ranked
WHERE p.id = ranked.id;

-- DropIndex
DROP INDEX "Product_tenantId_idx";

-- CreateIndex
CREATE INDEX "Product_tenantId_sortOrder_idx" ON "Product"("tenantId", "sortOrder");
