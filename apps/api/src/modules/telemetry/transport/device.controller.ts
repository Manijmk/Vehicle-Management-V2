import {
  Body,
  Controller,
  Delete,
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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
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
  async createDevice(@Req() req: AuthenticatedRequest, @Body() dto: CreateDeviceDto) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.createDevice({
      organizationId,
      name: dto.name,
      identifier: dto.identifier,
      notes: dto.notes ?? null,
      metadata: dto.metadata ?? null,
      actorId: req.principal.userId,
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
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata ?? null } : {}),
      actorId: req.principal.userId,
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
      notes: dto.notes ?? null,
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
    return this.deviceService.unassignDevice(
      organizationId,
      deviceId,
      dto.notes,
      req.principal.userId,
    );
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
    return this.deviceService.suspendDevice(organizationId, deviceId, req.principal.userId);
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
    return this.deviceService.activateDevice(organizationId, deviceId, req.principal.userId);
  }

  @Post(':deviceId/reassign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({
    summary: 'Reassign a telemetry device to another vehicle, ending prior active assignment',
  })
  async reassignDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: AssignDeviceDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    const assignedBy = req.principal.userId;
    return this.deviceService.reassignDevice({
      organizationId,
      deviceId,
      vehicleId: dto.vehicleId,
      assignedBy,
      notes: dto.notes ?? null,
    });
  }

  @Post(':deviceId/credentials')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Provision or rotate machine credential for a telemetry device' })
  async createCredential(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    const actorId = req.principal.userId;
    return this.deviceService.createCredential(organizationId, deviceId, actorId);
  }

  @Get(':deviceId/credentials')
  @RequirePermissions('telemetry.device.read')
  @ApiOperation({
    summary: 'List machine credentials for a telemetry device (secret hash not exposed)',
  })
  async listCredentials(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.deviceService.listCredentials(organizationId, deviceId);
  }

  @Delete(':deviceId/credentials/:credentialId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.device.manage')
  @ApiOperation({ summary: 'Revoke a telemetry device machine credential' })
  async revokeCredential(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    const revokedBy = req.principal.userId;
    return this.deviceService.revokeCredential(organizationId, deviceId, credentialId, revokedBy);
  }
}
