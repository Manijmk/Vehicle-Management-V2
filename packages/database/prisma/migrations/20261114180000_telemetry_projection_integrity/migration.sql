-- Drop old foreign key on telemetry_current_positions
ALTER TABLE "telemetry_current_positions" DROP CONSTRAINT IF EXISTS "telemetry_current_positions_position_id_fkey";

-- Make device_id nullable on telemetry_positions and telemetry_current_positions for deviceless human ingestion
ALTER TABLE "telemetry_positions" ALTER COLUMN "device_id" DROP NOT NULL;
ALTER TABLE "telemetry_current_positions" ALTER COLUMN "device_id" DROP NOT NULL;

-- Composite unique key on telemetry_positions(id, organization_id, vehicle_id)
ALTER TABLE "telemetry_positions" ADD CONSTRAINT "telemetry_positions_id_organization_id_vehicle_id_key" UNIQUE ("id", "organization_id", "vehicle_id");

-- Tenant- and Vehicle-safe composite foreign key from telemetry_current_positions to telemetry_positions
ALTER TABLE "telemetry_current_positions" ADD CONSTRAINT "telemetry_current_positions_position_id_org_veh_fkey" FOREIGN KEY ("position_id", "organization_id", "vehicle_id") REFERENCES "telemetry_positions"("id", "organization_id", "vehicle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant-safe composite foreign key from telemetry_current_positions to telemetry_devices
ALTER TABLE "telemetry_current_positions" ADD CONSTRAINT "telemetry_current_positions_device_id_org_fkey" FOREIGN KEY ("device_id", "organization_id") REFERENCES "telemetry_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite unique key on telemetry_current_positions(position_id, organization_id, vehicle_id)
ALTER TABLE "telemetry_current_positions" ADD CONSTRAINT "telemetry_current_positions_position_id_org_veh_key" UNIQUE ("position_id", "organization_id", "vehicle_id");

-- Source-aware idempotency partial unique indexes
DROP INDEX IF EXISTS "unique_telemetry_provider_msg";

CREATE UNIQUE INDEX "unique_device_provider_message"
ON "telemetry_positions"("organization_id", "device_id", "provider_message_id")
WHERE "device_id" IS NOT NULL AND "provider_message_id" IS NOT NULL;

CREATE UNIQUE INDEX "unique_deviceless_provider_message"
ON "telemetry_positions"("organization_id", "source", "provider_message_id")
WHERE "device_id" IS NULL AND "provider_message_id" IS NOT NULL;
