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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { TelemetryService } from '../application/telemetry.service.js';
import {
  BatchIngestDto,
  HistoryQueryDto,
  IngestPositionDto,
} from './telemetry.dto.js';

@ApiTags('telemetry')
@ApiBearerAuth()
@TenantScoped()
@Controller('telemetry')
export class TelemetryController {
  constructor(
    @Inject(TelemetryService)
    private readonly telemetryService: TelemetryService,
  ) {}

  @Post('ingest')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('telemetry.ingest')
  @ApiOperation({ summary: 'Ingest a single telemetry/GPS position' })
  async ingestPosition(
    @Req() req: AuthenticatedRequest,
    @Body() dto: IngestPositionDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.ingestPosition({
      organizationId,
      deviceId: dto.deviceId,
      capturedAt: dto.capturedAt,
      latitude: dto.latitude,
      longitude: dto.longitude,
      speedKmh: dto.speedKmh,
      heading: dto.heading,
      altitudeM: dto.altitudeM,
      accuracyM: dto.accuracyM,
      ignition: dto.ignition,
      odometerKm: dto.odometerKm,
      source: dto.source,
      providerMessageId: dto.providerMessageId,
      rawMetadata: dto.rawMetadata,
    });
  }

  @Post('ingest/batch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.ingest')
  @ApiOperation({ summary: 'Batch ingest up to 100 telemetry/GPS positions' })
  async ingestBatch(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BatchIngestDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.ingestBatch(organizationId, dto.positions);
  }

  @Get('current')
  @RequirePermissions('telemetry.read')
  @ApiOperation({ summary: 'Get current positions of all fleet vehicles in organization' })
  async getCurrentFleetPositions(@Req() req: AuthenticatedRequest) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.getCurrentFleetPositions(organizationId);
  }

  @Get('vehicles/:vehicleId/current')
  @RequirePermissions('telemetry.read')
  @ApiOperation({ summary: 'Get current position of a specific vehicle' })
  async getCurrentVehiclePosition(
    @Req() req: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.getCurrentVehiclePosition(organizationId, vehicleId);
  }

  @Get('vehicles/:vehicleId/history')
  @RequirePermissions('telemetry.read')
  @ApiOperation({ summary: 'Get historical telemetry positions for a vehicle' })
  async getVehicleHistory(
    @Req() req: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: HistoryQueryDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.getVehicleHistory(organizationId, vehicleId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get('trips/:tripId/route')
  @RequirePermissions('telemetry.read')
  @ApiOperation({ summary: 'Get route positions recorded during a trip in chronological order' })
  async getTripRoute(
    @Req() req: AuthenticatedRequest,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.getTripRoute(organizationId, tripId);
  }
}
