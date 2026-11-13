import { Inject, Injectable } from '@nestjs/common';
import { TelemetryDeviceStatus } from '@vms/database';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertValidDeviceIdentifier,
  assertValidDeviceName,
  assertValidDeviceNotes,
  assertValidDeviceStatusTransition,
  generateDeviceCredential,
  verifyCredentialSecret,
} from '../domain/device.js';
import {
  TelemetryDeviceAlreadyAssignedError,
  TelemetryDeviceCredentialInvalidError,
  TelemetryDeviceCredentialNotFoundError,
  TelemetryDeviceInactiveError,
  TelemetryDeviceNotAssignedError,
  TelemetryDeviceNotFoundError,
  TelemetryDeviceSuspendedError,
} from '../domain/telemetry-errors.js';
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
  type TelemetryDeviceCredentialRecord,
  type TelemetryDeviceRecord,
} from './telemetry.repository.js';

export interface CreateDeviceCommand {
  readonly organizationId: string;
  readonly name: string;
  readonly identifier: string;
  readonly notes?: string | null | undefined;
  readonly metadata?: Record<string, unknown> | null | undefined;
  readonly actorId?: string | undefined;
}

export interface UpdateDeviceCommand {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly name?: string | undefined;
  readonly notes?: string | null | undefined;
  readonly metadata?: Record<string, unknown> | null | undefined;
  readonly actorId?: string | undefined;
}

export interface AssignDeviceCommand {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly vehicleId: string;
  readonly assignedBy: string;
  readonly notes?: string | null | undefined;
}

@Injectable()
export class DeviceService {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
  ) {}

  async createDevice(command: CreateDeviceCommand): Promise<TelemetryDeviceRecord> {
    assertValidDeviceName(command.name);
    assertValidDeviceIdentifier(command.identifier);
    assertValidDeviceNotes(command.notes);

    return this.deviceRepository.createDevice({
      organizationId: command.organizationId,
      name: command.name.trim(),
      identifier: command.identifier.trim(),
      notes: command.notes?.trim() ?? null,
      metadata: command.metadata ?? null,
      actorId: command.actorId,
    });
  }

  async listDevices(organizationId: string): Promise<readonly TelemetryDeviceRecord[]> {
    return this.deviceRepository.listDevices(organizationId);
  }

  async getDeviceById(organizationId: string, deviceId: string): Promise<TelemetryDeviceRecord> {
    const device = await this.deviceRepository.getDeviceById(organizationId, deviceId);
    if (!device) {
      throw new TelemetryDeviceNotFoundError(deviceId);
    }
    return device;
  }

  async updateDevice(command: UpdateDeviceCommand): Promise<TelemetryDeviceRecord> {
    await this.getDeviceById(command.organizationId, command.deviceId);

    if (command.name !== undefined) {
      assertValidDeviceName(command.name);
    }
    if (command.notes !== undefined) {
      assertValidDeviceNotes(command.notes);
    }

    return this.deviceRepository.updateDevice({
      organizationId: command.organizationId,
      deviceId: command.deviceId,
      ...(command.name !== undefined ? { name: command.name.trim() } : {}),
      notes: command.notes?.trim() ?? null,
      metadata: command.metadata,
      actorId: command.actorId,
    });
  }

  async assignDevice(command: AssignDeviceCommand): Promise<TelemetryDeviceRecord> {
    const device = await this.getDeviceById(command.organizationId, command.deviceId);

    if (device.status !== TelemetryDeviceStatus.ACTIVE) {
      throw new TelemetryDeviceInactiveError(device.id, device.status);
    }

    const activeDeviceAssignment = await this.deviceRepository.getActiveAssignmentByDeviceId(
      command.organizationId,
      command.deviceId,
    );
    if (activeDeviceAssignment) {
      throw new TelemetryDeviceAlreadyAssignedError(
        command.deviceId,
        activeDeviceAssignment.vehicleId,
      );
    }

    const vehicleExists = await this.deviceRepository.verifyVehicleExists(
      command.organizationId,
      command.vehicleId,
    );
    if (!vehicleExists) {
      throw new ApplicationError('VEHICLE_NOT_FOUND', `Vehicle ${command.vehicleId} was not found`);
    }

    const activeVehicleAssignment = await this.deviceRepository.getActiveAssignmentByVehicleId(
      command.organizationId,
      command.vehicleId,
    );
    if (activeVehicleAssignment) {
      throw new ApplicationError(
        'TELEMETRY_DEVICE_ALREADY_ASSIGNED',
        `Vehicle ${command.vehicleId} already has an active telemetry device assigned`,
      );
    }

    return this.deviceRepository.assignDevice({
      organizationId: command.organizationId,
      deviceId: command.deviceId,
      vehicleId: command.vehicleId,
      assignedBy: command.assignedBy,
      notes: command.notes?.trim() ?? null,
    });
  }

  async unassignDevice(
    organizationId: string,
    deviceId: string,
    notes?: string,
    unassignedBy?: string,
  ): Promise<TelemetryDeviceRecord> {
    await this.getDeviceById(organizationId, deviceId);

    const activeAssignment = await this.deviceRepository.getActiveAssignmentByDeviceId(
      organizationId,
      deviceId,
    );
    if (!activeAssignment) {
      throw new TelemetryDeviceNotAssignedError(deviceId);
    }

    return this.deviceRepository.unassignDevice(
      organizationId,
      deviceId,
      notes?.trim(),
      unassignedBy,
    );
  }

  async suspendDevice(
    organizationId: string,
    deviceId: string,
    actorId?: string,
  ): Promise<TelemetryDeviceRecord> {
    const device = await this.getDeviceById(organizationId, deviceId);
    assertValidDeviceStatusTransition(device.status, TelemetryDeviceStatus.SUSPENDED);

    return this.deviceRepository.updateDeviceStatus(
      organizationId,
      deviceId,
      TelemetryDeviceStatus.SUSPENDED,
      actorId,
    );
  }

  async activateDevice(
    organizationId: string,
    deviceId: string,
    actorId?: string,
  ): Promise<TelemetryDeviceRecord> {
    const device = await this.getDeviceById(organizationId, deviceId);
    assertValidDeviceStatusTransition(device.status, TelemetryDeviceStatus.ACTIVE);

    return this.deviceRepository.updateDeviceStatus(
      organizationId,
      deviceId,
      TelemetryDeviceStatus.ACTIVE,
      actorId,
    );
  }

  async reassignDevice(command: AssignDeviceCommand): Promise<TelemetryDeviceRecord> {
    const device = await this.getDeviceById(command.organizationId, command.deviceId);
    if (device.status !== TelemetryDeviceStatus.ACTIVE) {
      throw new TelemetryDeviceInactiveError(device.id, device.status);
    }

    const vehicleExists = await this.deviceRepository.verifyVehicleExists(
      command.organizationId,
      command.vehicleId,
    );
    if (!vehicleExists) {
      throw new ApplicationError('VEHICLE_NOT_FOUND', `Vehicle ${command.vehicleId} was not found`);
    }

    // 1. End existing assignment for this device if any
    const activeDeviceAssignment = await this.deviceRepository.getActiveAssignmentByDeviceId(
      command.organizationId,
      command.deviceId,
    );
    if (activeDeviceAssignment) {
      await this.deviceRepository.unassignDevice(
        command.organizationId,
        command.deviceId,
        'Reassigned to new vehicle',
      );
    }

    // 2. End existing assignment for the target vehicle if any
    const activeVehicleAssignment = await this.deviceRepository.getActiveAssignmentByVehicleId(
      command.organizationId,
      command.vehicleId,
    );
    if (activeVehicleAssignment) {
      await this.deviceRepository.unassignDevice(
        command.organizationId,
        activeVehicleAssignment.deviceId,
        'Replaced by newly assigned device',
      );
    }

    // 3. Create successor assignment row
    return this.deviceRepository.assignDevice({
      organizationId: command.organizationId,
      deviceId: command.deviceId,
      vehicleId: command.vehicleId,
      assignedBy: command.assignedBy,
      notes: command.notes?.trim() ?? null,
    });
  }

  async createCredential(
    organizationId: string,
    deviceId: string,
    actorId?: string,
  ): Promise<{
    readonly id: string;
    readonly deviceId: string;
    readonly keyPrefix: string;
    readonly secret: string;
    readonly token: string;
    readonly createdAt: Date;
    readonly status: 'ACTIVE' | 'REVOKED';
  }> {
    const device = await this.getDeviceById(organizationId, deviceId);
    if (device.status !== TelemetryDeviceStatus.ACTIVE) {
      throw new TelemetryDeviceInactiveError(deviceId, device.status);
    }

    const generated = generateDeviceCredential();
    const cred = await this.deviceRepository.createCredential({
      organizationId,
      deviceId,
      keyPrefix: generated.keyPrefix,
      secretHash: generated.secretHash,
      actorId,
    });

    return {
      id: cred.id,
      deviceId: cred.deviceId,
      keyPrefix: cred.keyPrefix,
      secret: generated.secret,
      token: generated.token,
      createdAt: cred.createdAt,
      status: cred.status,
    };
  }

  async listCredentials(
    organizationId: string,
    deviceId: string,
  ): Promise<readonly TelemetryDeviceCredentialRecord[]> {
    await this.getDeviceById(organizationId, deviceId);
    return this.deviceRepository.listCredentials(organizationId, deviceId);
  }

  async revokeCredential(
    organizationId: string,
    deviceId: string,
    credentialId: string,
    revokedBy: string,
  ): Promise<TelemetryDeviceCredentialRecord> {
    await this.getDeviceById(organizationId, deviceId);
    const credentials = await this.deviceRepository.listCredentials(organizationId, deviceId);
    const existing = credentials.find((c) => c.id === credentialId);
    if (!existing) {
      throw new TelemetryDeviceCredentialNotFoundError(credentialId);
    }

    return this.deviceRepository.revokeCredential(
      organizationId,
      deviceId,
      credentialId,
      revokedBy,
    );
  }

  async authenticateDeviceToken(
    token: string,
    clientOrgId?: string,
  ): Promise<{
    readonly organizationId: string;
    readonly deviceId: string;
    readonly vehicleId: string;
  }> {
    const dotIndex = token.indexOf('.');
    if (dotIndex <= 0 || dotIndex >= token.length - 1) {
      throw new TelemetryDeviceCredentialInvalidError('Invalid device token format');
    }

    const keyPrefix = token.slice(0, dotIndex);
    const secret = token.slice(dotIndex + 1);

    const credential = await this.deviceRepository.getCredentialByKeyPrefix(keyPrefix);
    if (!credential || credential.status !== 'ACTIVE' || credential.revokedAt != null) {
      throw new TelemetryDeviceCredentialInvalidError('Invalid or revoked device credential');
    }

    if (!verifyCredentialSecret(secret, credential.secretHash)) {
      throw new TelemetryDeviceCredentialInvalidError('Invalid or revoked device credential');
    }

    // Verify tenant match if client explicitly provided an organization header
    if (clientOrgId && clientOrgId !== credential.organizationId) {
      throw new ApplicationError(
        'INVALID_TENANT_CONTEXT',
        'Device credential does not belong to specified organization',
      );
    }

    // Update last used timestamp
    await this.deviceRepository.updateCredentialLastUsed(credential.id);

    // Verify device status
    const device = await this.deviceRepository.getDeviceById(
      credential.organizationId,
      credential.deviceId,
    );
    if (!device) {
      throw new TelemetryDeviceNotFoundError(credential.deviceId);
    }
    if (device.status === TelemetryDeviceStatus.SUSPENDED) {
      throw new TelemetryDeviceSuspendedError(device.id);
    }
    if (device.status !== TelemetryDeviceStatus.ACTIVE) {
      throw new TelemetryDeviceInactiveError(device.id, device.status);
    }

    // Derive vehicle from active assignment
    const assignment = await this.deviceRepository.getActiveAssignmentByDeviceId(
      credential.organizationId,
      credential.deviceId,
    );
    if (!assignment) {
      throw new TelemetryDeviceNotAssignedError(device.id);
    }

    return {
      organizationId: credential.organizationId,
      deviceId: credential.deviceId,
      vehicleId: assignment.vehicleId,
    };
  }
}
