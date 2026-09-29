import { Module } from '@nestjs/common';

import { VEHICLE_REPOSITORY } from '../../common/tokens.js';
import { VehicleService } from './application/vehicle.service.js';
import { PrismaVehicleRepository } from './infrastructure/prisma-vehicle.repository.js';
import { VehicleController } from './transport/vehicle.controller.js';

@Module({
  controllers: [VehicleController],
  providers: [
    VehicleService,
    PrismaVehicleRepository,
    { provide: VEHICLE_REPOSITORY, useExisting: PrismaVehicleRepository },
  ],
  exports: [VEHICLE_REPOSITORY],
})
export class VehicleModule {}
