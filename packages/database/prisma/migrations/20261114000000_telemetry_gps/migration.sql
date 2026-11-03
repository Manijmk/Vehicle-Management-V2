-- CreateEnum
CREATE TYPE "TelemetrySource" AS ENUM ('DEVICE', 'MOBILE', 'IMPORT', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "TelemetryPositionStatus" AS ENUM ('VALID', 'STALE', 'INVALID');

-- CreateEnum
CREATE TYPE "TelemetryDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "telemetry_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "identifier" VARCHAR(100) NOT NULL,
    "status" "TelemetryDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" VARCHAR(500),
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "telemetry_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_device_vehicle_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(3),
    "assigned_by" UUID NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_device_vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "trip_id" UUID,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "speed_kmh" DECIMAL(6,2),
    "heading" DECIMAL(5,2),
    "altitude_m" DECIMAL(8,2),
    "accuracy_m" DECIMAL(8,2),
    "ignition" BOOLEAN,
    "odometer_km" INTEGER,
    "source" "TelemetrySource" NOT NULL,
    "status" "TelemetryPositionStatus" NOT NULL DEFAULT 'VALID',
    "provider_message_id" VARCHAR(200),
    "raw_metadata" JSONB,

    CONSTRAINT "telemetry_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_current_positions" (
    "organization_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "speed_kmh" DECIMAL(6,2),
    "heading" DECIMAL(5,2),
    "ignition" BOOLEAN,
    "odometer_km" INTEGER,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "source" "TelemetrySource" NOT NULL,
    "status" "TelemetryPositionStatus" NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "telemetry_current_positions_pkey" PRIMARY KEY ("organization_id","vehicle_id")
);

-- Indexes and Constraints for telemetry_devices
ALTER TABLE "telemetry_devices" ADD CONSTRAINT "telemetry_devices_organization_id_display_id_key" UNIQUE ("organization_id", "display_id");
ALTER TABLE "telemetry_devices" ADD CONSTRAINT "telemetry_devices_organization_id_identifier_key" UNIQUE ("organization_id", "identifier");
ALTER TABLE "telemetry_devices" ADD CONSTRAINT "telemetry_devices_id_organization_id_key" UNIQUE ("id", "organization_id");
CREATE INDEX "telemetry_devices_organization_id_status_idx" ON "telemetry_devices"("organization_id", "status");

-- Indexes for telemetry_device_vehicle_assignments
CREATE INDEX "telemetry_device_vehicle_assignments_organization_id_device_id_idx" ON "telemetry_device_vehicle_assignments"("organization_id", "device_id");
CREATE INDEX "telemetry_device_vehicle_assignments_organization_id_vehicle_id_idx" ON "telemetry_device_vehicle_assignments"("organization_id", "vehicle_id");
CREATE INDEX "telemetry_device_vehicle_assignments_organization_id_assigned_at_idx" ON "telemetry_device_vehicle_assignments"("organization_id", "assigned_at");

-- Indexes and Constraints for telemetry_positions
CREATE UNIQUE INDEX "unique_telemetry_provider_msg" ON "telemetry_positions"("organization_id", "device_id", "provider_message_id");
CREATE INDEX "telemetry_positions_organization_id_vehicle_id_captured_at_idx" ON "telemetry_positions"("organization_id", "vehicle_id", "captured_at" DESC);
CREATE INDEX "telemetry_positions_organization_id_device_id_captured_at_idx" ON "telemetry_positions"("organization_id", "device_id", "captured_at" DESC);
CREATE INDEX "telemetry_positions_organization_id_trip_id_captured_at_idx" ON "telemetry_positions"("organization_id", "trip_id", "captured_at");
CREATE INDEX "telemetry_positions_organization_id_captured_at_idx" ON "telemetry_positions"("organization_id", "captured_at" DESC);

-- Indexes and Constraints for telemetry_current_positions
ALTER TABLE "telemetry_current_positions" ADD CONSTRAINT "telemetry_current_positions_position_id_key" UNIQUE ("position_id");
CREATE UNIQUE INDEX "telemetry_current_positions_vehicle_id_organization_id_key" ON "telemetry_current_positions"("vehicle_id", "organization_id");

-- Foreign Keys
ALTER TABLE "telemetry_devices" ADD CONSTRAINT "telemetry_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telemetry_device_vehicle_assignments" ADD CONSTRAINT "telemetry_device_vehicle_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_device_vehicle_assignments" ADD CONSTRAINT "telemetry_device_vehicle_assignments_device_id_organization_id_fkey" FOREIGN KEY ("device_id", "organization_id") REFERENCES "telemetry_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_device_vehicle_assignments" ADD CONSTRAINT "telemetry_device_vehicle_assignments_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_device_vehicle_assignments" ADD CONSTRAINT "telemetry_device_vehicle_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telemetry_positions" ADD CONSTRAINT "telemetry_positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_positions" ADD CONSTRAINT "telemetry_positions_device_id_organization_id_fkey" FOREIGN KEY ("device_id", "organization_id") REFERENCES "telemetry_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_positions" ADD CONSTRAINT "telemetry_positions_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_positions" ADD CONSTRAINT "telemetry_positions_trip_id_organization_id_fkey" FOREIGN KEY ("trip_id", "organization_id") REFERENCES "trips"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "telemetry_current_positions" ADD CONSTRAINT "telemetry_current_positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_current_positions" ADD CONSTRAINT "telemetry_current_positions_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_current_positions" ADD CONSTRAINT "telemetry_current_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "telemetry_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
