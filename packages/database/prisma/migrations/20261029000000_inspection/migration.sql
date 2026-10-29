-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "InspectionTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InspectionItemSeverity" AS ENUM ('NORMAL', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "InspectionResponseResult" AS ENUM ('PASS', 'FAIL', 'NOT_APPLICABLE');

-- Add unique constraint on trips for trip participant composite foreign key
CREATE UNIQUE INDEX "trips_id_organization_id_vehicle_id_driver_id_assignment_id_key" ON "trips"("id", "organization_id", "vehicle_id", "driver_id", "assignment_id");

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "type" "InspectionType" NOT NULL,
    "status" "InspectionTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_template_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "prompt" VARCHAR(500) NOT NULL,
    "description" VARCHAR(500),
    "required" BOOLEAN NOT NULL DEFAULT true,
    "severity" "InspectionItemSeverity" NOT NULL DEFAULT 'NORMAL',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspection_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "template_id" UUID NOT NULL,
    "type" "InspectionType" NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID,
    "assignment_id" UUID,
    "trip_id" UUID,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "result" "InspectionResult",
    "has_critical_failure" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(500),
    "performed_by" UUID,
    "notes" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_responses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "template_item_id" UUID NOT NULL,
    "response" "InspectionResponseResult" NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspection_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspection_templates_id_organization_id_key" ON "inspection_templates"("id", "organization_id");

-- CreateIndex
CREATE INDEX "inspection_templates_organization_id_status_idx" ON "inspection_templates"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inspection_templates_organization_id_type_status_idx" ON "inspection_templates"("organization_id", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_template_items_id_organization_id_key" ON "inspection_template_items"("id", "organization_id");

-- CreateIndex
CREATE INDEX "inspection_template_items_organization_id_template_id_sort_order_idx" ON "inspection_template_items"("organization_id", "template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_organization_id_display_id_key" ON "inspections"("organization_id", "display_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_id_organization_id_key" ON "inspections"("id", "organization_id");

-- CreateIndex
CREATE INDEX "inspections_organization_id_status_idx" ON "inspections"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inspections_organization_id_type_idx" ON "inspections"("organization_id", "type");

-- CreateIndex
CREATE INDEX "inspections_organization_id_result_idx" ON "inspections"("organization_id", "result");

-- CreateIndex
CREATE INDEX "inspections_organization_id_vehicle_id_created_at_idx" ON "inspections"("organization_id", "vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "inspections_organization_id_trip_id_created_at_idx" ON "inspections"("organization_id", "trip_id", "created_at");

-- CreateIndex
CREATE INDEX "inspections_organization_id_driver_id_created_at_idx" ON "inspections"("organization_id", "driver_id", "created_at");

-- CreateIndex
CREATE INDEX "inspections_organization_id_trip_id_type_status_completed_at_idx" ON "inspections"("organization_id", "trip_id", "type", "status", "completed_at");

-- CreateIndex
CREATE INDEX "inspections_organization_id_created_at_idx" ON "inspections"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_responses_organization_id_inspection_id_template_item_id_key" ON "inspection_responses"("organization_id", "inspection_id", "template_item_id");

-- CreateIndex
CREATE INDEX "inspection_responses_organization_id_inspection_id_idx" ON "inspection_responses"("organization_id", "inspection_id");

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_template_items" ADD CONSTRAINT "inspection_template_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_template_items" ADD CONSTRAINT "inspection_template_items_template_id_organization_id_fkey" FOREIGN KEY ("template_id", "organization_id") REFERENCES "inspection_templates"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_template_id_organization_id_fkey" FOREIGN KEY ("template_id", "organization_id") REFERENCES "inspection_templates"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "vehicle_driver_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Trip participant composite integrity constraint)
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_trip_participant_composite_fkey" FOREIGN KEY ("trip_id", "organization_id", "vehicle_id", "driver_id", "assignment_id") REFERENCES "trips"("id", "organization_id", "vehicle_id", "driver_id", "assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_inspection_id_organization_id_fkey" FOREIGN KEY ("inspection_id", "organization_id") REFERENCES "inspections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_template_item_id_organization_id_fkey" FOREIGN KEY ("template_item_id", "organization_id") REFERENCES "inspection_template_items"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

