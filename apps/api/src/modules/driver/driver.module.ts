import { Module } from '@nestjs/common';

import { DRIVER_REPOSITORY } from '../../common/tokens.js';
import { DriverService } from './application/driver.service.js';
import { PrismaDriverRepository } from './infrastructure/prisma-driver.repository.js';
import { DriverController } from './transport/driver.controller.js';

@Module({
  controllers: [DriverController],
  providers: [
    DriverService,
    PrismaDriverRepository,
    { provide: DRIVER_REPOSITORY, useExisting: PrismaDriverRepository },
  ],
  exports: [DRIVER_REPOSITORY, DriverService],
})
export class DriverModule {}
