import {
  Body,
  Controller,
  Delete,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApplicationError } from '../../foundation/domain/errors.js';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { IntegrationService, type ActorContext } from '../application/integration.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  AccountingExportQueryDto,
  ConfirmFuelCardImportDto,
  ConnectionActionDto,
  CreateDeviceMappingDto,
  CreateIntegrationConnectionDto,
  CreateWebhookSubscriptionDto,
  ListConnectionsQueryDto,
  ListDeliveriesQueryDto,
  UpdateIntegrationConnectionDto,
} from './integration.dto.js';

interface MulterUploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
}

function getActor(req: AuthenticatedRequest): ActorContext {
  const reqWithId = req as unknown as { requestId?: string };
  return {
    actorId: req.principal.userId,
    requestId: reqWithId.requestId ?? (req.headers['x-request-id'] as string) ?? 'system',
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string) ?? null,
  };
}

@ApiTags('integrations')
@ApiBearerAuth()
@TenantScoped()
@Controller('integrations')
export class IntegrationController {
  constructor(
    @Inject(IntegrationService)
    private readonly integrationService: IntegrationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Connection CRUD & Lifecycle
  // ---------------------------------------------------------------------------

  @Get()
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'List integration connections with pagination and filtering' })
  async listConnections(@Req() req: AuthenticatedRequest, @Query() query: ListConnectionsQueryDto) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.listConnections(orgId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('integration.manage')
  @ApiOperation({ summary: 'Create a new integration connection' })
  async createConnection(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateIntegrationConnectionDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.createConnection(orgId, dto, getActor(req));
  }

  @Get(':connectionId')
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'Get details of an integration connection' })
  async getConnection(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.getConnection(orgId, connectionId);
  }

  @Patch(':connectionId')
  @RequirePermissions('integration.manage')
  @ApiOperation({ summary: 'Update an integration connection with optimistic locking' })
  async updateConnection(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: UpdateIntegrationConnectionDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.updateConnection(
      orgId,
      connectionId,
      dto.version,
      dto,
      getActor(req),
    );
  }

  @Post(':connectionId/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.manage')
  @ApiOperation({ summary: 'Activate an integration connection' })
  async activateConnection(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: ConnectionActionDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.activateConnection(
      orgId,
      connectionId,
      dto.version,
      getActor(req),
    );
  }

  @Post(':connectionId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.manage')
  @ApiOperation({ summary: 'Suspend an active integration connection' })
  async suspendConnection(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: ConnectionActionDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.suspendConnection(
      orgId,
      connectionId,
      dto.version,
      getActor(req),
    );
  }

  @Post(':connectionId/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.manage')
  @ApiOperation({ summary: 'Permanently disable an integration connection' })
  async disableConnection(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: ConnectionActionDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.disableConnection(
      orgId,
      connectionId,
      dto.version,
      getActor(req),
    );
  }

  // ---------------------------------------------------------------------------
  // Secret Management (Provision, Rotate, Revoke)
  // ---------------------------------------------------------------------------

  @Post(':connectionId/credentials')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('integration.secret.manage')
  @ApiOperation({ summary: 'Provision new credentials with a one-time plaintext reveal' })
  async provisionSecret(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.provisionSecret(orgId, connectionId, getActor(req));
  }

  @Post(':connectionId/credentials/rotate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.secret.manage')
  @ApiOperation({ summary: 'Rotate integration credentials with a one-time plaintext reveal' })
  async rotateSecret(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.rotateSecret(orgId, connectionId, getActor(req));
  }

  @Post(':connectionId/credentials/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('integration.secret.manage')
  @ApiOperation({ summary: 'Revoke active integration secret' })
  async revokeSecret(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body('secretId', ParseUUIDPipe) secretId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    await this.integrationService.revokeSecret(orgId, connectionId, secretId, getActor(req));
  }

  // ---------------------------------------------------------------------------
  // Webhook Subscriptions & Deliveries
  // ---------------------------------------------------------------------------

  @Get(':connectionId/webhook-subscriptions')
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'List webhook subscriptions for an integration connection' })
  async listSubscriptions(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.listSubscriptions(orgId, connectionId);
  }

  @Post(':connectionId/webhook-subscriptions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('integration.manage')
  @ApiOperation({ summary: 'Create an outbound webhook subscription' })
  async createSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: CreateWebhookSubscriptionDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.createSubscription(orgId, connectionId, dto, getActor(req));
  }

  @Delete(':connectionId/webhook-subscriptions/:subId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('integration.manage')
  @ApiOperation({ summary: 'Delete a webhook subscription' })
  async deleteSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('subId', ParseUUIDPipe) subId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    await this.integrationService.deleteSubscription(orgId, connectionId, subId, getActor(req));
  }

  @Get(':connectionId/deliveries')
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'List outbound webhook deliveries and attempts' })
  async listDeliveries(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query() query: ListDeliveriesQueryDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.listDeliveries(orgId, connectionId, query);
  }

  @Get(':connectionId/deliveries/:deliveryId')
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'Get details of an outbound webhook delivery and attempt history' })
  async getDelivery(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.getDelivery(orgId, connectionId, deliveryId);
  }

  @Post(':connectionId/deliveries/:deliveryId/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.webhook.retry')
  @ApiOperation({ summary: 'Manually retry a failed or dead-letter webhook delivery' })
  async retryDelivery(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.retryDelivery(orgId, connectionId, deliveryId, getActor(req));
  }

  // ---------------------------------------------------------------------------
  // Provider-Device Mapping
  // ---------------------------------------------------------------------------

  @Get(':connectionId/device-mappings')
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'List provider-to-telemetry device mappings' })
  async listDeviceMappings(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.listDeviceMappings(orgId, connectionId);
  }

  @Post(':connectionId/device-mappings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.telematics.map', 'telemetry.device.manage')
  @ApiOperation({ summary: 'Create or update provider-to-telemetry device mapping' })
  async upsertDeviceMapping(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: CreateDeviceMappingDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.upsertDeviceMapping(orgId, connectionId, dto, getActor(req));
  }

  // ---------------------------------------------------------------------------
  // Fuel Card Import (Preview, Confirm, List)
  // ---------------------------------------------------------------------------

  @Post(':connectionId/fuel-card/import/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.fuel-card.import', 'fuel.read')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload and preview a fuel-card transaction CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async previewFuelCardImport(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @UploadedFile() file?: MulterUploadedFile,
  ) {
    if (!file || !file.buffer) {
      throw new ApplicationError('VALIDATION_ERROR', 'CSV file is required');
    }
    const orgId = req.tenant!.organizationId;
    return this.integrationService.previewFuelCardImport(
      orgId,
      connectionId,
      file.buffer,
      file.originalname ?? 'fuel_card_import.csv',
    );
  }

  @Post(':connectionId/fuel-card/import/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('integration.fuel-card.import', 'fuel.import')
  @ApiOperation({ summary: 'Confirm a previously previewed fuel-card import batch' })
  async confirmFuelCardImport(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: ConfirmFuelCardImportDto,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.confirmFuelCardImport(
      orgId,
      connectionId,
      dto.batchId,
      getActor(req),
    );
  }

  @Get(':connectionId/fuel-card/imports')
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'List fuel card import batches for connection' })
  async listFuelCardImports(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.listFuelCardBatches(orgId, connectionId);
  }

  // ---------------------------------------------------------------------------
  // Accounting Export
  // ---------------------------------------------------------------------------

  @Get(':connectionId/accounting/export')
  @RequirePermissions('integration.accounting.export', 'finance.read')
  @ApiOperation({ summary: 'Export POSTED financial transactions as accounting-ready CSV' })
  async exportAccountingCsv(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query() query: AccountingExportQueryDto,
    @Res() res: Response,
  ) {
    const orgId = req.tenant!.organizationId;
    const fromUtc = new Date(query.from);
    const toUtc = new Date(query.to);

    if (isNaN(fromUtc.getTime()) || isNaN(toUtc.getTime())) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'from and to must be valid ISO 8601 UTC date strings',
      );
    }

    const result = await this.integrationService.exportAccountingCsv(
      orgId,
      connectionId,
      fromUtc,
      toUtc,
      query.currency,
      getActor(req),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Content-Length', Buffer.byteLength(result.csvContent, 'utf8'));
    res.end(result.csvContent);
  }

  @Get(':connectionId/accounting/exports')
  @RequirePermissions('integration.read')
  @ApiOperation({ summary: 'List accounting export logs for connection' })
  async listAccountingExports(
    @Req() req: AuthenticatedRequest,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    const orgId = req.tenant!.organizationId;
    return this.integrationService.listAccountingExports(orgId, connectionId);
  }
}
