export type IncidentAttachmentType = 'PHOTO' | 'DOCUMENT' | 'OTHER';

export interface IncidentAttachmentEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly incidentId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly fileSizeBytes?: number;
  readonly storageKey: string;
  readonly sha256: string;
  readonly fileHashSha256?: string;
  readonly attachmentType: IncidentAttachmentType;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly createdByName?: string;
  readonly createdByUser?: {
    id?: string;
    displayName?: string | null;
    email?: string | null;
  } | null;
}
