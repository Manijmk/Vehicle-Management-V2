import { Body, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { NotificationService } from '../application/notification.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import { UpdateNotificationTemplateDto } from './notification.dto.js';

@ApiTags('notification-templates')
@ApiBearerAuth()
@TenantScoped()
@Controller('notification-templates')
export class NotificationTemplateController {
  constructor(
    @Inject(NotificationService)
    private readonly service: NotificationService,
  ) {}

  @Get()
  @RequirePermissions('notification.template.read')
  @ApiOperation({ summary: 'List notification templates for current tenant' })
  @ApiOkResponse({ description: 'List of templates with placeholders' })
  async listTemplates(@Req() req: AuthenticatedRequest) {
    const organizationId = req.tenant!.organizationId;
    const items = await this.service.listTemplates(organizationId);
    return { items };
  }

  @Patch(':key')
  @RequirePermissions('notification.template.manage')
  @ApiOperation({ summary: 'Update an existing notification template (admin only)' })
  @ApiOkResponse({ description: 'Updated template' })
  async updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('key') key: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    return this.service.updateTemplate(organizationId, key, {
      titleTemplate: dto.titleTemplate,
      bodyTemplate: dto.bodyTemplate,
      enabled: dto.enabled,
      description: dto.description,
    });
  }
}
