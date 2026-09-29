import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { ApiConfig } from '@vms/config';
import { loadApiConfig } from '@vms/config';
import { createDatabaseClient } from '@vms/database';
import type { PrismaClient } from '@vms/database';

import { API_CONFIG, DATABASE } from '../common/tokens.js';

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = createDatabaseClient({ databaseUrl: config.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    { provide: API_CONFIG, useFactory: () => loadApiConfig() },
    DatabaseLifecycle,
    {
      provide: DATABASE,
      inject: [DatabaseLifecycle],
      useFactory: (db: DatabaseLifecycle) => db.client,
    },
  ],
  exports: [API_CONFIG, DATABASE],
})
export class DatabaseModule {}
