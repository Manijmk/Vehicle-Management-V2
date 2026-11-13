import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TelemetrySource } from '@vms/database';
import { ApplicationError } from '../../foundation/domain/errors.js';
import { Public } from '../../identity/transport/security.decorators.js';
import { DeviceService } from '../application/device.service.js';
import { TelemetryService } from '../application/telemetry.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import { DeviceBatchIngestDto, DeviceIngestPositionDto } from './telemetry.dto.js';

function extractDeviceToken(req: Request): string {
  const deviceKey = req.header('x-device-key');
  if (deviceKey && deviceKey.trim()) {
    return deviceKey.trim();
  }

  const auth = req.header('authorization');
  if (auth) {
    if (auth.startsWith('DeviceBearer ')) {
      return auth.slice(13).trim();
    }
    if (auth.startsWith('Bearer dev_')) {
      return auth.slice(7).trim();
    }
  }

  throw new ApplicationError(
    'UNAUTHENTICATED',
    'Device credential is required via x-device-key header or Authorization: DeviceBearer <token>',
  );
}

@ApiTags('telemetry-device-ingest')
@Public()
@Controller('telemetry/device')
export class DeviceIngestController {
  constructor(
    @Inject(DeviceService)
    private readonly deviceService: DeviceService,
    @Inject(TelemetryService)
    private readonly telemetryService: TelemetryService,
  ) {}

  @Post(['positions', 'ingest'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Machine authentication ingestion endpoint for GPS tracking devices' })
  async ingestPosition(@Req() req: Request, @Body() dto: DeviceIngestPositionDto) {
    const token = extractDeviceToken(req);
    const clientOrgId = req.header('x-organization-id');

    // Derives organizationId, deviceId, and vehicleId from credential & active assignment
    const { organizationId, deviceId } = await this.deviceService.authenticateDeviceToken(
      token,
      clientOrgId,
    );

    return this.telemetryService.ingestPosition(
      {
        organizationId,
        deviceId,
        capturedAt: dto.capturedAt,
        latitude: dto.latitude,
        longitude: dto.longitude,
        speedKmh: dto.speedKmh ?? null,
        heading: dto.heading ?? null,
        altitudeM: dto.altitudeM ?? null,
        accuracyM: dto.accuracyM ?? null,
        ignition: dto.ignition ?? null,
        odometerKm: dto.odometerKm ?? null,
        source: TelemetrySource.DEVICE,
        providerMessageId: dto.providerMessageId ?? null,
        rawMetadata: dto.rawMetadata ?? null,
      },
      'device_single',
    );
  }

  @Post(['positions/batch', 'ingest/batch'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Machine authentication batch ingestion endpoint for GPS tracking devices',
  })
  async ingestBatch(@Req() req: Request, @Body() dto: DeviceBatchIngestDto) {
    const token = extractDeviceToken(req);
    const clientOrgId = req.header('x-organization-id');

    const { organizationId, deviceId } = await this.deviceService.authenticateDeviceToken(
      token,
      clientOrgId,
    );

    const positions = dto.positions.map((p) => ({
      deviceId,
      capturedAt: p.capturedAt,
      latitude: p.latitude,
      longitude: p.longitude,
      speedKmh: p.speedKmh ?? null,
      heading: p.heading ?? null,
      altitudeM: p.altitudeM ?? null,
      accuracyM: p.accuracyM ?? null,
      ignition: p.ignition ?? null,
      odometerKm: p.odometerKm ?? null,
      source: TelemetrySource.DEVICE,
      providerMessageId: p.providerMessageId ?? null,
      rawMetadata: p.rawMetadata ?? null,
    }));

    return this.telemetryService.ingestBatch(organizationId, positions, 'device_batch');
  }
}
