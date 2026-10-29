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
import { AssignmentService } from '../application/assignment.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  CreateAssignmentDto,
  EndAssignmentDto,
  ListAssignmentsQueryDto,
} from './assignment.dto.js';

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
      'assignment-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Assignments')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'Missing required tenant permission' })
@TenantScoped()
@Controller('assignments')
export class AssignmentController {
  constructor(
    @Inject(AssignmentService)
    private readonly service: AssignmentService,
  ) {}

  @Post()
  @RequirePermissions('assignment.create')
  @ApiOperation({ summary: 'Create a new vehicle-driver assignment' })
  @ApiCreatedResponse({ description: 'Created assignment' })
  createAssignment(
    @Body() body: CreateAssignmentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.createAssignment({
      organizationId: request.tenant!.organizationId,
      vehicleId: body.vehicleId,
      driverId: body.driverId,
      ...(body.startedAt ? { startedAt: new Date(body.startedAt) } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
      metadata: mutationMetadata(request),
    });
  }

  @Get()
  @RequirePermissions('assignment.read')
  @ApiOperation({ summary: 'List vehicle-driver assignments with optional filtering' })
  @ApiOkResponse({ description: 'Paginated assignments' })
  listAssignments(
    @Query() query: ListAssignmentsQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.listAssignments(request.tenant!.organizationId, query);
  }

  @Get(':assignmentId')
  @RequirePermissions('assignment.read')
  @ApiOperation({ summary: 'Get assignment details by ID' })
  @ApiOkResponse({ description: 'Assignment details' })
  getAssignment(
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) assignmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.getAssignment(request.tenant!.organizationId, assignmentId);
  }

  @Post(':assignmentId/end')
  @HttpCode(200)
  @RequirePermissions('assignment.end')
  @ApiOperation({ summary: 'End an active vehicle-driver assignment' })
  @ApiOkResponse({ description: 'Ended assignment' })
  endAssignment(
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) assignmentId: string,
    @Body() body: EndAssignmentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.endAssignment({
      organizationId: request.tenant!.organizationId,
      assignmentId,
      endReason: body.endReason ?? body.reason ?? '',
      version: body.version,
      ...(body.endedAt ? { endedAt: new Date(body.endedAt) } : {}),
      metadata: mutationMetadata(request),
    });
  }
}

@ApiTags('Vehicle Contextual Assignments')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'Missing required tenant permission' })
@TenantScoped()
@Controller('vehicles/:vehicleId')
export class VehicleAssignmentController {
  constructor(
    @Inject(AssignmentService)
    private readonly service: AssignmentService,
  ) {}

  @Get('current-assignment')
  @RequirePermissions('assignment.read')
  @ApiOperation({ summary: 'Get current active assignment for a vehicle' })
  @ApiOkResponse({ description: 'Current active assignment or null' })
  async getCurrentAssignment(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const current = await this.service.getCurrentAssignmentForVehicle(
      request.tenant!.organizationId,
      vehicleId,
    );
    response.status(HttpStatus.OK).json(current ?? null);
  }

  @Get('assignments')
  @RequirePermissions('assignment.read')
  @ApiOperation({ summary: 'Get assignment history for a vehicle' })
  @ApiOkResponse({ description: 'Vehicle assignment history' })
  getAssignmentHistory(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown[]> {
    return this.service.getVehicleAssignmentHistory(request.tenant!.organizationId, vehicleId);
  }
}

@ApiTags('Driver Contextual Assignments')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'Missing required tenant permission' })
@TenantScoped()
@Controller('drivers/:driverId')
export class DriverAssignmentController {
  constructor(
    @Inject(AssignmentService)
    private readonly service: AssignmentService,
  ) {}

  @Get('current-assignment')
  @RequirePermissions('assignment.read')
  @ApiOperation({ summary: 'Get current active assignment for a driver' })
  @ApiOkResponse({ description: 'Current active assignment or null' })
  async getCurrentAssignment(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const current = await this.service.getCurrentAssignmentForDriver(
      request.tenant!.organizationId,
      driverId,
    );
    response.status(HttpStatus.OK).json(current ?? null);
  }

  @Get('assignments')
  @RequirePermissions('assignment.read')
  @ApiOperation({ summary: 'Get assignment history for a driver' })
  @ApiOkResponse({ description: 'Driver assignment history' })
  getAssignmentHistory(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown[]> {
    return this.service.getDriverAssignmentHistory(request.tenant!.organizationId, driverId);
  }
}
