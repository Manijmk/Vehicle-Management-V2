import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../identity/transport/security.decorators.js';
import { IntegrationService } from '../application/integration.service.js';

@ApiTags('integrations-telematics-webhook')
@Public()
@Controller('integrations/telematics')
export class TelematicsWebhookController {
  constructor(
    @Inject(IntegrationService)
    private readonly integrationService: IntegrationService,
  ) {}

  @Post(':connectionId/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Inbound telematics machine-to-machine webhook authenticated via HMAC-SHA256 signature',
  })
  async handleEvents(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Headers('x-vms-signature') signature: string | undefined,
    @Headers('x-vms-timestamp') timestamp: string | undefined,
    @Req() req: Request,
  ) {
    const reqWithRawBody = req as Request & { rawBody?: Buffer };
    const rawBody = reqWithRawBody.rawBody
      ? reqWithRawBody.rawBody.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});

    return this.integrationService.handleTelematicsWebhook(
      connectionId,
      signature,
      timestamp,
      rawBody,
    );
  }
}
