-- CreateEnum
CREATE TYPE "ComplianceSubjectType" AS ENUM ('VEHICLE', 'DRIVER');

-- CreateEnum
CREATE TYPE "ComplianceDocumentTypeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ComplianceDocumentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REVOKED');

-- CreateTable
CREATE TABLE "compliance_document_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "subject_type" "ComplianceSubjectType" NOT NULL,
    "status" "ComplianceDocumentTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "blocks_operation" BOOLEAN NOT NULL DEFAULT false,
    "requires_expiry" BOOLEAN NOT NULL DEFAULT false,
    "warning_days_before_expiry" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "compliance_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "document_type_id" UUID NOT NULL,
    "subject_type" "ComplianceSubjectType" NOT NULL,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "document_number" VARCHAR(100),
    "issuer_name" VARCHAR(200),
    "issued_on" DATE,
    "expires_on" DATE,
    "status" "ComplianceDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" VARCHAR(1000),
    "object_key" VARCHAR(500) NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_etag" VARCHAR(100),
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by" UUID,
    "revocation_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "compliance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_document_types_organization_id_code_key" ON "compliance_document_types"("organization_id", "code");
CREATE UNIQUE INDEX "compliance_document_types_id_organization_id_key" ON "compliance_document_types"("id", "organization_id");
CREATE UNIQUE INDEX "compliance_document_types_id_organization_id_subject_type_key" ON "compliance_document_types"("id", "organization_id", "subject_type");
CREATE INDEX "compliance_document_types_organization_id_status_idx" ON "compliance_document_types"("organization_id", "status");
CREATE INDEX "compliance_document_types_organization_id_subject_type_status_idx" ON "compliance_document_types"("organization_id", "subject_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_documents_organization_id_display_id_key" ON "compliance_documents"("organization_id", "display_id");
CREATE UNIQUE INDEX "compliance_documents_id_organization_id_key" ON "compliance_documents"("id", "organization_id");
CREATE INDEX "compliance_documents_organization_id_status_idx" ON "compliance_documents"("organization_id", "status");
CREATE INDEX "compliance_documents_organization_id_subject_type_status_idx" ON "compliance_documents"("organization_id", "subject_type", "status");
CREATE INDEX "compliance_documents_organization_id_vehicle_id_status_idx" ON "compliance_documents"("organization_id", "vehicle_id", "status");
CREATE INDEX "compliance_documents_organization_id_driver_id_status_idx" ON "compliance_documents"("organization_id", "driver_id", "status");
CREATE INDEX "compliance_documents_organization_id_expires_on_idx" ON "compliance_documents"("organization_id", "expires_on");
CREATE INDEX "compliance_documents_organization_id_created_at_idx" ON "compliance_documents"("organization_id", "created_at");

-- Partial Unique Indexes for Single Active Document per Subject and Type
CREATE UNIQUE INDEX "compliance_documents_vehicle_active_idx" ON "compliance_documents"("organization_id", "vehicle_id", "document_type_id") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX "compliance_documents_driver_active_idx" ON "compliance_documents"("organization_id", "driver_id", "document_type_id") WHERE status = 'ACTIVE';

-- CHECK Constraints
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_document_subject_check" CHECK (
    ("subject_type" = 'VEHICLE' AND "vehicle_id" IS NOT NULL AND "driver_id" IS NULL) OR
    ("subject_type" = 'DRIVER' AND "driver_id" IS NOT NULL AND "vehicle_id" IS NULL)
);

ALTER TABLE "compliance_document_types" ADD CONSTRAINT "compliance_doc_type_blocks_op_check" CHECK (
    "blocks_operation" = false OR "required" = true
);

ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_document_date_range_check" CHECK (
    "issued_on" IS NULL OR "expires_on" IS NULL OR "expires_on" >= "issued_on"
);

-- AddForeignKey (compliance_document_types)
ALTER TABLE "compliance_document_types" ADD CONSTRAINT "compliance_document_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_document_types" ADD CONSTRAINT "compliance_document_types_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_document_types" ADD CONSTRAINT "compliance_document_types_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (compliance_documents)
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_type_org_subject_fkey" FOREIGN KEY ("document_type_id", "organization_id", "subject_type") REFERENCES "compliance_document_types"("id", "organization_id", "subject_type") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_superseded_by_id_organization_id_fkey" FOREIGN KEY ("superseded_by_id", "organization_id") REFERENCES "compliance_documents"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

