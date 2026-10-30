import { Inject, Injectable } from '@nestjs/common';

import {
  type AddWorkOrderLaborInput,
  type AddWorkOrderPartInput,
  type AddWorkOrderTaskInput,
  type CancelMaintenanceRequestInput,
  type CancelMaintenanceWorkOrderInput,
  type CompleteMaintenanceWorkOrderInput,
  type ConvertRequestToWorkOrderInput,
  type CreateMaintenancePlanInput,
  type CreateMaintenanceRequestInput,
  type CreateMaintenanceScheduleInput,
  type CreateMaintenanceVendorInput,
  type CreateMaintenanceWorkOrderInput,
  type ListMaintenancePlansFilter,
  type ListMaintenanceRequestsFilter,
  type ListMaintenanceSchedulesFilter,
  type ListMaintenanceVendorsFilter,
  type ListMaintenanceWorkOrdersFilter,
  MAINTENANCE_REPOSITORY,
  type MaintenanceDashboardSummary,
  type MaintenanceMutationMetadata,
  type MaintenancePlanDetail,
  type MaintenanceRepository,
  type MaintenanceRequestDetail,
  type MaintenanceVendorDetail,
  type MaintenanceWorkOrderDetail,
  type PaginatedMaintenancePlans,
  type PaginatedMaintenanceRequests,
  type PaginatedMaintenanceSchedules,
  type PaginatedMaintenanceVendors,
  type PaginatedMaintenanceWorkOrders,
  type UpdateMaintenancePlanInput,
  type UpdateMaintenanceRequestInput,
  type UpdateMaintenanceVendorInput,
  type UpdateMaintenanceWorkOrderInput,
  type UpdateWorkOrderTaskInput,
  type VehicleMaintenanceScheduleDetail,
  type VehicleMaintenanceSummary,
  type WorkOrderLaborDetail,
  type WorkOrderPartDetail,
  type WorkOrderTaskDetail,
} from './maintenance.repository.js';
import type { VehicleMaintenanceGate } from '../../trip/application/vehicle-maintenance-gate.port.js';
import { assertVehicleOperationallyAvailable } from '../domain/vehicle-maintenance-availability.js';

@Injectable()
export class MaintenanceService implements VehicleMaintenanceGate {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
  ) {}

  // Vehicle Maintenance Gate Port Implementation
  async assertOperationallyAvailable(vehicleId: string, organizationId: string): Promise<void> {
    const summary = await this.repository.getVehicleMaintenanceSummary(vehicleId, organizationId);
    assertVehicleOperationallyAvailable({
      openBlockingRequestsCount: summary.openRequests.filter((r) => r.blocksOperation).length,
      activeBlockingWorkOrdersCount: summary.activeWorkOrders.filter((w) => w.blocksOperation)
        .length,
    });
  }

  async isOperationallyAvailable(vehicleId: string, organizationId: string): Promise<boolean> {
    try {
      await this.assertOperationallyAvailable(vehicleId, organizationId);
      return true;
    } catch {
      return false;
    }
  }

  // Maintenance Requests
  async createRequest(input: CreateMaintenanceRequestInput): Promise<MaintenanceRequestDetail> {
    return this.repository.createRequest(input);
  }

  async getRequest(id: string, organizationId: string): Promise<MaintenanceRequestDetail | null> {
    return this.repository.findRequestById(id, organizationId);
  }

  async getRequestByInspection(
    inspectionId: string,
    organizationId: string,
  ): Promise<MaintenanceRequestDetail | null> {
    return this.repository.findRequestByInspection(inspectionId, organizationId);
  }

  async listRequests(
    organizationId: string,
    filter?: ListMaintenanceRequestsFilter,
  ): Promise<PaginatedMaintenanceRequests> {
    return this.repository.listRequests(organizationId, filter);
  }

  async updateRequest(input: UpdateMaintenanceRequestInput): Promise<MaintenanceRequestDetail> {
    return this.repository.updateRequest(input);
  }

  async convertRequestToWorkOrder(input: ConvertRequestToWorkOrderInput): Promise<{
    request: MaintenanceRequestDetail;
    workOrder: MaintenanceWorkOrderDetail;
  }> {
    return this.repository.convertRequestToWorkOrder(input);
  }

  async cancelRequest(input: CancelMaintenanceRequestInput): Promise<MaintenanceRequestDetail> {
    return this.repository.cancelRequest(input);
  }

  // Maintenance Plans
  async createPlan(input: CreateMaintenancePlanInput): Promise<MaintenancePlanDetail> {
    return this.repository.createPlan(input);
  }

  async getPlan(id: string, organizationId: string): Promise<MaintenancePlanDetail | null> {
    return this.repository.findPlanById(id, organizationId);
  }

  async listPlans(
    organizationId: string,
    filter?: ListMaintenancePlansFilter,
  ): Promise<PaginatedMaintenancePlans> {
    return this.repository.listPlans(organizationId, filter);
  }

  async updatePlan(input: UpdateMaintenancePlanInput): Promise<MaintenancePlanDetail> {
    return this.repository.updatePlan(input);
  }

  async activatePlan(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenancePlanDetail> {
    return this.repository.activatePlan(id, version, organizationId, metadata);
  }

  async archivePlan(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenancePlanDetail> {
    return this.repository.archivePlan(id, version, organizationId, metadata);
  }

  // Vehicle Maintenance Schedules
  async createSchedule(
    input: CreateMaintenanceScheduleInput,
  ): Promise<VehicleMaintenanceScheduleDetail> {
    return this.repository.createSchedule(input);
  }

  async getSchedule(
    id: string,
    organizationId: string,
  ): Promise<VehicleMaintenanceScheduleDetail | null> {
    return this.repository.findScheduleById(id, organizationId);
  }

  async listSchedules(
    organizationId: string,
    filter?: ListMaintenanceSchedulesFilter,
  ): Promise<PaginatedMaintenanceSchedules> {
    return this.repository.listSchedules(organizationId, filter);
  }

  async createWorkOrderFromSchedule(
    scheduleId: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.repository.createWorkOrderFromSchedule(
      scheduleId,
      version,
      organizationId,
      metadata,
    );
  }

  // Maintenance Vendors
  async createVendor(input: CreateMaintenanceVendorInput): Promise<MaintenanceVendorDetail> {
    return this.repository.createVendor(input);
  }

  async getVendor(id: string, organizationId: string): Promise<MaintenanceVendorDetail | null> {
    return this.repository.findVendorById(id, organizationId);
  }

  async listVendors(
    organizationId: string,
    filter?: ListMaintenanceVendorsFilter,
  ): Promise<PaginatedMaintenanceVendors> {
    return this.repository.listVendors(organizationId, filter);
  }

  async updateVendor(input: UpdateMaintenanceVendorInput): Promise<MaintenanceVendorDetail> {
    return this.repository.updateVendor(input);
  }

  // Maintenance Work Orders
  async createWorkOrder(
    input: CreateMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.repository.createWorkOrder(input);
  }

  async getWorkOrder(
    id: string,
    organizationId: string,
  ): Promise<MaintenanceWorkOrderDetail | null> {
    return this.repository.findWorkOrderById(id, organizationId);
  }

  async listWorkOrders(
    organizationId: string,
    filter?: ListMaintenanceWorkOrdersFilter,
  ): Promise<PaginatedMaintenanceWorkOrders> {
    return this.repository.listWorkOrders(organizationId, filter);
  }

  async updateWorkOrder(
    input: UpdateMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.repository.updateWorkOrder(input);
  }

  async openWorkOrder(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.repository.openWorkOrder(id, version, organizationId, metadata);
  }

  async startWorkOrder(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.repository.startWorkOrder(id, version, organizationId, metadata);
  }

  async completeWorkOrder(
    input: CompleteMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.repository.completeWorkOrder(input);
  }

  async cancelWorkOrder(
    input: CancelMaintenanceWorkOrderInput,
  ): Promise<MaintenanceWorkOrderDetail> {
    return this.repository.cancelWorkOrder(input);
  }

  // Tasks
  async addTask(input: AddWorkOrderTaskInput): Promise<WorkOrderTaskDetail> {
    return this.repository.addTask(input);
  }

  async updateTask(input: UpdateWorkOrderTaskInput): Promise<WorkOrderTaskDetail> {
    return this.repository.updateTask(input);
  }

  async deleteTask(taskId: string, organizationId: string): Promise<void> {
    return this.repository.deleteTask(taskId, organizationId);
  }

  // Parts
  async addPart(input: AddWorkOrderPartInput): Promise<WorkOrderPartDetail> {
    return this.repository.addPart(input);
  }

  async deletePart(partId: string, organizationId: string): Promise<void> {
    return this.repository.deletePart(partId, organizationId);
  }

  // Labor
  async addLabor(input: AddWorkOrderLaborInput): Promise<WorkOrderLaborDetail> {
    return this.repository.addLabor(input);
  }

  async deleteLabor(laborId: string, organizationId: string): Promise<void> {
    return this.repository.deleteLabor(laborId, organizationId);
  }

  // Summaries
  async getVehicleMaintenanceSummary(
    vehicleId: string,
    organizationId: string,
  ): Promise<VehicleMaintenanceSummary> {
    return this.repository.getVehicleMaintenanceSummary(vehicleId, organizationId);
  }

  async getDashboardSummary(organizationId: string): Promise<MaintenanceDashboardSummary> {
    return this.repository.getDashboardSummary(organizationId);
  }
}
