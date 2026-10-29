import { Module } from '@nestjs/common';

import { TRIP_REPOSITORY } from './application/trip.repository.js';
import { TripService } from './application/trip.service.js';
import { PrismaTripRepository } from './infrastructure/prisma-trip.repository.js';
import {
  AssignmentTripController,
  DriverTripController,
  TripController,
  VehicleTripController,
} from './transport/trip.controller.js';

@Module({
  controllers: [
    TripController,
    VehicleTripController,
    DriverTripController,
    AssignmentTripController,
  ],
  providers: [
    TripService,
    {
      provide: TRIP_REPOSITORY,
      useClass: PrismaTripRepository,
    },
  ],
  exports: [TripService, TRIP_REPOSITORY],
})
export class TripModule {}
