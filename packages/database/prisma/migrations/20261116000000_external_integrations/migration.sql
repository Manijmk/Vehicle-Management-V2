-- AlterEnum
ALTER TYPE "FuelTransactionSource" ADD VALUE IF NOT EXISTS 'FUEL_CARD_IMPORT';

-- AlterEnum
ALTER TYPE "TelemetrySource" ADD VALUE IF NOT EXISTS 'WEBHOOK';

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('OUTBOUND_WEBHOOK', 'INBOUND_TELEMATICS', 'FUEL_CARD_IMPORT', 'ACCOUNTING_EXPORT');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'RETRYING', 'EXHAUSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationMappingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FuelCardImportBatchStatus" AS ENUM ('PREVIEWED', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DRAFT',
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),
    "last_successful_activity_at" TIMESTAMPTZ(3),

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_secrets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "encrypted_secret" TEXT NOT NULL,
    "secret_hash" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by" UUID,

    CONSTRAINT "integration_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "endpoint_url" VARCHAR(2048) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "event_types" TEXT[] NOT NULL,
    "secret_reference" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "source_event_id" UUID NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "delivery_status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "last_http_status" INTEGER,
    "last_error_code" VARCHAR(100),
    "payload" JSONB NOT NULL,
    "locked_until" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "http_status" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "error_code" VARCHAR(100),
    "response_excerpt" VARCHAR(500),
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_integration_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_event_id" VARCHAR(200) NOT NULL,
    "payload_hash" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
    "processed_positions_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_integration_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_device_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider_device_id" VARCHAR(150) NOT NULL,
    "telemetry_device_id" UUID NOT NULL,
    "status" "IntegrationMappingStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_device_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_card_import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "status" "FuelCardImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
    "file_name" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "error_summary" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by" UUID,

    CONSTRAINT "fuel_card_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_transaction_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_transaction_id" VARCHAR(200) NOT NULL,
    "fuel_transaction_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_transaction_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_export_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "format" VARCHAR(20) NOT NULL DEFAULT 'CSV',
    "from_utc" TIMESTAMPTZ(3) NOT NULL,
    "to_utc" TIMESTAMPTZ(3) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_export_logs_pkey" PRIMARY KEY ("id")
);

-- Unique constraints & Indexes
CREATE UNIQUE INDEX "integration_connections_organization_id_display_id_key" ON "integration_connections"("organization_id", "display_id");
CREATE UNIQUE INDEX "integration_connections_id_organization_id_key" ON "integration_connections"("id", "organization_id");
CREATE INDEX "integration_connections_organization_id_kind_status_idx" ON "integration_connections"("organization_id", "kind", "status");
CREATE INDEX "integration_connections_organization_id_created_at_idx" ON "integration_connections"("organization_id", "created_at");

CREATE UNIQUE INDEX "integration_secrets_id_organization_id_key" ON "integration_secrets"("id", "organization_id");
CREATE INDEX "integration_secrets_organization_id_connection_id_status_idx" ON "integration_secrets"("organization_id", "connection_id", "status");

CREATE UNIQUE INDEX "webhook_subscriptions_id_organization_id_key" ON "webhook_subscriptions"("id", "organization_id");
CREATE INDEX "webhook_subscriptions_organization_id_connection_id_idx" ON "webhook_subscriptions"("organization_id", "connection_id");
CREATE INDEX "webhook_subscriptions_organization_id_status_idx" ON "webhook_subscriptions"("organization_id", "status");

CREATE UNIQUE INDEX "webhook_deliveries_id_organization_id_key" ON "webhook_deliveries"("id", "organization_id");
CREATE UNIQUE INDEX "webhook_deliveries_organization_id_subscription_id_source_event_id_key" ON "webhook_deliveries"("organization_id", "subscription_id", "source_event_id");
CREATE INDEX "webhook_deliveries_organization_id_delivery_status_next_attempt_at_idx" ON "webhook_deliveries"("organization_id", "delivery_status", "next_attempt_at");
CREATE INDEX "webhook_deliveries_organization_id_created_at_idx" ON "webhook_deliveries"("organization_id", "created_at");

CREATE UNIQUE INDEX "webhook_delivery_attempts_id_organization_id_key" ON "webhook_delivery_attempts"("id", "organization_id");
CREATE INDEX "webhook_delivery_attempts_organization_id_delivery_id_idx" ON "webhook_delivery_attempts"("organization_id", "delivery_id");

CREATE UNIQUE INDEX "inbound_integration_receipts_id_organization_id_key" ON "inbound_integration_receipts"("id", "organization_id");
CREATE UNIQUE INDEX "inbound_integration_receipts_org_conn_event_key" ON "inbound_integration_receipts"("organization_id", "connection_id", "external_event_id");
CREATE INDEX "inbound_integration_receipts_organization_id_connection_id_created_at_idx" ON "inbound_integration_receipts"("organization_id", "connection_id", "created_at");

CREATE UNIQUE INDEX "integration_device_mappings_id_organization_id_key" ON "integration_device_mappings"("id", "organization_id");
CREATE UNIQUE INDEX "integration_device_mappings_org_conn_provider_device_key" ON "integration_device_mappings"("organization_id", "connection_id", "provider_device_id");
CREATE INDEX "integration_device_mappings_organization_id_telemetry_device_id_idx" ON "integration_device_mappings"("organization_id", "telemetry_device_id");

CREATE UNIQUE INDEX "fuel_card_import_batches_id_organization_id_key" ON "fuel_card_import_batches"("id", "organization_id");
CREATE INDEX "fuel_card_import_batches_organization_id_connection_id_created_at_idx" ON "fuel_card_import_batches"("organization_id", "connection_id", "created_at");

CREATE UNIQUE INDEX "external_transaction_identities_id_organization_id_key" ON "external_transaction_identities"("id", "organization_id");
CREATE UNIQUE INDEX "external_transaction_identities_org_conn_ext_id_key" ON "external_transaction_identities"("organization_id", "connection_id", "external_transaction_id");
CREATE INDEX "external_transaction_identities_organization_id_fuel_transaction_id_idx" ON "external_transaction_identities"("organization_id", "fuel_transaction_id");

CREATE UNIQUE INDEX "accounting_export_logs_id_organization_id_key" ON "accounting_export_logs"("id", "organization_id");
CREATE INDEX "accounting_export_logs_organization_id_connection_id_created_at_idx" ON "accounting_export_logs"("organization_id", "connection_id", "created_at");

-- Foreign key constraints
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "integration_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "integration_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_organization_id_fkey" FOREIGN KEY ("subscription_id", "organization_id") REFERENCES "webhook_subscriptions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_delivery_attempts" ADD CONSTRAINT "webhook_delivery_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_delivery_attempts" ADD CONSTRAINT "webhook_delivery_attempts_delivery_id_organization_id_fkey" FOREIGN KEY ("delivery_id", "organization_id") REFERENCES "webhook_deliveries"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbound_integration_receipts" ADD CONSTRAINT "inbound_integration_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_integration_receipts" ADD CONSTRAINT "inbound_integration_receipts_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "integration_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_device_mappings" ADD CONSTRAINT "integration_device_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_device_mappings" ADD CONSTRAINT "integration_device_mappings_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "integration_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_device_mappings" ADD CONSTRAINT "integration_device_mappings_telemetry_device_id_organization_id_fkey" FOREIGN KEY ("telemetry_device_id", "organization_id") REFERENCES "telemetry_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fuel_card_import_batches" ADD CONSTRAINT "fuel_card_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_card_import_batches" ADD CONSTRAINT "fuel_card_import_batches_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "integration_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuel_card_import_batches" ADD CONSTRAINT "fuel_card_import_batches_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_transaction_identities" ADD CONSTRAINT "external_transaction_identities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_transaction_identities" ADD CONSTRAINT "external_transaction_identities_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "integration_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_transaction_identities" ADD CONSTRAINT "external_transaction_identities_fuel_transaction_id_organization_id_fkey" FOREIGN KEY ("fuel_transaction_id", "organization_id") REFERENCES "fuel_transactions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounting_export_logs" ADD CONSTRAINT "accounting_export_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_export_logs" ADD CONSTRAINT "accounting_export_logs_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "integration_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_export_logs" ADD CONSTRAINT "accounting_export_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
