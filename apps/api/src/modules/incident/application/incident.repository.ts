import type {
  IncidentAttachmentType,
  IncidentOperationalImpact,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from '../domain/incident.js';
import type { IncidentStatusHistoryEntry } from '../domain/incident-status-history.js';
import type { IncidentNoteEntry } from '../domain/incident-note.js';
import type { IncidentAttachmentEntry } from '../domain/incident-attachment.js';

export interface IncidentMutationMetadata {
  readonly actorId: string;
  readonly requestId?: string | null | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

export interface IncidentDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly type: IncidentType;
  readonly severity: IncidentSeverity;
  readonly status: IncidentStatus;
  readonly vehicleId: string | null;
  readonly driverId: string | null;
  readonly tripId: string | null;
  readonly assignmentId: string | null;
  readonly occurredAt: Date;
  readonly reportedAt: Date;
  readonly title: string;
  readonly description: string;
  readonly locationText: string | null;
  readonly operationalImpact: IncidentOperationalImpact;
  readonly resolutionSummary: string | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly cancelReason: string | null;
  readonly cancellationReason?: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;

  readonly vehicle?: {
    id: string;
    displayId: string;
    registration: string;
    model: string;
    status: string;
  } | null;
  readonly driver?: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
    status: string;
  } | null;
  readonly trip?: {
    id: string;
    displayId: string;
    status: string;
    origin: string;
    destination: string;
  } | null;
  readonly assignment?: {
    id: string;
    status: string;
    startedAt: Date;
    endedAt: Date | null;
  } | null;
  readonly maintenanceRequest?: {
    id: string;
    displayId: string;
    status: string;
    title: string;
  } | null;

  readonly statusHistory?: IncidentStatusHistoryEntry[];
  readonly notes?: IncidentNoteEntry[];
  readonly attachments?: IncidentAttachmentEntry[];
}

export interface ReportIncidentInput {
  readonly organizationId: string;
  readonly type: IncidentType;
  readonly severity: IncidentSeverity;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: Date;
  readonly locationText?: string | null | undefined;
  readonly operationalImpact: IncidentOperationalImpact;
  readonly vehicleId?: string | null | undefined;
  readonly driverId?: string | null | undefined;
  readonly tripId?: string | null | undefined;
  readonly assignmentId?: string | null | undefined;
  readonly metadata: IncidentMutationMetadata;
}

export interface UpdateIncidentInput {
  readonly id: string;
  readonly organizationId: string;
  readonly version: number;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly severity?: IncidentSeverity | undefined;
  readonly locationText?: string | null | undefined;
  readonly operationalImpact?: IncidentOperationalImpact | undefined;
  readonly metadata: IncidentMutationMetadata;
}

export interface StartInvestigationInput {
  readonly id: string;
  readonly organizationId: string;
  readonly version: number;
  readonly metadata: IncidentMutationMetadata;
}

export interface ResolveIncidentInput {
  readonly id: string;
  readonly organizationId: string;
  readonly version: number;
  readonly resolutionSummary: string;
  readonly metadata: IncidentMutationMetadata;
}

export interface CloseIncidentInput {
  readonly id: string;
  readonly organizationId: string;
  readonly version: number;
  readonly metadata: IncidentMutationMetadata;
}

export interface CancelIncidentInput {
  readonly id: string;
  readonly organizationId: string;
  readonly version: number;
  readonly cancelReason: string;
  readonly metadata: IncidentMutationMetadata;
}

export interface AddNoteInput {
  readonly incidentId: string;
  readonly organizationId: string;
  readonly body: string;
  readonly metadata: IncidentMutationMetadata;
}

export interface UploadAttachmentInput {
  readonly incidentId: string;
  readonly organizationId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageKey: string;
  readonly sha256: string;
  readonly attachmentType: IncidentAttachmentType;
  readonly description?: string | null | undefined;
  readonly metadata: IncidentMutationMetadata;
}

export interface ListIncidentsFilter {
  readonly status?: IncidentStatus | undefined;
  readonly type?: IncidentType | undefined;
  readonly severity?: IncidentSeverity | undefined;
  readonly vehicleId?: string | undefined;
  readonly driverId?: string | undefined;
  readonly tripId?: string | undefined;
  readonly operationalImpact?: IncidentOperationalImpact | undefined;
  readonly search?: string | undefined;
  readonly fromOccurredAt?: Date | undefined;
  readonly toOccurredAt?: Date | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedIncidents {
  readonly items: IncidentDetail[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface IncidentRepository {
  createIncident(input: ReportIncidentInput): Promise<IncidentDetail>;
  findIncidentById(id: string, organizationId: string): Promise<IncidentDetail | null>;
  listIncidents(organizationId: string, filter?: ListIncidentsFilter): Promise<PaginatedIncidents>;
  updateIncident(input: UpdateIncidentInput): Promise<IncidentDetail>;
  startInvestigation(input: StartInvestigationInput): Promise<IncidentDetail>;
  resolveIncident(input: ResolveIncidentInput): Promise<IncidentDetail>;
  closeIncident(input: CloseIncidentInput): Promise<IncidentDetail>;
  cancelIncident(input: CancelIncidentInput): Promise<IncidentDetail>;
  addNote(input: AddNoteInput): Promise<IncidentNoteEntry>;
  listNotes(incidentId: string, organizationId: string): Promise<IncidentNoteEntry[]>;
  addAttachment(input: UploadAttachmentInput): Promise<IncidentAttachmentEntry>;
  findAttachmentById(
    attachmentId: string,
    incidentId: string,
    organizationId: string,
  ): Promise<IncidentAttachmentEntry | null>;
  listAttachments(incidentId: string, organizationId: string): Promise<IncidentAttachmentEntry[]>;
  isVehicleBlocked(vehicleId: string, organizationId: string): Promise<boolean>;
  isDriverBlocked(driverId: string, organizationId: string): Promise<boolean>;
  getIncidentsForVehicle(
    vehicleId: string,
    organizationId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedIncidents>;
  getIncidentsForDriver(
    driverId: string,
    organizationId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedIncidents>;
  getIncidentsForTrip(
    tripId: string,
    organizationId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedIncidents>;
}
