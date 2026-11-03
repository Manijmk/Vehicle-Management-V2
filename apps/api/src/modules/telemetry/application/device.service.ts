import { Inject, Injectable } from '@nestjs/common';
import { TelemetryDeviceStatus } from '@vms/database';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertValidDeviceIdentifier,
  assertValidDeviceName,
  assertValidDeviceNotes,
  assertValidDeviceStatusTransition,
} from '../domain/device.js';
import {
  TelemetryDeviceAlreadyAssignedError,
  TelemetryDeviceInactiveError,
  TelemetryDeviceNotAssignedError,
  TelemetryDeviceNotFoundError,
} from '../domain/telemetry-errors.js';
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
  type TelemetryDeviceRecord,
} from './telemetry.repository.js';

export interface CreateDeviceCommand {
  readonly organizationId: string;
  readonly name: string;
  readonly identifier: string;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface UpdateDeviceCommand {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly name?: string;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface AssignDeviceCommand {
  readonly organizationId: string;
  readonly deviceId: string;
  readonly vehicleId: string;
  readonly assignedBy: string;
  readonly notes?: string | null;
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
    });
  }

  async listDevices(organizationId: string): Promise<readonly TelemetryDeviceRecord[]> {
    return this.deviceRepository.listDevices(organizationId);
  }

  async getDeviceById(
    organizationId: string,
    deviceId: string,
  ): Promise<TelemetryDeviceRecord> {
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
      name: command.name?.trim(),
      notes: command.notes?.trim() ?? null,
      metadata: command.metadata,
    });
  }

  async assignDevice(command: AssignDeviceCommand): Promise<TelemetryDeviceRecord> {
    const device = await this.getDeviceById(command.organizationId, command.deviceId);

    if (device.status !== TelemetryDeviceStatus.ACTIVE) {
      throw new TelemetryDeviceInactiveError(device.id, device.status);
    }

    const activeDeviceAssignment =
      await this.deviceRepository.getActiveAssignmentByDeviceId(
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

    const activeVehicleAssignment =
      await this.deviceRepository.getActiveAssignmentByVehicleId(
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
  ): Promise<TelemetryDeviceRecord> {
    await this.getDeviceById(organizationId, deviceId);

    const activeAssignment =
      await this.deviceRepository.getActiveAssignmentByDeviceId(
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
    );
  }

  async suspendDevice(
    organizationId: string,
    deviceId: string,
  ): Promise<TelemetryDeviceRecord> {
    const device = await this.getDeviceById(organizationId, deviceId);
    assertValidDeviceStatusTransition(device.status, TelemetryDeviceStatus.SUSPENDED);

    return this.deviceRepository.updateDeviceStatus(
      organizationId,
      deviceId,
      TelemetryDeviceStatus.SUSPENDED,
    );
  }

  async activateDevice(
    organizationId: string,
    deviceId: string,
  ): Promise<TelemetryDeviceRecord> {
    const device = await this.getDeviceById(organizationId, deviceId);
    assertValidDeviceStatusTransition(device.status, TelemetryDeviceStatus.ACTIVE);

    return this.deviceRepository.updateDeviceStatus(
      organizationId,
      deviceId,
      TelemetryDeviceStatus.ACTIVE,
    );
  }
}
