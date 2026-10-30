import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertPlanCanBeActivated,
  assertPlanCanBeArchived,
  assertPlanCanBeEdited,
  assertRequestCanBeCancelled,
  assertRequestCanBeConverted,
  assertWorkOrderCanBeCancelled,
  assertWorkOrderCanBeCompleted,
  assertWorkOrderTransition,
  calculateInitialDueThresholds,
  calculateResetDueThresholds,
  calculateWorkOrderTotals,
  deriveScheduleDueState,
  isTerminalWorkOrderStatus,
  type MaintenancePlanStatus,
  type MaintenancePriority,
  type MaintenanceRequestSource,
  type MaintenanceRequestStatus,
  type MaintenanceVendorStatus,
  type MaintenanceWorkOrderStatus,
  type WorkOrderTaskStatus,
} from '../domain/index.js';
import type {
  AddWorkOrderLaborInput,
  AddWorkOrderPartInput,
  AddWorkOrderTaskInput,
  CancelMaintenanceRequestInput,
  CancelMaintenanceWorkOrderInput,
  CompleteMaintenanceWorkOrderInput,
  ConvertRequestToWorkOrderInput,
  CreateMaintenancePlanInput,
  CreateMaintenanceRequestInput,
  CreateMaintenanceScheduleInput,
  CreateMaintenanceVendorInput,
  CreateMaintenanceWorkOrderInput,
  ListMaintenancePlansFilter,
  ListMaintenanceRequestsFilter,
  ListMaintenanceSchedulesFilter,
  ListMaintenanceVendorsFilter,
  ListMaintenanceWorkOrdersFilter,
  MaintenanceDashboardSummary,
  MaintenanceMutationMetadata,
  MaintenancePlanDetail,
  MaintenanceRepository,
  MaintenanceRequestDetail,
  MaintenanceVendorDetail,
  MaintenanceWorkOrderDetail,
  PaginatedMaintenancePlans,
  PaginatedMaintenanceRequests,
  PaginatedMaintenanceSchedules,
  PaginatedMaintenanceVendors,
  PaginatedMaintenanceWorkOrders,
  UpdateMaintenancePlanInput,
  UpdateMaintenanceRequestInput,
  UpdateMaintenanceVendorInput,
  UpdateMaintenanceWorkOrderInput,
  UpdateWorkOrderTaskInput,
  VehicleMaintenanceScheduleDetail,
  VehicleMaintenanceSummary,
  WorkOrderLaborDetail,
  WorkOrderPartDetail,
  WorkOrderTaskDetail,
} from '../application/maintenance.repository.js';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaMaintenanceRepository implements MaintenanceRepository {
  constructor(
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  private async recordAuditAndOutbox(
    tx: Transaction,
    organizationId: string,
    action: string,
    eventType: string,
    entityType:
      | 'MaintenanceRequest'
      | 'MaintenancePlan'
      | 'VehicleMaintenanceSchedule'
      | 'MaintenanceVendor'
      | 'MaintenanceWorkOrder',
    entityId: string,
    before: unknown | null,
    after: unknown | null,
    metadata: MaintenanceMutationMetadata,
    payloadData: Record<string, unknown>,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = randomUUID();

    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType,
        entityId,
        ...(before === null ? {} : { beforeData: json(before) }),
        ...(after === null ? {} : { afterData: json(after) }),
        actorId: metadata.actorId,
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
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
          occurredAt: occurredAt.toISOString(),
          actorId: metadata.actorId,
          requestId: metadata.requestId,
          ...payloadData,
        }),
      },
    });
  }

  private async recordAuditOnly(
    tx: Transaction,
    organizationId: string,
    action: string,
    entityType:
      | 'MaintenanceRequest'
      | 'MaintenancePlan'
      | 'VehicleMaintenanceSchedule'
      | 'MaintenanceVendor'
      | 'MaintenanceWorkOrder',
    entityId: string,
    before: unknown | null,
    after: unknown | null,
    metadata: MaintenanceMutationMetadata,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId,
        action,
        entityType,
        entityId,
        ...(before === null ? {} : { beforeData: json(before) }),
        ...(after === null ? {} : { afterData: json(after) }),
        actorId: metadata.actorId,
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      },
    });
  }

  private async allocateDisplayId(
    tx: Transaction,
    organizationId: string,
    prefix: 'MR' | 'MP' | 'VND' | 'MWO',
    tableName:
      'maintenanceRequest' | 'maintenancePlan' | 'maintenanceVendor' | 'maintenanceWorkOrder',
  ): Promise<string> {
    let maxNumber = 1000;
    // Find highest existing displayId for this prefix
    let existing: { displayId: string }[] = [];
    if (tableName === 'maintenanceRequest') {
      existing = await tx.maintenanceRequest.findMany({
        where: { organizationId },
        select: { displayId: true },
      });
    } else if (tableName === 'maintenancePlan') {
      existing = await tx.maintenancePlan.findMany({
        where: { organizationId },
        select: { displayId: true },
      });
    } else if (tableName === 'maintenanceVendor') {
      existing = await tx.maintenanceVendor.findMany({
        where: { organizationId },
        select: { displayId: true },
      });
    } else if (tableName === 'maintenanceWorkOrder') {
      existing = await tx.maintenanceWorkOrder.findMany({
        where: { organizationId },
        select: { displayId: true },
      });
    }

    const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    for (const item of existing) {
      const match = regex.exec(item.displayId);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
    return `${prefix}-${maxNumber + 1}`;
  }

  // -------------------------------------------------------------
  // MAINTENANCE REQUESTS
  // -------------------------------------------------------------

  async createRequest(input: CreateMaintenanceRequestInput): Promise<MaintenanceRequestDetail> {
    return this.database.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
      });
      if (!vehicle) {
        throw new ApplicationError(
          'VEHICLE_NOT_FOUND',
          'Vehicle was not found in this organization',
        );
      }
      if (vehicle.status === 'RETIRED') {
        throw new ApplicationError(
          'INVALID_VEHICLE_TRANSITION',
          'Cannot create maintenance request for retired vehicle',
        );
      }

      if (input.sourceInspectionId) {
        const inspection = await tx.inspection.findFirst({
          where: { id: input.sourceInspectionId, organizationId: input.organizationId },
        });
        if (!inspection) {
          throw new ApplicationError(
            'INSPECTION_NOT_FOUND',
            'Inspection was not found in this organization',
          );
        }

        // Idempotency check for inspection-derived requests
        const existingForInspection = await tx.maintenanceRequest.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceInspectionId: input.sourceInspectionId,
          },
          include: {
            vehicle: true,
            sourceInspection: true,
            convertedWorkOrder: true,
          },
        });
        if (existingForInspection) {
          return this.mapRequest(existingForInspection);
        }
      }

      const displayId = await this.allocateDisplayId(
        tx,
        input.organizationId,
        'MR',
        'maintenanceRequest',
      );
      const priority = input.priority ?? 'NORMAL';
      const blocksOperation = input.blocksOperation ?? false;

      const created = await tx.maintenanceRequest.create({
        data: {
          organizationId: input.organizationId,
          displayId,
          vehicleId: input.vehicleId,
          sourceType: input.sourceType,
          sourceInspectionId: input.sourceInspectionId ?? null,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority,
          blocksOperation,
          status: 'OPEN',
          version: 1,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
      });

      const mapped = this.mapRequest(created);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'maintenance.request.created',
        'MaintenanceRequestCreated',
        'MaintenanceRequest',
        created.id,
        null,
        mapped,
        input.metadata,
        {
          requestId: created.id,
          displayId: created.displayId,
          vehicleId: created.vehicleId,
          sourceType: created.sourceType,
          sourceInspectionId: created.sourceInspectionId,
          priority: created.priority,
          blocksOperation: created.blocksOperation,
          status: created.status,
        },
      );

      return mapped;
    });
  }

  async findRequestById(
    id: string,
    organizationId: string,
  ): Promise<MaintenanceRequestDetail | null> {
    const raw = await this.database.maintenanceRequest.findFirst({
      where: { id, organizationId },
      include: {
        vehicle: true,
        sourceInspection: true,
        convertedWorkOrder: true,
      },
    });
    return raw ? this.mapRequest(raw) : null;
  }

  async findRequestByInspection(
    inspectionId: string,
    organizationId: string,
  ): Promise<MaintenanceRequestDetail | null> {
    const raw = await this.database.maintenanceRequest.findFirst({
      where: { sourceInspectionId: inspectionId, organizationId },
      include: {
        vehicle: true,
        sourceInspection: true,
        convertedWorkOrder: true,
      },
    });
    return raw ? this.mapRequest(raw) : null;
  }

  async listRequests(
    organizationId: string,
    filter?: ListMaintenanceRequestsFilter,
  ): Promise<PaginatedMaintenanceRequests> {
    const where: Prisma.MaintenanceRequestWhereInput = { organizationId };

    if (filter?.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter?.status) where.status = filter.status;
    if (filter?.priority) where.priority = filter.priority;
    if (filter?.sourceType) where.sourceType = filter.sourceType;

    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { displayId: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { vehicle: { displayId: { contains: q, mode: 'insensitive' } } },
        { vehicle: { registration: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const [items, total] = await Promise.all([
      this.database.maintenanceRequest.findMany({
        where,
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.database.maintenanceRequest.count({ where }),
    ]);

    return {
      items: items.map((r) => this.mapRequest(r)),
      total,
    };
  }

  async updateRequest(input: UpdateMaintenanceRequestInput): Promise<MaintenanceRequestDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenanceRequest.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
      });

      if (!current) {
        throw new ApplicationError(
          'MAINTENANCE_REQUEST_NOT_FOUND',
          'Maintenance request not found in this organization',
        );
      }

      if (current.status !== 'OPEN') {
        throw new ApplicationError(
          'MAINTENANCE_REQUEST_ALREADY_TERMINAL',
          `Cannot edit request in ${current.status} status`,
        );
      }

      const updateResult = await tx.maintenanceRequest.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          title: input.title !== undefined ? input.title.trim() : current.title,
          description:
            input.description !== undefined
              ? input.description?.trim() || null
              : current.description,
          priority: input.priority ?? current.priority,
          blocksOperation: input.blocksOperation ?? current.blocksOperation,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Maintenance request was modified by another request',
        );
      }

      const updated = await tx.maintenanceRequest.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
      });

      const beforeMapped = this.mapRequest(current);
      const afterMapped = this.mapRequest(updated);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'maintenance.request.updated',
        'MaintenanceRequest',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
      );

      return afterMapped;
    });
  }

  async convertRequestToWorkOrder(input: ConvertRequestToWorkOrderInput): Promise<{
    request: MaintenanceRequestDetail;
    workOrder: MaintenanceWorkOrderDetail;
  }> {
    return this.database.$transaction(async (tx) => {
      const request = await tx.maintenanceRequest.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
      });

      if (!request) {
        throw new ApplicationError(
          'MAINTENANCE_REQUEST_NOT_FOUND',
          'Maintenance request not found in this organization',
        );
      }

      assertRequestCanBeConverted(request.status as MaintenanceRequestStatus);

      if (input.vendorId) {
        const vendor = await tx.maintenanceVendor.findFirst({
          where: { id: input.vendorId, organizationId: input.organizationId },
        });
        if (!vendor) {
          throw new ApplicationError(
            'MAINTENANCE_VENDOR_NOT_FOUND',
            'Vendor was not found in this organization',
          );
        }
        if (vendor.status !== 'ACTIVE') {
          throw new ApplicationError(
            'MAINTENANCE_VENDOR_NOT_ACTIVE',
            'Cannot assign inactive vendor',
          );
        }
      }

      const mwoDisplayId = await this.allocateDisplayId(
        tx,
        input.organizationId,
        'MWO',
        'maintenanceWorkOrder',
      );
      const now = new Date();

      const createdWorkOrder = await tx.maintenanceWorkOrder.create({
        data: {
          organizationId: input.organizationId,
          displayId: mwoDisplayId,
          vehicleId: request.vehicleId,
          maintenanceRequestId: request.id,
          vendorId: input.vendorId ?? null,
          title: input.title?.trim() || request.title,
          description: input.description?.trim() || request.description,
          priority: input.priority ?? request.priority,
          blocksOperation: input.blocksOperation ?? request.blocksOperation,
          status: 'OPEN',
          openedAt: now,
          odometerAtOpen: request.vehicle.odometerKm,
          version: 1,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const updateResult = await tx.maintenanceRequest.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          status: 'CONVERTED',
          convertedWorkOrderId: createdWorkOrder.id,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Maintenance request was modified by another request',
        );
      }

      const updatedRequest = await tx.maintenanceRequest.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
      });

      const mappedRequest = this.mapRequest(updatedRequest);
      const mappedWorkOrder = this.mapWorkOrder(createdWorkOrder);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'maintenance.request.converted',
        'MaintenanceRequestConverted',
        'MaintenanceRequest',
        request.id,
        this.mapRequest(request),
        mappedRequest,
        input.metadata,
        {
          requestId: request.id,
          workOrderId: createdWorkOrder.id,
          workOrderDisplayId: createdWorkOrder.displayId,
        },
      );

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'maintenance.work-order.created',
        'WorkOrderCreated',
        'MaintenanceWorkOrder',
        createdWorkOrder.id,
        null,
        mappedWorkOrder,
        input.metadata,
        {
          workOrderId: createdWorkOrder.id,
          displayId: createdWorkOrder.displayId,
          vehicleId: createdWorkOrder.vehicleId,
          status: createdWorkOrder.status,
          maintenanceRequestId: request.id,
        },
      );

      return { request: mappedRequest, workOrder: mappedWorkOrder };
    });
  }

  async cancelRequest(input: CancelMaintenanceRequestInput): Promise<MaintenanceRequestDetail> {
    return this.database.$transaction(async (tx) => {
      const request = await tx.maintenanceRequest.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
      });

      if (!request) {
        throw new ApplicationError(
          'MAINTENANCE_REQUEST_NOT_FOUND',
          'Maintenance request not found in this organization',
        );
      }

      assertRequestCanBeCancelled(request.status as MaintenanceRequestStatus, input.cancelReason);

      const updateResult = await tx.maintenanceRequest.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          status: 'CANCELLED',
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Maintenance request was modified by another request',
        );
      }

      const updated = await tx.maintenanceRequest.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          sourceInspection: true,
          convertedWorkOrder: true,
        },
      });

      const beforeMapped = this.mapRequest(request);
      const afterMapped = this.mapRequest(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'maintenance.request.cancelled',
        'MaintenanceRequestCancelled',
        'MaintenanceRequest',
        request.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          requestId: request.id,
          cancelReason: input.cancelReason.trim(),
        },
      );

      return afterMapped;
    });
  }

  // -------------------------------------------------------------
  // PREVENTIVE MAINTENANCE PLANS
  // -------------------------------------------------------------

  async createPlan(input: CreateMaintenancePlanInput): Promise<MaintenancePlanDetail> {
    return this.database.$transaction(async (tx) => {
      const displayId = await this.allocateDisplayId(
        tx,
        input.organizationId,
        'MP',
        'maintenancePlan',
      );

      const created = await tx.maintenancePlan.create({
        data: {
          organizationId: input.organizationId,
          displayId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          status: 'DRAFT',
          intervalDays: input.intervalDays ?? null,
          intervalOdometerKm: input.intervalOdometerKm ?? null,
          defaultPriority: input.defaultPriority ?? 'NORMAL',
          blocksOperationWhenDue: input.blocksOperationWhenDue ?? false,
          version: 1,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
      });

      const mapped = this.mapPlan(created);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'maintenance.plan.created',
        'MaintenancePlan',
        created.id,
        null,
        mapped,
        input.metadata,
      );

      return mapped;
    });
  }

  async findPlanById(id: string, organizationId: string): Promise<MaintenancePlanDetail | null> {
    const raw = await this.database.maintenancePlan.findFirst({
      where: { id, organizationId },
    });
    return raw ? this.mapPlan(raw) : null;
  }

  async listPlans(
    organizationId: string,
    filter?: ListMaintenancePlansFilter,
  ): Promise<PaginatedMaintenancePlans> {
    const where: Prisma.MaintenancePlanWhereInput = { organizationId };

    if (filter?.status) where.status = filter.status;
    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { displayId: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const [items, total] = await Promise.all([
      this.database.maintenancePlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.database.maintenancePlan.count({ where }),
    ]);

    return {
      items: items.map((p) => this.mapPlan(p)),
      total,
    };
  }

  async updatePlan(input: UpdateMaintenancePlanInput): Promise<MaintenancePlanDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenancePlan.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
      });

      if (!current) {
        throw new ApplicationError(
          'MAINTENANCE_PLAN_NOT_FOUND',
          'Maintenance plan not found in this organization',
        );
      }

      assertPlanCanBeEdited(current.status as MaintenancePlanStatus);

      const updateResult = await tx.maintenancePlan.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          name: input.name !== undefined ? input.name.trim() : current.name,
          description:
            input.description !== undefined
              ? input.description?.trim() || null
              : current.description,
          intervalDays:
            input.intervalDays !== undefined ? input.intervalDays : current.intervalDays,
          intervalOdometerKm:
            input.intervalOdometerKm !== undefined
              ? input.intervalOdometerKm
              : current.intervalOdometerKm,
          defaultPriority: input.defaultPriority ?? current.defaultPriority,
          blocksOperationWhenDue: input.blocksOperationWhenDue ?? current.blocksOperationWhenDue,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Maintenance plan was modified by another request',
        );
      }

      const updated = await tx.maintenancePlan.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
      });

      const beforeMapped = this.mapPlan(current);
      const afterMapped = this.mapPlan(updated);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'maintenance.plan.updated',
        'MaintenancePlan',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
      );

      return afterMapped;
    });
  }

  async activatePlan(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenancePlanDetail> {
    return this.database.$transaction(async (tx) => {
      const plan = await tx.maintenancePlan.findFirst({
        where: { id, organizationId },
      });

      if (!plan) {
        throw new ApplicationError(
          'MAINTENANCE_PLAN_NOT_FOUND',
          'Maintenance plan not found in this organization',
        );
      }

      assertPlanCanBeActivated(
        plan.status as MaintenancePlanStatus,
        plan.intervalDays,
        plan.intervalOdometerKm,
      );

      const updateResult = await tx.maintenancePlan.updateMany({
        where: { id, organizationId, version },
        data: {
          status: 'ACTIVE',
          updatedBy: metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Maintenance plan was modified by another request',
        );
      }

      const updated = await tx.maintenancePlan.findFirstOrThrow({
        where: { id, organizationId },
      });

      const beforeMapped = this.mapPlan(plan);
      const afterMapped = this.mapPlan(updated);

      await this.recordAuditOnly(
        tx,
        organizationId,
        'maintenance.plan.activated',
        'MaintenancePlan',
        id,
        beforeMapped,
        afterMapped,
        metadata,
      );

      return afterMapped;
    });
  }

  async archivePlan(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenancePlanDetail> {
    return this.database.$transaction(async (tx) => {
      const plan = await tx.maintenancePlan.findFirst({
        where: { id, organizationId },
      });

      if (!plan) {
        throw new ApplicationError(
          'MAINTENANCE_PLAN_NOT_FOUND',
          'Maintenance plan not found in this organization',
        );
      }

      assertPlanCanBeArchived(plan.status as MaintenancePlanStatus);

      const updateResult = await tx.maintenancePlan.updateMany({
        where: { id, organizationId, version },
        data: {
          status: 'ARCHIVED',
          updatedBy: metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Maintenance plan was modified by another request',
        );
      }

      const updated = await tx.maintenancePlan.findFirstOrThrow({
        where: { id, organizationId },
      });

      const beforeMapped = this.mapPlan(plan);
      const afterMapped = this.mapPlan(updated);

      await this.recordAuditOnly(
        tx,
        organizationId,
        'maintenance.plan.archived',
        'MaintenancePlan',
        id,
        beforeMapped,
        afterMapped,
        metadata,
      );

      return afterMapped;
    });
  }

  // -------------------------------------------------------------
  // VEHICLE MAINTENANCE SCHEDULES
  // -------------------------------------------------------------

  async createSchedule(
    input: CreateMaintenanceScheduleInput,
  ): Promise<VehicleMaintenanceScheduleDetail> {
    return this.database.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
      });
      if (!vehicle) {
        throw new ApplicationError(
          'VEHICLE_NOT_FOUND',
          'Vehicle was not found in this organization',
        );
      }
      if (vehicle.status === 'RETIRED') {
        throw new ApplicationError(
          'INVALID_VEHICLE_TRANSITION',
          'Cannot schedule maintenance for retired vehicle',
        );
      }

      const plan = await tx.maintenancePlan.findFirst({
        where: { id: input.maintenancePlanId, organizationId: input.organizationId },
      });
      if (!plan) {
        throw new ApplicationError(
          'MAINTENANCE_PLAN_NOT_FOUND',
          'Maintenance plan was not found in this organization',
        );
      }
      if (plan.status !== 'ACTIVE') {
        throw new ApplicationError(
          'MAINTENANCE_PLAN_NOT_ACTIVE',
          'Cannot assign inactive maintenance plan to vehicle',
        );
      }

      const existing = await tx.vehicleMaintenanceSchedule.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          maintenancePlanId: input.maintenancePlanId,
        },
      });
      if (existing) {
        throw new ApplicationError(
          'MAINTENANCE_SCHEDULE_ALREADY_EXISTS',
          'Vehicle already has an active maintenance schedule for this plan',
        );
      }

      const now = new Date();
      const thresholds = calculateInitialDueThresholds(plan, vehicle.odometerKm, now);

      const created = await tx.vehicleMaintenanceSchedule.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          maintenancePlanId: input.maintenancePlanId,
          nextDueAt: thresholds.nextDueAt,
          nextDueOdometerKm: thresholds.nextDueOdometerKm,
          version: 1,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
        include: {
          vehicle: true,
          plan: true,
          workOrders: {
            where: { status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } },
            take: 1,
          },
        },
      });

      const mapped = this.mapSchedule(created, vehicle.odometerKm);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'maintenance.schedule.created',
        'VehicleMaintenanceSchedule',
        created.id,
        null,
        mapped,
        input.metadata,
      );

      return mapped;
    });
  }

  async findScheduleById(
    id: string,
    organizationId: string,
  ): Promise<VehicleMaintenanceScheduleDetail | null> {
    const raw = await this.database.vehicleMaintenanceSchedule.findFirst({
      where: { id, organizationId },
      include: {
        vehicle: true,
        plan: true,
        workOrders: {
          where: { status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } },
          take: 1,
        },
      },
    });
    return raw ? this.mapSchedule(raw, raw.vehicle.odometerKm) : null;
  }

  async listSchedules(
    organizationId: string,
    filter?: ListMaintenanceSchedulesFilter,
  ): Promise<PaginatedMaintenanceSchedules> {
    const where: Prisma.VehicleMaintenanceScheduleWhereInput = { organizationId };

    if (filter?.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter?.maintenancePlanId) where.maintenancePlanId = filter.maintenancePlanId;

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const [items, total] = await Promise.all([
      this.database.vehicleMaintenanceSchedule.findMany({
        where,
        include: {
          vehicle: true,
          plan: true,
          workOrders: {
            where: { status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.database.vehicleMaintenanceSchedule.count({ where }),
    ]);

    let mapped = items.map((s) => this.mapSchedule(s, s.vehicle.odometerKm));
    if (filter?.dueState) {
      mapped = mapped.filter((s) => s.dueState === filter.dueState);
    }

    return {
      items: mapped,
      total,
    };
  }

  async createWorkOrderFromSchedule(
    scheduleId: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.database.$transaction(async (tx) => {
      const schedule = await tx.vehicleMaintenanceSchedule.findFirst({
        where: { id: scheduleId, organizationId },
        include: {
          vehicle: true,
          plan: true,
          workOrders: {
            where: { status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } },
          },
        },
      });

      if (!schedule) {
        throw new ApplicationError(
          'MAINTENANCE_SCHEDULE_NOT_FOUND',
          'Maintenance schedule not found in this organization',
        );
      }

      if (schedule.workOrders.length > 0) {
        throw new ApplicationError(
          'SCHEDULE_ALREADY_HAS_ACTIVE_WORK_ORDER',
          'This schedule already has an active work order in progress',
        );
      }

      const displayId = await this.allocateDisplayId(
        tx,
        organizationId,
        'MWO',
        'maintenanceWorkOrder',
      );
      const now = new Date();

      const created = await tx.maintenanceWorkOrder.create({
        data: {
          organizationId,
          displayId,
          vehicleId: schedule.vehicleId,
          maintenanceScheduleId: schedule.id,
          title: `Preventive Maintenance: ${schedule.plan.name}`,
          description: `Scheduled preventive maintenance triggered by plan ${schedule.plan.name}`,
          priority: schedule.plan.defaultPriority,
          blocksOperation: schedule.plan.blocksOperationWhenDue,
          status: 'OPEN',
          openedAt: now,
          odometerAtOpen: schedule.vehicle.odometerKm,
          version: 1,
          createdBy: metadata.actorId,
          updatedBy: metadata.actorId,
        },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const mapped = this.mapWorkOrder(created);

      await this.recordAuditAndOutbox(
        tx,
        organizationId,
        'maintenance.work-order.created',
        'WorkOrderCreated',
        'MaintenanceWorkOrder',
        created.id,
        null,
        mapped,
        metadata,
        {
          workOrderId: created.id,
          displayId: created.displayId,
          vehicleId: created.vehicleId,
          maintenanceScheduleId: schedule.id,
          status: created.status,
        },
      );

      return mapped;
    });
  }

  // -------------------------------------------------------------
  // MAINTENANCE VENDORS
  // -------------------------------------------------------------

  async createVendor(input: CreateMaintenanceVendorInput): Promise<MaintenanceVendorDetail> {
    return this.database.$transaction(async (tx) => {
      const displayId = await this.allocateDisplayId(
        tx,
        input.organizationId,
        'VND',
        'maintenanceVendor',
      );

      const created = await tx.maintenanceVendor.create({
        data: {
          organizationId: input.organizationId,
          displayId,
          name: input.name.trim(),
          contactName: input.contactName?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          notes: input.notes?.trim() || null,
          status: 'ACTIVE',
          version: 1,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
      });

      const mapped = this.mapVendor(created);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'maintenance.vendor.created',
        'MaintenanceVendor',
        created.id,
        null,
        mapped,
        input.metadata,
      );

      return mapped;
    });
  }

  async findVendorById(
    id: string,
    organizationId: string,
  ): Promise<MaintenanceVendorDetail | null> {
    const raw = await this.database.maintenanceVendor.findFirst({
      where: { id, organizationId },
    });
    return raw ? this.mapVendor(raw) : null;
  }

  async listVendors(
    organizationId: string,
    filter?: ListMaintenanceVendorsFilter,
  ): Promise<PaginatedMaintenanceVendors> {
    const where: Prisma.MaintenanceVendorWhereInput = { organizationId };

    if (filter?.status) where.status = filter.status;
    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { displayId: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const [items, total] = await Promise.all([
      this.database.maintenanceVendor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.database.maintenanceVendor.count({ where }),
    ]);

    return {
      items: items.map((v) => this.mapVendor(v)),
      total,
    };
  }

  async updateVendor(input: UpdateMaintenanceVendorInput): Promise<MaintenanceVendorDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenanceVendor.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
      });

      if (!current) {
        throw new ApplicationError(
          'MAINTENANCE_VENDOR_NOT_FOUND',
          'Vendor not found in this organization',
        );
      }

      const updateResult = await tx.maintenanceVendor.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          name: input.name !== undefined ? input.name.trim() : current.name,
          contactName:
            input.contactName !== undefined
              ? input.contactName?.trim() || null
              : current.contactName,
          phone: input.phone !== undefined ? input.phone?.trim() || null : current.phone,
          email: input.email !== undefined ? input.email?.trim() || null : current.email,
          notes: input.notes !== undefined ? input.notes?.trim() || null : current.notes,
          status: input.status ?? current.status,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Vendor was modified by another request',
        );
      }

      const updated = await tx.maintenanceVendor.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
      });

      const beforeMapped = this.mapVendor(current);
      const afterMapped = this.mapVendor(updated);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'maintenance.vendor.updated',
        'MaintenanceVendor',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
      );

      return afterMapped;
    });
  }

  // -------------------------------------------------------------
  // MAINTENANCE WORK ORDERS
  // -------------------------------------------------------------

  async createWorkOrder(
    input: CreateMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.database.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
      });
      if (!vehicle) {
        throw new ApplicationError(
          'VEHICLE_NOT_FOUND',
          'Vehicle was not found in this organization',
        );
      }
      if (vehicle.status === 'RETIRED') {
        throw new ApplicationError(
          'INVALID_VEHICLE_TRANSITION',
          'Cannot create work order for retired vehicle',
        );
      }

      if (input.vendorId) {
        const vendor = await tx.maintenanceVendor.findFirst({
          where: { id: input.vendorId, organizationId: input.organizationId },
        });
        if (!vendor) {
          throw new ApplicationError(
            'MAINTENANCE_VENDOR_NOT_FOUND',
            'Vendor was not found in this organization',
          );
        }
        if (vendor.status !== 'ACTIVE') {
          throw new ApplicationError(
            'MAINTENANCE_VENDOR_NOT_ACTIVE',
            'Cannot assign inactive vendor',
          );
        }
      }

      const displayId = await this.allocateDisplayId(
        tx,
        input.organizationId,
        'MWO',
        'maintenanceWorkOrder',
      );

      const created = await tx.maintenanceWorkOrder.create({
        data: {
          organizationId: input.organizationId,
          displayId,
          vehicleId: input.vehicleId,
          maintenanceRequestId: input.maintenanceRequestId ?? null,
          maintenanceScheduleId: input.maintenanceScheduleId ?? null,
          vendorId: input.vendorId ?? null,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority: input.priority ?? 'NORMAL',
          blocksOperation: input.blocksOperation ?? false,
          status: 'DRAFT',
          version: 1,
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const mapped = this.mapWorkOrder(created);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'maintenance.work-order.created',
        'WorkOrderCreated',
        'MaintenanceWorkOrder',
        created.id,
        null,
        mapped,
        input.metadata,
        {
          workOrderId: created.id,
          displayId: created.displayId,
          vehicleId: created.vehicleId,
          status: created.status,
        },
      );

      return mapped;
    });
  }

  async findWorkOrderById(
    id: string,
    organizationId: string,
  ): Promise<MaintenanceWorkOrderDetail | null> {
    const raw = await this.database.maintenanceWorkOrder.findFirst({
      where: { id, organizationId },
      include: {
        vehicle: true,
        request: true,
        vendor: true,
        tasks: { orderBy: { sortOrder: 'asc' } },
        parts: { orderBy: { createdAt: 'asc' } },
        labor: { orderBy: { createdAt: 'asc' } },
      },
    });
    return raw ? this.mapWorkOrder(raw) : null;
  }

  async listWorkOrders(
    organizationId: string,
    filter?: ListMaintenanceWorkOrdersFilter,
  ): Promise<PaginatedMaintenanceWorkOrders> {
    const where: Prisma.MaintenanceWorkOrderWhereInput = { organizationId };

    if (filter?.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter?.status) where.status = filter.status;
    if (filter?.priority) where.priority = filter.priority;
    if (filter?.vendorId) where.vendorId = filter.vendorId;

    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { displayId: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { vehicle: { displayId: { contains: q, mode: 'insensitive' } } },
        { vehicle: { registration: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const [items, total] = await Promise.all([
      this.database.maintenanceWorkOrder.findMany({
        where,
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: { orderBy: { sortOrder: 'asc' } },
          parts: { orderBy: { createdAt: 'asc' } },
          labor: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.database.maintenanceWorkOrder.count({ where }),
    ]);

    return {
      items: items.map((w) => this.mapWorkOrder(w)),
      total,
    };
  }

  async updateWorkOrder(
    input: UpdateMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenanceWorkOrder.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      if (!current) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }

      if (isTerminalWorkOrderStatus(current.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          `Cannot edit work order in ${current.status} status`,
        );
      }

      if (input.vendorId !== undefined && input.vendorId !== null) {
        const vendor = await tx.maintenanceVendor.findFirst({
          where: { id: input.vendorId, organizationId: input.organizationId },
        });
        if (!vendor || vendor.status !== 'ACTIVE') {
          throw new ApplicationError(
            'MAINTENANCE_VENDOR_NOT_ACTIVE',
            'Cannot assign invalid or inactive vendor',
          );
        }
      }

      const updateResult = await tx.maintenanceWorkOrder.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          vendorId: input.vendorId !== undefined ? input.vendorId : current.vendorId,
          title: input.title !== undefined ? input.title.trim() : current.title,
          description:
            input.description !== undefined
              ? input.description?.trim() || null
              : current.description,
          priority: input.priority ?? current.priority,
          blocksOperation: input.blocksOperation ?? current.blocksOperation,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Work order was modified by another request',
        );
      }

      const updated = await tx.maintenanceWorkOrder.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const beforeMapped = this.mapWorkOrder(current);
      const afterMapped = this.mapWorkOrder(updated);

      await this.recordAuditOnly(
        tx,
        input.organizationId,
        'maintenance.work-order.updated',
        'MaintenanceWorkOrder',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
      );

      return afterMapped;
    });
  }

  async openWorkOrder(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenanceWorkOrder.findFirst({
        where: { id, organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      if (!current) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }

      assertWorkOrderTransition(current.status as MaintenanceWorkOrderStatus, 'OPEN');

      const now = new Date();
      const updateResult = await tx.maintenanceWorkOrder.updateMany({
        where: { id, organizationId, version },
        data: {
          status: 'OPEN',
          openedAt: now,
          odometerAtOpen: current.vehicle.odometerKm,
          updatedBy: metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Work order was modified by another request',
        );
      }

      const updated = await tx.maintenanceWorkOrder.findFirstOrThrow({
        where: { id, organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const beforeMapped = this.mapWorkOrder(current);
      const afterMapped = this.mapWorkOrder(updated);

      await this.recordAuditOnly(
        tx,
        organizationId,
        'maintenance.work-order.opened',
        'MaintenanceWorkOrder',
        current.id,
        beforeMapped,
        afterMapped,
        metadata,
      );

      return afterMapped;
    });
  }

  async startWorkOrder(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenanceWorkOrder.findFirst({
        where: { id, organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      if (!current) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }

      assertWorkOrderTransition(current.status as MaintenanceWorkOrderStatus, 'IN_PROGRESS');

      const now = new Date();
      const updateResult = await tx.maintenanceWorkOrder.updateMany({
        where: { id, organizationId, version },
        data: {
          status: 'IN_PROGRESS',
          startedAt: now,
          updatedBy: metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Work order was modified by another request',
        );
      }

      const updated = await tx.maintenanceWorkOrder.findFirstOrThrow({
        where: { id, organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const beforeMapped = this.mapWorkOrder(current);
      const afterMapped = this.mapWorkOrder(updated);

      await this.recordAuditAndOutbox(
        tx,
        organizationId,
        'maintenance.work-order.started',
        'WorkOrderStarted',
        'MaintenanceWorkOrder',
        current.id,
        beforeMapped,
        afterMapped,
        metadata,
        {
          workOrderId: current.id,
          displayId: current.displayId,
          vehicleId: current.vehicleId,
          status: 'IN_PROGRESS',
        },
      );

      return afterMapped;
    });
  }

  async completeWorkOrder(
    input: CompleteMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenanceWorkOrder.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
          schedule: {
            include: { plan: true },
          },
        },
      });

      if (!current) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }

      assertWorkOrderCanBeCompleted(
        current.status as MaintenanceWorkOrderStatus,
        current.tasks.map((t) => ({ status: t.status as WorkOrderTaskStatus })),
        input.completionNotes,
        input.odometerAtCompletion,
        current.vehicle.odometerKm,
      );

      const now = new Date();
      const finalOdo = input.odometerAtCompletion ?? current.vehicle.odometerKm;

      const updateResult = await tx.maintenanceWorkOrder.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          completionNotes: input.completionNotes.trim(),
          odometerAtCompletion: input.odometerAtCompletion ?? null,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Work order was modified by another request',
        );
      }

      // Update vehicle odometer if completion odometer is higher
      if (input.odometerAtCompletion && input.odometerAtCompletion > current.vehicle.odometerKm) {
        await tx.vehicle.update({
          where: { id: current.vehicleId },
          data: { odometerKm: input.odometerAtCompletion },
        });
      }

      // If linked to preventive schedule, atomically reset schedule thresholds
      if (current.schedule) {
        const resetThresholds = calculateResetDueThresholds(current.schedule.plan, finalOdo, now);

        await tx.vehicleMaintenanceSchedule.update({
          where: { id: current.schedule.id },
          data: {
            lastCompletedAt: resetThresholds.lastCompletedAt,
            lastCompletedOdometerKm: resetThresholds.lastCompletedOdometerKm,
            nextDueAt: resetThresholds.nextDueAt,
            nextDueOdometerKm: resetThresholds.nextDueOdometerKm,
            version: { increment: 1 },
          },
        });

        await this.recordAuditOnly(
          tx,
          input.organizationId,
          'maintenance.schedule.reset',
          'VehicleMaintenanceSchedule',
          current.schedule.id,
          null,
          resetThresholds,
          input.metadata,
        );
      }

      const updated = await tx.maintenanceWorkOrder.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const beforeMapped = this.mapWorkOrder(current);
      const afterMapped = this.mapWorkOrder(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'maintenance.work-order.completed',
        'WorkOrderCompleted',
        'MaintenanceWorkOrder',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          workOrderId: current.id,
          displayId: current.displayId,
          vehicleId: current.vehicleId,
          status: 'COMPLETED',
          finalOdometerKm: finalOdo,
          totalCost: afterMapped.totalCost,
        },
      );

      return afterMapped;
    });
  }

  async cancelWorkOrder(
    input: CancelMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.database.$transaction(async (tx) => {
      const current = await tx.maintenanceWorkOrder.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      if (!current) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }

      assertWorkOrderCanBeCancelled(
        current.status as MaintenanceWorkOrderStatus,
        input.cancelReason,
      );

      const now = new Date();
      const updateResult = await tx.maintenanceWorkOrder.updateMany({
        where: { id: input.id, organizationId: input.organizationId, version: input.version },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelReason: input.cancelReason.trim(),
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Work order was modified by another request',
        );
      }

      const updated = await tx.maintenanceWorkOrder.findFirstOrThrow({
        where: { id: input.id, organizationId: input.organizationId },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
      });

      const beforeMapped = this.mapWorkOrder(current);
      const afterMapped = this.mapWorkOrder(updated);

      await this.recordAuditAndOutbox(
        tx,
        input.organizationId,
        'maintenance.work-order.cancelled',
        'WorkOrderCancelled',
        'MaintenanceWorkOrder',
        current.id,
        beforeMapped,
        afterMapped,
        input.metadata,
        {
          workOrderId: current.id,
          cancelReason: input.cancelReason.trim(),
        },
      );

      return afterMapped;
    });
  }

  // -------------------------------------------------------------
  // TASKS, PARTS, LABOR
  // -------------------------------------------------------------

  async addTask(input: AddWorkOrderTaskInput): Promise<WorkOrderTaskDetail> {
    return this.database.$transaction(async (tx) => {
      const workOrder = await tx.maintenanceWorkOrder.findFirst({
        where: { id: input.workOrderId, organizationId: input.organizationId },
      });
      if (!workOrder) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }
      if (isTerminalWorkOrderStatus(workOrder.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          'Cannot add tasks to terminal work order',
        );
      }

      const sortOrder =
        input.sortOrder ??
        (await tx.maintenanceWorkOrderTask.count({ where: { workOrderId: input.workOrderId } }));

      const created = await tx.maintenanceWorkOrderTask.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          description: input.description.trim(),
          status: input.status ?? 'PENDING',
          sortOrder,
          notes: input.notes?.trim() || null,
        },
      });

      return this.mapTask(created);
    });
  }

  async updateTask(input: UpdateWorkOrderTaskInput): Promise<WorkOrderTaskDetail> {
    return this.database.$transaction(async (tx) => {
      const task = await tx.maintenanceWorkOrderTask.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        include: { workOrder: true },
      });
      if (!task) {
        throw new ApplicationError(
          'WORK_ORDER_TASK_NOT_FOUND',
          'Task not found in this organization',
        );
      }
      if (isTerminalWorkOrderStatus(task.workOrder.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          'Cannot update tasks on terminal work order',
        );
      }

      const updated = await tx.maintenanceWorkOrderTask.update({
        where: { id: input.id },
        data: {
          description:
            input.description !== undefined ? input.description.trim() : task.description,
          status: input.status ?? task.status,
          sortOrder: input.sortOrder ?? task.sortOrder,
          notes: input.notes !== undefined ? input.notes?.trim() || null : task.notes,
        },
      });

      return this.mapTask(updated);
    });
  }

  async deleteTask(taskId: string, organizationId: string): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const task = await tx.maintenanceWorkOrderTask.findFirst({
        where: { id: taskId, organizationId },
        include: { workOrder: true },
      });
      if (!task) {
        throw new ApplicationError(
          'WORK_ORDER_TASK_NOT_FOUND',
          'Task not found in this organization',
        );
      }
      if (isTerminalWorkOrderStatus(task.workOrder.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          'Cannot delete tasks from terminal work order',
        );
      }

      await tx.maintenanceWorkOrderTask.delete({ where: { id: taskId } });
    });
  }

  async addPart(input: AddWorkOrderPartInput): Promise<WorkOrderPartDetail> {
    return this.database.$transaction(async (tx) => {
      const workOrder = await tx.maintenanceWorkOrder.findFirst({
        where: { id: input.workOrderId, organizationId: input.organizationId },
      });
      if (!workOrder) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }
      if (isTerminalWorkOrderStatus(workOrder.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          'Cannot add parts to terminal work order',
        );
      }

      const qty = Math.max(Number(input.quantity) || 0, 0);
      const unitCost = Math.max(Number(input.unitCost) || 0, 0);
      const totalCost = Math.round(qty * unitCost * 100) / 100;

      const created = await tx.maintenanceWorkOrderPart.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          description: input.description.trim(),
          partNumber: input.partNumber?.trim() || null,
          quantity: new Prisma.Decimal(qty),
          unitCost: new Prisma.Decimal(unitCost),
          totalCost: new Prisma.Decimal(totalCost),
        },
      });

      return this.mapPart(created);
    });
  }

  async deletePart(partId: string, organizationId: string): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const part = await tx.maintenanceWorkOrderPart.findFirst({
        where: { id: partId, organizationId },
        include: { workOrder: true },
      });
      if (!part) {
        throw new ApplicationError(
          'WORK_ORDER_PART_NOT_FOUND',
          'Part line not found in this organization',
        );
      }
      if (isTerminalWorkOrderStatus(part.workOrder.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          'Cannot delete parts from terminal work order',
        );
      }

      await tx.maintenanceWorkOrderPart.delete({ where: { id: partId } });
    });
  }

  async addLabor(input: AddWorkOrderLaborInput): Promise<WorkOrderLaborDetail> {
    return this.database.$transaction(async (tx) => {
      const workOrder = await tx.maintenanceWorkOrder.findFirst({
        where: { id: input.workOrderId, organizationId: input.organizationId },
      });
      if (!workOrder) {
        throw new ApplicationError(
          'WORK_ORDER_NOT_FOUND',
          'Work order not found in this organization',
        );
      }
      if (isTerminalWorkOrderStatus(workOrder.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          'Cannot add labor to terminal work order',
        );
      }

      const hours = Math.max(Number(input.hours) || 0, 0);
      const rate = Math.max(Number(input.hourlyRate) || 0, 0);
      const totalCost = Math.round(hours * rate * 100) / 100;

      const created = await tx.maintenanceWorkOrderLabor.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          description: input.description.trim(),
          hours: new Prisma.Decimal(hours),
          hourlyRate: new Prisma.Decimal(rate),
          totalCost: new Prisma.Decimal(totalCost),
        },
      });

      return this.mapLabor(created);
    });
  }

  async deleteLabor(laborId: string, organizationId: string): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const labor = await tx.maintenanceWorkOrderLabor.findFirst({
        where: { id: laborId, organizationId },
        include: { workOrder: true },
      });
      if (!labor) {
        throw new ApplicationError(
          'WORK_ORDER_LABOR_NOT_FOUND',
          'Labor line not found in this organization',
        );
      }
      if (isTerminalWorkOrderStatus(labor.workOrder.status as MaintenanceWorkOrderStatus)) {
        throw new ApplicationError(
          'WORK_ORDER_ALREADY_TERMINAL',
          'Cannot delete labor from terminal work order',
        );
      }

      await tx.maintenanceWorkOrderLabor.delete({ where: { id: laborId } });
    });
  }

  // -------------------------------------------------------------
  // SUMMARIES & DASHBOARDS
  // -------------------------------------------------------------

  async getVehicleMaintenanceSummary(
    vehicleId: string,
    organizationId: string,
  ): Promise<VehicleMaintenanceSummary> {
    const [openRequests, activeWorkOrders, schedules, recentHistory] = await Promise.all([
      this.database.maintenanceRequest.findMany({
        where: { organizationId, vehicleId, status: 'OPEN' },
        include: { vehicle: true, sourceInspection: true, convertedWorkOrder: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.database.maintenanceWorkOrder.findMany({
        where: { organizationId, vehicleId, status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.database.vehicleMaintenanceSchedule.findMany({
        where: { organizationId, vehicleId },
        include: {
          vehicle: true,
          plan: true,
          workOrders: { where: { status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.database.maintenanceWorkOrder.findMany({
        where: { organizationId, vehicleId, status: { in: ['COMPLETED', 'CANCELLED'] } },
        include: {
          vehicle: true,
          request: true,
          vendor: true,
          tasks: true,
          parts: true,
          labor: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const vehicle = await this.database.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    const currentOdo = vehicle?.odometerKm ?? 0;

    const mappedOpenRequests = openRequests.map((r) => this.mapRequest(r));
    const mappedActiveWorkOrders = activeWorkOrders.map((w) => this.mapWorkOrder(w));
    const mappedSchedules = schedules.map((s) => this.mapSchedule(s, currentOdo));
    const mappedRecentHistory = recentHistory.map((w) => this.mapWorkOrder(w));

    const isOperationallyBlocked =
      mappedOpenRequests.some((r) => r.blocksOperation) ||
      mappedActiveWorkOrders.some((w) => w.blocksOperation);

    return {
      vehicleId,
      isOperationallyBlocked,
      openRequests: mappedOpenRequests,
      activeWorkOrders: mappedActiveWorkOrders,
      schedules: mappedSchedules,
      recentHistory: mappedRecentHistory,
    };
  }

  async getDashboardSummary(organizationId: string): Promise<MaintenanceDashboardSummary> {
    const [
      openRequestsCount,
      criticalRequestsCount,
      openWorkOrdersCount,
      inProgressWorkOrdersCount,
      schedules,
      blockingRequests,
      blockingWorkOrders,
    ] = await Promise.all([
      this.database.maintenanceRequest.count({
        where: { organizationId, status: 'OPEN' },
      }),
      this.database.maintenanceRequest.count({
        where: { organizationId, status: 'OPEN', priority: 'CRITICAL' },
      }),
      this.database.maintenanceWorkOrder.count({
        where: { organizationId, status: 'OPEN' },
      }),
      this.database.maintenanceWorkOrder.count({
        where: { organizationId, status: 'IN_PROGRESS' },
      }),
      this.database.vehicleMaintenanceSchedule.findMany({
        where: { organizationId },
        include: { vehicle: true, plan: true },
      }),
      this.database.maintenanceRequest.findMany({
        where: { organizationId, status: 'OPEN', blocksOperation: true },
        select: { vehicleId: true },
      }),
      this.database.maintenanceWorkOrder.findMany({
        where: {
          organizationId,
          status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] },
          blocksOperation: true,
        },
        select: { vehicleId: true },
      }),
    ]);

    const blockedVehicleIds = new Set<string>([
      ...blockingRequests.map((r) => r.vehicleId),
      ...blockingWorkOrders.map((w) => w.vehicleId),
    ]);

    const now = new Date();
    let dueSchedulesCount = 0;
    let overdueSchedulesCount = 0;

    for (const schedule of schedules) {
      const state = deriveScheduleDueState(schedule, schedule.vehicle.odometerKm, now);
      if (state === 'DUE') dueSchedulesCount++;
      if (state === 'OVERDUE') overdueSchedulesCount++;
    }

    return {
      openRequestsCount,
      criticalRequestsCount,
      openWorkOrdersCount,
      inProgressWorkOrdersCount,
      dueSchedulesCount,
      overdueSchedulesCount,
      blockedVehiclesCount: blockedVehicleIds.size,
    };
  }

  // -------------------------------------------------------------
  // MAPPERS
  // -------------------------------------------------------------

  private mapRequest(raw: {
    id: string;
    organizationId: string;
    displayId: string;
    vehicleId: string;
    vehicle?: { displayId?: string | null; registration?: string | null } | null;
    sourceType: string;
    sourceInspectionId?: string | null;
    sourceInspection?: { displayId?: string | null } | null;
    title: string;
    description?: string | null;
    priority: string;
    blocksOperation: boolean;
    status: string;
    convertedWorkOrderId?: string | null;
    convertedWorkOrder?: { displayId?: string | null } | null;
    version: number;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
  }): MaintenanceRequestDetail {
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      vehicleId: raw.vehicleId,
      ...(raw.vehicle?.displayId ? { vehicleDisplayId: raw.vehicle.displayId } : {}),
      ...(raw.vehicle?.registration ? { vehicleRegistration: raw.vehicle.registration } : {}),
      sourceType: raw.sourceType as MaintenanceRequestSource,
      sourceInspectionId: raw.sourceInspectionId ?? null,
      sourceInspectionDisplayId: raw.sourceInspection?.displayId ?? null,
      title: raw.title,
      description: raw.description ?? null,
      priority: raw.priority as MaintenancePriority,
      blocksOperation: raw.blocksOperation,
      status: raw.status as MaintenanceRequestStatus,
      convertedWorkOrderId: raw.convertedWorkOrderId ?? null,
      convertedWorkOrderDisplayId: raw.convertedWorkOrder?.displayId ?? null,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    };
  }

  private mapPlan(raw: {
    id: string;
    organizationId: string;
    displayId: string;
    name: string;
    description?: string | null;
    status: string;
    intervalDays?: number | null;
    intervalOdometerKm?: number | null;
    defaultPriority: string;
    blocksOperationWhenDue: boolean;
    version: number;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
  }): MaintenancePlanDetail {
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      name: raw.name,
      description: raw.description ?? null,
      status: raw.status as MaintenancePlanStatus,
      intervalDays: raw.intervalDays ?? null,
      intervalOdometerKm: raw.intervalOdometerKm ?? null,
      defaultPriority: raw.defaultPriority as MaintenancePriority,
      blocksOperationWhenDue: raw.blocksOperationWhenDue,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    };
  }

  private mapSchedule(
    raw: {
      id: string;
      organizationId: string;
      vehicleId: string;
      vehicle?: { displayId?: string | null; registration?: string | null } | null;
      maintenancePlanId: string;
      plan?: {
        name?: string | null;
        intervalDays?: number | null;
        intervalOdometerKm?: number | null;
      } | null;
      lastCompletedAt?: Date | null;
      lastCompletedOdometerKm?: number | null;
      nextDueAt?: Date | null;
      nextDueOdometerKm?: number | null;
      workOrders?: Array<{ id: string; displayId: string }> | null;
      version: number;
      createdAt: Date;
      createdBy: string;
      updatedAt: Date;
      updatedBy: string;
    },
    currentVehicleOdo: number,
  ): VehicleMaintenanceScheduleDetail {
    const dueState = deriveScheduleDueState(
      {
        nextDueAt: raw.nextDueAt ?? null,
        nextDueOdometerKm: raw.nextDueOdometerKm ?? null,
      },
      currentVehicleOdo,
    );
    const activeWo = raw.workOrders && raw.workOrders.length > 0 ? raw.workOrders[0] : null;

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      vehicleId: raw.vehicleId,
      ...(raw.vehicle?.displayId ? { vehicleDisplayId: raw.vehicle.displayId } : {}),
      ...(raw.vehicle?.registration ? { vehicleRegistration: raw.vehicle.registration } : {}),
      maintenancePlanId: raw.maintenancePlanId,
      ...(raw.plan?.name ? { planName: raw.plan.name } : {}),
      planIntervalDays: raw.plan?.intervalDays ?? null,
      planIntervalOdometerKm: raw.plan?.intervalOdometerKm ?? null,
      lastCompletedAt: raw.lastCompletedAt ?? null,
      lastCompletedOdometerKm: raw.lastCompletedOdometerKm ?? null,
      nextDueAt: raw.nextDueAt ?? null,
      nextDueOdometerKm: raw.nextDueOdometerKm ?? null,
      dueState,
      activeWorkOrderId: activeWo?.id ?? null,
      activeWorkOrderDisplayId: activeWo?.displayId ?? null,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    };
  }

  private mapVendor(raw: {
    id: string;
    organizationId: string;
    displayId: string;
    name: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    status: string;
    version: number;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
  }): MaintenanceVendorDetail {
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      name: raw.name,
      contactName: raw.contactName ?? null,
      phone: raw.phone ?? null,
      email: raw.email ?? null,
      notes: raw.notes ?? null,
      status: raw.status as MaintenanceVendorStatus,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    };
  }

  private mapTask(raw: {
    id: string;
    organizationId: string;
    workOrderId: string;
    description: string;
    status: string;
    sortOrder: number;
    notes?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): WorkOrderTaskDetail {
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      workOrderId: raw.workOrderId,
      description: raw.description,
      status: raw.status as WorkOrderTaskStatus,
      sortOrder: raw.sortOrder,
      notes: raw.notes ?? null,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapPart(raw: {
    id: string;
    organizationId: string;
    workOrderId: string;
    description: string;
    partNumber?: string | null;
    quantity: number | unknown;
    unitCost: number | unknown;
    totalCost: number | unknown;
    createdAt: Date;
    updatedAt: Date;
  }): WorkOrderPartDetail {
    const quantity = Number(raw.quantity);
    const unitCost = Number(raw.unitCost);
    const totalCost = Number(raw.totalCost);

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      workOrderId: raw.workOrderId,
      description: raw.description,
      partNumber: raw.partNumber ?? null,
      quantity,
      unitCost,
      totalCost,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapLabor(raw: {
    id: string;
    organizationId: string;
    workOrderId: string;
    description: string;
    hours: number | unknown;
    hourlyRate: number | unknown;
    totalCost: number | unknown;
    createdAt: Date;
    updatedAt: Date;
  }): WorkOrderLaborDetail {
    const hours = Number(raw.hours);
    const hourlyRate = Number(raw.hourlyRate);
    const totalCost = Number(raw.totalCost);

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      workOrderId: raw.workOrderId,
      description: raw.description,
      hours,
      hourlyRate,
      totalCost,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapWorkOrder(raw: {
    id: string;
    organizationId: string;
    displayId: string;
    vehicleId: string;
    vehicle?: { displayId?: string | null; registration?: string | null } | null;
    maintenanceRequestId?: string | null;
    request?: { displayId?: string | null } | null;
    maintenanceScheduleId?: string | null;
    vendorId?: string | null;
    vendor?: { name?: string | null } | null;
    title: string;
    description?: string | null;
    priority: string;
    blocksOperation: boolean;
    status: string;
    openedAt?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
    cancelReason?: string | null;
    completionNotes?: string | null;
    odometerAtOpen?: number | null;
    odometerAtCompletion?: number | null;
    tasks?: Array<Parameters<PrismaMaintenanceRepository['mapTask']>[0]> | null;
    parts?: Array<Parameters<PrismaMaintenanceRepository['mapPart']>[0]> | null;
    labor?: Array<Parameters<PrismaMaintenanceRepository['mapLabor']>[0]> | null;
    version: number;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
  }): MaintenanceWorkOrderDetail {
    const tasks = (raw.tasks ?? []).map((t) => this.mapTask(t));
    const parts = (raw.parts ?? []).map((p) => this.mapPart(p));
    const labor = (raw.labor ?? []).map((l) => this.mapLabor(l));
    const totals = calculateWorkOrderTotals(parts, labor);

    return {
      id: raw.id,
      organizationId: raw.organizationId,
      displayId: raw.displayId,
      vehicleId: raw.vehicleId,
      ...(raw.vehicle?.displayId ? { vehicleDisplayId: raw.vehicle.displayId } : {}),
      ...(raw.vehicle?.registration ? { vehicleRegistration: raw.vehicle.registration } : {}),
      maintenanceRequestId: raw.maintenanceRequestId ?? null,
      maintenanceRequestDisplayId: raw.request?.displayId ?? null,
      maintenanceScheduleId: raw.maintenanceScheduleId ?? null,
      vendorId: raw.vendorId ?? null,
      vendorName: raw.vendor?.name ?? null,
      title: raw.title,
      description: raw.description ?? null,
      priority: raw.priority as MaintenancePriority,
      blocksOperation: raw.blocksOperation,
      status: raw.status as MaintenanceWorkOrderStatus,
      openedAt: raw.openedAt ?? null,
      startedAt: raw.startedAt ?? null,
      completedAt: raw.completedAt ?? null,
      cancelledAt: raw.cancelledAt ?? null,
      cancelReason: raw.cancelReason ?? null,
      completionNotes: raw.completionNotes ?? null,
      odometerAtOpen: raw.odometerAtOpen ?? null,
      odometerAtCompletion: raw.odometerAtCompletion ?? null,
      version: raw.version,
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
      tasks,
      parts,
      labor,
      partsTotal: totals.partsTotal,
      laborTotal: totals.laborTotal,
      totalCost: totals.totalCost,
    };
  }
}
