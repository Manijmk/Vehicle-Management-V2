import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { DriverStatus as PrismaDriverStatus, Prisma, PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertDriverTransition,
  assertLicenseDateRange,
  calculateDriverEligibility,
  isLicenseValid,
  normalizeCountry,
  normalizeDisplayId,
  normalizeEmail,
  normalizeEmployeeNumber,
  normalizeLicenseNumber,
  normalizeName,
  normalizePhone,
} from '../domain/driver.js';
import type { DriverStatus } from '../domain/driver.js';
import type {
  DriverLicenseRecord,
  DriverRecord,
  DriverRepository,
  DriverStatusHistoryEntry,
  ListDriversFilter,
  MutationMetadata,
  PaginatedResult,
} from '../application/driver.repository.js';

type Transaction = Prisma.TransactionClient;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class PrismaDriverRepository implements DriverRepository {
  constructor(@Inject(DATABASE) private readonly database: PrismaClient) {}

  private mapLicense(license: {
    id: string;
    driverId: string;
    organizationId: string;
    licenseNumber: string;
    issuingCountry: string;
    issuingRegion: string | null;
    licenseClasses: string[];
    issueDate: Date;
    expiryDate: Date;
    notes: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): DriverLicenseRecord {
    return {
      id: license.id,
      driverId: license.driverId,
      organizationId: license.organizationId,
      licenseNumber: license.licenseNumber,
      issuingCountry: license.issuingCountry,
      issuingRegion: license.issuingRegion,
      licenseClasses: license.licenseClasses,
      issueDate: license.issueDate,
      expiryDate: license.expiryDate,
      notes: license.notes,
      version: license.version,
      createdAt: license.createdAt,
      updatedAt: license.updatedAt,
      isValid: isLicenseValid({ issueDate: license.issueDate, expiryDate: license.expiryDate }),
    };
  }

  private mapDriver(
    driver: {
      id: string;
      organizationId: string;
      displayId: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      employeeNumber: string | null;
      status: PrismaDriverStatus;
      notes: string | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
      licenses?: Array<{
        id: string;
        driverId: string;
        organizationId: string;
        licenseNumber: string;
        issuingCountry: string;
        issuingRegion: string | null;
        licenseClasses: string[];
        issueDate: Date;
        expiryDate: Date;
        notes: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
      }>;
    },
    referenceDate: Date = new Date(),
  ): DriverRecord {
    const licenses = driver.licenses ? driver.licenses.map((lic) => this.mapLicense(lic)) : [];
    const eligibility = calculateDriverEligibility(
      driver.status as DriverStatus,
      licenses,
      referenceDate,
    );

    return {
      id: driver.id,
      organizationId: driver.organizationId,
      displayId: driver.displayId,
      firstName: driver.firstName,
      lastName: driver.lastName,
      email: driver.email,
      phone: driver.phone,
      employeeNumber: driver.employeeNumber,
      status: driver.status as DriverStatus,
      notes: driver.notes,
      version: driver.version,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
      licenses,
      eligible: eligibility.eligible,
      eligibilityReasons: eligibility.reasonCodes,
    };
  }

  async listDrivers(
    organizationId: string,
    filter?: ListDriversFilter,
  ): Promise<PaginatedResult<DriverRecord>> {
    const page = Math.max(1, filter?.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.DriverWhereInput = {
      organizationId,
      ...(filter?.status ? { status: filter.status as PrismaDriverStatus } : {}),
      ...(filter?.search
        ? {
            OR: [
              { displayId: { contains: filter.search, mode: 'insensitive' } },
              { firstName: { contains: filter.search, mode: 'insensitive' } },
              { lastName: { contains: filter.search, mode: 'insensitive' } },
              { employeeNumber: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, drivers] = await Promise.all([
      this.database.driver.count({ where }),
      this.database.driver.findMany({
        where,
        include: { licenses: { orderBy: { createdAt: 'desc' } } },
        orderBy: [{ status: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const items = drivers.map((driver) => this.mapDriver(driver));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getDriver(organizationId: string, driverId: string): Promise<DriverRecord> {
    const driver = await this.database.driver.findFirst({
      where: { id: driverId, organizationId },
      include: { licenses: { orderBy: { createdAt: 'desc' } } },
    });
    if (driver === null) {
      throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
    }
    return this.mapDriver(driver);
  }

  async createDriver(
    input: Parameters<DriverRepository['createDriver']>[0],
  ): Promise<DriverRecord> {
    try {
      return await this.database.$transaction(async (tx) => {
        const firstName = normalizeName(input.firstName, 'First name');
        const lastName = normalizeName(input.lastName, 'Last name');
        const email = normalizeEmail(input.email);
        const phone = normalizePhone(input.phone);
        const employeeNumber = normalizeEmployeeNumber(input.employeeNumber);

        let displayId: string;
        if (input.displayId && input.displayId.trim().length > 0) {
          displayId = normalizeDisplayId(input.displayId);
          const existingDisplay = await tx.driver.findFirst({
            where: { organizationId: input.organizationId, displayId },
          });
          if (existingDisplay !== null) {
            throw new ApplicationError(
              'DRIVER_ALREADY_EXISTS',
              'Driver display ID already exists in this organization',
            );
          }
        } else {
          const existingDrivers = await tx.driver.findMany({
            where: { organizationId: input.organizationId },
            select: { displayId: true },
          });
          let maxNumber = 1000;
          for (const d of existingDrivers) {
            const match = /^DRV-(\d+)$/i.exec(d.displayId);
            if (match && match[1]) {
              const num = parseInt(match[1], 10);
              if (num > maxNumber) maxNumber = num;
            }
          }
          displayId = `DRV-${maxNumber + 1}`;
        }

        if (employeeNumber !== null) {
          const existingEmp = await tx.driver.findFirst({
            where: { organizationId: input.organizationId, employeeNumber },
          });
          if (existingEmp !== null) {
            throw new ApplicationError(
              'DRIVER_EMPLOYEE_NUMBER_EXISTS',
              'Driver employee number already exists in this organization',
            );
          }
        }

        const driver = await tx.driver.create({
          data: {
            organizationId: input.organizationId,
            displayId,
            firstName,
            lastName,
            email,
            phone,
            employeeNumber,
            notes: input.notes?.trim() || null,
            status: 'DRAFT',
          },
          include: { licenses: true },
        });

        await this.recordStatusHistory(
          tx,
          input.organizationId,
          driver.id,
          null,
          'DRAFT',
          'Driver created',
          input.metadata,
        );

        await this.record(
          tx,
          input.organizationId,
          'driver.created',
          'Driver',
          driver.id,
          null,
          driver,
          'DriverCreated',
          input.metadata,
        );

        return this.mapDriver(driver);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError(
          'DRIVER_ALREADY_EXISTS',
          'Driver display ID or unique field already exists in this organization',
        );
      }
      throw error;
    }
  }

  async updateDriver(
    input: Parameters<DriverRepository['updateDriver']>[0],
  ): Promise<DriverRecord> {
    try {
      return await this.database.$transaction(async (tx) => {
        const before = await tx.driver.findFirst({
          where: { id: input.driverId, organizationId: input.organizationId },
        });
        if (before === null) {
          throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
        }

        const displayId =
          input.displayId === undefined ? before.displayId : normalizeDisplayId(input.displayId);
        const firstName =
          input.firstName === undefined
            ? before.firstName
            : normalizeName(input.firstName, 'First name');
        const lastName =
          input.lastName === undefined
            ? before.lastName
            : normalizeName(input.lastName, 'Last name');
        const email = input.email === undefined ? before.email : normalizeEmail(input.email);
        const phone = input.phone === undefined ? before.phone : normalizePhone(input.phone);
        const employeeNumber =
          input.employeeNumber === undefined
            ? before.employeeNumber
            : normalizeEmployeeNumber(input.employeeNumber);

        if (displayId !== before.displayId) {
          const duplicateDisplay = await tx.driver.findFirst({
            where: {
              organizationId: input.organizationId,
              NOT: { id: input.driverId },
              displayId,
            },
          });
          if (duplicateDisplay !== null) {
            throw new ApplicationError(
              'DRIVER_ALREADY_EXISTS',
              'Another driver already uses that display ID',
            );
          }
        }

        if (employeeNumber !== null && employeeNumber !== before.employeeNumber) {
          const duplicateEmp = await tx.driver.findFirst({
            where: {
              organizationId: input.organizationId,
              NOT: { id: input.driverId },
              employeeNumber,
            },
          });
          if (duplicateEmp !== null) {
            throw new ApplicationError(
              'DRIVER_EMPLOYEE_NUMBER_EXISTS',
              'Another driver already uses that employee number',
            );
          }
        }

        const result = await tx.driver.updateMany({
          where: {
            id: input.driverId,
            organizationId: input.organizationId,
            version: input.version,
          },
          data: {
            displayId,
            firstName,
            lastName,
            email,
            phone,
            employeeNumber,
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
            version: { increment: 1 },
          },
        });

        if (result.count !== 1) {
          throw new ApplicationError(
            'CONCURRENCY_CONFLICT',
            'Driver was changed by another request',
          );
        }

        const after = await tx.driver.findUniqueOrThrow({
          where: { id: input.driverId },
          include: { licenses: { orderBy: { createdAt: 'desc' } } },
        });

        await this.record(
          tx,
          input.organizationId,
          'driver.updated',
          'Driver',
          input.driverId,
          before,
          after,
          'DriverUpdated',
          input.metadata,
        );

        return this.mapDriver(after);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError(
          'DRIVER_ALREADY_EXISTS',
          'Driver display ID or unique field already exists in this organization',
        );
      }
      throw error;
    }
  }

  async activateDriver(
    input: Parameters<DriverRepository['activateDriver']>[0],
  ): Promise<DriverRecord> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.driver.findFirst({
        where: { id: input.driverId, organizationId: input.organizationId },
        include: { licenses: true },
      });
      if (before === null) {
        throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
      }

      assertDriverTransition(before.status as DriverStatus, 'ACTIVE');

      const now = new Date();
      const hasValidLicense = before.licenses.some((lic) =>
        isLicenseValid({ issueDate: lic.issueDate, expiryDate: lic.expiryDate }, now),
      );

      if (!hasValidLicense) {
        throw new ApplicationError(
          'NO_VALID_DRIVER_LICENSE',
          'Driver must have at least one valid, unexpired license to be activated',
        );
      }

      const version = input.version ?? before.version;
      const result = await tx.driver.updateMany({
        where: { id: input.driverId, organizationId: input.organizationId, version },
        data: { status: 'ACTIVE', version: { increment: 1 } },
      });

      if (result.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Driver was changed by another request');
      }

      const after = await tx.driver.findUniqueOrThrow({
        where: { id: input.driverId },
        include: { licenses: { orderBy: { createdAt: 'desc' } } },
      });

      await this.recordStatusHistory(
        tx,
        input.organizationId,
        input.driverId,
        before.status as DriverStatus,
        'ACTIVE',
        before.status === 'SUSPENDED' ? 'Reactivated' : 'Activated',
        input.metadata,
      );

      await this.record(
        tx,
        input.organizationId,
        'driver.activated',
        'Driver',
        input.driverId,
        before,
        after,
        'DriverActivated',
        input.metadata,
      );

      return this.mapDriver(after);
    });
  }

  async suspendDriver(
    input: Parameters<DriverRepository['suspendDriver']>[0],
  ): Promise<DriverRecord> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.driver.findFirst({
        where: { id: input.driverId, organizationId: input.organizationId },
        include: { licenses: true },
      });
      if (before === null) {
        throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
      }

      assertDriverTransition(before.status as DriverStatus, 'SUSPENDED');

      const result = await tx.driver.updateMany({
        where: {
          id: input.driverId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: { status: 'SUSPENDED', version: { increment: 1 } },
      });

      if (result.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Driver was changed by another request');
      }

      const after = await tx.driver.findUniqueOrThrow({
        where: { id: input.driverId },
        include: { licenses: { orderBy: { createdAt: 'desc' } } },
      });

      await this.recordStatusHistory(
        tx,
        input.organizationId,
        input.driverId,
        before.status as DriverStatus,
        'SUSPENDED',
        input.reason,
        input.metadata,
      );

      await this.record(
        tx,
        input.organizationId,
        'driver.suspended',
        'Driver',
        input.driverId,
        before,
        after,
        'DriverSuspended',
        input.metadata,
      );

      return this.mapDriver(after);
    });
  }

  async deactivateDriver(
    input: Parameters<DriverRepository['deactivateDriver']>[0],
  ): Promise<DriverRecord> {
    return this.database.$transaction(async (tx) => {
      const before = await tx.driver.findFirst({
        where: { id: input.driverId, organizationId: input.organizationId },
        include: { licenses: true },
      });
      if (before === null) {
        throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
      }

      assertDriverTransition(before.status as DriverStatus, 'INACTIVE');

      const activeAssignment = await tx.vehicleDriverAssignment.findFirst({
        where: {
          driverId: input.driverId,
          organizationId: input.organizationId,
          status: 'ACTIVE',
        },
      });
      if (activeAssignment !== null) {
        throw new ApplicationError(
          'DRIVER_HAS_ACTIVE_ASSIGNMENT',
          'Cannot deactivate driver while an active vehicle assignment exists',
        );
      }

      const result = await tx.driver.updateMany({
        where: {
          id: input.driverId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: { status: 'INACTIVE', version: { increment: 1 } },
      });

      if (result.count !== 1) {
        throw new ApplicationError('CONCURRENCY_CONFLICT', 'Driver was changed by another request');
      }

      const after = await tx.driver.findUniqueOrThrow({
        where: { id: input.driverId },
        include: { licenses: { orderBy: { createdAt: 'desc' } } },
      });

      await this.recordStatusHistory(
        tx,
        input.organizationId,
        input.driverId,
        before.status as DriverStatus,
        'INACTIVE',
        input.reason,
        input.metadata,
      );

      await this.record(
        tx,
        input.organizationId,
        'driver.deactivated',
        'Driver',
        input.driverId,
        before,
        after,
        'DriverDeactivated',
        input.metadata,
      );

      return this.mapDriver(after);
    });
  }

  async listStatusHistory(
    organizationId: string,
    driverId: string,
  ): Promise<DriverStatusHistoryEntry[]> {
    const driver = await this.database.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (driver === null) {
      throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
    }

    const history = await this.database.driverStatusHistory.findMany({
      where: { organizationId, driverId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { displayName: true } } },
    });

    return history.map((entry) => ({
      id: entry.id,
      organizationId: entry.organizationId,
      driverId: entry.driverId,
      fromStatus: entry.fromStatus as DriverStatus | null,
      toStatus: entry.toStatus as DriverStatus,
      reason: entry.reason,
      changedBy: entry.actor?.displayName ?? entry.changedBy,
      requestId: entry.requestId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      createdAt: entry.createdAt,
    }));
  }

  async listLicenses(organizationId: string, driverId: string): Promise<DriverLicenseRecord[]> {
    const driver = await this.database.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (driver === null) {
      throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
    }

    const licenses = await this.database.driverLicense.findMany({
      where: { organizationId, driverId },
      orderBy: { createdAt: 'desc' },
    });

    return licenses.map((lic) => this.mapLicense(lic));
  }

  async addLicense(
    input: Parameters<DriverRepository['addLicense']>[0],
  ): Promise<DriverLicenseRecord> {
    try {
      return await this.database.$transaction(async (tx) => {
        const driver = await tx.driver.findFirst({
          where: { id: input.driverId, organizationId: input.organizationId },
        });
        if (driver === null) {
          throw new ApplicationError('DRIVER_NOT_FOUND', 'Driver was not found');
        }

        const licenseNumber = normalizeLicenseNumber(input.licenseNumber);
        const issuingCountry = normalizeCountry(input.issuingCountry);
        assertLicenseDateRange(input.issueDate, input.expiryDate);

        const existingLicense = await tx.driverLicense.findFirst({
          where: {
            organizationId: input.organizationId,
            licenseNumber,
            issuingCountry,
          },
        });
        if (existingLicense !== null) {
          throw new ApplicationError(
            'DRIVER_LICENSE_EXISTS',
            'License number and issuing country combination already exists in this organization',
          );
        }

        const normalizedClasses = input.licenseClasses
          .map((c) => c.trim().toUpperCase())
          .filter((c) => c.length > 0);

        const license = await tx.driverLicense.create({
          data: {
            driverId: input.driverId,
            organizationId: input.organizationId,
            licenseNumber,
            issuingCountry,
            issuingRegion: input.issuingRegion?.trim() || null,
            licenseClasses: normalizedClasses,
            issueDate: input.issueDate,
            expiryDate: input.expiryDate,
            notes: input.notes?.trim() || null,
          },
        });

        await this.record(
          tx,
          input.organizationId,
          'driver.license.added',
          'DriverLicense',
          license.id,
          null,
          license,
          'DriverLicenseAdded',
          input.metadata,
        );

        return this.mapLicense(license);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError(
          'DRIVER_LICENSE_EXISTS',
          'License number and issuing country combination already exists in this organization',
        );
      }
      throw error;
    }
  }

  async updateLicense(
    input: Parameters<DriverRepository['updateLicense']>[0],
  ): Promise<DriverLicenseRecord> {
    try {
      return await this.database.$transaction(async (tx) => {
        const before = await tx.driverLicense.findFirst({
          where: {
            id: input.licenseId,
            driverId: input.driverId,
            organizationId: input.organizationId,
          },
        });
        if (before === null) {
          throw new ApplicationError('DRIVER_LICENSE_NOT_FOUND', 'Driver license was not found');
        }

        const licenseNumber =
          input.licenseNumber === undefined
            ? before.licenseNumber
            : normalizeLicenseNumber(input.licenseNumber);
        const issuingCountry =
          input.issuingCountry === undefined
            ? before.issuingCountry
            : normalizeCountry(input.issuingCountry);
        const issueDate = input.issueDate ?? before.issueDate;
        const expiryDate = input.expiryDate ?? before.expiryDate;

        assertLicenseDateRange(issueDate, expiryDate);

        if (licenseNumber !== before.licenseNumber || issuingCountry !== before.issuingCountry) {
          const duplicate = await tx.driverLicense.findFirst({
            where: {
              organizationId: input.organizationId,
              NOT: { id: input.licenseId },
              licenseNumber,
              issuingCountry,
            },
          });
          if (duplicate !== null) {
            throw new ApplicationError(
              'DRIVER_LICENSE_EXISTS',
              'Another license with this number and country already exists in this organization',
            );
          }
        }

        const normalizedClasses =
          input.licenseClasses === undefined
            ? before.licenseClasses
            : input.licenseClasses.map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0);

        const result = await tx.driverLicense.updateMany({
          where: {
            id: input.licenseId,
            driverId: input.driverId,
            organizationId: input.organizationId,
            version: input.version,
          },
          data: {
            licenseNumber,
            issuingCountry,
            ...(input.issuingRegion !== undefined
              ? { issuingRegion: input.issuingRegion?.trim() || null }
              : {}),
            licenseClasses: normalizedClasses,
            issueDate,
            expiryDate,
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
            version: { increment: 1 },
          },
        });

        if (result.count !== 1) {
          throw new ApplicationError(
            'CONCURRENCY_CONFLICT',
            'License was changed by another request',
          );
        }

        const after = await tx.driverLicense.findUniqueOrThrow({
          where: { id: input.licenseId },
        });

        await this.record(
          tx,
          input.organizationId,
          'driver.license.updated',
          'DriverLicense',
          input.licenseId,
          before,
          after,
          'DriverLicenseUpdated',
          input.metadata,
        );

        return this.mapLicense(after);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError(
          'DRIVER_LICENSE_EXISTS',
          'License number and issuing country combination already exists in this organization',
        );
      }
      throw error;
    }
  }

  async removeLicense(input: Parameters<DriverRepository['removeLicense']>[0]): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const before = await tx.driverLicense.findFirst({
        where: {
          id: input.licenseId,
          driverId: input.driverId,
          organizationId: input.organizationId,
        },
      });
      if (before === null) {
        throw new ApplicationError('DRIVER_LICENSE_NOT_FOUND', 'Driver license was not found');
      }

      await tx.driverLicense.delete({
        where: { id: input.licenseId },
      });

      await this.record(
        tx,
        input.organizationId,
        'driver.license.removed',
        'DriverLicense',
        input.licenseId,
        before,
        null,
        'DriverLicenseRemoved',
        input.metadata,
      );
    });
  }

  private async recordStatusHistory(
    tx: Transaction,
    organizationId: string,
    driverId: string,
    fromStatus: DriverStatus | null,
    toStatus: DriverStatus,
    reason: string,
    metadata: MutationMetadata,
  ): Promise<void> {
    await tx.driverStatusHistory.create({
      data: {
        organizationId,
        driverId,
        fromStatus: fromStatus as PrismaDriverStatus | null,
        toStatus: toStatus as PrismaDriverStatus,
        reason,
        changedBy: metadata.actorId,
        requestId: metadata.requestId,
        ...(metadata.ipAddress === undefined ? {} : { ipAddress: metadata.ipAddress }),
        ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
      },
    });
  }

  private async record(
    tx: Transaction,
    organizationId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    eventType: string,
    metadata: MutationMetadata,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();
    const auditMetadata: {
      actorId: string;
      requestId: string;
      ipAddress?: string;
      userAgent?: string;
    } = {
      actorId: metadata.actorId,
      requestId: metadata.requestId,
      ...(metadata.ipAddress === undefined ? {} : { ipAddress: metadata.ipAddress }),
      ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
    };

    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType,
        entityId,
        ...(before === null ? {} : { beforeData: json(before) }),
        ...(after === null ? {} : { afterData: json(after) }),
        actorId: auditMetadata.actorId,
        requestId: auditMetadata.requestId,
        ...(auditMetadata.ipAddress === undefined ? {} : { ipAddress: auditMetadata.ipAddress }),
        ...(auditMetadata.userAgent === undefined ? {} : { userAgent: auditMetadata.userAgent }),
      },
    });

    await tx.outboxEvent.create({
      data: {
        id: eventId,
        organizationId,
        eventType,
        aggregateType: entityType,
        aggregateId: entityId,
        occurredAt,
        payload: json({
          eventId,
          organizationId,
          entityId,
          eventType,
          occurredAt: occurredAt.toISOString(),
        }),
      },
    });
  }
}
