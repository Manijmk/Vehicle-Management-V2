import { Module } from '@nestjs/common';

import { VEHICLE_MAINTENANCE_GATE } from '../trip/application/vehicle-maintenance-gate.port.js';
import { MAINTENANCE_REPOSITORY } from './application/maintenance.repository.js';
import { MaintenanceService } from './application/maintenance.service.js';
import { PrismaMaintenanceRepository } from './infrastructure/prisma-maintenance.repository.js';
import {
  InspectionMaintenanceController,
  MaintenanceController,
  VehicleMaintenanceController,
  VehicleMaintenanceSchedulesController,
} from './transport/maintenance.controller.js';

@Module({
  controllers: [
    MaintenanceController,
    VehicleMaintenanceController,
    VehicleMaintenanceSchedulesController,
    InspectionMaintenanceController,
  ],
  providers: [
    MaintenanceService,
    {
      provide: MAINTENANCE_REPOSITORY,
      useClass: PrismaMaintenanceRepository,
    },
    {
      provide: VEHICLE_MAINTENANCE_GATE,
      useExisting: MaintenanceService,
    },
  ],
  exports: [MaintenanceService, MAINTENANCE_REPOSITORY, VEHICLE_MAINTENANCE_GATE],
})
export class MaintenanceModule {}
