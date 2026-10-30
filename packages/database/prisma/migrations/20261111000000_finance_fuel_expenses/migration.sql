-- CreateEnum
CREATE TYPE "FuelQuantityUnit" AS ENUM ('LITER', 'KWH', 'KG', 'GALLON');

-- CreateEnum
CREATE TYPE "FuelTransactionSource" AS ENUM ('MANUAL', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "FuelTransactionStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "FuelAnomalyCode" AS ENUM ('ODOMETER_REGRESSION', 'DUPLICATE_REFERENCE', 'DUPLICATE_TRANSACTION', 'FUTURE_TRANSACTION_DATE', 'ZERO_DISTANCE_REFUEL', 'UNUSUAL_UNIT_PRICE');

-- CreateEnum
CREATE TYPE "FuelAnomalySeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExpenseCategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "FuelImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "fuel_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID,
    "trip_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "energy_type" "FuelType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantity_unit" "FuelQuantityUnit" NOT NULL DEFAULT 'LITER',
    "unit_price" DECIMAL(12,4) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "odometer_km" INTEGER,
    "station_name" VARCHAR(200),
    "reference_number" VARCHAR(100),
    "source" "FuelTransactionSource" NOT NULL DEFAULT 'MANUAL',
    "status" "FuelTransactionStatus" NOT NULL DEFAULT 'POSTED',
    "void_reason" VARCHAR(500),
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" UUID,
    "receipt_storage_key" VARCHAR(500),
    "receipt_file_name" VARCHAR(255),
    "receipt_content_type" VARCHAR(100),
    "receipt_size_bytes" INTEGER,
    "import_batch_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "fuel_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_transaction_anomalies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fuel_transaction_id" UUID NOT NULL,
    "code" "FuelAnomalyCode" NOT NULL,
    "severity" "FuelAnomalySeverity" NOT NULL DEFAULT 'WARNING',
    "description" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_transaction_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "status" "ExpenseCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "category_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "trip_id" UUID,
    "maintenance_work_order_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "vendor_name" VARCHAR(200),
    "reference_number" VARCHAR(100),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "void_reason" VARCHAR(500),
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" UUID,
    "receipt_storage_key" VARCHAR(500),
    "receipt_file_name" VARCHAR(255),
    "receipt_content_type" VARCHAR(100),
    "receipt_size_bytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_import_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "imported_rows" INTEGER NOT NULL,
    "failed_rows" INTEGER NOT NULL,
    "status" "FuelImportStatus" NOT NULL DEFAULT 'PENDING',
    "error_summary" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "fuel_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_transactions_organization_id_display_id_key" ON "fuel_transactions"("organization_id", "display_id");
CREATE UNIQUE INDEX "fuel_transactions_id_organization_id_key" ON "fuel_transactions"("id", "organization_id");
CREATE INDEX "fuel_transactions_organization_id_status_idx" ON "fuel_transactions"("organization_id", "status");
CREATE INDEX "fuel_transactions_organization_id_vehicle_id_occurred_at_idx" ON "fuel_transactions"("organization_id", "vehicle_id", "occurred_at");
CREATE INDEX "fuel_transactions_organization_id_driver_id_occurred_at_idx" ON "fuel_transactions"("organization_id", "driver_id", "occurred_at");
CREATE INDEX "fuel_transactions_organization_id_trip_id_idx" ON "fuel_transactions"("organization_id", "trip_id");
CREATE INDEX "fuel_transactions_organization_id_reference_number_idx" ON "fuel_transactions"("organization_id", "reference_number");
CREATE INDEX "fuel_transactions_organization_id_occurred_at_idx" ON "fuel_transactions"("organization_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_transaction_anomalies_id_organization_id_key" ON "fuel_transaction_anomalies"("id", "organization_id");
CREATE INDEX "fuel_transaction_anomalies_organization_id_fuel_transacti_idx" ON "fuel_transaction_anomalies"("organization_id", "fuel_transaction_id");
CREATE INDEX "fuel_transaction_anomalies_organization_id_code_idx" ON "fuel_transaction_anomalies"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_organization_id_code_key" ON "expense_categories"("organization_id", "code");
CREATE UNIQUE INDEX "expense_categories_id_organization_id_key" ON "expense_categories"("id", "organization_id");
CREATE INDEX "expense_categories_organization_id_status_idx" ON "expense_categories"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_organization_id_display_id_key" ON "expenses"("organization_id", "display_id");
CREATE UNIQUE INDEX "expenses_id_organization_id_key" ON "expenses"("id", "organization_id");
CREATE INDEX "expenses_organization_id_status_idx" ON "expenses"("organization_id", "status");
CREATE INDEX "expenses_organization_id_category_id_idx" ON "expenses"("organization_id", "category_id");
CREATE INDEX "expenses_organization_id_vehicle_id_occurred_at_idx" ON "expenses"("organization_id", "vehicle_id", "occurred_at");
CREATE INDEX "expenses_organization_id_driver_id_occurred_at_idx" ON "expenses"("organization_id", "driver_id", "occurred_at");
CREATE INDEX "expenses_organization_id_trip_id_idx" ON "expenses"("organization_id", "trip_id");
CREATE INDEX "expenses_organization_id_maintenance_work_order_id_idx" ON "expenses"("organization_id", "maintenance_work_order_id");
CREATE INDEX "expenses_organization_id_occurred_at_idx" ON "expenses"("organization_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_import_jobs_id_organization_id_key" ON "fuel_import_jobs"("id", "organization_id");
CREATE INDEX "fuel_import_jobs_organization_id_created_at_idx" ON "fuel_import_jobs"("organization_id", "created_at");

-- CHECK Constraints
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transaction_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transaction_unit_price_check" CHECK ("unit_price" >= 0);
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transaction_total_amount_check" CHECK ("total_amount" >= 0);
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transaction_odometer_check" CHECK ("odometer_km" IS NULL OR "odometer_km" >= 0);
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transaction_void_check" CHECK ("status" != 'VOIDED' OR "void_reason" IS NOT NULL);

ALTER TABLE "expenses" ADD CONSTRAINT "expense_amount_check" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expense_void_check" CHECK ("status" != 'VOIDED' OR "void_reason" IS NOT NULL);

-- AddForeignKey (fuel_transactions)
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transactions_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transactions_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transactions_trip_id_organization_id_fkey" FOREIGN KEY ("trip_id", "organization_id") REFERENCES "trips"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transactions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_transactions" ADD CONSTRAINT "fuel_transactions_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (fuel_transaction_anomalies)
ALTER TABLE "fuel_transaction_anomalies" ADD CONSTRAINT "fuel_transaction_anomalies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_transaction_anomalies" ADD CONSTRAINT "fuel_transaction_anomalies_fuel_transaction_id_organization_id_fkey" FOREIGN KEY ("fuel_transaction_id", "organization_id") REFERENCES "fuel_transactions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (expense_categories)
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (expenses)
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_organization_id_fkey" FOREIGN KEY ("category_id", "organization_id") REFERENCES "expense_categories"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_organization_id_fkey" FOREIGN KEY ("trip_id", "organization_id") REFERENCES "trips"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_maintenance_work_order_id_organization_id_fkey" FOREIGN KEY ("maintenance_work_order_id", "organization_id") REFERENCES "maintenance_work_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (fuel_import_jobs)
ALTER TABLE "fuel_import_jobs" ADD CONSTRAINT "fuel_import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_import_jobs" ADD CONSTRAINT "fuel_import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

