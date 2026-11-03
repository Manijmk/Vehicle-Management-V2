import { Module } from '@nestjs/common';
import { DeviceService } from './application/device.service.js';
import { TelemetryService } from './application/telemetry.service.js';
import {
  DEVICE_REPOSITORY,
  TELEMETRY_REPOSITORY,
} from './telemetry.tokens.js';
import { PrismaTelemetryRepository } from './infrastructure/prisma-telemetry.repository.js';
import { DeviceController } from './transport/device.controller.js';
import { TelemetryController } from './transport/telemetry.controller.js';

@Module({
  controllers: [
    DeviceController,
    TelemetryController,
  ],
  providers: [
    TelemetryService,
    DeviceService,
    {
      provide: TELEMETRY_REPOSITORY,
      useClass: PrismaTelemetryRepository,
    },
    {
      provide: DEVICE_REPOSITORY,
      useClass: PrismaTelemetryRepository,
    },
  ],
  exports: [
    TelemetryService,
    DeviceService,
    TELEMETRY_REPOSITORY,
    DEVICE_REPOSITORY,
  ],
})
export class TelemetryModule {}
