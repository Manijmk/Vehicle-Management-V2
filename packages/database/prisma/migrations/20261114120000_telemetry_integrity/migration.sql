-- AlterEnum
ALTER TYPE "TelemetryPositionStatus" ADD VALUE IF NOT EXISTS 'OUT_OF_ORDER';

-- CreateEnum
CREATE TYPE "TelemetryDeviceCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "telemetry_device_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "secret_hash" VARCHAR(255) NOT NULL,
    "status" "TelemetryDeviceCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by" UUID,

    CONSTRAINT "telemetry_device_credentials_pkey" PRIMARY KEY ("id")
);

-- Partial Unique Indexes for Device Vehicle Assignments (one active vehicle per device, one active device per vehicle)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_device_assignment"
ON "telemetry_device_vehicle_assignments"("organization_id", "device_id")
WHERE "unassigned_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_vehicle_device_assignment"
ON "telemetry_device_vehicle_assignments"("organization_id", "vehicle_id")
WHERE "unassigned_at" IS NULL;

-- Unique and Indexes for telemetry_device_credentials
ALTER TABLE "telemetry_device_credentials" ADD CONSTRAINT "telemetry_device_credentials_key_prefix_key" UNIQUE ("key_prefix");
CREATE INDEX "telemetry_device_credentials_organization_id_device_id_idx" ON "telemetry_device_credentials"("organization_id", "device_id");

-- Foreign Keys for telemetry_device_credentials
ALTER TABLE "telemetry_device_credentials" ADD CONSTRAINT "telemetry_device_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_device_credentials" ADD CONSTRAINT "telemetry_device_credentials_device_id_organization_id_fkey" FOREIGN KEY ("device_id", "organization_id") REFERENCES "telemetry_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_device_credentials" ADD CONSTRAINT "telemetry_device_credentials_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

