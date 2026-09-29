-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "employee_number" VARCHAR(50),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "status" "DriverStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_licenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "license_number" VARCHAR(50) NOT NULL,
    "issuing_country" VARCHAR(3) NOT NULL,
    "issuing_region" VARCHAR(50),
    "license_classes" TEXT[],
    "issue_date" TIMESTAMPTZ(3) NOT NULL,
    "expiry_date" TIMESTAMPTZ(3) NOT NULL,
    "notes" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "from_status" "DriverStatus",
    "to_status" "DriverStatus" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "changed_by" UUID NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_organization_id_display_id_key" ON "drivers"("organization_id", "display_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_organization_id_employee_number_key" ON "drivers"("organization_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_id_organization_id_key" ON "drivers"("id", "organization_id");

-- CreateIndex
CREATE INDEX "drivers_organization_id_status_idx" ON "drivers"("organization_id", "status");

-- CreateIndex
CREATE INDEX "drivers_organization_id_last_name_first_name_idx" ON "drivers"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "driver_licenses_organization_id_license_number_issuing_country_key" ON "driver_licenses"("organization_id", "license_number", "issuing_country");

-- CreateIndex
CREATE UNIQUE INDEX "driver_licenses_id_organization_id_key" ON "driver_licenses"("id", "organization_id");

-- CreateIndex
CREATE INDEX "driver_licenses_organization_id_driver_id_idx" ON "driver_licenses"("organization_id", "driver_id");

-- CreateIndex
CREATE INDEX "driver_licenses_organization_id_expiry_date_idx" ON "driver_licenses"("organization_id", "expiry_date");

-- CreateIndex
CREATE INDEX "driver_status_history_organization_id_driver_id_created_at_idx" ON "driver_status_history"("organization_id", "driver_id", "created_at");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_licenses" ADD CONSTRAINT "driver_licenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_licenses" ADD CONSTRAINT "driver_licenses_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_status_history" ADD CONSTRAINT "driver_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_status_history" ADD CONSTRAINT "driver_status_history_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_status_history" ADD CONSTRAINT "driver_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
