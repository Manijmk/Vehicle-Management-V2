import { Module } from '@nestjs/common';

import { OPERATIONAL_COMPLIANCE_GATE } from '../trip/application/operational-compliance-gate.port.js';
import { ComplianceService } from './application/compliance.service.js';
import { COMPLIANCE_REPOSITORY, OBJECT_STORAGE_PORT } from './compliance.tokens.js';
import { PrismaComplianceRepository } from './infrastructure/prisma-compliance.repository.js';
import { S3ObjectStorageAdapter } from './infrastructure/s3-object-storage.adapter.js';
import { ComplianceController } from './transport/compliance.controller.js';
import { DriverComplianceController } from './transport/driver-compliance.controller.js';
import { VehicleComplianceController } from './transport/vehicle-compliance.controller.js';

@Module({
  controllers: [ComplianceController, VehicleComplianceController, DriverComplianceController],
  providers: [
    ComplianceService,
    {
      provide: COMPLIANCE_REPOSITORY,
      useClass: PrismaComplianceRepository,
    },
    {
      provide: OBJECT_STORAGE_PORT,
      useClass: S3ObjectStorageAdapter,
    },
    {
      provide: OPERATIONAL_COMPLIANCE_GATE,
      useExisting: ComplianceService,
    },
  ],
  exports: [
    ComplianceService,
    COMPLIANCE_REPOSITORY,
    OBJECT_STORAGE_PORT,
    OPERATIONAL_COMPLIANCE_GATE,
  ],
})
export class ComplianceModule {}
