-- CreateEnum
CREATE TYPE "MaintenanceRequestSource" AS ENUM ('MANUAL', 'INSPECTION', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenanceRequestStatus" AS ENUM ('OPEN', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceWorkOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenancePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaintenanceVendorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WorkOrderTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "source_type" "MaintenanceRequestSource" NOT NULL,
    "source_inspection_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "blocks_operation" BOOLEAN NOT NULL DEFAULT false,
    "status" "MaintenanceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "converted_work_order_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "status" "MaintenancePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "interval_days" INTEGER,
    "interval_odometer_km" INTEGER,
    "default_priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "blocks_operation_when_due" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_maintenance_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "maintenance_plan_id" UUID NOT NULL,
    "last_completed_at" TIMESTAMPTZ(3),
    "last_completed_odometer_km" INTEGER,
    "next_due_at" TIMESTAMPTZ(3),
    "next_due_odometer_km" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "vehicle_maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_vendors" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(200),
    "phone" VARCHAR(50),
    "email" VARCHAR(200),
    "notes" VARCHAR(500),
    "status" "MaintenanceVendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "maintenance_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_work_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "maintenance_request_id" UUID,
    "maintenance_schedule_id" UUID,
    "vendor_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "blocks_operation" BOOLEAN NOT NULL DEFAULT false,
    "status" "MaintenanceWorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "opened_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(500),
    "completion_notes" VARCHAR(1000),
    "odometer_at_open" INTEGER,
    "odometer_at_completion" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "maintenance_work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_work_order_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "status" "WorkOrderTaskStatus" NOT NULL DEFAULT 'PENDING',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_work_order_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_work_order_parts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "part_number" VARCHAR(100),
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "total_cost" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_work_order_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_work_order_labor" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "total_cost" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_work_order_labor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_organization_id_display_id_key" ON "maintenance_requests"("organization_id", "display_id");
CREATE UNIQUE INDEX "maintenance_requests_id_organization_id_key" ON "maintenance_requests"("id", "organization_id");
CREATE INDEX "maintenance_requests_organization_id_status_idx" ON "maintenance_requests"("organization_id", "status");
CREATE INDEX "maintenance_requests_organization_id_vehicle_id_status_idx" ON "maintenance_requests"("organization_id", "vehicle_id", "status");
CREATE INDEX "maintenance_requests_organization_id_status_priority_idx" ON "maintenance_requests"("organization_id", "status", "priority");
CREATE INDEX "maintenance_requests_organization_id_source_inspection_id_idx" ON "maintenance_requests"("organization_id", "source_inspection_id");

-- Partial Unique Index for idempotent inspection-generated maintenance requests
CREATE UNIQUE INDEX "unique_inspection_maintenance_request" ON "maintenance_requests"("organization_id", "source_inspection_id") WHERE "source_type" = 'INSPECTION' AND "source_inspection_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_organization_id_display_id_key" ON "maintenance_plans"("organization_id", "display_id");
CREATE UNIQUE INDEX "maintenance_plans_id_organization_id_key" ON "maintenance_plans"("id", "organization_id");
CREATE INDEX "maintenance_plans_organization_id_status_idx" ON "maintenance_plans"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_maintenance_schedules_organization_id_vehicle_id_maintenance_plan_id_key" ON "vehicle_maintenance_schedules"("organization_id", "vehicle_id", "maintenance_plan_id");
CREATE UNIQUE INDEX "vehicle_maintenance_schedules_id_organization_id_key" ON "vehicle_maintenance_schedules"("id", "organization_id");
CREATE INDEX "vehicle_maintenance_schedules_organization_id_vehicle_id_idx" ON "vehicle_maintenance_schedules"("organization_id", "vehicle_id");
CREATE INDEX "vehicle_maintenance_schedules_organization_id_next_due_at_idx" ON "vehicle_maintenance_schedules"("organization_id", "next_due_at");
CREATE INDEX "vehicle_maintenance_schedules_organization_id_next_due_odometer_km_idx" ON "vehicle_maintenance_schedules"("organization_id", "next_due_odometer_km");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_vendors_organization_id_display_id_key" ON "maintenance_vendors"("organization_id", "display_id");
CREATE UNIQUE INDEX "maintenance_vendors_id_organization_id_key" ON "maintenance_vendors"("id", "organization_id");
CREATE INDEX "maintenance_vendors_organization_id_status_idx" ON "maintenance_vendors"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_work_orders_organization_id_display_id_key" ON "maintenance_work_orders"("organization_id", "display_id");
CREATE UNIQUE INDEX "maintenance_work_orders_id_organization_id_key" ON "maintenance_work_orders"("id", "organization_id");
CREATE INDEX "maintenance_work_orders_organization_id_status_idx" ON "maintenance_work_orders"("organization_id", "status");
CREATE INDEX "maintenance_work_orders_organization_id_vehicle_id_status_idx" ON "maintenance_work_orders"("organization_id", "vehicle_id", "status");
CREATE INDEX "maintenance_work_orders_organization_id_maintenance_request_id_idx" ON "maintenance_work_orders"("organization_id", "maintenance_request_id");
CREATE INDEX "maintenance_work_orders_organization_id_maintenance_schedule_id_idx" ON "maintenance_work_orders"("organization_id", "maintenance_schedule_id");

-- Partial Unique Index for at most one non-terminal work order per preventive schedule
CREATE UNIQUE INDEX "unique_active_schedule_work_order" ON "maintenance_work_orders"("organization_id", "maintenance_schedule_id") WHERE "maintenance_schedule_id" IS NOT NULL AND "status" IN ('DRAFT', 'OPEN', 'IN_PROGRESS');

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_work_order_tasks_id_organization_id_key" ON "maintenance_work_order_tasks"("id", "organization_id");
CREATE INDEX "maintenance_work_order_tasks_organization_id_work_order_id_sort_order_idx" ON "maintenance_work_order_tasks"("organization_id", "work_order_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_work_order_parts_id_organization_id_key" ON "maintenance_work_order_parts"("id", "organization_id");
CREATE INDEX "maintenance_work_order_parts_organization_id_work_order_id_idx" ON "maintenance_work_order_parts"("organization_id", "work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_work_order_labor_id_organization_id_key" ON "maintenance_work_order_labor"("id", "organization_id");
CREATE INDEX "maintenance_work_order_labor_organization_id_work_order_id_idx" ON "maintenance_work_order_labor"("organization_id", "work_order_id");

-- AddForeignKey (MaintenanceRequest)
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_source_inspection_id_organization_id_fkey" FOREIGN KEY ("source_inspection_id", "organization_id") REFERENCES "inspections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_converted_work_order_id_organization_id_fkey" FOREIGN KEY ("converted_work_order_id", "organization_id") REFERENCES "maintenance_work_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (MaintenancePlan)
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (VehicleMaintenanceSchedule)
ALTER TABLE "vehicle_maintenance_schedules" ADD CONSTRAINT "vehicle_maintenance_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicle_maintenance_schedules" ADD CONSTRAINT "vehicle_maintenance_schedules_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicle_maintenance_schedules" ADD CONSTRAINT "vehicle_maintenance_schedules_maintenance_plan_id_organization_id_fkey" FOREIGN KEY ("maintenance_plan_id", "organization_id") REFERENCES "maintenance_plans"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (MaintenanceVendor)
ALTER TABLE "maintenance_vendors" ADD CONSTRAINT "maintenance_vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_vendors" ADD CONSTRAINT "maintenance_vendors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_vendors" ADD CONSTRAINT "maintenance_vendors_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (MaintenanceWorkOrder)
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_maintenance_request_id_organization_id_fkey" FOREIGN KEY ("maintenance_request_id", "organization_id") REFERENCES "maintenance_requests"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_maintenance_schedule_id_organization_id_fkey" FOREIGN KEY ("maintenance_schedule_id", "organization_id") REFERENCES "vehicle_maintenance_schedules"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_vendor_id_organization_id_fkey" FOREIGN KEY ("vendor_id", "organization_id") REFERENCES "maintenance_vendors"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (MaintenanceWorkOrderTask)
ALTER TABLE "maintenance_work_order_tasks" ADD CONSTRAINT "maintenance_work_order_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_order_tasks" ADD CONSTRAINT "maintenance_work_order_tasks_work_order_id_organization_id_fkey" FOREIGN KEY ("work_order_id", "organization_id") REFERENCES "maintenance_work_orders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (MaintenanceWorkOrderPart)
ALTER TABLE "maintenance_work_order_parts" ADD CONSTRAINT "maintenance_work_order_parts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_order_parts" ADD CONSTRAINT "maintenance_work_order_parts_work_order_id_organization_id_fkey" FOREIGN KEY ("work_order_id", "organization_id") REFERENCES "maintenance_work_orders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (MaintenanceWorkOrderLabor)
ALTER TABLE "maintenance_work_order_labor" ADD CONSTRAINT "maintenance_work_order_labor_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_work_order_labor" ADD CONSTRAINT "maintenance_work_order_labor_work_order_id_organization_id_fkey" FOREIGN KEY ("work_order_id", "organization_id") REFERENCES "maintenance_work_orders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

