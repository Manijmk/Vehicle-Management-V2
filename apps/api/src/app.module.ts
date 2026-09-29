import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { HealthController } from './health.controller.js';
import { DatabaseModule } from './infrastructure/database.module.js';
import { FoundationModule } from './modules/foundation/foundation.module.js';
import { AuthenticationGuard } from './modules/identity/transport/authentication.guard.js';
import { PermissionGuard } from './modules/identity/transport/permission.guard.js';
import { TenantContextGuard } from './modules/identity/transport/tenant-context.guard.js';
import { DriverModule } from './modules/driver/driver.module.js';
import { VehicleModule } from './modules/vehicle/vehicle.module.js';

@Module({
  imports: [DatabaseModule, FoundationModule, VehicleModule, DriverModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
