import { Inject, Injectable } from '@nestjs/common';

import type { InspectionTemplateProps } from '../domain/inspection-template.js';
import {
  INSPECTION_TEMPLATE_REPOSITORY,
  type ActivateInspectionTemplateInput,
  type ArchiveInspectionTemplateInput,
  type CreateInspectionTemplateInput,
  type InspectionTemplateRepository,
  type ListInspectionTemplatesFilter,
  type PaginatedInspectionTemplates,
  type UpdateInspectionTemplateInput,
} from './inspection-template.repository.js';

@Injectable()
export class InspectionTemplateService {
  constructor(
    @Inject(INSPECTION_TEMPLATE_REPOSITORY)
    private readonly repository: InspectionTemplateRepository,
  ) {}

  async createTemplate(input: CreateInspectionTemplateInput): Promise<InspectionTemplateProps> {
    return this.repository.createTemplate(input);
  }

  async getTemplate(organizationId: string, templateId: string): Promise<InspectionTemplateProps> {
    return this.repository.getTemplate(organizationId, templateId);
  }

  async listTemplates(
    organizationId: string,
    filter?: ListInspectionTemplatesFilter,
  ): Promise<PaginatedInspectionTemplates> {
    return this.repository.listTemplates(organizationId, filter);
  }

  async updateTemplate(input: UpdateInspectionTemplateInput): Promise<InspectionTemplateProps> {
    return this.repository.updateTemplate(input);
  }

  async activateTemplate(input: ActivateInspectionTemplateInput): Promise<InspectionTemplateProps> {
    return this.repository.activateTemplate(input);
  }

  async archiveTemplate(input: ArchiveInspectionTemplateInput): Promise<InspectionTemplateProps> {
    return this.repository.archiveTemplate(input);
  }
}
