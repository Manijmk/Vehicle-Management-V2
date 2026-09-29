import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@vms/contracts';

import { Public } from './modules/identity/transport/security.decorators.js';

class HealthResponseDto implements HealthResponse {
  @ApiProperty({ example: 'ok' })
  readonly status = 'ok' as const;

  @ApiProperty({ example: 'vehicle-management-api' })
  readonly service = 'vehicle-management-api' as const;

  @ApiProperty({ example: '0.1.0' })
  readonly version = '0.1.0';

  @ApiProperty({ example: '2026-08-18T00:00:00.000Z', format: 'date-time' })
  readonly timestamp = new Date().toISOString();
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Confirm that the API process is live' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponse {
    return new HealthResponseDto();
  }
}
