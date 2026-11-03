import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { NotificationService } from '../application/notification.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import { UpdateNotificationPreferenceDto } from './notification.dto.js';

@ApiTags('notification-preferences')
@ApiBearerAuth()
@TenantScoped()
@Controller('notification-preferences')
export class NotificationPreferenceController {
  constructor(
    @Inject(NotificationService)
    private readonly service: NotificationService,
  ) {}

  @Get()
  @RequirePermissions('notification.preference.update')
  @ApiOperation({ summary: 'Get notification preferences for authenticated user' })
  @ApiOkResponse({ description: 'Notification preferences across all categories' })
  async getPreferences(@Req() req: AuthenticatedRequest) {
    const organizationId = req.tenant!.organizationId;
    const userId = req.principal.userId;

    const items = await this.service.getUserPreferences(organizationId, userId);
    return { items };
  }

  @Put()
  @RequirePermissions('notification.preference.update')
  @ApiOperation({ summary: 'Update notification preference for a category' })
  @ApiOkResponse({ description: 'Updated preference record' })
  async updatePreference(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    const userId = req.principal.userId;

    return this.service.updateUserPreference(organizationId, userId, {
      category: dto.category,
      inAppEnabled: dto.inAppEnabled,
      emailEnabled: dto.emailEnabled,
      smsEnabled: dto.smsEnabled,
    });
  }
}
