import type { IncidentStatus } from './incident.js';

export interface IncidentStatusHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly incidentId: string;
  readonly fromStatus: IncidentStatus | null;
  readonly toStatus: IncidentStatus;
  readonly reason: string | null;
  readonly actorId: string;
  readonly actorName?: string;
  readonly requestId: string | null;
  readonly createdAt: Date;
}
