import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { DATABASE } from '../../../common/tokens.js';
import { type PrismaClient } from '@vms/database';
import { Inject } from '@nestjs/common';
import { ApplicationError } from '../../foundation/domain/errors.js';
import type { MaintenancePriority } from '../domain/index.js';
import { MaintenanceService } from '../application/maintenance.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import {
  AddWorkOrderLaborDto,
  AddWorkOrderPartDto,
  AddWorkOrderTaskDto,
  CancelMaintenanceRequestDto,
  CancelMaintenanceWorkOrderDto,
  CompleteMaintenanceWorkOrderDto,
  ConvertRequestToWorkOrderDto,
  CreateMaintenancePlanDto,
  CreateMaintenanceRequestDto,
  CreateMaintenanceScheduleDto,
  CreateMaintenanceVendorDto,
  CreateMaintenanceWorkOrderDto,
  ListMaintenancePlansQueryDto,
  ListMaintenanceRequestsQueryDto,
  ListMaintenanceSchedulesQueryDto,
  ListMaintenanceVendorsQueryDto,
  ListMaintenanceWorkOrdersQueryDto,
  UpdateMaintenancePlanDto,
  UpdateMaintenanceRequestDto,
  UpdateMaintenanceVendorDto,
  UpdateMaintenanceWorkOrderDto,
  UpdateWorkOrderTaskDto,
  VersionedActionDto,
} from './maintenance.dto.js';

function mutationMetadata(request: AuthenticatedRequest) {
  const ipAddress = request.ip ?? '127.0.0.1';
  const userAgent = Array.isArray(request.headers['user-agent'])
    ? request.headers['user-agent'][0]
    : (request.headers['user-agent'] ?? 'unknown');

  return {
    actorId: request.principal.userId,
    requestId:
      request.requestId ??
      (Array.isArray(request.headers['x-request-id'])
        ? request.headers['x-request-id'][0]
        : request.headers['x-request-id']) ??
      'maintenance-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Maintenance')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  description: 'Active tenant organization context',
  required: true,
})
@TenantScoped()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  // -------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------

  @Get('dashboard')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get operational maintenance dashboard counts' })
  @ApiOkResponse({ description: 'Dashboard metrics retrieved successfully' })
  async getDashboard(@Req() request: AuthenticatedRequest) {
    return this.service.getDashboardSummary(request.tenant!.organizationId);
  }

  // -------------------------------------------------------------------
  // Maintenance Requests
  // -------------------------------------------------------------------

  @Post('requests')
  @RequirePermissions('maintenance.request.create')
  @ApiOperation({ summary: 'Create a maintenance request' })
  @ApiCreatedResponse({ description: 'Maintenance request created' })
  async createRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMaintenanceRequestDto,
  ) {
    return this.service.createRequest({
      organizationId: request.tenant!.organizationId,
      vehicleId: dto.vehicleId,
      sourceType: dto.sourceType ?? 'MANUAL',
      sourceInspectionId: dto.sourceInspectionId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      blocksOperation: dto.blocksOperation,
      metadata: mutationMetadata(request),
    });
  }

  @Get('requests')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'List maintenance requests' })
  @ApiOkResponse({ description: 'Paginated list of maintenance requests' })
  async listRequests(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMaintenanceRequestsQueryDto,
  ) {
    return this.service.listRequests(request.tenant!.organizationId, query);
  }

  @Get('requests/:requestId')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get maintenance request details' })
  @ApiOkResponse({ description: 'Maintenance request details' })
  @ApiNotFoundResponse({ description: 'Request not found' })
  async getRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    const item = await this.service.getRequest(requestId, request.tenant!.organizationId);
    if (!item) {
      throw new ApplicationError(
        'MAINTENANCE_REQUEST_NOT_FOUND',
        'Maintenance request not found in this organization',
      );
    }
    return item;
  }

  @Patch('requests/:requestId')
  @RequirePermissions('maintenance.request.manage')
  @ApiOperation({ summary: 'Update maintenance request metadata' })
  @ApiOkResponse({ description: 'Maintenance request updated' })
  async updateRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: UpdateMaintenanceRequestDto,
  ) {
    return this.service.updateRequest({
      id: requestId,
      organizationId: request.tenant!.organizationId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      blocksOperation: dto.blocksOperation,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post('requests/:requestId/convert-to-work-order')
  @RequirePermissions('maintenance.request.manage', 'maintenance.work-order.create')
  @ApiOperation({ summary: 'Convert maintenance request into a work order' })
  @ApiOkResponse({ description: 'Maintenance request converted to work order' })
  async convertRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ConvertRequestToWorkOrderDto,
  ) {
    return this.service.convertRequestToWorkOrder({
      id: requestId,
      organizationId: request.tenant!.organizationId,
      vendorId: dto.vendorId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      blocksOperation: dto.blocksOperation,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post('requests/:requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maintenance.request.manage')
  @ApiOperation({ summary: 'Cancel a maintenance request' })
  @ApiOkResponse({ description: 'Maintenance request cancelled' })
  async cancelRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CancelMaintenanceRequestDto,
  ) {
    return this.service.cancelRequest({
      id: requestId,
      organizationId: request.tenant!.organizationId,
      cancelReason: dto.cancelReason,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  // -------------------------------------------------------------------
  // Maintenance Plans
  // -------------------------------------------------------------------

  @Post('plans')
  @RequirePermissions('maintenance.plan.manage')
  @ApiOperation({ summary: 'Create preventive maintenance plan' })
  @ApiCreatedResponse({ description: 'Plan created' })
  async createPlan(@Req() request: AuthenticatedRequest, @Body() dto: CreateMaintenancePlanDto) {
    return this.service.createPlan({
      organizationId: request.tenant!.organizationId,
      name: dto.name,
      description: dto.description,
      intervalDays: dto.intervalDays,
      intervalOdometerKm: dto.intervalOdometerKm,
      defaultPriority: dto.defaultPriority,
      blocksOperationWhenDue: dto.blocksOperationWhenDue,
      metadata: mutationMetadata(request),
    });
  }

  @Get('plans')
  @RequirePermissions('maintenance.plan.read')
  @ApiOperation({ summary: 'List preventive maintenance plans' })
  @ApiOkResponse({ description: 'List of plans' })
  async listPlans(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMaintenancePlansQueryDto,
  ) {
    return this.service.listPlans(request.tenant!.organizationId, query);
  }

  @Get('plans/:planId')
  @RequirePermissions('maintenance.plan.read')
  @ApiOperation({ summary: 'Get maintenance plan details' })
  @ApiOkResponse({ description: 'Plan details' })
  @ApiNotFoundResponse({ description: 'Plan not found' })
  async getPlan(
    @Req() request: AuthenticatedRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    const plan = await this.service.getPlan(planId, request.tenant!.organizationId);
    if (!plan) {
      throw new ApplicationError(
        'MAINTENANCE_PLAN_NOT_FOUND',
        'Maintenance plan not found in this organization',
      );
    }
    return plan;
  }

  @Patch('plans/:planId')
  @RequirePermissions('maintenance.plan.manage')
  @ApiOperation({ summary: 'Update draft maintenance plan' })
  @ApiOkResponse({ description: 'Plan updated' })
  async updatePlan(
    @Req() request: AuthenticatedRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdateMaintenancePlanDto,
  ) {
    return this.service.updatePlan({
      id: planId,
      organizationId: request.tenant!.organizationId,
      name: dto.name,
      description: dto.description,
      intervalDays: dto.intervalDays,
      intervalOdometerKm: dto.intervalOdometerKm,
      defaultPriority: dto.defaultPriority,
      blocksOperationWhenDue: dto.blocksOperationWhenDue,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post('plans/:planId/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maintenance.plan.manage')
  @ApiOperation({ summary: 'Activate maintenance plan' })
  @ApiOkResponse({ description: 'Plan activated' })
  async activatePlan(
    @Req() request: AuthenticatedRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: VersionedActionDto,
  ) {
    return this.service.activatePlan(
      planId,
      dto.version,
      request.tenant!.organizationId,
      mutationMetadata(request),
    );
  }

  @Post('plans/:planId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maintenance.plan.manage')
  @ApiOperation({ summary: 'Archive maintenance plan' })
  @ApiOkResponse({ description: 'Plan archived' })
  async archivePlan(
    @Req() request: AuthenticatedRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: VersionedActionDto,
  ) {
    return this.service.archivePlan(
      planId,
      dto.version,
      request.tenant!.organizationId,
      mutationMetadata(request),
    );
  }

  // -------------------------------------------------------------------
  // Vehicle Maintenance Schedules
  // -------------------------------------------------------------------

  @Post('schedules')
  @RequirePermissions('maintenance.plan.manage')
  @ApiOperation({ summary: 'Assign preventive maintenance plan to vehicle' })
  @ApiCreatedResponse({ description: 'Schedule created' })
  async createSchedule(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMaintenanceScheduleDto,
  ) {
    return this.service.createSchedule({
      organizationId: request.tenant!.organizationId,
      vehicleId: dto.vehicleId,
      maintenancePlanId: dto.maintenancePlanId,
      metadata: mutationMetadata(request),
    });
  }

  @Get('schedules')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'List vehicle maintenance schedules' })
  @ApiOkResponse({ description: 'List of schedules' })
  async listSchedules(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMaintenanceSchedulesQueryDto,
  ) {
    return this.service.listSchedules(request.tenant!.organizationId, query);
  }

  @Get('schedules/:scheduleId')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get schedule details' })
  @ApiOkResponse({ description: 'Schedule details' })
  @ApiNotFoundResponse({ description: 'Schedule not found' })
  async getSchedule(
    @Req() request: AuthenticatedRequest,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ) {
    const item = await this.service.getSchedule(scheduleId, request.tenant!.organizationId);
    if (!item) {
      throw new ApplicationError(
        'MAINTENANCE_SCHEDULE_NOT_FOUND',
        'Maintenance schedule not found in this organization',
      );
    }
    return item;
  }

  @Post('schedules/:scheduleId/work-orders')
  @RequirePermissions('maintenance.work-order.create')
  @ApiOperation({ summary: 'Create preventive work order from due schedule' })
  @ApiCreatedResponse({ description: 'Work order created from schedule' })
  async createWorkOrderFromSchedule(
    @Req() request: AuthenticatedRequest,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: VersionedActionDto,
  ) {
    return this.service.createWorkOrderFromSchedule(
      scheduleId,
      dto.version,
      request.tenant!.organizationId,
      mutationMetadata(request),
    );
  }

  // -------------------------------------------------------------------
  // Maintenance Vendors
  // -------------------------------------------------------------------

  @Post('vendors')
  @RequirePermissions('maintenance.vendor.manage')
  @ApiOperation({ summary: 'Create maintenance vendor/shop' })
  @ApiCreatedResponse({ description: 'Vendor created' })
  async createVendor(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMaintenanceVendorDto,
  ) {
    return this.service.createVendor({
      organizationId: request.tenant!.organizationId,
      name: dto.name,
      contactName: dto.contactName,
      phone: dto.phone,
      email: dto.email,
      notes: dto.notes,
      metadata: mutationMetadata(request),
    });
  }

  @Get('vendors')
  @RequirePermissions('maintenance.vendor.read')
  @ApiOperation({ summary: 'List maintenance vendors' })
  @ApiOkResponse({ description: 'List of vendors' })
  async listVendors(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMaintenanceVendorsQueryDto,
  ) {
    return this.service.listVendors(request.tenant!.organizationId, query);
  }

  @Get('vendors/:vendorId')
  @RequirePermissions('maintenance.vendor.read')
  @ApiOperation({ summary: 'Get vendor details' })
  @ApiOkResponse({ description: 'Vendor details' })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  async getVendor(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
  ) {
    const vendor = await this.service.getVendor(vendorId, request.tenant!.organizationId);
    if (!vendor) {
      throw new ApplicationError(
        'MAINTENANCE_VENDOR_NOT_FOUND',
        'Vendor not found in this organization',
      );
    }
    return vendor;
  }

  @Patch('vendors/:vendorId')
  @RequirePermissions('maintenance.vendor.manage')
  @ApiOperation({ summary: 'Update vendor details' })
  @ApiOkResponse({ description: 'Vendor updated' })
  async updateVendor(
    @Req() request: AuthenticatedRequest,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Body() dto: UpdateMaintenanceVendorDto,
  ) {
    return this.service.updateVendor({
      id: vendorId,
      organizationId: request.tenant!.organizationId,
      name: dto.name,
      contactName: dto.contactName,
      phone: dto.phone,
      email: dto.email,
      notes: dto.notes,
      status: dto.status,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  // -------------------------------------------------------------------
  // Maintenance Work Orders
  // -------------------------------------------------------------------

  @Post('work-orders')
  @RequirePermissions('maintenance.work-order.create')
  @ApiOperation({ summary: 'Create maintenance work order' })
  @ApiCreatedResponse({ description: 'Work order created' })
  async createWorkOrder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMaintenanceWorkOrderDto,
  ) {
    return this.service.createWorkOrder({
      organizationId: request.tenant!.organizationId,
      vehicleId: dto.vehicleId,
      maintenanceRequestId: dto.maintenanceRequestId,
      maintenanceScheduleId: dto.maintenanceScheduleId,
      vendorId: dto.vendorId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      blocksOperation: dto.blocksOperation,
      metadata: mutationMetadata(request),
    });
  }

  @Get('work-orders')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'List maintenance work orders' })
  @ApiOkResponse({ description: 'List of work orders' })
  async listWorkOrders(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMaintenanceWorkOrdersQueryDto,
  ) {
    return this.service.listWorkOrders(request.tenant!.organizationId, query);
  }

  @Get('work-orders/:workOrderId')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get work order details with tasks, parts, and labor' })
  @ApiOkResponse({ description: 'Work order details' })
  @ApiNotFoundResponse({ description: 'Work order not found' })
  async getWorkOrder(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
  ) {
    const item = await this.service.getWorkOrder(workOrderId, request.tenant!.organizationId);
    if (!item) {
      throw new ApplicationError(
        'WORK_ORDER_NOT_FOUND',
        'Work order not found in this organization',
      );
    }
    return item;
  }

  @Patch('work-orders/:workOrderId')
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Update work order details' })
  @ApiOkResponse({ description: 'Work order updated' })
  async updateWorkOrder(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: UpdateMaintenanceWorkOrderDto,
  ) {
    return this.service.updateWorkOrder({
      id: workOrderId,
      organizationId: request.tenant!.organizationId,
      vendorId: dto.vendorId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      blocksOperation: dto.blocksOperation,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post('work-orders/:workOrderId/open')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Open draft work order' })
  @ApiOkResponse({ description: 'Work order opened' })
  async openWorkOrder(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: VersionedActionDto,
  ) {
    return this.service.openWorkOrder(
      workOrderId,
      dto.version,
      request.tenant!.organizationId,
      mutationMetadata(request),
    );
  }

  @Post('work-orders/:workOrderId/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Start work order (transitions OPEN -> IN_PROGRESS)' })
  @ApiOkResponse({ description: 'Work order started' })
  async startWorkOrder(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: VersionedActionDto,
  ) {
    return this.service.startWorkOrder(
      workOrderId,
      dto.version,
      request.tenant!.organizationId,
      mutationMetadata(request),
    );
  }

  @Post('work-orders/:workOrderId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Complete work order' })
  @ApiOkResponse({ description: 'Work order completed' })
  async completeWorkOrder(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: CompleteMaintenanceWorkOrderDto,
  ) {
    return this.service.completeWorkOrder({
      id: workOrderId,
      organizationId: request.tenant!.organizationId,
      completionNotes: dto.completionNotes,
      odometerAtCompletion: dto.odometerAtCompletion,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post('work-orders/:workOrderId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Cancel work order' })
  @ApiOkResponse({ description: 'Work order cancelled' })
  async cancelWorkOrder(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: CancelMaintenanceWorkOrderDto,
  ) {
    return this.service.cancelWorkOrder({
      id: workOrderId,
      organizationId: request.tenant!.organizationId,
      cancelReason: dto.cancelReason,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  // Tasks
  @Post('work-orders/:workOrderId/tasks')
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Add task to work order' })
  @ApiCreatedResponse({ description: 'Task added' })
  async addTask(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: AddWorkOrderTaskDto,
  ) {
    return this.service.addTask({
      workOrderId,
      organizationId: request.tenant!.organizationId,
      description: dto.description,
      status: dto.status,
      sortOrder: dto.sortOrder,
      notes: dto.notes,
    });
  }

  @Patch('work-orders/:workOrderId/tasks/:taskId')
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Update work order task' })
  @ApiOkResponse({ description: 'Task updated' })
  async updateTask(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateWorkOrderTaskDto,
  ) {
    return this.service.updateTask({
      id: taskId,
      organizationId: request.tenant!.organizationId,
      description: dto.description,
      status: dto.status,
      sortOrder: dto.sortOrder,
      notes: dto.notes,
    });
  }

  @Delete('work-orders/:workOrderId/tasks/:taskId')
  @RequirePermissions('maintenance.work-order.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete work order task' })
  @ApiNoContentResponse({ description: 'Task deleted' })
  async deleteTask(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    await this.service.deleteTask(taskId, request.tenant!.organizationId);
  }

  // Parts
  @Post('work-orders/:workOrderId/parts')
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Add part line to work order' })
  @ApiCreatedResponse({ description: 'Part added' })
  async addPart(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: AddWorkOrderPartDto,
  ) {
    return this.service.addPart({
      workOrderId,
      organizationId: request.tenant!.organizationId,
      description: dto.description,
      partNumber: dto.partNumber,
      quantity: dto.quantity,
      unitCost: dto.unitCost,
    });
  }

  @Delete('work-orders/:workOrderId/parts/:partId')
  @RequirePermissions('maintenance.work-order.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete part line from work order' })
  @ApiNoContentResponse({ description: 'Part deleted' })
  async deletePart(
    @Req() request: AuthenticatedRequest,
    @Param('partId', ParseUUIDPipe) partId: string,
  ) {
    await this.service.deletePart(partId, request.tenant!.organizationId);
  }

  // Labor
  @Post('work-orders/:workOrderId/labor')
  @RequirePermissions('maintenance.work-order.manage')
  @ApiOperation({ summary: 'Add labor line to work order' })
  @ApiCreatedResponse({ description: 'Labor added' })
  async addLabor(
    @Req() request: AuthenticatedRequest,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: AddWorkOrderLaborDto,
  ) {
    return this.service.addLabor({
      workOrderId,
      organizationId: request.tenant!.organizationId,
      description: dto.description,
      hours: dto.hours,
      hourlyRate: dto.hourlyRate,
    });
  }

  @Delete('work-orders/:workOrderId/labor/:laborId')
  @RequirePermissions('maintenance.work-order.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete labor line from work order' })
  @ApiNoContentResponse({ description: 'Labor deleted' })
  async deleteLabor(
    @Req() request: AuthenticatedRequest,
    @Param('laborId', ParseUUIDPipe) laborId: string,
  ) {
    await this.service.deleteLabor(laborId, request.tenant!.organizationId);
  }
}

// ---------------------------------------------------------------------
// Nested Vehicle Maintenance Controller
// ---------------------------------------------------------------------

@ApiTags('Vehicles')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  description: 'Active tenant organization context',
  required: true,
})
@TenantScoped()
@Controller('vehicles/:vehicleId/maintenance')
export class VehicleMaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  @Get()
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get vehicle maintenance summary & operational availability' })
  @ApiOkResponse({ description: 'Vehicle maintenance summary' })
  async getVehicleMaintenance(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.service.getVehicleMaintenanceSummary(vehicleId, request.tenant!.organizationId);
  }
}

@ApiTags('Vehicles')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  description: 'Active tenant organization context',
  required: true,
})
@TenantScoped()
@Controller('vehicles/:vehicleId/maintenance-schedules')
export class VehicleMaintenanceSchedulesController {
  constructor(private readonly service: MaintenanceService) {}

  @Post()
  @RequirePermissions('maintenance.plan.manage')
  @ApiOperation({ summary: 'Assign maintenance plan to vehicle' })
  @ApiCreatedResponse({ description: 'Schedule created' })
  async createVehicleSchedule(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: { maintenancePlanId: string },
  ) {
    return this.service.createSchedule({
      organizationId: request.tenant!.organizationId,
      vehicleId,
      maintenancePlanId: dto.maintenancePlanId,
      metadata: mutationMetadata(request),
    });
  }

  @Get()
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'List schedules for vehicle' })
  @ApiOkResponse({ description: 'Vehicle schedules' })
  async listVehicleSchedules(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.service.listSchedules(request.tenant!.organizationId, { vehicleId });
  }
}

// ---------------------------------------------------------------------
// Inspection → Maintenance Integration Controller
// ---------------------------------------------------------------------

@ApiTags('Inspections')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  description: 'Active tenant organization context',
  required: true,
})
@TenantScoped()
@Controller('inspections/:inspectionId/maintenance-request')
export class InspectionMaintenanceController {
  constructor(
    @Inject(MaintenanceService)
    private readonly service: MaintenanceService,
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  @Post()
  @RequirePermissions('maintenance.request.create')
  @ApiOperation({ summary: 'Create maintenance request from failed inspection' })
  @ApiCreatedResponse({ description: 'Maintenance request created or existing returned' })
  async createFromInspection(
    @Req() request: AuthenticatedRequest,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: { title?: string; description?: string; priority?: MaintenancePriority },
  ) {
    const existing = await this.service.getRequestByInspection(
      inspectionId,
      request.tenant!.organizationId,
    );
    if (existing) {
      throw new ApplicationError(
        'DUPLICATE_MAINTENANCE_REQUEST',
        'A maintenance request already exists for this inspection',
      );
    }

    const inspection = await this.database.inspection.findFirst({
      where: { id: inspectionId, organizationId: request.tenant!.organizationId },
    });
    if (!inspection) {
      throw new ApplicationError(
        'INSPECTION_NOT_FOUND',
        'Inspection was not found in this organization',
      );
    }

    return this.service.createRequest({
      organizationId: request.tenant!.organizationId,
      vehicleId: inspection.vehicleId,
      sourceType: 'INSPECTION',
      sourceInspectionId: inspectionId,
      title: body.title || `Maintenance request from Inspection ${inspection.displayId}`,
      description: body.description ?? inspection.notes,
      priority: body.priority ?? (inspection.hasCriticalFailure ? 'CRITICAL' : 'NORMAL'),
      blocksOperation: inspection.hasCriticalFailure ? true : false,
      metadata: mutationMetadata(request),
    });
  }

  @Get()
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get maintenance request for inspection' })
  @ApiOkResponse({ description: 'Maintenance request if found' })
  async getForInspection(
    @Req() request: AuthenticatedRequest,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
  ) {
    return this.service.getRequestByInspection(inspectionId, request.tenant!.organizationId);
  }
}
