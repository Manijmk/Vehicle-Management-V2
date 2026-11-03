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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApplicationError } from '../../foundation/domain/errors.js';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { IncidentService } from '../application/incident.service.js';
import type { IncidentMutationMetadata } from '../application/incident.repository.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import {
  AddIncidentNoteDto,
  CancelIncidentDto,
  CloseIncidentDto,
  CreateIncidentMaintenanceRequestDto,
  ListIncidentsQueryDto,
  ReportIncidentDto,
  ResolveIncidentDto,
  StartInvestigationDto,
  UpdateIncidentDto,
  UploadIncidentAttachmentDto,
} from './incident.dto.js';

interface MulterUploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
}

function mutationMetadata(request: AuthenticatedRequest): IncidentMutationMetadata {
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
        : (request.headers['x-request-id'] ?? 'unknown')),
    ipAddress,
    userAgent,
  };
}

@ApiTags('Incidents')
@ApiBearerAuth()
@TenantScoped()
@Controller('incidents')
export class IncidentController {
  constructor(
    @Inject(IncidentService)
    private readonly service: IncidentService,
  ) {}

  @Post()
  @RequirePermissions('incident.create')
  @ApiOperation({ summary: 'Report a new incident' })
  @ApiCreatedResponse({ description: 'Incident reported successfully' })
  async reportIncident(@Req() request: AuthenticatedRequest, @Body() dto: ReportIncidentDto) {
    return this.service.reportIncident(
      request.tenant!.organizationId,
      {
        type: dto.type,
        severity: dto.severity,
        title: dto.title,
        description: dto.description,
        occurredAt: new Date(dto.occurredAt),
        locationText: dto.locationText,
        operationalImpact: dto.operationalImpact ?? 'NONE',
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        tripId: dto.tripId,
      },
      mutationMetadata(request),
    );
  }

  @Get()
  @RequirePermissions('incident.read')
  @ApiOperation({ summary: 'List and filter incidents' })
  @ApiOkResponse({ description: 'Paginated list of incidents' })
  async listIncidents(@Req() request: AuthenticatedRequest, @Query() query: ListIncidentsQueryDto) {
    return this.service.listIncidents(request.tenant!.organizationId, {
      status: query.status,
      type: query.type,
      severity: query.severity,
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      tripId: query.tripId,
      operationalImpact: query.operationalImpact,
      search: query.search,
      fromOccurredAt: query.fromOccurredAt ? new Date(query.fromOccurredAt) : undefined,
      toOccurredAt: query.toOccurredAt ? new Date(query.toOccurredAt) : undefined,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':incidentId')
  @RequirePermissions('incident.read')
  @ApiOperation({ summary: 'Get incident details by ID' })
  @ApiOkResponse({ description: 'Incident detail record' })
  async getIncident(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
  ) {
    return this.service.getIncident(request.tenant!.organizationId, incidentId);
  }

  @Patch(':incidentId')
  @RequirePermissions('incident.update')
  @ApiOperation({ summary: 'Update incident metadata' })
  @ApiOkResponse({ description: 'Updated incident detail' })
  async updateIncident(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.service.updateIncident(
      request.tenant!.organizationId,
      incidentId,
      {
        version: dto.version,
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        locationText: dto.locationText,
        operationalImpact: dto.operationalImpact,
      },
      mutationMetadata(request),
    );
  }

  @Post(':incidentId/investigate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incident.investigate')
  @ApiOperation({ summary: 'Start formal incident investigation' })
  @ApiOkResponse({ description: 'Incident investigation started' })
  async startInvestigation(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: StartInvestigationDto,
  ) {
    return this.service.startInvestigation(
      request.tenant!.organizationId,
      incidentId,
      dto.version,
      mutationMetadata(request),
    );
  }

  @Post(':incidentId/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incident.resolve')
  @ApiOperation({ summary: 'Resolve an incident with required summary' })
  @ApiOkResponse({ description: 'Incident resolved' })
  async resolveIncident(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveIncidentDto,
  ) {
    return this.service.resolveIncident(
      request.tenant!.organizationId,
      incidentId,
      dto.version,
      dto.resolutionSummary ?? '',
      mutationMetadata(request),
    );
  }

  @Post(':incidentId/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incident.close')
  @ApiOperation({ summary: 'Administratively close a resolved incident' })
  @ApiOkResponse({ description: 'Incident closed' })
  async closeIncident(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CloseIncidentDto,
  ) {
    return this.service.closeIncident(
      request.tenant!.organizationId,
      incidentId,
      dto.version,
      mutationMetadata(request),
    );
  }

  @Post(':incidentId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incident.cancel')
  @ApiOperation({ summary: 'Cancel an invalid or duplicate incident report' })
  @ApiOkResponse({ description: 'Incident cancelled' })
  async cancelIncident(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CancelIncidentDto,
  ) {
    const reason = dto.cancellationReason ?? dto.cancelReason;
    return this.service.cancelIncident(
      request.tenant!.organizationId,
      incidentId,
      dto.version,
      reason ?? '',
      mutationMetadata(request),
    );
  }

  @Get(':incidentId/notes')
  @RequirePermissions('incident.read')
  @ApiOperation({ summary: 'List chronological notes for incident' })
  @ApiOkResponse({ description: 'List of investigation notes' })
  async listNotes(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
  ) {
    return this.service.listNotes(request.tenant!.organizationId, incidentId);
  }

  @Post(':incidentId/notes')
  @RequirePermissions('incident.note.create')
  @ApiOperation({ summary: 'Append an immutable investigation note' })
  @ApiCreatedResponse({ description: 'Note added' })
  async addNote(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: AddIncidentNoteDto,
  ) {
    return this.service.addNote(
      request.tenant!.organizationId,
      incidentId,
      dto.body,
      mutationMetadata(request),
    );
  }

  @Get(':incidentId/attachments')
  @RequirePermissions('incident.read')
  @ApiOperation({ summary: 'List evidence attachments for incident' })
  @ApiOkResponse({ description: 'List of attachment records' })
  async listAttachments(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
  ) {
    return this.service.listAttachments(request.tenant!.organizationId, incidentId);
  }

  @Post(':incidentId/attachments')
  @RequirePermissions('incident.attachment.upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an evidence attachment (photo or document)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        attachmentType: { type: 'string', enum: ['PHOTO', 'DOCUMENT', 'OTHER'] },
        description: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Attachment uploaded successfully' })
  async uploadAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: UploadIncidentAttachmentDto,
    @UploadedFile() file?: MulterUploadedFile,
  ) {
    if (!file || !file.buffer) {
      throw new ApplicationError('FILE_EMPTY', 'An evidence file (PDF, PNG, or JPEG) is required.');
    }

    const description = dto.description ?? dto.caption;
    return this.service.uploadAttachment(
      request.tenant!.organizationId,
      incidentId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        ...(file.mimetype ? { mimetype: file.mimetype } : {}),
      },
      dto.attachmentType,
      description,
      mutationMetadata(request),
    );
  }

  @Get(':incidentId/attachments/:attachmentId/download-url')
  @RequirePermissions('incident.attachment.download')
  @ApiOperation({ summary: 'Get signed download URL for an evidence attachment' })
  @ApiOkResponse({ description: 'Presigned download URL and metadata' })
  async getAttachmentDownload(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.service.getAttachmentDownloadUrl(
      request.tenant!.organizationId,
      incidentId,
      attachmentId,
    );
  }

  @Post(':incidentId/maintenance-request')
  @RequirePermissions('incident.update', 'maintenance.request.create')
  @ApiOperation({ summary: 'Create an idempotent maintenance request from incident' })
  @ApiCreatedResponse({ description: 'Maintenance request created or retrieved idempotently' })
  async createMaintenanceRequest(
    @Req() request: AuthenticatedRequest,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateIncidentMaintenanceRequestDto,
  ) {
    return this.service.createMaintenanceRequest(
      request.tenant!.organizationId,
      incidentId,
      {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.blocksOperation !== undefined ? { blocksOperation: dto.blocksOperation } : {}),
      },
      mutationMetadata(request),
    );
  }
}

@ApiTags('Incidents')
@ApiBearerAuth()
@TenantScoped()
@Controller('vehicles/:vehicleId/incidents')
export class VehicleIncidentsController {
  constructor(
    @Inject(IncidentService)
    private readonly service: IncidentService,
  ) {}

  @Get()
  @RequirePermissions('incident.read')
  @ApiOperation({ summary: 'Get incident history for a vehicle' })
  @ApiOkResponse({ description: 'Paginated incident history for vehicle' })
  async getVehicleIncidents(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.getVehicleIncidents(
      request.tenant!.organizationId,
      vehicleId,
      limit,
      offset,
    );
  }
}

@ApiTags('Incidents')
@ApiBearerAuth()
@TenantScoped()
@Controller('drivers/:driverId/incidents')
export class DriverIncidentsController {
  constructor(
    @Inject(IncidentService)
    private readonly service: IncidentService,
  ) {}

  @Get()
  @RequirePermissions('incident.read')
  @ApiOperation({ summary: 'Get incident history for a driver' })
  @ApiOkResponse({ description: 'Paginated incident history for driver' })
  async getDriverIncidents(
    @Req() request: AuthenticatedRequest,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.getDriverIncidents(request.tenant!.organizationId, driverId, limit, offset);
  }
}

@ApiTags('Incidents')
@ApiBearerAuth()
@TenantScoped()
@Controller('trips/:tripId/incidents')
export class TripIncidentsController {
  constructor(
    @Inject(IncidentService)
    private readonly service: IncidentService,
  ) {}

  @Get()
  @RequirePermissions('incident.read')
  @ApiOperation({ summary: 'Get incident history for a trip' })
  @ApiOkResponse({ description: 'Paginated incident history for trip' })
  async getTripIncidents(
    @Req() request: AuthenticatedRequest,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.getTripIncidents(request.tenant!.organizationId, tripId, limit, offset);
  }
}
