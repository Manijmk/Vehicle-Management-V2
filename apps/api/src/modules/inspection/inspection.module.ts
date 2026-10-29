import { Module } from '@nestjs/common';

import { TRIP_INSPECTION_GATE } from '../trip/application/trip-inspection-gate.port.js';
import { INSPECTION_TEMPLATE_REPOSITORY } from './application/inspection-template.repository.js';
import { InspectionTemplateService } from './application/inspection-template.service.js';
import { INSPECTION_REPOSITORY } from './application/inspection.repository.js';
import { InspectionService } from './application/inspection.service.js';
import { PrismaInspectionTemplateRepository } from './infrastructure/prisma-inspection-template.repository.js';
import { PrismaInspectionRepository } from './infrastructure/prisma-inspection.repository.js';
import { InspectionTemplateController } from './transport/inspection-template.controller.js';
import {
  DriverInspectionController,
  InspectionController,
  TripInspectionController,
  VehicleInspectionController,
} from './transport/inspection.controller.js';

@Module({
  controllers: [
    InspectionTemplateController,
    InspectionController,
    VehicleInspectionController,
    TripInspectionController,
    DriverInspectionController,
  ],
  providers: [
    InspectionTemplateService,
    InspectionService,
    {
      provide: INSPECTION_TEMPLATE_REPOSITORY,
      useClass: PrismaInspectionTemplateRepository,
    },
    {
      provide: INSPECTION_REPOSITORY,
      useClass: PrismaInspectionRepository,
    },
    {
      provide: TRIP_INSPECTION_GATE,
      useClass: PrismaInspectionRepository,
    },
  ],
  exports: [
    InspectionService,
    InspectionTemplateService,
    INSPECTION_REPOSITORY,
    INSPECTION_TEMPLATE_REPOSITORY,
    TRIP_INSPECTION_GATE,
  ],
})
export class InspectionModule {}

