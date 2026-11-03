import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { DeviceService } from '../application/device.service.js';
import {
  AssignDeviceDto,
  CreateDeviceDto,
  UnassignDeviceDto,
  UpdateDeviceDto,
} from './telemetry.dto.js';

@ApiTags('telemetry-devices')
@ApiBearerAuth()
@TenantScoped()
@Controller('telemetry/devices')
export class DeviceController {
  constructor(
    @Inject(DeviceService)
    private readonly deviceService: DeviceService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Register a new telemetry device' })
  async createDevice(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDeviceDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.createDevice({
      organizationId,
      name: dto.name,
      identifier: dto.identifier,
      notes: dto.notes,
      metadata: dto.metadata,
    });
  }

  @Get()
  @RequirePermissions('telemetry.device.read')
  @ApiOperation({ summary: 'List all telemetry devices in the organization' })
  async listDevices(@Req() req: AuthenticatedRequest) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.listDevices(organizationId);
  }

  @Get(':deviceId')
  @RequirePermissions('telemetry.device.read')
  @ApiOperation({ summary: 'Get details for a single telemetry device' })
  async getDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.getDeviceById(organizationId, deviceId);
  }

  @Patch(':deviceId')
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Update telemetry device metadata or notes' })
  async updateDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.updateDevice({
      organizationId,
      deviceId,
      name: dto.name,
      notes: dto.notes,
      metadata: dto.metadata,
    });
  }

  @Post(':deviceId/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Assign a telemetry device to a vehicle' })
  async assignDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: AssignDeviceDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    const assignedBy = req.principal.userId;
    return this.deviceService.assignDevice({
      organizationId,
      deviceId,
      vehicleId: dto.vehicleId,
      assignedBy,
      notes: dto.notes,
    });
  }

  @Post(':deviceId/unassign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Unassign a telemetry device from its current vehicle' })
  async unassignDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: UnassignDeviceDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.unassignDevice(organizationId, deviceId, dto.notes);
  }

  @Post(':deviceId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Suspend a telemetry device' })
  async suspendDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.suspendDevice(organizationId, deviceId);
  }

  @Post(':deviceId/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Activate a telemetry device' })
  async activateDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.activateDevice(organizationId, deviceId);
  }
}
