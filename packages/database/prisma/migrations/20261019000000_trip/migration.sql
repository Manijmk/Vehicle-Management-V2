-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ABORTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add composite unique constraints on vehicle_driver_assignments
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_driver_assignments_id_organization_id_vehicle_id_driver_id_key"
    ON "vehicle_driver_assignments"("id", "organization_id", "vehicle_id", "driver_id");

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_driver_assignments_id_organization_id_key"
    ON "vehicle_driver_assignments"("id", "organization_id");

-- CreateTable trips
CREATE TABLE IF NOT EXISTS "trips" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "assignment_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" VARCHAR(200) NOT NULL,
    "destination" VARCHAR(200) NOT NULL,
    "purpose" VARCHAR(500),
    "planned_start_at" TIMESTAMPTZ(3),
    "planned_end_at" TIMESTAMPTZ(3),
    "actual_start_at" TIMESTAMPTZ(3),
    "actual_end_at" TIMESTAMPTZ(3),
    "start_odometer_km" INTEGER,
    "end_odometer_km" INTEGER,
    "distance_km" INTEGER,
    "cancel_reason" VARCHAR(500),
    "abort_reason" VARCHAR(500),
    "notes" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- Unique indexes on trips (MUST be created before child tables reference them)
CREATE UNIQUE INDEX IF NOT EXISTS "trips_organization_id_display_id_key"
    ON "trips"("organization_id", "display_id");

CREATE UNIQUE INDEX IF NOT EXISTS "trips_id_organization_id_key"
    ON "trips"("id", "organization_id");

-- CreateTable trip_status_history
CREATE TABLE IF NOT EXISTS "trip_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "from_status" "TripStatus",
    "to_status" "TripStatus" NOT NULL,
    "reason" VARCHAR(500),
    "changed_by" UUID NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_status_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKeys for trips
DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_assignment_id_organization_id_vehicle_id_driver_id_fkey"
        FOREIGN KEY ("assignment_id", "organization_id", "vehicle_id", "driver_id")
        REFERENCES "vehicle_driver_assignments"("id", "organization_id", "vehicle_id", "driver_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_organization_id_fkey"
        FOREIGN KEY ("vehicle_id", "organization_id")
        REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_organization_id_fkey"
        FOREIGN KEY ("driver_id", "organization_id")
        REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_updated_by_fkey"
        FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKeys for trip_status_history
DO $$ BEGIN
    ALTER TABLE "trip_status_history" ADD CONSTRAINT "trip_status_history_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trip_status_history" ADD CONSTRAINT "trip_status_history_trip_id_organization_id_fkey"
        FOREIGN KEY ("trip_id", "organization_id")
        REFERENCES "trips"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trip_status_history" ADD CONSTRAINT "trip_status_history_changed_by_fkey"
        FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Partial unique indexes enforcing single IN_PROGRESS trip per vehicle and driver
CREATE UNIQUE INDEX IF NOT EXISTS "idx_trips_in_progress_vehicle"
    ON "trips"("organization_id", "vehicle_id") WHERE "status" = 'IN_PROGRESS';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_trips_in_progress_driver"
    ON "trips"("organization_id", "driver_id") WHERE "status" = 'IN_PROGRESS';

-- Standard query and lookup indexes
CREATE INDEX IF NOT EXISTS "trips_organization_id_status_idx"
    ON "trips"("organization_id", "status");

CREATE INDEX IF NOT EXISTS "trips_organization_id_vehicle_id_idx"
    ON "trips"("organization_id", "vehicle_id");

CREATE INDEX IF NOT EXISTS "trips_organization_id_driver_id_idx"
    ON "trips"("organization_id", "driver_id");

CREATE INDEX IF NOT EXISTS "trips_organization_id_assignment_id_idx"
    ON "trips"("organization_id", "assignment_id");

CREATE INDEX IF NOT EXISTS "trips_organization_id_created_at_idx"
    ON "trips"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "trip_status_history_organization_id_trip_id_created_at_idx"
    ON "trip_status_history"("organization_id", "trip_id", "created_at");
