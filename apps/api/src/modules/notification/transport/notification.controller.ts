import {
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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { NotificationService } from '../application/notification.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import { ListNotificationsQueryDto } from './notification.dto.js';

@ApiTags('notifications')
@ApiBearerAuth()
@TenantScoped()
@Controller('notifications')
export class NotificationController {
  constructor(
    @Inject(NotificationService)
    private readonly service: NotificationService,
  ) {}

  @Get()
  @RequirePermissions('notification.read')
  @ApiOperation({ summary: 'List in-app notifications for authenticated user' })
  @ApiOkResponse({ description: 'Paginated user notifications feed' })
  async listNotifications(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const organizationId = req.tenant!.organizationId;
    const userId = req.principal.userId;

    return this.service.listUserNotifications({
      organizationId,
      userId,
      unreadOnly: query.unreadOnly,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get('unread-count')
  @RequirePermissions('notification.read')
  @ApiOperation({ summary: 'Get unread notification count for badge display' })
  @ApiOkResponse({ description: 'Current unread notification count' })
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const organizationId = req.tenant!.organizationId;
    const userId = req.principal.userId;
    const unreadCount = await this.service.getUnreadCount(organizationId, userId);
    return { unreadCount };
  }

  @Patch(':notificationId/read')
  @RequirePermissions('notification.read')
  @ApiOperation({ summary: 'Mark an individual notification as read' })
  @ApiOkResponse({ description: 'Updated recipient record marked as read' })
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('notificationId', ParseUUIDPipe) id: string,
  ) {
    const organizationId = req.tenant!.organizationId;
    const userId = req.principal.userId;
    return this.service.markAsRead(organizationId, userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('notification.read')
  @ApiOperation({ summary: 'Mark all unread notifications as read for current user' })
  @ApiOkResponse({ description: 'Count of marked notifications' })
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    const organizationId = req.tenant!.organizationId;
    const userId = req.principal.userId;
    return this.service.markAllAsRead(organizationId, userId);
  }
}
