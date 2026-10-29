import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@vms/database';

import { DATABASE } from '../../../common/tokens.js';
import { ApplicationError } from '../../foundation/domain/errors.js';
import {
  assertTemplateEditable,
  assertTemplateInput,
  assertTemplateItemInput,
  type InspectionItemSeverity,
  type InspectionTemplateProps,
  type InspectionTemplateStatus,
  type InspectionType,
} from '../domain/inspection-template.js';
import type {
  ActivateInspectionTemplateInput,
  ArchiveInspectionTemplateInput,
  CreateInspectionTemplateInput,
  InspectionTemplateRepository,
  ListInspectionTemplatesFilter,
  PaginatedInspectionTemplates,
  UpdateInspectionTemplateInput,
} from '../application/inspection-template.repository.js';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaInspectionTemplateRepository implements InspectionTemplateRepository {
  constructor(
    @Inject(DATABASE)
    private readonly database: PrismaClient,
  ) {}

  private mapTemplate(raw: {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    type: string;
    status: string;
    version: number;
    items?: Array<{
      id: string;
      templateId: string;
      organizationId: string;
      category: string;
      prompt: string;
      description: string | null;
      required: boolean;
      severity: string;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
  }): InspectionTemplateProps {
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      name: raw.name,
      description: raw.description,
      type: raw.type as InspectionType,
      status: raw.status as InspectionTemplateStatus,
      version: raw.version,
      items: (raw.items ?? []).map((i) => ({
        id: i.id,
        templateId: i.templateId,
        organizationId: i.organizationId,
        category: i.category,
        prompt: i.prompt,
        description: i.description,
        required: i.required,
        severity: i.severity as InspectionItemSeverity,
        sortOrder: i.sortOrder,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    };
  }

  async createTemplate(input: CreateInspectionTemplateInput): Promise<InspectionTemplateProps> {
    const validated = assertTemplateInput({
      name: input.name,
      description: input.description,
    });

    const itemsData = (input.items ?? []).map((item, idx) => {
      const validatedItem = assertTemplateItemInput({
        category: item.category,
        prompt: item.prompt,
        description: item.description,
      });
      return {
        organizationId: input.organizationId,
        category: validatedItem.category,
        prompt: validatedItem.prompt,
        description: validatedItem.description,
        required: item.required ?? true,
        severity: (item.severity ?? 'NORMAL') as InspectionItemSeverity,
        sortOrder: item.sortOrder ?? idx + 1,
      };
    });

    return this.database.$transaction(async (tx) => {
      const template = await tx.inspectionTemplate.create({
        data: {
          organizationId: input.organizationId,
          name: validated.name,
          description: validated.description,
          type: input.type,
          status: 'DRAFT',
          createdBy: input.metadata.actorId,
          updatedBy: input.metadata.actorId,
        },
      });

      if (itemsData.length > 0) {
        await tx.inspectionTemplateItem.createMany({
          data: itemsData.map((item) => ({
            ...item,
            templateId: template.id,
          })),
        });
      }

      const created = await tx.inspectionTemplate.findFirstOrThrow({
        where: { id: template.id, organizationId: input.organizationId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      const mapped = this.mapTemplate(created);

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          action: 'inspection_template.created',
          entityType: 'InspectionTemplate',
          entityId: template.id,
          afterData: json(mapped),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      return mapped;
    });
  }

  async getTemplate(organizationId: string, templateId: string): Promise<InspectionTemplateProps> {
    const template = await this.database.inspectionTemplate.findFirst({
      where: { id: templateId, organizationId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new ApplicationError(
        'INSPECTION_TEMPLATE_NOT_FOUND',
        'Inspection template was not found in this organization',
      );
    }

    return this.mapTemplate(template);
  }

  async listTemplates(
    organizationId: string,
    filter?: ListInspectionTemplatesFilter,
  ): Promise<PaginatedInspectionTemplates> {
    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const where: Prisma.InspectionTemplateWhereInput = {
      organizationId,
      ...(filter?.type ? { type: filter.type } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.search
        ? {
            name: { contains: filter.search.trim(), mode: 'insensitive' },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.database.inspectionTemplate.findMany({
        where,
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.database.inspectionTemplate.count({ where }),
    ]);

    return {
      items: items.map((t) => this.mapTemplate(t)),
      total,
      limit,
      offset,
    };
  }

  async updateTemplate(input: UpdateInspectionTemplateInput): Promise<InspectionTemplateProps> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.inspectionTemplate.findFirst({
        where: { id: input.templateId, organizationId: input.organizationId },
        include: { items: true },
      });

      if (!existing) {
        throw new ApplicationError(
          'INSPECTION_TEMPLATE_NOT_FOUND',
          'Inspection template was not found in this organization',
        );
      }

      assertTemplateEditable(existing.status as InspectionTemplateStatus);

      let name = existing.name;
      let description = existing.description;

      if (input.name !== undefined) {
        const validated = assertTemplateInput({
          name: input.name,
          description: input.description ?? existing.description,
        });
        name = validated.name;
        description = validated.description;
      } else if (input.description !== undefined) {
        description = input.description ? input.description.trim() || null : null;
      }

      const updateResult = await tx.inspectionTemplate.updateMany({
        where: {
          id: input.templateId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          name,
          description,
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Inspection template was modified by another request',
        );
      }

      if (input.items !== undefined) {
        // Delete existing items and recreate
        await tx.inspectionTemplateItem.deleteMany({
          where: { templateId: input.templateId, organizationId: input.organizationId },
        });

        const itemsData = input.items.map((item, idx) => {
          const validatedItem = assertTemplateItemInput({
            category: item.category,
            prompt: item.prompt,
            description: item.description,
          });
          return {
            templateId: input.templateId,
            organizationId: input.organizationId,
            category: validatedItem.category,
            prompt: validatedItem.prompt,
            description: validatedItem.description,
            required: item.required ?? true,
            severity: (item.severity ?? 'NORMAL') as InspectionItemSeverity,
            sortOrder: item.sortOrder ?? idx + 1,
          };
        });

        if (itemsData.length > 0) {
          await tx.inspectionTemplateItem.createMany({
            data: itemsData,
          });
        }
      }

      const updated = await tx.inspectionTemplate.findFirstOrThrow({
        where: { id: input.templateId, organizationId: input.organizationId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      const beforeMapped = this.mapTemplate(existing);
      const afterMapped = this.mapTemplate(updated);

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          action: 'inspection_template.updated',
          entityType: 'InspectionTemplate',
          entityId: updated.id,
          beforeData: json(beforeMapped),
          afterData: json(afterMapped),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      return afterMapped;
    });
  }

  async activateTemplate(input: ActivateInspectionTemplateInput): Promise<InspectionTemplateProps> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.inspectionTemplate.findFirst({
        where: { id: input.templateId, organizationId: input.organizationId },
        include: { items: true },
      });

      if (!existing) {
        throw new ApplicationError(
          'INSPECTION_TEMPLATE_NOT_FOUND',
          'Inspection template was not found in this organization',
        );
      }

      if (existing.status !== 'DRAFT') {
        throw new ApplicationError(
          'INVALID_INSPECTION_TRANSITION',
          `Cannot activate inspection template with status ${existing.status}`,
        );
      }

      if (existing.items.length === 0) {
        throw new ApplicationError(
          'INSPECTION_TEMPLATE_INVALID',
          'Cannot activate an inspection template with zero checklist items',
        );
      }

      const updateResult = await tx.inspectionTemplate.updateMany({
        where: {
          id: input.templateId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'ACTIVE',
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Inspection template was modified by another request',
        );
      }

      const updated = await tx.inspectionTemplate.findFirstOrThrow({
        where: { id: input.templateId, organizationId: input.organizationId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      const beforeMapped = this.mapTemplate(existing);
      const afterMapped = this.mapTemplate(updated);

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          action: 'inspection_template.activated',
          entityType: 'InspectionTemplate',
          entityId: updated.id,
          beforeData: json(beforeMapped),
          afterData: json(afterMapped),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      return afterMapped;
    });
  }

  async archiveTemplate(input: ArchiveInspectionTemplateInput): Promise<InspectionTemplateProps> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.inspectionTemplate.findFirst({
        where: { id: input.templateId, organizationId: input.organizationId },
        include: { items: true },
      });

      if (!existing) {
        throw new ApplicationError(
          'INSPECTION_TEMPLATE_NOT_FOUND',
          'Inspection template was not found in this organization',
        );
      }

      if (existing.status === 'ARCHIVED') {
        throw new ApplicationError(
          'INSPECTION_TEMPLATE_IMMUTABLE',
          'Inspection template is already archived',
        );
      }

      const updateResult = await tx.inspectionTemplate.updateMany({
        where: {
          id: input.templateId,
          organizationId: input.organizationId,
          version: input.version,
        },
        data: {
          status: 'ARCHIVED',
          updatedBy: input.metadata.actorId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationError(
          'CONCURRENCY_CONFLICT',
          'Inspection template was modified by another request',
        );
      }

      const updated = await tx.inspectionTemplate.findFirstOrThrow({
        where: { id: input.templateId, organizationId: input.organizationId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      const beforeMapped = this.mapTemplate(existing);
      const afterMapped = this.mapTemplate(updated);

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          action: 'inspection_template.archived',
          entityType: 'InspectionTemplate',
          entityId: updated.id,
          beforeData: json(beforeMapped),
          afterData: json(afterMapped),
          actorId: input.metadata.actorId,
          requestId: input.metadata.requestId,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });

      return afterMapped;
    });
  }
}
