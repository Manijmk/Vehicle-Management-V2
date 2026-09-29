import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@vms/database';

import { WORKER_DATABASE } from './tokens.js';

@Injectable()
export class DatabaseShutdownService implements OnApplicationShutdown {
  constructor(@Inject(WORKER_DATABASE) private readonly database: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
  }
}
