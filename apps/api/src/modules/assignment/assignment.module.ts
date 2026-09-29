import { Module } from '@nestjs/common';

import { ASSIGNMENT_REPOSITORY } from './application/assignment.repository.js';
import { AssignmentService } from './application/assignment.service.js';
import { PrismaAssignmentRepository } from './infrastructure/prisma-assignment.repository.js';
import {
  AssignmentController,
  DriverAssignmentController,
  VehicleAssignmentController,
} from './transport/assignment.controller.js';

@Module({
  controllers: [AssignmentController, VehicleAssignmentController, DriverAssignmentController],
  providers: [
    AssignmentService,
    {
      provide: ASSIGNMENT_REPOSITORY,
      useClass: PrismaAssignmentRepository,
    },
  ],
  exports: [AssignmentService, ASSIGNMENT_REPOSITORY],
})
export class AssignmentModule {}
