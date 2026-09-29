export type HealthStatus = 'ok';

export interface HealthResponse {
  readonly status: HealthStatus;
  readonly service: 'vehicle-management-api';
  readonly version: string;
  readonly timestamp: string;
}

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ApiErrorResponse {
  readonly error: ApiErrorBody;
  readonly requestId: string;
  readonly timestamp: string;
  readonly path: string;
}
