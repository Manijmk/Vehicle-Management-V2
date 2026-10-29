import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
import { InspectionService } from '../application/inspection.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import { VersionedActionDto } from './inspection-template.dto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  CancelInspectionDto,
  CreateInspectionDto,
  ListInspectionsQueryDto,
  SaveInspectionResponsesDto,
} from './inspection.dto.js';

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
      'inspection-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Inspections')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization UUID',
})
@ApiUnauthorizedResponse({ description: 'Authentication credentials are missing or invalid' })
@ApiForbiddenResponse({
  description: 'Caller lacks the required organization membership or permission',
})
@TenantScoped()
@Controller('inspections')
export class InspectionController {
  constructor(
    @Inject(InspectionService)
    private readonly service: InspectionService,
  ) {}

  @Post()
  @RequirePermissions('inspection.create')
  @ApiOperation({ summary: 'Create a new DRAFT inspection' })
  @ApiCreatedResponse({ description: 'Inspection created successfully' })
  async createInspection(@Req() request: AuthenticatedRequest, @Body() body: CreateInspectionDto) {
    return this.service.createInspection({
      organizationId: request.tenant!.organizationId,
      templateId: body.templateId,
      type: body.type,
      vehicleId: body.vehicleId,
      tripId: body.tripId,
      notes: body.notes,
      metadata: mutationMetadata(request),
    });
  }

  @Get()
  @RequirePermissions('inspection.read')
  @ApiOperation({ summary: 'List inspections with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of inspections' })
  async listInspections(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListInspectionsQueryDto,
  ) {
    return this.service.listInspections(request.tenant!.organizationId, query);
  }

  @Get(':inspectionId')
  @RequirePermissions('inspection.read')
  @ApiOperation({ summary: 'Get inspection details by ID' })
  @ApiOkResponse({ description: 'Inspection details' })
  async getInspection(
    @Req() request: AuthenticatedRequest,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
  ) {
    return this.service.getInspection(request.tenant!.organizationId, inspectionId);
  }

  @Post(':inspectionId/start')
  @RequirePermissions('inspection.perform')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a DRAFT inspection (transition to IN_PROGRESS)' })
  @ApiOkResponse({ description: 'Inspection started' })
  async startInspection(
    @Req() request: AuthenticatedRequest,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: VersionedActionDto,
  ) {
    return this.service.startInspection({
      organizationId: request.tenant!.organizationId,
      inspectionId,
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Put(':inspectionId/responses')
  @RequirePermissions('inspection.perform')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save inspection checklist responses' })
  @ApiOkResponse({ description: 'Responses saved successfully' })
  async saveResponses(
    @Req() request: AuthenticatedRequest,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: SaveInspectionResponsesDto,
  ) {
    return this.service.saveResponses({
      organizationId: request.tenant!.organizationId,
      inspectionId,
      version: body.version,
      responses: body.responses,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':inspectionId/complete')
  @RequirePermissions('inspection.complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an inspection and derive overall PASS/FAIL result' })
  @ApiOkResponse({ description: 'Inspection completed' })
  async completeInspection(
    @Req() request: AuthenticatedRequest,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: VersionedActionDto,
  ) {
    return this.service.completeInspection({
      organizationId: request.tenant!.organizationId,
      inspectionId,
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':inspectionId/cancel')
  @RequirePermissions('inspection.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an inspection with mandatory reason' })
  @ApiOkResponse({ description: 'Inspection cancelled' })
  async cancelInspection(
    @Req() request: AuthenticatedRequest,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: CancelInspectionDto,
  ) {
    return this.service.cancelInspection({
      organizationId: request.tenant!.organizationId,
      inspectionId,
      version: body.version,
      cancelReason: body.cancelReason,
      metadata: mutationMetadata(request),
    });
  }
}

@ApiTags('Vehicle Inspections')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization UUID',
})
@TenantScoped()
@Controller('vehicles/:vehicleId/inspections')
export class VehicleInspectionController {
  constructor(
    @Inject(InspectionService)
    private readonly service: InspectionService,
  ) {}

  @Get()
  @RequirePermissions('inspection.history.read')
  @ApiOperation({ summary: 'Get vehicle inspection history' })
  @ApiOkResponse({ description: 'Paginated list of vehicle inspections' })
  async getVehicleInspections(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.getInspectionsForVehicle(
      request.tenant!.organizationId,
      vehicleId,
      limit,
      offset,
    );
  }
}

@ApiTags('Trip Inspections')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization UUID',
})
@TenantScoped()
@Controller('trips/:tripId/inspections')
export class TripInspectionController {
  constructor(
    @Inject(InspectionService)
    private readonly service: InspectionService,
  ) {}

  @Get()
  @RequirePermissions('inspection.history.read')
  @ApiOperation({ summary: 'Get trip inspections' })
  @ApiOkResponse({ description: 'Paginated list of trip inspections' })
  async getTripInspections(
    @Req() request: AuthenticatedRequest,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.getInspectionsForTrip(
      request.tenant!.organizationId,
      tripId,
      limit,
      offset,
    );
  }
}

@ApiTags('Driver Inspections')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization UUID',
})
@TenantScoped()
@Controller('drivers/:driverId/inspections')
export class DriverInspectionController {
  constructor(
    @Inject(InspectionService)
    private readonly service: InspectionService,
  ) {}

  @Get()
  @RequirePermissions('inspection.history.read')
  @ApiOperation({ summary: 'Get driver inspection history' })
  @ApiOkResponse({ description: 'Paginated list of driver inspections' })
  async getDriverInspections(
    @Req() request: AuthenticatedRequest,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.getInspectionsForDriver(
      request.tenant!.organizationId,
      driverId,
      limit,
      offset,
    );
  }
}
