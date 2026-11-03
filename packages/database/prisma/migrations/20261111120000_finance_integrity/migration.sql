-- AlterTable
ALTER TABLE "fuel_transactions" ALTER COLUMN "total_amount" TYPE DECIMAL(14, 4);

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "amount" TYPE DECIMAL(14, 4);

-- AlterTable
ALTER TABLE "fuel_import_jobs" ADD COLUMN "idempotency_checksum" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_import_jobs_organization_id_idempotency_checksum_key" ON "fuel_import_jobs"("organization_id", "idempotency_checksum");

