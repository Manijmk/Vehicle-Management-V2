import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { VehicleService } from '../application/vehicle.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  ActivateVehicleDto,
  CreateVehicleDto,
  RetireVehicleDto,
  UpdateVehicleDto,
} from './vehicle.dto.js';

function mutationMetadata(request: AuthenticatedRequest) {
  const ipAddress = request.ip;
  const userAgent = Array.isArray(request.headers['user-agent'])
    ? request.headers['user-agent'][0]
    : request.headers['user-agent'];

  return {
    actorId: request.principal.userId,
    actorPermissions: [...request.tenant!.permissions],
    requestId:
      request.requestId ??
      (Array.isArray(request.headers['x-request-id'])
        ? request.headers['x-request-id'][0]
        : request.headers['x-request-id']) ??
      'vehicle-request',
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}

@ApiTags('vehicles')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Bearer token is absent, invalid, or inactive' })
@ApiForbiddenResponse({ description: 'Tenant context or required permission is invalid' })
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Selected tenant; verified against active membership',
})
@TenantScoped()
@Controller('vehicles')
export class VehicleController {
  constructor(@Inject(VehicleService) private readonly service: VehicleService) {}

  @Get()
  @RequirePermissions('vehicle.read')
  @ApiOperation({ summary: 'List all vehicles in the selected organization' })
  @ApiOkResponse({ description: 'Organization vehicles' })
  listVehicles(@Req() request: AuthenticatedRequest): Promise<unknown[]> {
    return this.service.listVehicles(request.tenant!.organizationId);
  }

  @Post()
  @RequirePermissions('vehicle.create')
  @ApiCreatedResponse({ description: 'Created vehicle' })
  createVehicle(
    @Body() body: CreateVehicleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.createVehicle({
      organizationId: request.tenant!.organizationId,
      ...body,
      metadata: mutationMetadata(request),
    });
  }

  @Get(':vehicleId')
  @RequirePermissions('vehicle.read')
  @ApiOkResponse({ description: 'Vehicle details' })
  getVehicle(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.getVehicle(request.tenant!.organizationId, vehicleId);
  }

  @Patch(':vehicleId')
  @RequirePermissions('vehicle.update')
  @ApiOkResponse({ description: 'Updated vehicle' })
  updateVehicle(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Body() body: UpdateVehicleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.updateVehicle({
      organizationId: request.tenant!.organizationId,
      vehicleId,
      ...body,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':vehicleId/activate')
  @HttpCode(204)
  @RequirePermissions('vehicle.activate')
  @ApiOkResponse({ description: 'Vehicle activated' })
  async activateVehicle(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Body() body: ActivateVehicleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.service.activateVehicle({
      organizationId: request.tenant!.organizationId,
      vehicleId,
      ...(body?.version !== undefined ? { version: body.version } : {}),
      metadata: mutationMetadata(request),
    });
  }

  @Post(':vehicleId/retire')
  @HttpCode(204)
  @RequirePermissions('vehicle.retire')
  @ApiOkResponse({ description: 'Vehicle retired' })
  async retireVehicle(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Body() body: RetireVehicleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.service.retireVehicle({
      organizationId: request.tenant!.organizationId,
      vehicleId,
      reason: body.reason,
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Get(':vehicleId/status-history')
  @RequirePermissions('vehicle.history.read')
  @ApiOkResponse({ description: 'Vehicle lifecycle history' })
  listStatusHistory(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown[]> {
    return this.service.listStatusHistory(request.tenant!.organizationId, vehicleId);
  }
}
