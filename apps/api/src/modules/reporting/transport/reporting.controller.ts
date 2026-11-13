import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApplicationError } from '../../foundation/domain/errors.js';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { ReportingService } from '../application/reporting.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  ComplianceAnalyticsQueryDto,
  CostAnalyticsQueryDto,
  DateRangeQueryDto,
  ExportReportQueryDto,
  FuelAnalyticsQueryDto,
  IncidentAnalyticsQueryDto,
  MaintenanceAnalyticsQueryDto,
  TripAnalyticsQueryDto,
  VehicleUtilizationQueryDto,
} from './reporting.dto.js';

@ApiTags('Reporting & Analytics')
@ApiBearerAuth()
@TenantScoped()
@Controller('reports')
export class ReportingController {
  constructor(
    @Inject(ReportingService)
    private readonly reportingService: ReportingService,
  ) {}

  private getTenant(request: AuthenticatedRequest) {
    if (!request.tenant) {
      throw new ApplicationError('INVALID_TENANT_CONTEXT', 'Tenant context required');
    }
    return request.tenant;
  }

  @Get('fleet-overview')
  @RequirePermissions('report.read')
  @ApiOperation({ summary: 'Get operational fleet overview metrics' })
  async getFleetOverview(@Req() request: AuthenticatedRequest, @Query() query: DateRangeQueryDto) {
    const tenant = this.getTenant(request);
    return this.reportingService.getFleetOverview(
      tenant.organizationId,
      query.from,
      query.to,
      tenant.permissions,
    );
  }

  @Get('vehicle-utilization')
  @RequirePermissions('report.read', 'trip.read')
  @ApiOperation({ summary: 'Get vehicle utilization and trip activity metrics' })
  async getVehicleUtilization(
    @Req() request: AuthenticatedRequest,
    @Query() query: VehicleUtilizationQueryDto,
  ) {
    const tenant = this.getTenant(request);
    return this.reportingService.getVehicleUtilization(
      tenant.organizationId,
      query.from,
      query.to,
      {
        vehicleId: query.vehicleId,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        page: query.page,
        limit: query.limit,
      },
    );
  }

  @Get('trips')
  @RequirePermissions('report.read', 'trip.read')
  @ApiOperation({ summary: 'Get trip lifecycle and distance analytics' })
  async getTripAnalytics(
    @Req() request: AuthenticatedRequest,
    @Query() query: TripAnalyticsQueryDto,
  ) {
    const tenant = this.getTenant(request);
    return this.reportingService.getTripAnalytics(tenant.organizationId, query.from, query.to, {
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      status: query.status,
    });
  }

  @Get('fuel')
  @RequirePermissions('report.read')
  @ApiOperation({ summary: 'Get fuel and energy analytics' })
  async getFuelAnalytics(
    @Req() request: AuthenticatedRequest,
    @Query() query: FuelAnalyticsQueryDto,
  ) {
    const tenant = this.getTenant(request);
    const hasFuelAccess =
      tenant.permissions.has('fuel.read') || tenant.permissions.has('finance.read');
    if (!hasFuelAccess) {
      throw new ApplicationError(
        'PERMISSION_DENIED',
        'Fuel report requires "fuel.read" permission (or "finance.read")',
      );
    }
    return this.reportingService.getFuelAnalytics(tenant.organizationId, query.from, query.to, {
      vehicleId: query.vehicleId,
      fuelType: query.fuelType,
    });
  }

  @Get('costs')
  @RequirePermissions('report.read')
  @ApiOperation({ summary: 'Get financial expense and cost analytics by currency' })
  async getCostAnalytics(
    @Req() request: AuthenticatedRequest,
    @Query() query: CostAnalyticsQueryDto,
  ) {
    const tenant = this.getTenant(request);
    const hasCostAccess =
      tenant.permissions.has('finance.read') ||
      (tenant.permissions.has('fuel.read') && tenant.permissions.has('expense.read'));
    if (!hasCostAccess) {
      throw new ApplicationError(
        'PERMISSION_DENIED',
        'Cost report requires both "fuel.read" and "expense.read" permissions (or "finance.read")',
      );
    }
    return this.reportingService.getCostAnalytics(tenant.organizationId, query.from, query.to, {
      vehicleId: query.vehicleId,
      categoryId: query.categoryId,
      currency: query.currency,
    });
  }

  @Get('maintenance')
  @RequirePermissions('report.read', 'maintenance.read')
  @ApiOperation({ summary: 'Get maintenance requests and work order analytics' })
  async getMaintenanceAnalytics(
    @Req() request: AuthenticatedRequest,
    @Query() query: MaintenanceAnalyticsQueryDto,
  ) {
    const tenant = this.getTenant(request);
    return this.reportingService.getMaintenanceAnalytics(
      tenant.organizationId,
      query.from,
      query.to,
      {
        vehicleId: query.vehicleId,
        status: query.status,
      },
    );
  }

  @Get('compliance')
  @RequirePermissions('report.read', 'compliance.read')
  @ApiOperation({ summary: 'Get current compliance status and document expiry metrics' })
  async getComplianceAnalytics(
    @Req() request: AuthenticatedRequest,
    @Query() query: ComplianceAnalyticsQueryDto,
  ) {
    const tenant = this.getTenant(request);
    return this.reportingService.getComplianceAnalytics(
      tenant.organizationId,
      query.from,
      query.to,
    );
  }

  @Get('incidents')
  @RequirePermissions('report.read', 'incident.read')
  @ApiOperation({ summary: 'Get incident distribution and resolution duration analytics' })
  async getIncidentAnalytics(
    @Req() request: AuthenticatedRequest,
    @Query() query: IncidentAnalyticsQueryDto,
  ) {
    const tenant = this.getTenant(request);
    return this.reportingService.getIncidentAnalytics(tenant.organizationId, query.from, query.to, {
      type: query.type,
      severity: query.severity,
      status: query.status,
    });
  }

  @Get('telemetry')
  @RequirePermissions('report.read', 'telemetry.read')
  @ApiOperation({ summary: 'Get telemetry device health and GPS coverage analytics' })
  async getTelemetryAnalytics(
    @Req() request: AuthenticatedRequest,
    @Query() query: DateRangeQueryDto,
  ) {
    const tenant = this.getTenant(request);
    return this.reportingService.getTelemetryAnalytics(tenant.organizationId, query.from, query.to);
  }

  @Get('dashboard')
  @RequirePermissions('report.read')
  @ApiOperation({ summary: 'Get executive dashboard aggregated metrics' })
  async getDashboard(@Req() request: AuthenticatedRequest, @Query() query: DateRangeQueryDto) {
    const tenant = this.getTenant(request);
    return this.reportingService.getDashboardSummary(
      tenant.organizationId,
      query.from,
      query.to,
      tenant.permissions,
    );
  }

  @Get(':reportKey/export')
  @RequirePermissions('report.export', 'report.read')
  @ApiOperation({ summary: 'Export a report as CSV or PDF' })
  async exportReport(
    @Req() request: AuthenticatedRequest,
    @Param('reportKey') reportKey: string,
    @Query() query: ExportReportQueryDto,
    @Res() response: Response,
  ) {
    const tenant = this.getTenant(request);

    // Enforce base reporting and export authorization
    if (!tenant.permissions.has('report.read')) {
      throw new ApplicationError(
        'REPORT_PERMISSION_DENIED',
        'Exporting reports requires "report.read" permission',
      );
    }
    if (!tenant.permissions.has('report.export')) {
      throw new ApplicationError(
        'REPORT_PERMISSION_DENIED',
        'Exporting reports requires "report.export" permission',
      );
    }

    // Validate source-domain permission composition for the exported report
    this.assertSourceDomainPermission(reportKey, tenant.permissions);

    const result = await this.reportingService.exportReport(
      tenant.organizationId,
      request.principal.userId,
      request.requestId ?? 'req-export',
      reportKey,
      query.format,
      query.from,
      query.to,
      {
        vehicleId: query.vehicleId,
        driverId: query.driverId,
        categoryId: query.categoryId,
        currency: query.currency,
        status: query.status,
        type: query.type,
        severity: query.severity,
        fuelType: query.fuelType,
      },
      tenant.permissions,
    );

    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.setHeader('Content-Length', result.content.length);
    response.end(result.content);
  }

  private assertSourceDomainPermission(
    reportKey: string,
    grantedPermissions: ReadonlySet<string>,
  ): void {
    if (reportKey === 'fuel') {
      const hasFuelAccess =
        grantedPermissions.has('fuel.read') || grantedPermissions.has('finance.read');
      if (!hasFuelAccess) {
        throw new ApplicationError(
          'REPORT_PERMISSION_DENIED',
          'Exporting "fuel" report requires source permission "fuel.read"',
        );
      }
      return;
    }
    if (reportKey === 'costs') {
      const hasCostAccess =
        grantedPermissions.has('finance.read') ||
        (grantedPermissions.has('fuel.read') && grantedPermissions.has('expense.read'));
      if (!hasCostAccess) {
        throw new ApplicationError(
          'REPORT_PERMISSION_DENIED',
          'Exporting "costs" report requires source permissions "fuel.read" and "expense.read" (or "finance.read")',
        );
      }
      return;
    }
    const requiredPermission = this.getSourceDomainPermissionForReport(reportKey);
    if (requiredPermission && !grantedPermissions.has(requiredPermission)) {
      throw new ApplicationError(
        'REPORT_PERMISSION_DENIED',
        `Exporting "${reportKey}" report requires source permission "${requiredPermission}"`,
      );
    }
  }

  private getSourceDomainPermissionForReport(reportKey: string): string | null {
    switch (reportKey) {
      case 'costs':
        return null; // Handled specially in assertSourceDomainPermission
      case 'fuel':
        return 'fuel.read';
      case 'trips':
      case 'vehicle-utilization':
        return 'trip.read';
      case 'maintenance':
        return 'maintenance.read';
      case 'compliance':
        return 'compliance.read';
      case 'incidents':
        return 'incident.read';
      case 'telemetry':
        return 'telemetry.read';
      case 'fleet-overview':
      case 'dashboard':
      default:
        return null;
    }
  }
}
