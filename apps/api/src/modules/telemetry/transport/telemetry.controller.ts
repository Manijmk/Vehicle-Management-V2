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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import { BatchIngestDto, HistoryQueryDto, IngestPositionDto } from './telemetry.dto.js';

@ApiTags('telemetry')
@ApiBearerAuth()
@TenantScoped()
@Controller('telemetry')
export class TelemetryController {
  constructor(
    @Inject(TelemetryService)
    private readonly telemetryService: TelemetryService,
  ) {}

  @Post(['positions', 'ingest'])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('telemetry.ingest')
  @ApiOperation({ summary: 'Ingest a single telemetry/GPS position' })
  async ingestPosition(@Req() req: AuthenticatedRequest, @Body() dto: IngestPositionDto) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.ingestPosition(
      {
        organizationId,
        deviceId: dto.deviceId,
        vehicleId: dto.vehicleId,
        capturedAt: dto.capturedAt,
        latitude: dto.latitude,
        longitude: dto.longitude,
        speedKmh: dto.speedKmh ?? null,
        heading: dto.heading ?? null,
        altitudeM: dto.altitudeM ?? null,
        accuracyM: dto.accuracyM ?? null,
        ignition: dto.ignition ?? null,
        odometerKm: dto.odometerKm ?? null,
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        providerMessageId: dto.providerMessageId ?? null,
        rawMetadata: dto.rawMetadata ?? null,
      },
      'human_single',
    );
  }

  @Post(['positions/batch', 'ingest/batch'])
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('telemetry.ingest')
  @ApiOperation({ summary: 'Batch ingest up to 100 telemetry/GPS positions' })
  async ingestBatch(@Req() req: AuthenticatedRequest, @Body() dto: BatchIngestDto) {
    const organizationId = req.tenant!.organizationId;
    return this.telemetryService.ingestBatch(organizationId, dto.positions, 'human_batch');
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
    const historyOptions = {
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    };
    return this.telemetryService.getVehicleHistory(organizationId, vehicleId, historyOptions);
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
