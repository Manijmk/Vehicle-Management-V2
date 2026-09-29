import { Inject, Injectable } from '@nestjs/common';

import { VEHICLE_REPOSITORY } from '../../../common/tokens.js';
import type { VehicleRepository } from './vehicle.repository.js';

@Injectable()
export class VehicleService {
  constructor(@Inject(VEHICLE_REPOSITORY) private readonly repository: VehicleRepository) {}

  listVehicles(organizationId: string): Promise<unknown[]> {
    return this.repository.listVehicles(organizationId);
  }

  getVehicle(organizationId: string, vehicleId: string): Promise<unknown> {
    return this.repository.getVehicle(organizationId, vehicleId);
  }

  createVehicle(input: Parameters<VehicleRepository['createVehicle']>[0]): Promise<unknown> {
    return this.repository.createVehicle(input);
  }

  updateVehicle(input: Parameters<VehicleRepository['updateVehicle']>[0]): Promise<unknown> {
    return this.repository.updateVehicle(input);
  }

  activateVehicle(input: Parameters<VehicleRepository['activateVehicle']>[0]): Promise<unknown> {
    return this.repository.activateVehicle(input);
  }

  retireVehicle(input: Parameters<VehicleRepository['retireVehicle']>[0]): Promise<unknown> {
    return this.repository.retireVehicle(input);
  }

  listStatusHistory(organizationId: string, vehicleId: string): Promise<unknown[]> {
    return this.repository.listStatusHistory(organizationId, vehicleId);
  }
}
