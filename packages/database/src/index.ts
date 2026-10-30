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
} from './generated/client.js';
