import { InvalidWebhookEventTypesError } from './integration-errors.js';

export const ALLOWED_WEBHOOK_EVENT_TYPES = [
  // Trips (6)
  'TripCreated',
  'TripReady',
  'TripStarted',
  'TripCompleted',
  'TripCancelled',
  'TripAborted',
  // Vehicles (4)
  'VehicleCreated',
  'VehicleActivated',
  'VehicleUpdated',
  'VehicleRetired',
  // Drivers (5)
  'DriverCreated',
  'DriverUpdated',
  'DriverActivated',
  'DriverSuspended',
  'DriverDeactivated',
  // Assignments (2)
  'VehicleDriverAssigned',
  'VehicleDriverUnassigned',
  // Inspections (3)
  'InspectionCompleted',
  'InspectionFailed',
  'InspectionCriticalFailureDetected',
  // Maintenance (3)
  'WorkOrderCreated',
  'WorkOrderCompleted',
  'MaintenanceRequestCreated',
  // Compliance (3)
  'ComplianceDocumentUploaded',
  'ComplianceDocumentRevoked',
  'ComplianceDocumentReplaced',
  // Finance (6)
  'FuelTransactionCreated',
  'FuelTransactionVoided',
  'FuelAnomalyDetected',
  'ExpenseCreated',
  'ExpensePosted',
  'ExpenseVoided',
  // Incidents (5)
  'IncidentReported',
  'IncidentInvestigationStarted',
  'IncidentResolved',
  'IncidentClosed',
  'IncidentCancelled',
] as const;

export type AllowedWebhookEventType = (typeof ALLOWED_WEBHOOK_EVENT_TYPES)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_WEBHOOK_EVENT_TYPES);

export function isAllowedWebhookEventType(eventType: string): boolean {
  return ALLOWED_SET.has(eventType);
}

export function validateWebhookEventTypes(eventTypes: readonly string[]): string[] {
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    throw new InvalidWebhookEventTypesError('At least one event type must be specified');
  }

  const unique = [...new Set(eventTypes)];
  for (const t of unique) {
    if (!isAllowedWebhookEventType(t)) {
      throw new InvalidWebhookEventTypesError(
        `Event type '${t}' is not supported for webhook subscriptions. Must be one of the approved event types.`,
      );
    }
  }

  return unique;
}

export const assertValidWebhookEventTypes = validateWebhookEventTypes;
