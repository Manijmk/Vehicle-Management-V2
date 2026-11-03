-- AlterEnum
ALTER TYPE "MaintenanceRequestSource" ADD VALUE IF NOT EXISTS 'INCIDENT';

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('ACCIDENT', 'BREAKDOWN', 'VIOLATION', 'DAMAGE', 'THEFT', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IncidentOperationalImpact" AS ENUM ('NONE', 'VEHICLE', 'DRIVER', 'BOTH');

-- CreateEnum
CREATE TYPE "IncidentAttachmentType" AS ENUM ('PHOTO', 'DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "vehicle_id" UUID,
    "driver_id" UUID,
    "trip_id" UUID,
    "assignment_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "reported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "location_text" VARCHAR(300),
    "operational_impact" "IncidentOperationalImpact" NOT NULL DEFAULT 'NONE',
    "resolution_summary" VARCHAR(2000),
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "from_status" "IncidentStatus",
    "to_status" "IncidentStatus" NOT NULL,
    "reason" VARCHAR(1000),
    "actor_id" UUID NOT NULL,
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "incident_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "attachment_type" "IncidentAttachmentType" NOT NULL DEFAULT 'OTHER',
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "incident_attachments_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN "source_incident_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "incidents_organization_id_display_id_key" ON "incidents"("organization_id", "display_id");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_id_organization_id_key" ON "incidents"("id", "organization_id");

-- CreateIndex
CREATE INDEX "incidents_organization_id_created_at_idx" ON "incidents"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_organization_id_status_created_at_idx" ON "incidents"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_organization_id_type_created_at_idx" ON "incidents"("organization_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_organization_id_severity_created_at_idx" ON "incidents"("organization_id", "severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_organization_id_vehicle_id_occurred_at_idx" ON "incidents"("organization_id", "vehicle_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_organization_id_driver_id_occurred_at_idx" ON "incidents"("organization_id", "driver_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_organization_id_trip_id_occurred_at_idx" ON "incidents"("organization_id", "trip_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_organization_id_status_operational_impact_idx" ON "incidents"("organization_id", "status", "operational_impact");

-- CreateIndex
CREATE INDEX "incident_status_history_organization_id_incident_id_created_idx" ON "incident_status_history"("organization_id", "incident_id", "created_at" ASC);

-- CreateIndex
CREATE INDEX "incident_notes_organization_id_incident_id_created_at_idx" ON "incident_notes"("organization_id", "incident_id", "created_at" ASC);

-- CreateIndex
CREATE INDEX "incident_attachments_organization_id_incident_id_created_at_idx" ON "incident_attachments"("organization_id", "incident_id", "created_at" ASC);

-- CreateIndex
CREATE INDEX "maintenance_requests_organization_id_source_incident_id_idx" ON "maintenance_requests"("organization_id", "source_incident_id");

-- CreateIndex (Partial unique index for Incident-originated Maintenance Request idempotency)
CREATE UNIQUE INDEX "idx_maintenance_requests_org_source_incident" ON "maintenance_requests"("organization_id", "source_incident_id") WHERE "source_type" = 'INCIDENT' AND "source_incident_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_trip_id_organization_id_fkey" FOREIGN KEY ("trip_id", "organization_id") REFERENCES "trips"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignment_id_organization_id_fkey" FOREIGN KEY ("assignment_id", "organization_id") REFERENCES "vehicle_driver_assignments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Trip participant composite integrity constraint)
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_trip_participant_composite_fkey" FOREIGN KEY ("trip_id", "organization_id", "vehicle_id", "driver_id", "assignment_id") REFERENCES "trips"("id", "organization_id", "vehicle_id", "driver_id", "assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_incident_id_organization_id_fkey" FOREIGN KEY ("incident_id", "organization_id") REFERENCES "incidents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_incident_id_organization_id_fkey" FOREIGN KEY ("incident_id", "organization_id") REFERENCES "incidents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_incident_id_organization_id_fkey" FOREIGN KEY ("incident_id", "organization_id") REFERENCES "incidents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_source_incident_id_organization_id_fkey" FOREIGN KEY ("source_incident_id", "organization_id") REFERENCES "incidents"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check Constraints for Incident domain integrity
ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_subject_required"
  CHECK ("vehicle_id" IS NOT NULL OR "driver_id" IS NOT NULL OR "trip_id" IS NOT NULL);

ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_operational_impact_vehicle"
  CHECK ("operational_impact" != 'VEHICLE' OR "vehicle_id" IS NOT NULL);

ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_operational_impact_driver"
  CHECK ("operational_impact" != 'DRIVER' OR "driver_id" IS NOT NULL);

ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_operational_impact_both"
  CHECK ("operational_impact" != 'BOTH' OR ("vehicle_id" IS NOT NULL AND "driver_id" IS NOT NULL));

ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_resolved_fields"
  CHECK ("status" != 'RESOLVED' OR ("resolved_at" IS NOT NULL AND "resolution_summary" IS NOT NULL));

ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_closed_fields"
  CHECK ("status" != 'CLOSED' OR ("closed_at" IS NOT NULL AND "resolved_at" IS NOT NULL));

ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_cancelled_fields"
  CHECK ("status" != 'CANCELLED' OR "cancel_reason" IS NOT NULL);

ALTER TABLE "incidents" ADD CONSTRAINT "chk_incident_trip_participants"
  CHECK ("trip_id" IS NULL OR ("vehicle_id" IS NOT NULL AND "driver_id" IS NOT NULL AND "assignment_id" IS NOT NULL));

