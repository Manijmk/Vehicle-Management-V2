import type {
  InspectionItemSeverity,
  InspectionTemplateProps,
  InspectionTemplateStatus,
  InspectionType,
} from '../domain/inspection-template.js';

export const INSPECTION_TEMPLATE_REPOSITORY = Symbol('INSPECTION_TEMPLATE_REPOSITORY');

export interface InspectionMutationMetadata {
  readonly actorId: string;
  readonly requestId: string;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface CreateTemplateItemInput {
  readonly category: string;
  readonly prompt: string;
  readonly description?: string | null | undefined;
  readonly required?: boolean | undefined;
  readonly severity?: InspectionItemSeverity | undefined;
  readonly sortOrder?: number | undefined;
}

export interface CreateInspectionTemplateInput {
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly type: InspectionType;
  readonly items?: readonly CreateTemplateItemInput[] | undefined;
  readonly metadata: InspectionMutationMetadata;
}

export interface UpdateInspectionTemplateInput {
  readonly organizationId: string;
  readonly templateId: string;
  readonly version: number;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly items?: readonly CreateTemplateItemInput[] | undefined;
  readonly metadata: InspectionMutationMetadata;
}

export interface ActivateInspectionTemplateInput {
  readonly organizationId: string;
  readonly templateId: string;
  readonly version: number;
  readonly metadata: InspectionMutationMetadata;
}

export interface ArchiveInspectionTemplateInput {
  readonly organizationId: string;
  readonly templateId: string;
  readonly version: number;
  readonly metadata: InspectionMutationMetadata;
}

export interface ListInspectionTemplatesFilter {
  readonly type?: InspectionType | undefined;
  readonly status?: InspectionTemplateStatus | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface PaginatedInspectionTemplates {
  readonly items: readonly InspectionTemplateProps[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface InspectionTemplateRepository {
  createTemplate(input: CreateInspectionTemplateInput): Promise<InspectionTemplateProps>;
  getTemplate(organizationId: string, templateId: string): Promise<InspectionTemplateProps>;
  listTemplates(
    organizationId: string,
    filter?: ListInspectionTemplatesFilter,
  ): Promise<PaginatedInspectionTemplates>;
  updateTemplate(input: UpdateInspectionTemplateInput): Promise<InspectionTemplateProps>;
  activateTemplate(input: ActivateInspectionTemplateInput): Promise<InspectionTemplateProps>;
  archiveTemplate(input: ArchiveInspectionTemplateInput): Promise<InspectionTemplateProps>;
}
