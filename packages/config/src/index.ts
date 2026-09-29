import { parseCommaSeparated } from '@vms/validation';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const runtimeSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  OTEL_ENABLED: booleanString,
  OTEL_SERVICE_NAME: z.string().trim().min(1).default('vehicle-management'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default('http://localhost:4318'),
});

const infrastructureSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  REDIS_URL: z.string().startsWith('redis://'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().trim().min(1),
  S3_BUCKET: z.string().trim().min(3),
  S3_ACCESS_KEY: z.string().trim().min(1),
  S3_SECRET_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: booleanString,
});

const apiSchema = runtimeSchema.and(infrastructureSchema).and(
  z.object({
    API_PORT: z.coerce.number().int().positive().max(65_535).default(3001),
    API_CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform(parseCommaSeparated)
      .pipe(z.array(z.url()).min(1)),
    AUTH_PROVIDER: z.literal('local').default('local'),
    AUTH_ISSUER: z.string().trim().min(1).default('vehicle-management-local'),
    AUTH_AUDIENCE: z.string().trim().min(1).default('vehicle-management-api'),
    AUTH_LOCAL_SIGNING_KEY: z.string().min(32),
  }),
);

const workerSchema = runtimeSchema.and(infrastructureSchema).and(
  z.object({
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(20),
    OUTBOX_LOCK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  }),
);

export type ApiConfig = z.infer<typeof apiSchema>;
export type WorkerConfig = z.infer<typeof workerSchema>;

export class EnvironmentValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment configuration: ${issues.join('; ')}`);
    this.name = 'EnvironmentValidationError';
  }
}

function parseEnvironment<T>(schema: z.ZodType<T>, environment: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(environment);

  if (result.success) {
    return result.data;
  }

  throw new EnvironmentValidationError(
    result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
    ),
  );
}

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return parseEnvironment(apiSchema, environment);
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return parseEnvironment(workerSchema, environment);
}
