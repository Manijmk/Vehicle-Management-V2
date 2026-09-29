-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "vehicle_driver_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" VARCHAR(500),
    "notes" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_driver_assignments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "vehicle_driver_assignments" ADD CONSTRAINT "vehicle_driver_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_driver_assignments" ADD CONSTRAINT "vehicle_driver_assignments_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_driver_assignments" ADD CONSTRAINT "vehicle_driver_assignments_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Partial unique indexes enforcing single active assignment per vehicle and driver
CREATE UNIQUE INDEX IF NOT EXISTS "idx_assignments_active_vehicle" ON "vehicle_driver_assignments"("organization_id", "vehicle_id") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_assignments_active_driver" ON "vehicle_driver_assignments"("organization_id", "driver_id") WHERE "status" = 'ACTIVE';

-- Standard indexes
CREATE INDEX IF NOT EXISTS "vehicle_driver_assignments_organization_id_vehicle_id_idx" ON "vehicle_driver_assignments"("organization_id", "vehicle_id");
CREATE INDEX IF NOT EXISTS "vehicle_driver_assignments_organization_id_driver_id_idx" ON "vehicle_driver_assignments"("organization_id", "driver_id");
CREATE INDEX IF NOT EXISTS "vehicle_driver_assignments_organization_id_status_idx" ON "vehicle_driver_assignments"("organization_id", "status");
