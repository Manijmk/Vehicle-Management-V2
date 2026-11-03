import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { ApplicationError } from '../../foundation/domain/errors.js';
import { OBJECT_STORAGE_PORT } from '../../compliance/compliance.tokens.js';
import type { ObjectStoragePort } from '../../compliance/application/object-storage.port.js';
import { MaintenanceService } from '../../maintenance/application/maintenance.service.js';
import type { MaintenanceRequestDetail } from '../../maintenance/application/maintenance.repository.js';
import type { OperationalIncidentGate } from '../../trip/application/operational-incident-gate.port.js';
import {
  assertAllowedIncidentTransition,
  assertValidCancellation,
  assertValidResolution,
  validateIncidentOccurredAt,
  validateIncidentSubjects,
  validateOperationalImpactConsistency,
  type IncidentAttachmentType,
} from '../domain/incident.js';
import {
  DriverBlockedByIncidentError,
  IncidentAttachmentFileTooLargeError,
  IncidentAttachmentNotFoundError,
  IncidentNotFoundError,
  UnsupportedIncidentAttachmentTypeError,
  VehicleBlockedByIncidentError,
} from '../domain/incident-errors.js';
import { INCIDENT_REPOSITORY } from '../incident.tokens.js';
import type {
  IncidentDetail,
  IncidentMutationMetadata,
  IncidentRepository,
  ListIncidentsFilter,
  PaginatedIncidents,
  ReportIncidentInput,
  UpdateIncidentInput,
} from './incident.repository.js';
import type { IncidentNoteEntry } from '../domain/incident-note.js';
import type { IncidentAttachmentEntry } from '../domain/incident-attachment.js';

export const MAX_INCIDENT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_INCIDENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

function sanitizeFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function validateIncidentAttachmentFile(
  buffer: Buffer,
  declaredMimeType: string,
  maxSizeBytes: number = MAX_INCIDENT_ATTACHMENT_SIZE_BYTES,
): { detectedMimeType: string; sizeBytes: number } {
  const sizeBytes = buffer.length;

  if (sizeBytes > maxSizeBytes) {
    throw new IncidentAttachmentFileTooLargeError(sizeBytes, maxSizeBytes);
  }

  if (sizeBytes < 4) {
    throw new UnsupportedIncidentAttachmentTypeError(declaredMimeType || 'unknown');
  }

  let detectedType: string | null = null;

  // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    detectedType = 'application/pdf';
  }
  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  else if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedType = 'image/png';
  }
  // JPEG: 0xFF 0xD8 0xFF
  else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedType = 'image/jpeg';
  }

  if (!detectedType) {
    throw new UnsupportedIncidentAttachmentTypeError(declaredMimeType || 'unknown');
  }

  return { detectedMimeType: detectedType, sizeBytes };
}

@Injectable()
export class IncidentService implements OperationalIncidentGate {
  constructor(
    @Inject(INCIDENT_REPOSITORY)
    private readonly repository: IncidentRepository,
    @Inject(OBJECT_STORAGE_PORT)
    private readonly objectStorage: ObjectStoragePort,
    @Inject(MaintenanceService)
    private readonly maintenanceService: MaintenanceService,
  ) {}

  async reportIncident(
    organizationId: string,
    input: Omit<ReportIncidentInput, 'organizationId' | 'metadata'>,
    metadata: IncidentMutationMetadata,
  ): Promise<IncidentDetail> {
    validateIncidentSubjects({
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      tripId: input.tripId,
    });
    if (!input.tripId) {
      validateOperationalImpactConsistency(
        input.operationalImpact,
        input.vehicleId,
        input.driverId,
      );
    }
    validateIncidentOccurredAt(input.occurredAt);

    return this.repository.createIncident({
      ...input,
      organizationId,
      metadata,
    });
  }

  async getIncident(organizationId: string, incidentId: string): Promise<IncidentDetail> {
    const incident = await this.repository.findIncidentById(incidentId, organizationId);
    if (!incident) {
      throw new IncidentNotFoundError(incidentId);
    }
    return incident;
  }

  async listIncidents(
    organizationId: string,
    filter?: ListIncidentsFilter,
  ): Promise<PaginatedIncidents> {
    return this.repository.listIncidents(organizationId, filter);
  }

  async updateIncident(
    organizationId: string,
    incidentId: string,
    input: Omit<UpdateIncidentInput, 'id' | 'organizationId' | 'metadata'>,
    metadata: IncidentMutationMetadata,
  ): Promise<IncidentDetail> {
    const existing = await this.getIncident(organizationId, incidentId);
    if (existing.status !== 'REPORTED' && existing.status !== 'INVESTIGATING') {
      throw new ApplicationError(
        'INVALID_INCIDENT_TRANSITION',
        `Cannot update incident in status ${existing.status}`,
      );
    }

    if (input.operationalImpact) {
      validateOperationalImpactConsistency(
        input.operationalImpact,
        existing.vehicleId,
        existing.driverId,
      );
    }

    return this.repository.updateIncident({
      id: incidentId,
      organizationId,
      version: input.version,
      title: input.title,
      description: input.description,
      severity: input.severity,
      locationText: input.locationText,
      operationalImpact: input.operationalImpact,
      metadata,
    });
  }

  async startInvestigation(
    organizationId: string,
    incidentId: string,
    version: number,
    metadata: IncidentMutationMetadata,
  ): Promise<IncidentDetail> {
    const existing = await this.getIncident(organizationId, incidentId);
    assertAllowedIncidentTransition(existing.status, 'INVESTIGATING');

    return this.repository.startInvestigation({
      id: incidentId,
      organizationId,
      version,
      metadata,
    });
  }

  async resolveIncident(
    organizationId: string,
    incidentId: string,
    version: number,
    resolutionSummary: string,
    metadata: IncidentMutationMetadata,
  ): Promise<IncidentDetail> {
    const existing = await this.getIncident(organizationId, incidentId);
    assertAllowedIncidentTransition(existing.status, 'RESOLVED');
    const validSummary = assertValidResolution(resolutionSummary);

    return this.repository.resolveIncident({
      id: incidentId,
      organizationId,
      version,
      resolutionSummary: validSummary,
      metadata,
    });
  }

  async closeIncident(
    organizationId: string,
    incidentId: string,
    version: number,
    metadata: IncidentMutationMetadata,
  ): Promise<IncidentDetail> {
    const existing = await this.getIncident(organizationId, incidentId);
    assertAllowedIncidentTransition(existing.status, 'CLOSED');

    return this.repository.closeIncident({
      id: incidentId,
      organizationId,
      version,
      metadata,
    });
  }

  async cancelIncident(
    organizationId: string,
    incidentId: string,
    version: number,
    cancelReason: string,
    metadata: IncidentMutationMetadata,
  ): Promise<IncidentDetail> {
    const existing = await this.getIncident(organizationId, incidentId);
    assertAllowedIncidentTransition(existing.status, 'CANCELLED');
    const validReason = assertValidCancellation(cancelReason);

    return this.repository.cancelIncident({
      id: incidentId,
      organizationId,
      version,
      cancelReason: validReason,
      metadata,
    });
  }

  async addNote(
    organizationId: string,
    incidentId: string,
    body: string,
    metadata: IncidentMutationMetadata,
  ): Promise<IncidentNoteEntry> {
    await this.getIncident(organizationId, incidentId);
    if (!body || body.trim().length === 0) {
      throw new ApplicationError('VALIDATION_ERROR', 'Note body cannot be empty');
    }

    return this.repository.addNote({
      incidentId,
      organizationId,
      body: body.trim(),
      metadata,
    });
  }

  async listNotes(organizationId: string, incidentId: string): Promise<IncidentNoteEntry[]> {
    await this.getIncident(organizationId, incidentId);
    return this.repository.listNotes(incidentId, organizationId);
  }

  async uploadAttachment(
    organizationId: string,
    incidentId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    attachmentType: IncidentAttachmentType = 'OTHER',
    description?: string,
    metadata: IncidentMutationMetadata = { actorId: '' },
  ): Promise<IncidentAttachmentEntry> {
    await this.getIncident(organizationId, incidentId);

    const { detectedMimeType, sizeBytes } = validateIncidentAttachmentFile(
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const safeName = sanitizeFileName(file.originalname);
    const storageKey = `tenants/${organizationId}/incidents/${incidentId}/${randomUUID()}-${safeName}`;

    await this.objectStorage.putObject({
      objectKey: storageKey,
      body: file.buffer,
      contentType: detectedMimeType,
    });

    return this.repository.addAttachment({
      incidentId,
      organizationId,
      fileName: safeName,
      mimeType: detectedMimeType,
      sizeBytes,
      storageKey,
      sha256,
      attachmentType,
      description: description?.trim() || null,
      metadata,
    });
  }

  async listAttachments(
    organizationId: string,
    incidentId: string,
  ): Promise<IncidentAttachmentEntry[]> {
    await this.getIncident(organizationId, incidentId);
    return this.repository.listAttachments(incidentId, organizationId);
  }

  async getAttachmentDownloadUrl(
    organizationId: string,
    incidentId: string,
    attachmentId: string,
  ): Promise<{
    url: string;
    downloadUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    fileSizeBytes?: number;
    sha256?: string;
    fileHashSha256?: string;
  }> {
    const attachment = await this.repository.findAttachmentById(
      attachmentId,
      incidentId,
      organizationId,
    );
    if (!attachment) {
      throw new IncidentAttachmentNotFoundError(attachmentId);
    }

    const url = await this.objectStorage.getSignedDownloadUrl({
      objectKey: attachment.storageKey,
      expiresInSeconds: 900,
      fileName: attachment.fileName,
    });

    return {
      url,
      downloadUrl: url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      fileSizeBytes: attachment.sizeBytes,
      sha256: attachment.sha256,
      fileHashSha256: attachment.sha256,
    };
  }

  async createMaintenanceRequest(
    organizationId: string,
    incidentId: string,
    input: {
      title?: string;
      description?: string;
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
      blocksOperation?: boolean;
    },
    metadata: IncidentMutationMetadata,
  ): Promise<MaintenanceRequestDetail> {
    const incident = await this.getIncident(organizationId, incidentId);

    if (!incident.vehicleId) {
      throw new ApplicationError(
        'VEHICLE_REQUIRED',
        'Incident does not have an associated vehicle for maintenance request',
      );
    }

    // Check if one already exists for this incident
    const existing = await this.maintenanceService.getRequestByIncident(incidentId, organizationId);
    if (existing) {
      return existing;
    }

    const priority =
      input.priority ??
      (incident.severity === 'CRITICAL'
        ? 'CRITICAL'
        : incident.severity === 'HIGH'
          ? 'HIGH'
          : 'NORMAL');

    const blocksOperation =
      input.blocksOperation ??
      (incident.operationalImpact === 'VEHICLE' || incident.operationalImpact === 'BOTH');

    const maintenanceMetadata = {
      actorId: metadata.actorId,
      requestId: metadata.requestId ?? 'unknown',
      ipAddress: metadata.ipAddress ?? '127.0.0.1',
      userAgent: metadata.userAgent ?? 'unknown',
    };

    return this.maintenanceService.createRequest({
      organizationId,
      vehicleId: incident.vehicleId,
      sourceType: 'INCIDENT',
      sourceIncidentId: incidentId,
      title:
        input.title?.trim() || `Maintenance from Incident ${incident.displayId}: ${incident.title}`,
      description: input.description?.trim() ?? incident.description,
      priority,
      blocksOperation,
      metadata: maintenanceMetadata,
    });
  }

  async getVehicleIncidents(
    organizationId: string,
    vehicleId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedIncidents> {
    return this.repository.getIncidentsForVehicle(vehicleId, organizationId, limit, offset);
  }

  async getDriverIncidents(
    organizationId: string,
    driverId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedIncidents> {
    return this.repository.getIncidentsForDriver(driverId, organizationId, limit, offset);
  }

  async getTripIncidents(
    organizationId: string,
    tripId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedIncidents> {
    return this.repository.getIncidentsForTrip(tripId, organizationId, limit, offset);
  }

  // =========================================================================
  // OPERATIONAL INCIDENT GATE IMPLEMENTATION
  // =========================================================================

  async assertVehicleIncidentAvailability(
    vehicleId: string,
    organizationId: string,
  ): Promise<void> {
    const blocked = await this.repository.isVehicleBlocked(vehicleId, organizationId);
    if (blocked) {
      throw new VehicleBlockedByIncidentError(vehicleId);
    }
  }

  async assertDriverIncidentAvailability(driverId: string, organizationId: string): Promise<void> {
    const blocked = await this.repository.isDriverBlocked(driverId, organizationId);
    if (blocked) {
      throw new DriverBlockedByIncidentError(driverId);
    }
  }

  async isVehicleBlockedByIncident(vehicleId: string, organizationId: string): Promise<boolean> {
    return this.repository.isVehicleBlocked(vehicleId, organizationId);
  }

  async isDriverBlockedByIncident(driverId: string, organizationId: string): Promise<boolean> {
    return this.repository.isDriverBlocked(driverId, organizationId);
  }
}
