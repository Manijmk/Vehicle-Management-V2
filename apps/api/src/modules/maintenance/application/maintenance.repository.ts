import type {
  MaintenancePlanStatus,
  MaintenancePriority,
  MaintenanceRequestSource,
  MaintenanceRequestStatus,
  MaintenanceVendorStatus,
  MaintenanceWorkOrderStatus,
  ScheduleDueState,
  WorkOrderTaskStatus,
} from '../domain/index.js';

export const MAINTENANCE_REPOSITORY = Symbol('MAINTENANCE_REPOSITORY');

export interface MaintenanceMutationMetadata {
  readonly actorId: string;
  readonly requestId: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export interface MaintenanceRequestDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly vehicleId: string;
  readonly vehicleDisplayId?: string;
  readonly vehicleRegistration?: string;
  readonly sourceType: MaintenanceRequestSource;
  readonly sourceInspectionId: string | null;
  readonly sourceInspectionDisplayId?: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly priority: MaintenancePriority;
  readonly blocksOperation: boolean;
  readonly status: MaintenanceRequestStatus;
  readonly convertedWorkOrderId: string | null;
  readonly convertedWorkOrderDisplayId?: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface CreateMaintenanceRequestInput {
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly sourceType: MaintenanceRequestSource;
  readonly sourceInspectionId?: string | null | undefined;
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly priority?: MaintenancePriority | undefined;
  readonly blocksOperation?: boolean | undefined;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface UpdateMaintenanceRequestInput {
  readonly id: string;
  readonly organizationId: string;
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly priority?: MaintenancePriority | undefined;
  readonly blocksOperation?: boolean | undefined;
  readonly version: number;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface ConvertRequestToWorkOrderInput {
  readonly id: string;
  readonly organizationId: string;
  readonly version: number;
  readonly vendorId?: string | null | undefined;
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly priority?: MaintenancePriority | undefined;
  readonly blocksOperation?: boolean | undefined;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface CancelMaintenanceRequestInput {
  readonly id: string;
  readonly organizationId: string;
  readonly cancelReason: string;
  readonly version: number;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface ListMaintenanceRequestsFilter {
  readonly vehicleId?: string | undefined;
  readonly status?: MaintenanceRequestStatus | undefined;
  readonly priority?: MaintenancePriority | undefined;
  readonly sourceType?: MaintenanceRequestSource | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedMaintenanceRequests {
  readonly items: readonly MaintenanceRequestDetail[];
  readonly total: number;
}

export interface MaintenancePlanDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: MaintenancePlanStatus;
  readonly intervalDays: number | null;
  readonly intervalOdometerKm: number | null;
  readonly defaultPriority: MaintenancePriority;
  readonly blocksOperationWhenDue: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface CreateMaintenancePlanInput {
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly intervalDays?: number | null | undefined;
  readonly intervalOdometerKm?: number | null | undefined;
  readonly defaultPriority?: MaintenancePriority | undefined;
  readonly blocksOperationWhenDue?: boolean | undefined;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface UpdateMaintenancePlanInput {
  readonly id: string;
  readonly organizationId: string;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly intervalDays?: number | null | undefined;
  readonly intervalOdometerKm?: number | null | undefined;
  readonly defaultPriority?: MaintenancePriority | undefined;
  readonly blocksOperationWhenDue?: boolean | undefined;
  readonly version: number;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface ListMaintenancePlansFilter {
  readonly status?: MaintenancePlanStatus | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedMaintenancePlans {
  readonly items: readonly MaintenancePlanDetail[];
  readonly total: number;
}

export interface VehicleMaintenanceScheduleDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly vehicleDisplayId?: string;
  readonly vehicleRegistration?: string;
  readonly maintenancePlanId: string;
  readonly planName?: string;
  readonly planIntervalDays?: number | null;
  readonly planIntervalOdometerKm?: number | null;
  readonly lastCompletedAt: Date | null;
  readonly lastCompletedOdometerKm: number | null;
  readonly nextDueAt: Date | null;
  readonly nextDueOdometerKm: number | null;
  readonly dueState: ScheduleDueState;
  readonly activeWorkOrderId?: string | null;
  readonly activeWorkOrderDisplayId?: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface CreateMaintenanceScheduleInput {
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly maintenancePlanId: string;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface ListMaintenanceSchedulesFilter {
  readonly vehicleId?: string | undefined;
  readonly maintenancePlanId?: string | undefined;
  readonly dueState?: ScheduleDueState | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedMaintenanceSchedules {
  readonly items: readonly VehicleMaintenanceScheduleDetail[];
  readonly total: number;
}

export interface MaintenanceVendorDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly status: MaintenanceVendorStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export interface CreateMaintenanceVendorInput {
  readonly organizationId: string;
  readonly name: string;
  readonly contactName?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface UpdateMaintenanceVendorInput {
  readonly id: string;
  readonly organizationId: string;
  readonly name?: string | undefined;
  readonly contactName?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly status?: MaintenanceVendorStatus | undefined;
  readonly version: number;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface ListMaintenanceVendorsFilter {
  readonly status?: MaintenanceVendorStatus | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedMaintenanceVendors {
  readonly items: readonly MaintenanceVendorDetail[];
  readonly total: number;
}

export interface WorkOrderTaskDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly workOrderId: string;
  readonly description: string;
  readonly status: WorkOrderTaskStatus;
  readonly sortOrder: number;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkOrderPartDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly workOrderId: string;
  readonly description: string;
  readonly partNumber: string | null;
  readonly quantity: number;
  readonly unitCost: number;
  readonly totalCost: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkOrderLaborDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly workOrderId: string;
  readonly description: string;
  readonly hours: number;
  readonly hourlyRate: number;
  readonly totalCost: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MaintenanceWorkOrderDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly vehicleId: string;
  readonly vehicleDisplayId?: string;
  readonly vehicleRegistration?: string;
  readonly maintenanceRequestId: string | null;
  readonly maintenanceRequestDisplayId?: string | null;
  readonly maintenanceScheduleId: string | null;
  readonly vendorId: string | null;
  readonly vendorName?: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly priority: MaintenancePriority;
  readonly blocksOperation: boolean;
  readonly status: MaintenanceWorkOrderStatus;
  readonly openedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly completionNotes: string | null;
  readonly odometerAtOpen: number | null;
  readonly odometerAtCompletion: number | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
  readonly tasks: readonly WorkOrderTaskDetail[];
  readonly parts: readonly WorkOrderPartDetail[];
  readonly labor: readonly WorkOrderLaborDetail[];
  readonly partsTotal: number;
  readonly laborTotal: number;
  readonly totalCost: number;
}

export interface CreateMaintenanceWorkOrderInput {
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly maintenanceRequestId?: string | null | undefined;
  readonly maintenanceScheduleId?: string | null | undefined;
  readonly vendorId?: string | null | undefined;
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly priority?: MaintenancePriority | undefined;
  readonly blocksOperation?: boolean | undefined;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface UpdateMaintenanceWorkOrderInput {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId?: string | null | undefined;
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly priority?: MaintenancePriority | undefined;
  readonly blocksOperation?: boolean | undefined;
  readonly version: number;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface CompleteMaintenanceWorkOrderInput {
  readonly id: string;
  readonly organizationId: string;
  readonly completionNotes: string;
  readonly odometerAtCompletion?: number | null | undefined;
  readonly version: number;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface CancelMaintenanceWorkOrderInput {
  readonly id: string;
  readonly organizationId: string;
  readonly cancelReason: string;
  readonly version: number;
  readonly metadata: MaintenanceMutationMetadata;
}

export interface ListMaintenanceWorkOrdersFilter {
  readonly vehicleId?: string | undefined;
  readonly status?: MaintenanceWorkOrderStatus | undefined;
  readonly priority?: MaintenancePriority | undefined;
  readonly vendorId?: string | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedMaintenanceWorkOrders {
  readonly items: readonly MaintenanceWorkOrderDetail[];
  readonly total: number;
}

export interface AddWorkOrderTaskInput {
  readonly workOrderId: string;
  readonly organizationId: string;
  readonly description: string;
  readonly status?: WorkOrderTaskStatus | undefined;
  readonly sortOrder?: number | undefined;
  readonly notes?: string | null | undefined;
}

export interface UpdateWorkOrderTaskInput {
  readonly id: string;
  readonly organizationId: string;
  readonly description?: string | undefined;
  readonly status?: WorkOrderTaskStatus | undefined;
  readonly sortOrder?: number | undefined;
  readonly notes?: string | null | undefined;
}

export interface AddWorkOrderPartInput {
  readonly workOrderId: string;
  readonly organizationId: string;
  readonly description: string;
  readonly partNumber?: string | null | undefined;
  readonly quantity: number;
  readonly unitCost: number;
}

export interface AddWorkOrderLaborInput {
  readonly workOrderId: string;
  readonly organizationId: string;
  readonly description: string;
  readonly hours: number;
  readonly hourlyRate: number;
}

export interface VehicleMaintenanceSummary {
  readonly vehicleId: string;
  readonly isOperationallyBlocked: boolean;
  readonly openRequests: readonly MaintenanceRequestDetail[];
  readonly activeWorkOrders: readonly MaintenanceWorkOrderDetail[];
  readonly schedules: readonly VehicleMaintenanceScheduleDetail[];
  readonly recentHistory: readonly MaintenanceWorkOrderDetail[];
}

export interface MaintenanceDashboardSummary {
  readonly openRequestsCount: number;
  readonly criticalRequestsCount: number;
  readonly openWorkOrdersCount: number;
  readonly inProgressWorkOrdersCount: number;
  readonly dueSchedulesCount: number;
  readonly overdueSchedulesCount: number;
  readonly blockedVehiclesCount: number;
}

export interface MaintenanceRepository {
  createRequest(input: CreateMaintenanceRequestInput): Promise<MaintenanceRequestDetail>;
  findRequestById(id: string, organizationId: string): Promise<MaintenanceRequestDetail | null>;
  findRequestByInspection(
    inspectionId: string,
    organizationId: string,
  ): Promise<MaintenanceRequestDetail | null>;
  listRequests(
    organizationId: string,
    filter?: ListMaintenanceRequestsFilter,
  ): Promise<PaginatedMaintenanceRequests>;
  updateRequest(input: UpdateMaintenanceRequestInput): Promise<MaintenanceRequestDetail>;
  convertRequestToWorkOrder(input: ConvertRequestToWorkOrderInput): Promise<{
    request: MaintenanceRequestDetail;
    workOrder: MaintenanceWorkOrderDetail;
  }>;
  cancelRequest(input: CancelMaintenanceRequestInput): Promise<MaintenanceRequestDetail>;

  createPlan(input: CreateMaintenancePlanInput): Promise<MaintenancePlanDetail>;
  findPlanById(id: string, organizationId: string): Promise<MaintenancePlanDetail | null>;
  listPlans(
    organizationId: string,
    filter?: ListMaintenancePlansFilter,
  ): Promise<PaginatedMaintenancePlans>;
  updatePlan(input: UpdateMaintenancePlanInput): Promise<MaintenancePlanDetail>;
  activatePlan(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenancePlanDetail>;
  archivePlan(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenancePlanDetail>;

  createSchedule(input: CreateMaintenanceScheduleInput): Promise<VehicleMaintenanceScheduleDetail>;
  findScheduleById(
    id: string,
    organizationId: string,
  ): Promise<VehicleMaintenanceScheduleDetail | null>;
  listSchedules(
    organizationId: string,
    filter?: ListMaintenanceSchedulesFilter,
  ): Promise<PaginatedMaintenanceSchedules>;
  createWorkOrderFromSchedule(
    scheduleId: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail>;

  createVendor(input: CreateMaintenanceVendorInput): Promise<MaintenanceVendorDetail>;
  findVendorById(id: string, organizationId: string): Promise<MaintenanceVendorDetail | null>;
  listVendors(
    organizationId: string,
    filter?: ListMaintenanceVendorsFilter,
  ): Promise<PaginatedMaintenanceVendors>;
  updateVendor(input: UpdateMaintenanceVendorInput): Promise<MaintenanceVendorDetail>;

  createWorkOrder(input: CreateMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrderDetail>;
  findWorkOrderById(id: string, organizationId: string): Promise<MaintenanceWorkOrderDetail | null>;
  listWorkOrders(
    organizationId: string,
    filter?: ListMaintenanceWorkOrdersFilter,
  ): Promise<PaginatedMaintenanceWorkOrders>;
  updateWorkOrder(input: UpdateMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrderDetail>;
  openWorkOrder(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail>;
  startWorkOrder(
    id: string,
    version: number,
    organizationId: string,
    metadata: MaintenanceMutationMetadata,
  ): Promise<MaintenanceWorkOrderDetail>;
  completeWorkOrder(input: CompleteMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrderDetail>;
  cancelWorkOrder(input: CancelMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrderDetail>;

  addTask(input: AddWorkOrderTaskInput): Promise<WorkOrderTaskDetail>;
  updateTask(input: UpdateWorkOrderTaskInput): Promise<WorkOrderTaskDetail>;
  deleteTask(taskId: string, organizationId: string): Promise<void>;

  addPart(input: AddWorkOrderPartInput): Promise<WorkOrderPartDetail>;
  deletePart(partId: string, organizationId: string): Promise<void>;

  addLabor(input: AddWorkOrderLaborInput): Promise<WorkOrderLaborDetail>;
  deleteLabor(laborId: string, organizationId: string): Promise<void>;

  getVehicleMaintenanceSummary(
    vehicleId: string,
    organizationId: string,
  ): Promise<VehicleMaintenanceSummary>;
  getDashboardSummary(organizationId: string): Promise<MaintenanceDashboardSummary>;
}
