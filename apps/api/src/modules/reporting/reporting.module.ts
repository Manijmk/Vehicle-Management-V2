import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database.module.js';
import { ReportingMetricsService } from './application/reporting-metrics.service.js';
import { REPORTING_REPOSITORY } from './application/reporting.port.js';
import { ReportingService } from './application/reporting.service.js';
import { PrismaReportingRepository } from './infrastructure/prisma-reporting.repository.js';
import { ReportingController } from './transport/reporting.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ReportingController],
  providers: [
    ReportingMetricsService,
    ReportingService,
    {
      provide: REPORTING_REPOSITORY,
      useClass: PrismaReportingRepository,
    },
  ],
  exports: [ReportingService, ReportingMetricsService],
})
export class ReportingModule {}
