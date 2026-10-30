import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { FinanceService } from '../application/finance.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import { FinanceSummaryQueryDto } from './finance.dto.js';

@ApiTags('Finance - Summaries & Analytics')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization context',
})
@TenantScoped()
@Controller()
export class FinanceSummaryController {
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

  @Get('finance/summary')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Get organization fleet finance summary' })
  @ApiOkResponse({ description: 'Organization finance summary' })
  async getFinanceSummary(
    @Req() req: AuthenticatedRequest,
    @Query() query: FinanceSummaryQueryDto,
  ) {
    return this.financeService.getFinanceSummary(req.tenant!.organizationId, {
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
    });
  }

  @Get('vehicles/:vehicleId/finance')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Get finance summary and efficiency metrics for a vehicle' })
  @ApiOkResponse({ description: 'Vehicle finance and efficiency summary' })
  async getVehicleFinance(
    @Req() req: AuthenticatedRequest,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
  ) {
    return this.financeService.getVehicleFinanceSummary(req.tenant!.organizationId, vehicleId);
  }

  @Get('trips/:tripId/finance')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Get trip fuel and expense spend' })
  @ApiOkResponse({ description: 'Trip finance summary' })
  async getTripFinance(
    @Req() req: AuthenticatedRequest,
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
  ) {
    return this.financeService.getTripFinanceSummary(req.tenant!.organizationId, tripId);
  }
}
