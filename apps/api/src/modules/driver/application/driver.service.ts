import { Inject, Injectable } from '@nestjs/common';

import { DRIVER_REPOSITORY } from '../../../common/tokens.js';
import type {
  DriverLicenseRecord,
  DriverRecord,
  DriverRepository,
  DriverStatusHistoryEntry,
  ListDriversFilter,
  PaginatedResult,
} from './driver.repository.js';

@Injectable()
export class DriverService {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly repository: DriverRepository) {}

  listDrivers(
    organizationId: string,
    filter?: ListDriversFilter,
  ): Promise<PaginatedResult<DriverRecord>> {
    return this.repository.listDrivers(organizationId, filter);
  }

  getDriver(organizationId: string, driverId: string): Promise<DriverRecord> {
    return this.repository.getDriver(organizationId, driverId);
  }

  createDriver(input: Parameters<DriverRepository['createDriver']>[0]): Promise<DriverRecord> {
    return this.repository.createDriver(input);
  }

  updateDriver(input: Parameters<DriverRepository['updateDriver']>[0]): Promise<DriverRecord> {
    return this.repository.updateDriver(input);
  }

  activateDriver(input: Parameters<DriverRepository['activateDriver']>[0]): Promise<DriverRecord> {
    return this.repository.activateDriver(input);
  }

  suspendDriver(input: Parameters<DriverRepository['suspendDriver']>[0]): Promise<DriverRecord> {
    return this.repository.suspendDriver(input);
  }

  deactivateDriver(
    input: Parameters<DriverRepository['deactivateDriver']>[0],
  ): Promise<DriverRecord> {
    return this.repository.deactivateDriver(input);
  }

  listStatusHistory(organizationId: string, driverId: string): Promise<DriverStatusHistoryEntry[]> {
    return this.repository.listStatusHistory(organizationId, driverId);
  }

  listLicenses(organizationId: string, driverId: string): Promise<DriverLicenseRecord[]> {
    return this.repository.listLicenses(organizationId, driverId);
  }

  addLicense(input: Parameters<DriverRepository['addLicense']>[0]): Promise<DriverLicenseRecord> {
    return this.repository.addLicense(input);
  }

  updateLicense(
    input: Parameters<DriverRepository['updateLicense']>[0],
  ): Promise<DriverLicenseRecord> {
    return this.repository.updateLicense(input);
  }

  removeLicense(input: Parameters<DriverRepository['removeLicense']>[0]): Promise<void> {
    return this.repository.removeLicense(input);
  }
}
