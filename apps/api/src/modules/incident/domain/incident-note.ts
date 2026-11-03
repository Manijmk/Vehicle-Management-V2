export interface IncidentNoteEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly incidentId: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly createdById?: string;
  readonly createdByName?: string;
  readonly createdByUser?: {
    id?: string;
    displayName?: string | null;
    email?: string | null;
  } | null;
}
