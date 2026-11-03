import { Module } from '@nestjs/common';

import { ComplianceModule } from '../compliance/compliance.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { OPERATIONAL_INCIDENT_GATE } from '../trip/application/operational-incident-gate.port.js';
import { IncidentService } from './application/incident.service.js';
import { INCIDENT_REPOSITORY, INCIDENT_SERVICE } from './incident.tokens.js';
import { PrismaIncidentRepository } from './infrastructure/prisma-incident.repository.js';
import {
  DriverIncidentsController,
  IncidentController,
  TripIncidentsController,
  VehicleIncidentsController,
} from './transport/incident.controller.js';

@Module({
  imports: [MaintenanceModule, ComplianceModule],
  controllers: [
    IncidentController,
    VehicleIncidentsController,
    DriverIncidentsController,
    TripIncidentsController,
  ],
  providers: [
    IncidentService,
    {
      provide: INCIDENT_SERVICE,
      useExisting: IncidentService,
    },
    {
      provide: INCIDENT_REPOSITORY,
      useClass: PrismaIncidentRepository,
    },
    {
      provide: OPERATIONAL_INCIDENT_GATE,
      useExisting: IncidentService,
    },
  ],
  exports: [IncidentService, INCIDENT_SERVICE, INCIDENT_REPOSITORY, OPERATIONAL_INCIDENT_GATE],
})
export class IncidentModule {}
