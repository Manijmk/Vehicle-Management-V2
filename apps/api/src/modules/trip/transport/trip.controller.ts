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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { TripService } from '../application/trip.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  AbortTripDto,
  CancelTripDto,
  CompleteTripDto,
  CreateTripDto,
  ListTripsQueryDto,
  StartTripDto,
  UpdateTripDto,
} from './trip.dto.js';

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
      'trip-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Trips')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'Missing required tenant permission' })
@TenantScoped()
@Controller('trips')
export class TripController {
  constructor(@Inject(TripService) private readonly service: TripService) {}

  @Post()
  @RequirePermissions('trip.create')
  @ApiOperation({ summary: 'Create a new trip in DRAFT status' })
  @ApiCreatedResponse({ description: 'Trip created successfully' })
  async createTrip(
    @Body() dto: CreateTripDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const plannedStartAt = dto.plannedStartAt ? new Date(dto.plannedStartAt) : null;
    const plannedEndAt = dto.plannedEndAt ? new Date(dto.plannedEndAt) : null;

    return this.service.createTrip({
      organizationId: request.tenant!.organizationId,
      assignmentId: dto.assignmentId,
      origin: dto.origin,
      destination: dto.destination,
      purpose: dto.purpose,
      plannedStartAt,
      plannedEndAt,
      notes: dto.notes,
      metadata: mutationMetadata(request),
    });
  }

  @Get()
  @RequirePermissions('trip.read')
  @ApiOperation({ summary: 'List and filter trips within tenant' })
  @ApiOkResponse({ description: 'Paginated trips list' })
  async listTrips(
    @Query() query: ListTripsQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.listTrips(request.tenant!.organizationId, {
      status: query.status,
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      assignmentId: query.assignmentId,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':tripId')
  @RequirePermissions('trip.read')
  @ApiOperation({ summary: 'Get detailed trip by ID' })
  @ApiOkResponse({ description: 'Trip details' })
  async getTrip(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.getTrip(request.tenant!.organizationId, tripId);
  }

  @Patch(':tripId')
  @RequirePermissions('trip.update')
  @ApiOperation({ summary: 'Update planning details of a DRAFT trip' })
  @ApiOkResponse({ description: 'Trip updated successfully' })
  async updateTrip(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Body() dto: UpdateTripDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const plannedStartAt = dto.plannedStartAt ? new Date(dto.plannedStartAt) : undefined;
    const plannedEndAt = dto.plannedEndAt ? new Date(dto.plannedEndAt) : undefined;

    return this.service.updateTrip({
      organizationId: request.tenant!.organizationId,
      tripId,
      origin: dto.origin,
      destination: dto.destination,
      purpose: dto.purpose,
      plannedStartAt,
      plannedEndAt,
      notes: dto.notes,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':tripId/ready')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trip.ready')
  @ApiOperation({ summary: 'Transition DRAFT trip to READY' })
  @ApiOkResponse({ description: 'Trip marked ready successfully' })
  async markTripReady(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Body('version') version: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.markTripReady({
      organizationId: request.tenant!.organizationId,
      tripId,
      version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':tripId/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trip.start')
  @ApiOperation({ summary: 'Transition READY trip to IN_PROGRESS' })
  @ApiOkResponse({ description: 'Trip started successfully' })
  async startTrip(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Body() dto: StartTripDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.startTrip({
      organizationId: request.tenant!.organizationId,
      tripId,
      startOdometerKm: dto.startOdometerKm,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':tripId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trip.complete')
  @ApiOperation({ summary: 'Complete an IN_PROGRESS trip and record end odometer' })
  @ApiOkResponse({ description: 'Trip completed successfully' })
  async completeTrip(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Body() dto: CompleteTripDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.completeTrip({
      organizationId: request.tenant!.organizationId,
      tripId,
      endOdometerKm: dto.endOdometerKm,
      notes: dto.notes,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':tripId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trip.cancel')
  @ApiOperation({ summary: 'Cancel a DRAFT or READY trip' })
  @ApiOkResponse({ description: 'Trip cancelled successfully' })
  async cancelTrip(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Body() dto: CancelTripDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const cancelReason = dto.cancelReason ?? dto.reason ?? '';
    return this.service.cancelTrip({
      organizationId: request.tenant!.organizationId,
      tripId,
      cancelReason,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':tripId/abort')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trip.abort')
  @ApiOperation({ summary: 'Abort an IN_PROGRESS trip and record end odometer' })
  @ApiOkResponse({ description: 'Trip aborted successfully' })
  async abortTrip(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Body() dto: AbortTripDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const abortReason = dto.abortReason ?? dto.reason ?? '';
    return this.service.abortTrip({
      organizationId: request.tenant!.organizationId,
      tripId,
      endOdometerKm: dto.endOdometerKm,
      abortReason,
      version: dto.version,
      metadata: mutationMetadata(request),
    });
  }

  @Get(':tripId/status-history')
  @RequirePermissions('trip.history.read')
  @ApiOperation({ summary: 'Get ordered lifecycle status history of a trip' })
  @ApiOkResponse({ description: 'Ordered status history entries' })
  async getStatusHistory(
    @Param('tripId', new ParseUUIDPipe({ version: '4' })) tripId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.getStatusHistory(request.tenant!.organizationId, tripId);
  }
}

@ApiTags('Vehicles')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@TenantScoped()
@Controller('vehicles/:vehicleId')
export class VehicleTripController {
  constructor(@Inject(TripService) private readonly service: TripService) {}

  @Get('current-trip')
  @RequirePermissions('trip.read')
  @ApiOperation({ summary: 'Get current in-progress trip for vehicle' })
  @ApiOkResponse({ description: 'Current in-progress trip or null' })
  async getCurrentTrip(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const current = await this.service.getCurrentTripForVehicle(
      request.tenant!.organizationId,
      vehicleId,
    );
    response.status(HttpStatus.OK).json(current ?? null);
  }

  @Get('trips')
  @RequirePermissions('trip.history.read')
  @ApiOperation({ summary: 'Get trip history for vehicle' })
  @ApiOkResponse({ description: 'Paginated trips list for vehicle' })
  async getVehicleTrips(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.service.getTripsForVehicle(
      request.tenant!.organizationId,
      vehicleId,
      parsedLimit,
      parsedOffset,
    );
  }
}

@ApiTags('Drivers')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@TenantScoped()
@Controller('drivers/:driverId')
export class DriverTripController {
  constructor(@Inject(TripService) private readonly service: TripService) {}

  @Get('current-trip')
  @RequirePermissions('trip.read')
  @ApiOperation({ summary: 'Get current in-progress trip for driver' })
  @ApiOkResponse({ description: 'Current in-progress trip or null' })
  async getCurrentTrip(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const current = await this.service.getCurrentTripForDriver(
      request.tenant!.organizationId,
      driverId,
    );
    response.status(HttpStatus.OK).json(current ?? null);
  }

  @Get('trips')
  @RequirePermissions('trip.history.read')
  @ApiOperation({ summary: 'Get trip history for driver' })
  @ApiOkResponse({ description: 'Paginated trips list for driver' })
  async getDriverTrips(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.service.getTripsForDriver(
      request.tenant!.organizationId,
      driverId,
      parsedLimit,
      parsedOffset,
    );
  }
}

@ApiTags('Assignments')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@TenantScoped()
@Controller('assignments/:assignmentId')
export class AssignmentTripController {
  constructor(@Inject(TripService) private readonly service: TripService) {}

  @Get('trips')
  @RequirePermissions('trip.history.read')
  @ApiOperation({ summary: 'Get trip history for assignment' })
  @ApiOkResponse({ description: 'Paginated trips list for assignment' })
  async getAssignmentTrips(
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) assignmentId: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.service.getTripsForAssignment(
      request.tenant!.organizationId,
      assignmentId,
      parsedLimit,
      parsedOffset,
    );
  }
}
