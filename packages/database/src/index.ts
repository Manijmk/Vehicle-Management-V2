import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client.js';

export interface DatabaseClientConfig {
  readonly databaseUrl: string;
}

export function createDatabaseClient(config: DatabaseClientConfig): PrismaClient {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });

  return new PrismaClient({ adapter });
}

export type { PrismaClient } from './generated/client.js';
export {
  AssignmentStatus,
  DriverStatus,
  FuelType,
  InspectionItemSeverity,
  InspectionResponseResult,
  InspectionResult,
  InspectionStatus,
  InspectionTemplateStatus,
  InspectionType,
  MembershipStatus,
  OutboxStatus,
  PrincipalStatus,
  Prisma,
  TripStatus,
  VehicleStatus,
  VehicleType,
  MaintenanceRequestSource,
  MaintenancePriority,
  MaintenanceRequestStatus,
  MaintenanceWorkOrderStatus,
  MaintenancePlanStatus,
  MaintenanceVendorStatus,
  WorkOrderTaskStatus,
  ComplianceSubjectType,
  ComplianceDocumentTypeStatus,
  ComplianceDocumentStatus,
  FuelQuantityUnit,
  FuelTransactionSource,
  FuelTransactionStatus,
  FuelAnomalyCode,
  FuelAnomalySeverity,
  ExpenseCategoryStatus,
  ExpenseStatus,
  FuelImportStatus,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
  IncidentOperationalImpact,
  IncidentAttachmentType,
  NotificationChannel,
  NotificationStatus,
  NotificationPriority,
  NotificationCategory,
  DeliveryAttemptStatus,
  TelemetrySource,
  TelemetryPositionStatus,
  TelemetryDeviceStatus,
} from './generated/client.js';

export type {
  Incident,
  IncidentAttachment,
  IncidentNote,
  IncidentStatusHistory,
  Notification,
  NotificationRecipient,
  NotificationDeliveryAttempt,
  NotificationPreference,
  NotificationTemplate,
  AutomationDeduplication,
  TelemetryDevice,
  TelemetryDeviceVehicleAssignment,
  TelemetryPosition,
  TelemetryCurrentPosition,
} from './generated/client.js';
