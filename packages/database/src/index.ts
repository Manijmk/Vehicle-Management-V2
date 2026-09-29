import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client.js';

export interface DatabaseClientConfig {
  readonly databaseUrl: string;
}

export function createDatabaseClient(config: DatabaseClientConfig): PrismaClient {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });

  return new PrismaClient({ adapter });
}

export type { PrismaClient } from './generated/client.js';
export {
  DriverStatus,
  FuelType,
  MembershipStatus,
  OutboxStatus,
  PrincipalStatus,
  Prisma,
  VehicleStatus,
  VehicleType,
} from './generated/client.js';
