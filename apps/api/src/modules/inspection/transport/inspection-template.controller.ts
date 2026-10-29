import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { InspectionTemplateService } from '../application/inspection-template.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  CreateInspectionTemplateDto,
  ListInspectionTemplatesQueryDto,
  UpdateInspectionTemplateDto,
  VersionedActionDto,
} from './inspection-template.dto.js';

function mutationMetadata(request: AuthenticatedRequest) {
  const ipAddress = request.ip ?? '127.0.0.1';
  const userAgent = Array.isArray(request.headers['user-agent'])
    ? request.headers['user-agent'][0]
    : (request.headers['user-agent'] ?? 'unknown');

  return {
    actorId: request.principal.userId,
    requestId:
      request.requestId ??
      (Array.isArray(request.headers['x-request-id'])
        ? request.headers['x-request-id'][0]
        : request.headers['x-request-id']) ??
      'inspection-template-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Inspection Templates')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization UUID',
})
@ApiUnauthorizedResponse({ description: 'Authentication credentials are missing or invalid' })
@ApiForbiddenResponse({
  description: 'Caller lacks the required organization membership or permission',
})
@TenantScoped()
@Controller('inspection-templates')
export class InspectionTemplateController {
  constructor(
    @Inject(InspectionTemplateService)
    private readonly service: InspectionTemplateService,
  ) {}

  @Post()
  @RequirePermissions('inspection.template.manage')
  @ApiOperation({ summary: 'Create a new DRAFT inspection template' })
  @ApiCreatedResponse({ description: 'Template created successfully' })
  async createTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateInspectionTemplateDto,
  ) {
    return this.service.createTemplate({
      organizationId: request.tenant!.organizationId,
      name: body.name,
      description: body.description,
      type: body.type,
      items: body.items,
      metadata: mutationMetadata(request),
    });
  }

  @Get()
  @RequirePermissions('inspection.template.read')
  @ApiOperation({ summary: 'List inspection templates with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated list of inspection templates' })
  async listTemplates(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListInspectionTemplatesQueryDto,
  ) {
    return this.service.listTemplates(request.tenant!.organizationId, query);
  }

  @Get(':templateId')
  @RequirePermissions('inspection.template.read')
  @ApiOperation({ summary: 'Get inspection template details by ID' })
  @ApiOkResponse({ description: 'Template details' })
  async getTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.service.getTemplate(request.tenant!.organizationId, templateId);
  }

  @Patch(':templateId')
  @RequirePermissions('inspection.template.manage')
  @ApiOperation({ summary: 'Update a DRAFT inspection template' })
  @ApiOkResponse({ description: 'Template updated successfully' })
  async updateTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: UpdateInspectionTemplateDto,
  ) {
    return this.service.updateTemplate({
      organizationId: request.tenant!.organizationId,
      templateId,
      version: body.version,
      name: body.name,
      description: body.description,
      items: body.items,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':templateId/activate')
  @RequirePermissions('inspection.template.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a DRAFT inspection template' })
  @ApiOkResponse({ description: 'Template activated successfully' })
  async activateTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: VersionedActionDto,
  ) {
    return this.service.activateTemplate({
      organizationId: request.tenant!.organizationId,
      templateId,
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':templateId/archive')
  @RequirePermissions('inspection.template.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an ACTIVE inspection template' })
  @ApiOkResponse({ description: 'Template archived successfully' })
  async archiveTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: VersionedActionDto,
  ) {
    return this.service.archiveTemplate({
      organizationId: request.tenant!.organizationId,
      templateId,
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }
}
