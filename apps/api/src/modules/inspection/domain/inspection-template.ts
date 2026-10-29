import { ApplicationError } from '../../foundation/domain/errors.js';

export type InspectionType = 'PRE_TRIP' | 'POST_TRIP' | 'PERIODIC' | 'SAFETY' | 'CUSTOM';
export type InspectionTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type InspectionItemSeverity = 'NORMAL' | 'CRITICAL';

export interface InspectionTemplateItemProps {
  readonly id: string;
  readonly templateId: string;
  readonly organizationId: string;
  readonly category: string;
  readonly prompt: string;
  readonly description?: string | null;
  readonly required: boolean;
  readonly severity: InspectionItemSeverity;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InspectionTemplateProps {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly type: InspectionType;
  readonly status: InspectionTemplateStatus;
  readonly version: number;
  readonly items: readonly InspectionTemplateItemProps[];
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export function isTerminalTemplateStatus(status: InspectionTemplateStatus): boolean {
  return status === 'ARCHIVED';
}

export function assertTemplateEditable(status: InspectionTemplateStatus): void {
  if (status !== 'DRAFT') {
    throw new ApplicationError(
      'INSPECTION_TEMPLATE_IMMUTABLE',
      `Cannot modify inspection template with status ${status}. Only DRAFT templates are editable.`,
    );
  }
}

export function assertTemplateItemInput(input: {
  category: string;
  prompt: string;
  description?: string | null | undefined;
}): { category: string; prompt: string; description: string | null } {
  const category = input.category.trim();
  const prompt = input.prompt.trim();

  if (!category || category.length > 100) {
    throw new ApplicationError(
      'INSPECTION_ITEM_INVALID',
      'Template item category must be non-empty and at most 100 characters',
    );
  }

  if (!prompt || prompt.length > 500) {
    throw new ApplicationError(
      'INSPECTION_ITEM_INVALID',
      'Template item prompt must be non-empty and at most 500 characters',
    );
  }

  if (input.description && input.description.length > 500) {
    throw new ApplicationError(
      'INSPECTION_ITEM_INVALID',
      'Template item description must be at most 500 characters',
    );
  }

  return {
    category,
    prompt,
    description: input.description?.trim() || null,
  };
}

export function assertTemplateInput(input: {
  name: string;
  description?: string | null | undefined;
}): { name: string; description: string | null } {
  const name = input.name.trim();

  if (!name || name.length > 200) {
    throw new ApplicationError(
      'INSPECTION_TEMPLATE_INVALID',
      'Template name must be non-empty and at most 200 characters',
    );
  }

  if (input.description && input.description.length > 500) {
    throw new ApplicationError(
      'INSPECTION_TEMPLATE_INVALID',
      'Template description must be at most 500 characters',
    );
  }

  return {
    name,
    description: input.description?.trim() || null,
  };
}
