-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('CRITICAL_INSPECTION', 'COMPLIANCE_EXPIRY', 'MAINTENANCE', 'INCIDENT', 'GENERAL');

-- CreateEnum
CREATE TYPE "DeliveryAttemptStatus" AS ENUM ('DELIVERED', 'FAILED', 'RETRYING', 'SKIPPED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" VARCHAR(250) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "source_event_id" UUID,
    "source_aggregate_type" VARCHAR(100),
    "source_aggregate_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channels" "NotificationChannel"[] NOT NULL,
    "in_app_read" BOOLEAN NOT NULL DEFAULT false,
    "in_app_read_at" TIMESTAMPTZ(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "DeliveryAttemptStatus" NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(1000),
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title_template" VARCHAR(250) NOT NULL,
    "body_template" VARCHAR(4000) NOT NULL,
    "description" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_deduplications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule_key" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "window_key" VARCHAR(50) NOT NULL,
    "triggered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_deduplications_pkey" PRIMARY KEY ("id")
);

-- Constraints and Indexes
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_display_id_key" UNIQUE ("organization_id", "display_id");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_id_organization_id_key" UNIQUE ("id", "organization_id");
CREATE INDEX "notifications_organization_id_created_at_idx" ON "notifications"("organization_id", "created_at" DESC);
CREATE INDEX "notifications_organization_id_category_created_at_idx" ON "notifications"("organization_id", "category", "created_at" DESC);
CREATE INDEX "notifications_organization_id_source_event_id_idx" ON "notifications"("organization_id", "source_event_id");
CREATE UNIQUE INDEX "idx_notifications_org_source_event_type" ON "notifications"("organization_id", "source_event_id", "type") WHERE "source_event_id" IS NOT NULL;

ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_organization_id_notification_id_user_id_key" UNIQUE ("organization_id", "notification_id", "user_id");
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_id_organization_id_key" UNIQUE ("id", "organization_id");
CREATE INDEX "notification_recipients_organization_id_user_id_in_app_read_created_at_idx" ON "notification_recipients"("organization_id", "user_id", "in_app_read", "created_at" DESC);
CREATE INDEX "notification_recipients_organization_id_user_id_created_at_idx" ON "notification_recipients"("organization_id", "user_id", "created_at" DESC);
CREATE INDEX "notification_recipients_organization_id_status_idx" ON "notification_recipients"("organization_id", "status");

CREATE INDEX "notification_delivery_attempts_organization_id_recipient_id_channel_idx" ON "notification_delivery_attempts"("organization_id", "recipient_id", "channel");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_user_id_category_key" UNIQUE ("organization_id", "user_id", "category");

ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_organization_id_key_key" UNIQUE ("organization_id", "key");

ALTER TABLE "automation_deduplications" ADD CONSTRAINT "automation_deduplications_organization_id_rule_key_aggregate_id_window_key_key" UNIQUE ("organization_id", "rule_key", "aggregate_id", "window_key");

-- Foreign Keys
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_organization_id_fkey" FOREIGN KEY ("notification_id", "organization_id") REFERENCES "notifications"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_recipient_id_organization_id_fkey" FOREIGN KEY ("recipient_id", "organization_id") REFERENCES "notification_recipients"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_deduplications" ADD CONSTRAINT "automation_deduplications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

