import { ApplicationError } from '../../foundation/domain/errors.js';
import type {
  InspectionItemSeverity,
  InspectionTemplateStatus,
  InspectionType,
} from './inspection-template.js';

export type InspectionStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type InspectionResult = 'PASS' | 'FAIL';
export type InspectionResponseResult = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export const TERMINAL_INSPECTION_STATUSES = new Set<InspectionStatus>(['COMPLETED', 'CANCELLED']);

export function isTerminalInspectionStatus(status: InspectionStatus): boolean {
  return TERMINAL_INSPECTION_STATUSES.has(status);
}

const ALLOWED_INSPECTION_TRANSITIONS: Record<InspectionStatus, readonly InspectionStatus[]> = {
  DRAFT: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertInspectionTransition(
  currentStatus: InspectionStatus,
  targetStatus: InspectionStatus,
): void {
  if (isTerminalInspectionStatus(currentStatus)) {
    throw new ApplicationError(
      'INSPECTION_ALREADY_TERMINAL',
      `Cannot transition inspection from terminal status ${currentStatus} to ${targetStatus}`,
    );
  }

  const allowed = ALLOWED_INSPECTION_TRANSITIONS[currentStatus];
  if (!allowed.includes(targetStatus)) {
    throw new ApplicationError(
      'INVALID_INSPECTION_TRANSITION',
      `Cannot transition inspection from ${currentStatus} to ${targetStatus}`,
    );
  }
}

export interface InspectionResponseInput {
  readonly templateItemId: string;
  readonly response: InspectionResponseResult;
  readonly comment?: string | null;
}

export function evaluateInspectionResponses(
  templateItems: readonly {
    id: string;
    required: boolean;
    severity: InspectionItemSeverity;
  }[],
  submittedResponses: readonly InspectionResponseInput[],
): { result: InspectionResult; hasCriticalFailure: boolean } {
  const itemMap = new Map(templateItems.map((item) => [item.id, item]));
  const responseMap = new Map<string, InspectionResponseInput>();

  for (const resp of submittedResponses) {
    if (!itemMap.has(resp.templateItemId)) {
      throw new ApplicationError(
        'INSPECTION_ITEM_NOT_FOUND',
        `Submitted response references unknown template item ${resp.templateItemId}`,
      );
    }

    if (responseMap.has(resp.templateItemId)) {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        `Duplicate response submitted for template item ${resp.templateItemId}`,
      );
    }

    responseMap.set(resp.templateItemId, resp);
  }

  // Validate all required items have valid responses
  for (const item of templateItems) {
    if (item.required) {
      const resp = responseMap.get(item.id);
      if (!resp) {
        throw new ApplicationError(
          'INSPECTION_REQUIRED_RESPONSES_MISSING',
          `Required template item ${item.id} is missing a response`,
        );
      }

      if (resp.response === 'NOT_APPLICABLE') {
        throw new ApplicationError(
          'INSPECTION_ITEM_NOT_APPLICABLE',
          `Required template item ${item.id} cannot be marked NOT_APPLICABLE`,
        );
      }
    }
  }

  let hasFail = false;
  let hasCriticalFailure = false;

  for (const resp of submittedResponses) {
    if (resp.response === 'FAIL') {
      hasFail = true;
      const item = itemMap.get(resp.templateItemId);
      if (item?.severity === 'CRITICAL') {
        hasCriticalFailure = true;
      }
    }
  }

  return {
    result: hasFail ? 'FAIL' : 'PASS',
    hasCriticalFailure,
  };
}

export function assertInspectionCreation(props: {
  type: InspectionType;
  templateType: InspectionType;
  templateStatus: InspectionTemplateStatus;
  trip?: {
    status: string;
    vehicleId: string;
    driverId: string;
    assignmentId: string;
  } | null;
  vehicle: {
    id: string;
    status: string;
  };
  driverId?: string | null;
  assignmentId?: string | null;
}): void {
  if (props.templateStatus !== 'ACTIVE') {
    throw new ApplicationError(
      'INSPECTION_TEMPLATE_NOT_ACTIVE',
      'Cannot create an inspection from an inactive template',
    );
  }

  if (props.type !== props.templateType) {
    throw new ApplicationError(
      'INSPECTION_TYPE_MISMATCH',
      `Inspection type ${props.type} does not match template type ${props.templateType}`,
    );
  }

  if (props.type === 'PRE_TRIP') {
    if (!props.trip) {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        'PRE_TRIP inspections must be linked to a trip',
      );
    }
    if (props.trip.status !== 'READY') {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        `PRE_TRIP inspections require a trip in READY status (current status: ${props.trip.status})`,
      );
    }
    if (
      props.vehicle.id !== props.trip.vehicleId ||
      props.driverId !== props.trip.driverId ||
      props.assignmentId !== props.trip.assignmentId
    ) {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        'PRE_TRIP inspection participant details must match the linked trip',
      );
    }
  } else if (props.type === 'POST_TRIP') {
    if (!props.trip) {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        'POST_TRIP inspections must be linked to a trip',
      );
    }
    if (props.trip.status !== 'IN_PROGRESS') {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        `POST_TRIP inspections require a trip in IN_PROGRESS status (current status: ${props.trip.status})`,
      );
    }
    if (
      props.vehicle.id !== props.trip.vehicleId ||
      props.driverId !== props.trip.driverId ||
      props.assignmentId !== props.trip.assignmentId
    ) {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        'POST_TRIP inspection participant details must match the linked trip',
      );
    }
  } else {
    // Standalone inspection (PERIODIC, SAFETY, CUSTOM)
    if (props.vehicle.status === 'RETIRED') {
      throw new ApplicationError(
        'INSPECTION_ITEM_INVALID',
        'Cannot create standalone inspections for a RETIRED vehicle',
      );
    }
  }
}
